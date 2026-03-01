import React from 'react';
import { useWorkGuardData } from './hooks/useWorkGuardData';
import { LineChart, Line, YAxis, ResponsiveContainer } from 'recharts';
import { Eye, Activity, Mic } from 'lucide-react';

function App() {
  const { status, ear, history, isSpeaking, isYawning } = useWorkGuardData();

  const getStatusColor = () => {
    if (status === 'Focused') return 'bg-green-100 text-green-800 border-green-500';
    if (status.includes('Drowsy')) return 'bg-red-100 text-red-800 border-red-500';
    if (status.includes('Distracted')) return 'bg-yellow-100 text-yellow-800 border-yellow-500';
    return 'bg-gray-100 text-gray-800 border-gray-500';
  };

  const getVoiceLabel = () => {
    if (isYawning) return "Yawning";
    if (isSpeaking) return "Speaking";
    return "Silent";
  };

  const getVoiceColor = () => {
    if (isYawning) return "text-orange-600";
    if (isSpeaking) return "text-green-600";
    return "text-gray-600";
  };

  return (
    <div className="p-10 min-h-screen bg-gray-50 font-sans">
      <h1 className="text-3xl font-bold mb-8 text-gray-800">
        WorkGuard <span className="text-sm font-normal text-gray-500">Live Architecture V1</span>
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Card 1: Current State */}
        <div className={`p-6 rounded-xl border-l-4 shadow-sm ${getStatusColor()}`}>
          <div className="flex items-center space-x-4">
            <Activity className="w-8 h-8" />
            <div>
              <p className="text-sm uppercase font-bold opacity-70">Current State</p>
              <h2 className="text-2xl font-bold">{status}</h2>
            </div>
          </div>
        </div>

        {/* Card 2: EAR */}
        <div className="p-6 bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center space-x-4 text-blue-600">
            <Eye className="w-8 h-8" />
            <div>
              <p className="text-sm uppercase font-bold text-gray-400">
                Eye Openness (EAR)
              </p>
              <h2 className="text-2xl font-bold">{ear.toFixed(3)}</h2>
            </div>
          </div>
        </div>

        {/* Card 3: Voice Activity */}
        <div className="p-6 bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className={`flex items-center space-x-4 ${getVoiceColor()}`}>
            <Mic className="w-8 h-8" />
            <div>
              <p className="text-sm uppercase font-bold text-gray-400">
                Voice Activity
              </p>
              <h2 className="text-xl font-bold">
                {getVoiceLabel()}
              </h2>
            </div>
          </div>
        </div>

      </div>

      {/* Chart */}
      <div className="mt-8 p-6 bg-white rounded-xl border border-gray-200 shadow-sm">
        <h3 className="text-lg font-bold mb-4 text-gray-700">
          Real-time Attention Tensor
        </h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history}>
              <YAxis domain={[0.15, 0.35]} hide />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#2563eb"
                strokeWidth={3}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
}

export default App;
