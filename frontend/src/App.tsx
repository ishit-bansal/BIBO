import { useState } from 'react';
import './index.css';
import StatCards from './components/StatCards';
import ResourceChart from './components/ResourceChart';
import SectorHeatmap from './components/SectorHeatmap';
import IntelTable from './components/IntelTable';
import ReportForm from './components/ReportForm';
import CSVUpload from './components/CSVUpload';

type Tab = 'dashboard' | 'intel' | 'submit';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'dashboard', label: 'Resource HUD' },
    { id: 'intel', label: 'Intelligence Feed' },
    { id: 'submit', label: 'Field Report' },
  ];

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-gray-200">
      <header className="border-b border-gray-800 bg-[#0d1220] px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
            <h1 className="text-xl font-bold tracking-wide text-white">
              PROJECT SENTINEL
            </h1>
            <span className="ml-2 rounded bg-emerald-900/50 px-2 py-0.5 text-xs font-medium text-emerald-400">
              ONLINE
            </span>
          </div>
          <nav className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`rounded px-4 py-2 text-sm font-medium transition-colors ${
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
            <StatCards />
            <ResourceChart />
            <SectorHeatmap />
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
