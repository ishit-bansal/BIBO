import { useState } from 'react';
import './index.css';
import StatCards from './components/StatCards';
import SectorHeatmap from './components/SectorHeatmap';
import IntelTable from './components/IntelTable';
import ReportForm from './components/ReportForm';
import CSVUpload from './components/CSVUpload';
import HeroMap from './components/HeroMap';
import SupplyChainMap from './components/SupplyChainMap';
import LiveTicker from './components/LiveTicker';
import { useLiveData } from './hooks/useLiveData';

type Tab = 'dashboard' | 'tactical' | 'supply' | 'intel' | 'submit';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const live = useLiveData();

  const tabs: { id: Tab; label: string }[] = [
    { id: 'dashboard', label: 'Resource HUD' },
    { id: 'tactical', label: 'Tactical Map' },
    { id: 'supply', label: 'Supply Chain' },
    { id: 'intel', label: 'Intelligence Feed' },
    { id: 'submit', label: 'Field Report' },
  ];

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-gray-200">
      <header className="border-b border-gray-800 bg-[#0d1220] px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`h-3 w-3 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.6)] ${live.connected ? 'bg-emerald-500 animate-pulse' : 'bg-emerald-500'}`} />
            <h1 className="sentinel-display text-3xl font-bold leading-none text-white">
              PROJECT SENTINEL
            </h1>
            <span className={`ml-2 rounded px-2 py-0.5 text-xs font-medium ${live.connected ? 'bg-emerald-900/50 text-emerald-400' : 'bg-gray-800 text-gray-500'}`}>
              {live.connected ? 'LIVE' : 'ONLINE'}
            </span>
          </div>
          <nav className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`sentinel-display rounded px-4 py-2 text-lg leading-none font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-emerald-600 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <LiveTicker
              connected={live.connected}
              simTime={live.simTime}
              progress={live.progress}
              currentTick={live.currentTick}
              fullTimeline={live.fullTimeline}
              timelineLoaded={live.timelineLoaded}
            />
            <StatCards analytics={live.currentTick?.analytics} simTime={live.simTime} />
            <SectorHeatmap analytics={live.currentTick?.analytics} />
          </div>
        )}
        {activeTab === 'tactical' && (
          <div className="space-y-6">
            <HeroMap simTime={live.simTime || undefined} />
          </div>
        )}
        {activeTab === 'supply' && (
          <div className="space-y-6">
            <SupplyChainMap simTime={live.simTime || undefined} />
          </div>
        )}
        {activeTab === 'intel' && <IntelTable />}
        {activeTab === 'submit' && (
          <div className="grid gap-6 lg:grid-cols-2">
            <ReportForm />
            <CSVUpload />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
