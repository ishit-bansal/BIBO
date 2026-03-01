import { useState, useRef, useEffect, useCallback } from 'react';
import './index.css';
import StatCards from './components/StatCards';
import SectorHeatmap from './components/SectorHeatmap';
import IntelTable from './components/IntelTable';
import ReportForm from './components/ReportForm';
import CSVUpload from './components/CSVUpload';
import HeroMap from './components/HeroMap';
import SupplyChainMap from './components/SupplyChainMap';
import LiveTicker from './components/LiveTicker';
import LoginPage from './components/LoginPage';
import UserManagement from './components/UserManagement';
import BoSprite from './components/BoSprite';
import ChatBot from './components/ChatBot';
import { useLiveData } from './hooks/useLiveData';
import type { AuthUser, UserRole } from './components/LoginPage';
import type { AnalysisResult } from './services/api';

const bgMusicUrl = new URL('./assets/sprites/sounds/background_sound.mp3', import.meta.url).href;

type Tab = 'analyze' | 'dashboard' | 'ops' | 'intel' | 'submit' | 'personnel';

const SUPPLY_CHAIN_TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: 'Resources' },
  { id: 'ops', label: 'Operations' },
  { id: 'intel', label: 'Intelligence' },
];

function canAccess(tabRole: UserRole, userRole: UserRole): boolean {
  if (userRole === 'admin') return true;
  return tabRole === 'user';
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('analyze');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [scOpen, setScOpen] = useState(false);
  const scRef = useRef<HTMLDivElement>(null);
  const live = useLiveData();
  const [snapInProgress, setSnapInProgress] = useState(false);
  const [snapCount, setSnapCount] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const clearSnapRef = useRef(live.clearSnap);
  clearSnapRef.current = live.clearSnap;

  useEffect(() => {
    if (live.snapEvent && !snapInProgress) {
      setSnapInProgress(true);
      setSnapCount(c => c + 1);
    }
  }, [live.snapEvent, snapInProgress]);

  const handleSnapComplete = useCallback(() => {
    setSnapInProgress(false);
    clearSnapRef.current();
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (scRef.current && !scRef.current.contains(e.target as Node)) setScOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [musicStarted, setMusicStarted] = useState(false);

  const startMusic = useCallback(() => {
    if (musicStarted) return;
    if (!audioRef.current) {
      const audio = new Audio(bgMusicUrl);
      audio.loop = true;
      audio.volume = 0.08;
      audioRef.current = audio;
    }
    audioRef.current.play().then(() => setMusicStarted(true)).catch(() => {});
  }, [musicStarted]);

  useEffect(() => {
    const handler = () => startMusic();
    document.addEventListener('click', handler, { once: true });
    return () => document.removeEventListener('click', handler);
  }, [startMusic]);

  if (!authUser) {
    return <LoginPage onLogin={setAuthUser} />;
  }

  const isAdmin = authUser.role === 'admin';
  const isSupplyChainActive = ['dashboard', 'ops', 'intel'].includes(activeTab);

  const handleLogout = () => {
    setAuthUser(null);
    setActiveTab('analyze');
  };

  const navBtn = (id: Tab, label: string) => (
    <button
      key={id}
      onClick={() => setActiveTab(id)}
      className={`top-nav-tab sentinel-display rounded px-4 py-2 text-lg leading-none font-medium transition-colors ${
        activeTab === id
          ? 'bg-emerald-600 text-white'
          : 'text-white hover:bg-gray-800 hover:text-white'
      }`}
    >
      {label}
    </button>
  );

  const isMainDashboard = activeTab === 'analyze';

  return (
    <div className="ui-polish-v1 min-h-screen bg-transparent text-gray-200">
      <BoSprite
        snapTriggered={snapInProgress}
        onSnapComplete={handleSnapComplete}
        visible={isMainDashboard}
        onClick={() => setChatOpen(prev => !prev)}
      />
      {isMainDashboard && (
        <ChatBot
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          analysisResult={analysisResult}
        />
      )}
      <header className="app-title-bar border-b border-gray-800 px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="m-0 leading-none">
              <span className="sr-only">PROJECT SENTINEL</span>
              <img
                src={new URL('./assets/sprites/environment/title_font.png', import.meta.url).href}
                alt="Project Sentinel"
                className="title-logo"
              />
            </h1>
            <span className={`ml-2 rounded px-2 py-0.5 text-xs font-medium ${live.connected ? 'bg-emerald-900/50 text-emerald-400' : 'bg-gray-800 text-gray-500'}`}>
              {live.connected ? 'LIVE' : 'ONLINE'}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <nav className="flex gap-1 items-center">
              {navBtn('analyze', 'Dashboard')}

              {/* Supply Chain dropdown */}
              <div ref={scRef} className="relative">
                <button
                  onClick={() => setScOpen(prev => !prev)}
                  className={`top-nav-tab sentinel-display rounded px-4 py-2 text-lg leading-none font-medium transition-colors flex items-center gap-1.5 ${
                    isSupplyChainActive
                      ? 'bg-emerald-600 text-white'
                      : 'text-white hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  Supply Chain
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`transition-transform ${scOpen ? 'rotate-180' : ''}`}>
                    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                {scOpen && (
                  <div className="sc-dropdown-panel absolute top-full left-0 mt-1 min-w-[180px] rounded-lg border border-gray-300 bg-white shadow-xl z-50 overflow-hidden">
                    {SUPPLY_CHAIN_TABS.map(t => (
                      <button
                        key={t.id}
                        onClick={() => { setActiveTab(t.id); setScOpen(false); }}
                        className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors sentinel-display ${
                          activeTab === t.id
                            ? 'bg-emerald-50 text-emerald-700 border-l-2 border-emerald-500'
                            : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {isAdmin && navBtn('submit', 'Testing')}
              {isAdmin && navBtn('personnel', 'Personnel')}
            </nav>

            <div className="flex items-center gap-2 ml-2 pl-3 border-l border-gray-800">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-400">{authUser.name}</span>
                <span className={`text-[9px] font-bold rounded px-1.5 py-0.5 ${
                  authUser.role === 'admin' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
                }`}>
                  {authUser.role.toUpperCase()}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="rounded p-1 text-gray-500 hover:text-red-400 hover:bg-gray-800 transition-colors"
                title="Logout"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        {activeTab === 'analyze' && <CSVUpload snapCount={snapCount} onAnalysisChange={setAnalysisResult} />}
        {activeTab === 'dashboard' && (
          <div className="resource-hud-page space-y-6">
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
        {activeTab === 'ops' && (
          <div className="space-y-8">
            <HeroMap simTime={live.simTime || undefined} />
            <SupplyChainMap simTime={live.simTime || undefined} />
          </div>
        )}
        {activeTab === 'intel' && <IntelTable isAdmin={isAdmin} />}
        {activeTab === 'submit' && canAccess('admin', authUser.role) && (
          <ReportForm />
        )}
        {activeTab === 'personnel' && canAccess('admin', authUser.role) && (
          <UserManagement currentUser={authUser} />
        )}
      </main>
    </div>
  );
}

export default App;
