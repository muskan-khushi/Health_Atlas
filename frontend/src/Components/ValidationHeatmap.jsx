import React, { useState, useEffect } from 'react';
import { Activity, Zap, Shield, MapPin, Globe, Brain, Award } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const ValidationHeatmap = () => {
  const [providerData, setProviderData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const stages = [
    { id: 'vlm', name: 'VLM Extract', icon: Brain, color: 'from-purple-500 to-pink-500' },
    { id: 'npi', name: 'NPI', icon: Activity, color: 'from-blue-500 to-cyan-500' },
    { id: 'oig', name: 'OIG', icon: Shield, color: 'from-red-500 to-orange-500' },
    { id: 'license', name: 'License', icon: Award, color: 'from-emerald-500 to-teal-500' },
    { id: 'address', name: 'Address', icon: MapPin, color: 'from-amber-500 to-yellow-500' },
    { id: 'web', name: 'Web', icon: Globe, color: 'from-indigo-500 to-purple-500' },
    { id: 'score', name: 'Score', icon: Zap, color: 'from-rose-500 to-pink-500' }
  ];

  useEffect(() => {
    // Fetch real validation heatmap data
    const fetchData = async () => {
      try {
        const response = await fetch(`${API_URL}/api/analytics/validation-heatmap`);
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch heatmap data');
        }

        // Transform backend data to match component format
        const transformedData = (data.providers || []).map(provider => ({
          id: provider.id,
          name: provider.name,
          stages: provider.stages || {}
        }));

        setProviderData(transformedData);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching heatmap data:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    fetchData();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStageColor = (stage, status, confidence) => {
    if (status === 'pending') return 'bg-slate-800/50';
    if (status === 'processing') return `bg-gradient-to-r ${stage.color} animate-pulse`;
    
    // Complete - color by confidence
    if (confidence >= 0.9) return 'bg-gradient-to-r from-emerald-500 to-green-400';
    if (confidence >= 0.7) return 'bg-gradient-to-r from-amber-500 to-yellow-400';
    return 'bg-gradient-to-r from-rose-500 to-red-400';
  };

  const completionRate = (stageId) => {
    if (providerData.length === 0) return 0;
    const completed = providerData.filter(p => p.stages[stageId] === 'complete').length;
    return ((completed / providerData.length) * 100).toFixed(0);
  };

  if (loading) {
    return (
      <div className="w-full min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8 flex items-center justify-center">
        <div className="text-white text-xl">Loading validation heatmap...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8 flex items-center justify-center">
        <div className="text-red-400 text-xl">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
          <Activity className="text-cyan-400" size={36} />
          Real-Time Validation Heatmap
        </h1>
        <p className="text-slate-400 text-lg">
          Live performance metrics across 7-stage validation pipeline ({providerData.length} providers)
        </p>
      </div>

      {/* Stage Headers */}
      <div className="mb-4 grid grid-cols-8 gap-2">
        <div className="text-slate-500 text-xs font-semibold uppercase tracking-wide px-3 py-2">
          Provider
        </div>
        {stages.map((stage) => (
          <div key={stage.id} className="text-center">
            <div className={`bg-gradient-to-r ${stage.color} rounded-lg p-3 mb-2`}>
              <stage.icon className="mx-auto text-white mb-1" size={20} />
              <div className="text-white text-xs font-bold">{stage.name}</div>
            </div>
            <div className="text-xs text-slate-500">
              {completionRate(stage.id)}%
            </div>
          </div>
        ))}
      </div>

      {/* Heatmap Grid */}
      <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-4 max-h-[600px] overflow-y-auto">
        {providerData.length === 0 ? (
          <div className="text-center text-slate-400 py-12">
            No validation data available in the last 24 hours
          </div>
        ) : (
          providerData.map((provider) => (
            <div key={provider.id} className="grid grid-cols-8 gap-2 mb-2 items-center">
              <div className="text-slate-400 text-sm px-3 py-2 truncate">
                {provider.name}
              </div>
              {stages.map((stage) => {
                const stageStatus = provider.stages[stage.id] || 'pending';
                const isComplete = stageStatus === 'complete';
                
                return (
                  <div
                    key={stage.id}
                    className={`
                      h-12 rounded-lg transition-all duration-300 relative overflow-hidden
                      ${isComplete 
                        ? 'bg-gradient-to-r from-emerald-500 to-green-400' 
                        : stageStatus === 'processing'
                        ? `bg-gradient-to-r ${stage.color} animate-pulse`
                        : 'bg-slate-800/50'
                      }
                      border border-slate-700/30
                    `}
                  >
                    {isComplete && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-white text-xs font-bold">✓</div>
                      </div>
                    )}
                    {stageStatus === 'processing' && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-3 h-3 rounded-full bg-white animate-ping"></div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Stats Dashboard */}
      <div className="mt-8 grid grid-cols-4 gap-6">
        <div className="bg-slate-900/50 backdrop-blur-sm border border-emerald-500/30 rounded-xl p-6">
          <div className="text-emerald-400 text-3xl font-bold mb-2">
            {providerData.filter(p => 
              stages.every(s => p.stages[s.id] === 'complete')
            ).length}
          </div>
          <div className="text-slate-400 text-sm">Fully Validated</div>
        </div>

        <div className="bg-slate-900/50 backdrop-blur-sm border border-cyan-500/30 rounded-xl p-6">
          <div className="text-cyan-400 text-3xl font-bold mb-2">
            {providerData.filter(p => 
              stages.some(s => p.stages[s.id] === 'processing')
            ).length}
          </div>
          <div className="text-slate-400 text-sm">In Progress</div>
        </div>

        <div className="bg-slate-900/50 backdrop-blur-sm border border-amber-500/30 rounded-xl p-6">
          <div className="text-amber-400 text-3xl font-bold mb-2">
            {providerData.length}
          </div>
          <div className="text-slate-400 text-sm">Total Processed</div>
        </div>

        <div className="bg-slate-900/50 backdrop-blur-sm border border-rose-500/30 rounded-xl p-6">
          <div className="text-rose-400 text-3xl font-bold mb-2">
            {providerData.length > 0 
              ? (providerData.filter(p => stages.every(s => p.stages[s.id] === 'complete')).length / providerData.length * 100).toFixed(1)
              : 0
            }%
          </div>
          <div className="text-slate-400 text-sm">Completion Rate</div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-6 flex justify-center gap-8 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-slate-800/50"></div>
          <span className="text-slate-400">Pending</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-gradient-to-r from-cyan-500 to-blue-500 animate-pulse"></div>
          <span className="text-slate-400">Processing</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-gradient-to-r from-emerald-500 to-green-400"></div>
          <span className="text-slate-400">Complete</span>
        </div>
      </div>
    </div>
  );
};

export default ValidationHeatmap;