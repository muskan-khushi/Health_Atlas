import React, { useState, useEffect } from 'react';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Tooltip } from 'recharts';
import { TrendingUp, Shield, MapPin, Database, Clock, AlertTriangle } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const ConfidenceRadar = () => {
  const [selectedProvider, setSelectedProvider] = useState(0);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Fetch real confidence breakdown data
    const fetchData = async () => {
      try {
        const response = await fetch(`${API_URL}/api/analytics/confidence-breakdown`);
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch confidence data');
        }

        const transformedProviders = (data.providers || []).map(provider => ({
          name: provider.name,
          npi: provider.npi,
          overallScore: provider.overallScore || 0,
          tier: provider.tier || 'UNKNOWN',
          path: provider.path || 'UNKNOWN',
          dimensions: provider.dimensions.map(dim => ({
            ...dim,
            icon: getIconForDimension(dim.dimension)
          }))
        }));

        setProviders(transformedProviders);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching confidence data:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    fetchData();
    
    // Refresh every 60 seconds
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  const getIconForDimension = (dimensionName) => {
    const iconMap = {
      'Primary\nSource': Shield,
      'Address\nReliability': MapPin,
      'Digital\nFootprint': TrendingUp,
      'Data\nCompleteness': Database,
      'Data\nFreshness': Clock,
      'Fraud\nRisk': AlertTriangle
    };
    return iconMap[dimensionName] || Shield;
  };

  const pathConfig = {
    'GREEN': { color: 'from-emerald-500 to-green-400', emoji: '🟢', borderColor: '#10b981' },
    'YELLOW': { color: 'from-amber-500 to-yellow-400', emoji: '🟡', borderColor: '#f59e0b' },
    'RED': { color: 'from-rose-500 to-red-400', emoji: '🔴', borderColor: '#ef4444' },
    'UNKNOWN': { color: 'from-gray-500 to-gray-400', emoji: '⚪', borderColor: '#6b7280' }
  };

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-lg p-4 shadow-2xl">
          <div className="text-white font-bold mb-2">{data.dimension}</div>
          <div className="text-emerald-400 text-2xl font-bold mb-1">{data.score}%</div>
          <div className="text-slate-400 text-sm">Weight: {data.weight}%</div>
          <div className="text-xs text-slate-500 mt-2">
            Contributes {(data.score * data.weight / 100).toFixed(1)} points to final score
          </div>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="w-full min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 p-8 flex items-center justify-center">
        <div className="text-white text-xl">Loading confidence analysis...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 p-8 flex items-center justify-center">
        <div className="text-red-400 text-xl">Error: {error}</div>
      </div>
    );
  }

  if (providers.length === 0) {
    return (
      <div className="w-full min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 p-8 flex items-center justify-center">
        <div className="text-slate-400 text-xl">No provider data available</div>
      </div>
    );
  }

  const current = providers[selectedProvider];

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">
          📊 6-Dimensional Confidence Analysis
        </h1>
        <p className="text-slate-300 text-lg">
          AI-powered multi-factor scoring with weighted arbitration
        </p>
      </div>

      {/* Provider Selector */}
      <div className="mb-8 flex gap-4 overflow-x-auto pb-4">
        {providers.map((provider, idx) => (
          <button
            key={idx}
            onClick={() => setSelectedProvider(idx)}
            className={`
              flex-shrink-0 w-80 p-6 rounded-2xl border-2 transition-all duration-300
              ${selectedProvider === idx 
                ? `border-${pathConfig[provider.path].borderColor} bg-gradient-to-r ${pathConfig[provider.path].color}` 
                : 'border-slate-700 bg-slate-900/50 hover:border-slate-600'
              }
            `}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="text-white font-bold text-lg truncate">{provider.name}</div>
              <div className="text-2xl">{pathConfig[provider.path].emoji}</div>
            </div>
            <div className="text-white/80 text-sm mb-2">NPI: {provider.npi}</div>
            <div className="flex justify-between items-end">
              <div>
                <div className="text-white/60 text-xs uppercase tracking-wide">Overall Score</div>
                <div className="text-white text-3xl font-bold">{(provider.overallScore * 100).toFixed(0)}%</div>
              </div>
              <div className={`
                px-3 py-1 rounded-lg text-xs font-bold uppercase
                ${selectedProvider === idx ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'}
              `}>
                {provider.tier}
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-8">
        {/* Radar Chart */}
        <div className="col-span-2 bg-slate-900/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8">
          <ResponsiveContainer width="100%" height={500}>
            <RadarChart data={current.dimensions}>
              <PolarGrid stroke="#334155" strokeWidth={1} />
              <PolarAngleAxis 
                dataKey="dimension" 
                tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 600 }}
                tickLine={false}
              />
              <PolarRadiusAxis 
                angle={90} 
                domain={[0, 100]} 
                tick={{ fill: '#64748b', fontSize: 11 }}
                tickCount={6}
              />
              <Radar
                name={current.name}
                dataKey="score"
                stroke={pathConfig[current.path].borderColor}
                fill={pathConfig[current.path].borderColor}
                fillOpacity={0.3}
                strokeWidth={3}
                dot={{ fill: pathConfig[current.path].borderColor, r: 6 }}
                animationDuration={800}
                animationEasing="ease-out"
              />
              <Tooltip content={<CustomTooltip />} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Dimension Breakdown */}
        <div className="space-y-4">
          <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6">
            <h3 className="text-white font-bold text-lg mb-4">Dimension Breakdown</h3>
            <div className="space-y-4">
              {current.dimensions.map((dim, idx) => {
                const IconComponent = dim.icon;
                return (
                  <div key={idx} className="relative">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <IconComponent className="text-cyan-400" size={18} />
                        <span className="text-slate-300 text-sm font-medium">
                          {dim.dimension.replace('\n', ' ')}
                        </span>
                      </div>
                      <span className="text-white font-bold">{dim.score}%</span>
                    </div>
                    
                    <div className="relative h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full bg-gradient-to-r ${
                          dim.score >= 90 ? 'from-emerald-500 to-green-400' :
                          dim.score >= 70 ? 'from-amber-500 to-yellow-400' :
                          'from-rose-500 to-red-400'
                        } transition-all duration-1000 ease-out`}
                        style={{ width: `${dim.score}%` }}
                      />
                    </div>
                    
                    <div className="flex justify-between mt-1 text-xs text-slate-500">
                      <span>Weight: {dim.weight}%</span>
                      <span>+{(dim.score * dim.weight / 100).toFixed(1)} pts</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Final Calculation */}
          <div className={`bg-gradient-to-r ${pathConfig[current.path].color} rounded-2xl p-6`}>
            <div className="text-white/80 text-sm uppercase tracking-wide mb-2">
              Final Weighted Score
            </div>
            <div className="text-white text-5xl font-bold mb-4">
              {(current.overallScore * 100).toFixed(1)}%
            </div>
            <div className="flex items-center justify-between text-white/90 text-sm">
              <span className="font-semibold">{current.tier}</span>
              <span>{pathConfig[current.path].emoji} {current.path} PATH</span>
            </div>
            <div className="mt-4 pt-4 border-t border-white/20 text-white/70 text-xs">
              {current.path === 'GREEN' 
                ? '✅ Auto-approved - Committed to database'
                : current.path === 'YELLOW'
                ? '⚠️ Auto-approved with monitoring'
                : '🔴 Requires human review'}
            </div>
          </div>
        </div>
      </div>

      {/* Scoring Formula */}
      <div className="mt-8 bg-slate-900/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6">
        <h3 className="text-white font-bold text-lg mb-4">📐 Weighted Scoring Formula</h3>
        <div className="font-mono text-sm text-slate-300 bg-slate-950/50 p-4 rounded-lg border border-slate-700/30">
          <div className="mb-2">
            <span className="text-emerald-400">Final Score</span> = 
            <span className="text-cyan-400"> Primary (35%)</span> +
            <span className="text-blue-400"> Address (20%)</span> +
            <span className="text-purple-400"> Footprint (15%)</span> +
          </div>
          <div className="ml-24">
            <span className="text-amber-400">Completeness (15%)</span> +
            <span className="text-yellow-400"> Freshness (10%)</span> -
            <span className="text-rose-400"> Fraud Penalty (5%)</span>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-4 text-xs text-slate-400">
          <div>🟢 PLATINUM: 90-100% → Auto-approve</div>
          <div>🟡 GOLD: 65-89% → Auto-approve + monitor</div>
          <div>🔴 QUESTIONABLE: 0-64% → Human review</div>
        </div>
      </div>
    </div>
  );
};

export default ConfidenceRadar;