import { useState, useRef, useEffect, useCallback } from 'react';
import './index.css';
import StatCards from './components/StatCards';
import SectorHeatmap from './components/SectorHeatmap';
import IntelTable from './components/IntelTable';
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

type Tab = 'analyze' | 'dashboard' | 'ops' | 'intel' | 'personnel';

function canAccess(tabRole: UserRole, userRole: UserRole): boolean {
  if (userRole === 'admin') return true;
  return tabRole === 'user';
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
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

  const handleLogout = () => {
    setAuthUser(null);
    setActiveTab('dashboard');
  };

  const navBtn = (id: Tab, label: string, isLive?: boolean) => (
    <button
      key={id}
      onClick={() => setActiveTab(id)}
      className={`top-nav-tab sentinel-display rounded px-4 py-2 text-lg leading-none font-medium transition-colors flex items-center gap-1.5 ${
        activeTab === id
          ? 'bg-emerald-600 text-white'
          : 'text-white hover:bg-gray-800 hover:text-white'
      }`}
    >
      {isLive && live.connected && (
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
      )}
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
              {navBtn('dashboard', 'Resources', true)}
              {navBtn('ops', 'Operations', true)}
              {navBtn('intel', 'Intelligence')}
              {navBtn('analyze', 'Data Lab')}
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
              simComplete={live.simComplete}
              onRestart={live.restartSim}
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
        {activeTab === 'personnel' && canAccess('admin', authUser.role) && (
          <UserManagement currentUser={authUser} />
        )}
      </main>
    </div>
  );
}

export default App;
