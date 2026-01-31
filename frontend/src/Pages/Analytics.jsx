import React, { useState } from 'react';
import Sidebar from '../Components/Sidebar';
import Navbar_III from '../Components/Navbar_III';
import Globe3D from '../Components/Globe3D';
import ValidationHeatmap from '../Components/ValidationHeatmap';
import ConfidenceRadar from '../Components/ConfidenceRadar';
import { useHealthContext } from '../Context/HealthContext';

const Analytics = () => {
  const { Dark } = useHealthContext();
  const [activeView, setActiveView] = useState('globe');

  const views = [
    { id: 'globe', name: '🌍 Network Globe', description: 'Geographic distribution' },
    { id: 'heatmap', name: '🔥 Validation Heatmap', description: 'Pipeline performance' },
    { id: 'radar', name: '📊 Confidence Analysis', description: '6D scoring breakdown' }
  ];

  const bgMain = Dark ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-900";

  return (
    <div className={`flex min-h-screen ${bgMain}`}>
      <Sidebar />
      <div className="flex-1 lg:ml-[20vw]">
        <Navbar_III />
        
        {/* Tab Navigation */}
        <div className={`border-b ${Dark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
          <div className="flex gap-1 p-4 overflow-x-auto">
            {views.map(view => (
              <button
                key={view.id}
                onClick={() => setActiveView(view.id)}
                className={`
                  px-6 py-3 rounded-lg font-semibold transition-all whitespace-nowrap
                  ${activeView === view.id
                    ? Dark
                      ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-500/50'
                      : 'bg-cyan-500 text-white shadow-lg'
                    : Dark
                      ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }
                `}
              >
                <div className="flex flex-col items-start">
                  <span className="text-lg">{view.name}</span>
                  <span className={`text-xs ${activeView === view.id ? 'text-white/80' : 'text-gray-500'}`}>
                    {view.description}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Active Visualization - Full Width */}
        <div className={Dark ? 'bg-gray-900' : 'bg-white'}>
          {activeView === 'globe' && <Globe3D />}
          {activeView === 'heatmap' && <ValidationHeatmap />}
          {activeView === 'radar' && <ConfidenceRadar />}
        </div>
      </div>
    </div>
  );
};

export default Analytics;