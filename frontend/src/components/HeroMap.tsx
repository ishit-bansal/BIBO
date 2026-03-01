import { useEffect, useState, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchSectorSummaries, fetchHeroEvents } from '../services/api';
import type { SectorSummary, SectorEvent, Hero, HeroMission } from '../services/api';

/* ── colour helpers ───────────────────────────────────── */

const THREAT_COLOURS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f59e0b',
  medium: '#3b82f6',
  stable: '#10b981',
};

const STATUS_COLOURS: Record<string, string> = {
  critical: '#ef4444',
  engaged: '#f59e0b',
  active: '#10b981',
  standby: '#6b7280',
};

/* ── pulsing CSS (injected once) ──────────────────────── */

const PULSE_CSS = `
@keyframes sentinel-pulse {
  0%   { transform: scale(1);   opacity: .9; }
  70%  { transform: scale(2.8); opacity: 0; }
  100% { transform: scale(2.8); opacity: 0; }
}
@keyframes sentinel-glow {
  0%, 100% { box-shadow: 0 0 6px 2px var(--glow); }
  50%      { box-shadow: 0 0 18px 6px var(--glow); }
}
.sentinel-marker {
  animation: sentinel-glow 2s ease-in-out infinite;
  border-radius: 50%;
  border: 2px solid currentColor;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  cursor: pointer;
  position: relative;
  z-index: 500;
}
.sentinel-pulse-ring {
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 2px solid var(--glow);
  animation: sentinel-pulse 2s ease-out infinite;
  pointer-events: none;
}
.leaflet-popup-content-wrapper {
  background: #111827 !important;
  color: #e5e7eb !important;
  border: 1px solid #374151 !important;
  border-radius: 12px !important;
  box-shadow: 0 0 30px rgba(0,0,0,.6) !important;
}
.leaflet-popup-tip {
  background: #111827 !important;
  border: 1px solid #374151 !important;
}
.leaflet-popup-close-button {
  color: #9ca3af !important;
}
`;

function injectCSS() {
  if (document.getElementById('sentinel-map-css')) return;
  const style = document.createElement('style');
  style.id = 'sentinel-map-css';
  style.textContent = PULSE_CSS;
  document.head.appendChild(style);
}

/* ── icon builders ────────────────────────────────────── */

function sectorIcon(emoji: string, color: string, size: number) {
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 4],
    html: `<div class="sentinel-marker" style="width:${size}px;height:${size}px;color:${color};--glow:${color};background:rgba(0,0,0,.7);">
             <div class="sentinel-pulse-ring"></div>
             <span style="position:relative;z-index:1">${emoji}</span>
           </div>`,
  });
}

function heroIcon(emoji: string, color: string) {
  return L.divIcon({
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
    html: `<div style="width:32px;height:32px;border-radius:50%;border:2px solid ${color};
                 background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;
                 font-size:14px;box-shadow:0 0 8px ${color};cursor:pointer;position:relative;z-index:400;">
             ${emoji}
           </div>`,
  });
}

const SECTOR_EMOJI: Record<string, string> = {
  'New Asgard': '⚡',
  'Wakanda': '🐾',
  'Sokovia': '🔮',
  'Sanctum Sanctorum': '✨',
  'Avengers Compound': '🦅',
};

/* ── auto-fly component ───────────────────────────────── */

function FlyTo({ coords, zoom }: { coords: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(coords, zoom, { duration: 1.5 });
  }, [coords, zoom, map]);
  return null;
}

/* ── health bar ───────────────────────────────────────── */

function HealthBar({ value, label }: { value: number; label: string }) {
  const color = value > 70 ? '#10b981' : value > 40 ? '#f59e0b' : '#ef4444';
  return (
    <div className="mb-1">
      <div className="flex justify-between text-[10px] text-gray-400 mb-0.5">
        <span>{label}</span><span>{value}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-700 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

/* ── time helper ──────────────────────────────────────── */

function missionDuration(startISO: string) {
  const hrs = Math.floor((Date.now() - new Date(startISO).getTime()) / 3_600_000);
  if (hrs < 1) return '<1h';
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d ${hrs % 24}h`;
}

function fmtHours(h: number) {
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  const rem = h % 24;
  return rem > 0 ? `${d}d ${rem}h` : `${d}d`;
}

/* ── hero popup card ──────────────────────────────────── */

function HeroCard({ hero }: { hero: Hero }) {
  const sc = STATUS_COLOURS[hero.status] || '#6b7280';
  return (
    <div className="w-56">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{hero.avatar}</span>
        <div>
          <div className="font-bold text-sm text-white">{hero.alias}</div>
          <div className="text-[10px] text-gray-400">{hero.name}</div>
        </div>
        <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: `${sc}22`, color: sc, border: `1px solid ${sc}` }}>
          {hero.status.toUpperCase()}
        </span>
      </div>

      <HealthBar value={hero.health} label="Health" />
      <HealthBar value={hero.vitals.energy_reserves} label="Energy" />
      <HealthBar value={hero.vitals.shield_integrity} label="Shield" />

      <div className="mt-2 p-2 rounded bg-gray-800/60 text-[10px] text-gray-300 leading-relaxed">
        <span className="text-gray-500">MISSION:</span> {hero.mission}
      </div>
      <div className="flex justify-between mt-1.5 text-[10px] text-gray-500">
        <span>Duration: {missionDuration(hero.mission_start)}</span>
        <span>Comms: <span style={{ color: hero.comms === 'online' ? '#10b981' : '#ef4444' }}>{hero.comms}</span></span>
      </div>
      <div className="mt-1.5 p-1.5 rounded bg-gray-900/50 text-[10px] text-gray-400 italic">
        {hero.recent_activity}
      </div>
    </div>
  );
}

/* ── sector popup card ────────────────────────────────── */

function SectorCard({ sector }: { sector: SectorSummary }) {
  const tc = THREAT_COLOURS[sector.threat_level];
  return (
    <div className="w-64">
      <div className="flex items-center justify-between mb-2">
        <div className="font-bold text-white">{sector.sector_id}</div>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: `${tc}22`, color: tc, border: `1px solid ${tc}` }}>
          {sector.threat_level.toUpperCase()}
        </span>
      </div>

      <div className="flex gap-3 mb-2 text-[10px]">
        <div className="flex items-center gap-1">
          <span className="text-base">{sector.weather.icon}</span>
          <span className="text-gray-300">{sector.weather.condition}</span>
        </div>
        <span className="text-gray-500">{sector.weather.temp_c}°C</span>
        <span className="text-gray-500">{sector.weather.wind_kph} km/h</span>
      </div>

      <HealthBar value={sector.avg_health} label={`Avg Health (${sector.hero_count} heroes)`} />

      {sector.active_events.length > 0 && (
        <div className="mt-2 space-y-1">
          {sector.active_events.map(evt => (
            <div key={evt.id} className="p-1.5 rounded text-[10px]" style={{ background: `${THREAT_COLOURS[evt.severity]}11`, border: `1px solid ${THREAT_COLOURS[evt.severity]}33` }}>
              <div className="font-semibold" style={{ color: THREAT_COLOURS[evt.severity] }}>{evt.title}</div>
              <div className="text-gray-400 mt-0.5">{evt.description.slice(0, 100)}…</div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 text-[10px] text-gray-500">
        Heroes: {sector.heroes.map(h => h.avatar).join(' ')}
      </div>
    </div>
  );
}

/* ── sidebar hero roster ──────────────────────────────── */

function HeroRoster({ heroes, selectedId, onSelect }: { heroes: Hero[]; selectedId: string | null; onSelect: (h: Hero) => void }) {
  const grouped = useMemo(() => {
    const map = new Map<string, Hero[]>();
    heroes.forEach(h => {
      const arr = map.get(h.sector_id) || [];
      arr.push(h);
      map.set(h.sector_id, arr);
    });
    return map;
  }, [heroes]);

  return (
    <div className="space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto pr-1 custom-scrollbar">
      {[...grouped.entries()].map(([sector, list]) => (
        <div key={sector}>
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">{sector}</div>
          {list.map(h => {
            const sc = STATUS_COLOURS[h.status];
            const isSelected = h.id === selectedId;
            return (
              <button
                key={h.id}
                onClick={() => onSelect(h)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded transition-colors text-left ${
                  isSelected ? 'bg-emerald-900/30 border border-emerald-700/50' : 'hover:bg-gray-800/60 border border-transparent'
                }`}
              >
                <span className="text-base">{h.avatar}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-gray-200 truncate">{h.alias}</div>
                  <div className="text-[10px] text-gray-500 truncate">{h.mission.split('—')[0]}</div>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-[9px] font-semibold px-1 rounded" style={{ color: sc }}>{h.status}</span>
                  <span className="text-[9px] text-gray-500">{h.health}%</span>
                </div>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ── event feed ───────────────────────────────────────── */

function EventFeed({ events, onFocus }: { events: SectorEvent[]; onFocus: (e: SectorEvent) => void }) {
  const sorted = useMemo(() => [...events].sort((a, b) => {
    const sev = { critical: 0, high: 1, medium: 2, low: 3 };
    if (a.active !== b.active) return a.active ? -1 : 1;
    return (sev[a.severity] ?? 4) - (sev[b.severity] ?? 4);
  }), [events]);

  return (
    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
      {sorted.map(evt => {
        const c = THREAT_COLOURS[evt.severity];
        return (
          <button key={evt.id} onClick={() => onFocus(evt)} className="w-full text-left p-2 rounded transition-colors hover:bg-gray-800/60" style={{ background: evt.active ? `${c}08` : 'transparent', borderLeft: `3px solid ${evt.active ? c : '#374151'}` }}>
            <div className="flex items-center gap-1.5">
              {evt.active && <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: c }} />}
              <span className="text-[10px] font-semibold" style={{ color: c }}>{evt.severity.toUpperCase()}</span>
              <span className="text-[10px] text-gray-400 ml-auto">{evt.sector_id}</span>
            </div>
            <div className="text-xs text-gray-200 mt-0.5">{evt.title}</div>
          </button>
        );
      })}
    </div>
  );
}

/* ── threat badge colours ─────────────────────────────── */

const MISSION_THREAT_BG: Record<string, string> = {
  critical: 'bg-red-900/50 text-red-400 border-red-700/50',
  high: 'bg-amber-900/50 text-amber-400 border-amber-700/50',
  medium: 'bg-blue-900/50 text-blue-400 border-blue-700/50',
  low: 'bg-gray-800/50 text-gray-400 border-gray-600/50',
};

/* ── mission detail modal (full table like screenshot) ── */

function MissionModal({ hero, onClose }: { hero: Hero; onClose: () => void }) {
  const missions = hero.mission_history || [];
  const sorted = [...missions].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const total = missions.length;
  const successes = missions.filter(m => m.outcome === 'success').length;
  const successRate = total > 0 ? ((successes / total) * 100).toFixed(1) : '0';
  const totalDuration = missions.reduce((s, m) => s + m.duration_hours, 0);
  const totalSaved = missions.reduce((s, m) => s + m.casualties_saved, 0);

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 backdrop-blur-sm"
         onClick={onClose}>
      <div className="w-full max-w-4xl mx-4 max-h-[85vh] flex flex-col rounded-xl border border-gray-700 bg-gradient-to-b from-[#111827] to-[#0a0e1a] shadow-2xl"
           onClick={e => e.stopPropagation()}>
        {/* header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-xl">{hero.avatar}</span>
              {hero.name}&apos;s Missions
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">{total} total missions &bull; {successes} successful</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl transition-colors px-2">✕</button>
        </div>

        {/* table */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#111827] border-b border-gray-800 text-gray-400 uppercase tracking-wider text-[10px]">
                <th className="text-left py-3 px-4 font-semibold">Date &amp; Time</th>
                <th className="text-left py-3 px-3 font-semibold">Sector</th>
                <th className="text-left py-3 px-3 font-semibold">Mission Type</th>
                <th className="text-center py-3 px-3 font-semibold">Duration</th>
                <th className="text-center py-3 px-3 font-semibold">Status</th>
                <th className="text-center py-3 px-3 font-semibold">Threat</th>
                <th className="text-right py-3 px-4 font-semibold">Lives Saved</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(m => {
                const pass = m.outcome === 'success';
                const dt = new Date(m.timestamp);
                const threatCls = MISSION_THREAT_BG[m.threat] || MISSION_THREAT_BG.medium;
                return (
                  <tr key={m.id} className="border-b border-gray-800/40 hover:bg-gray-800/30 transition-colors">
                    <td className="py-3 px-4 text-gray-300 whitespace-nowrap">
                      {dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} {dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                    </td>
                    <td className="py-3 px-3 text-gray-300">{m.sector}</td>
                    <td className="py-3 px-3 text-gray-200 font-medium">{m.mission_type}</td>
                    <td className="py-3 px-3 text-center text-gray-300 font-mono">{fmtHours(m.duration_hours)}</td>
                    <td className="py-3 px-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                        pass ? 'bg-emerald-900/50 text-emerald-400' : 'bg-red-900/50 text-red-400'
                      }`}>
                        {pass ? '✓' : '✗'} {pass ? 'Pass' : 'Fail'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded border text-[10px] font-semibold capitalize ${threatCls}`}>
                        {m.threat}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-cyan-400 font-semibold">
                      {m.casualties_saved > 0 ? m.casualties_saved.toLocaleString() : <span className="text-gray-600">0</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* summary footer */}
        <div className="border-t border-gray-700 bg-[#0d1220] px-6 py-3 flex items-center gap-8 rounded-b-xl">
          <div>
            <div className="text-[9px] text-gray-500 uppercase">Total Missions</div>
            <div className="text-lg font-bold text-cyan-400 font-mono">{total}</div>
          </div>
          <div>
            <div className="text-[9px] text-gray-500 uppercase">Success Rate</div>
            <div className={`text-lg font-bold font-mono ${Number(successRate) >= 80 ? 'text-emerald-400' : Number(successRate) >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
              {successRate}%
            </div>
          </div>
          <div>
            <div className="text-[9px] text-gray-500 uppercase">Total Duration</div>
            <div className="text-lg font-bold text-white font-mono">{fmtHours(totalDuration)}</div>
          </div>
          <div>
            <div className="text-[9px] text-gray-500 uppercase">Total Lives Saved</div>
            <div className="text-lg font-bold text-cyan-400 font-mono">{totalSaved.toLocaleString()}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── hero detail panel (below map) — summary bar ─────── */

function HeroDetailPanel({ hero, onClose }: { hero: Hero; onClose: () => void }) {
  const [showModal, setShowModal] = useState(false);
  const missions = hero.mission_history || [];
  const totalMissions = missions.length;
  const successes = missions.filter(m => m.outcome === 'success').length;
  const successRate = totalMissions > 0 ? Math.round((successes / totalMissions) * 100) : 0;
  const avgDuration = totalMissions > 0 ? Math.round(missions.reduce((s, m) => s + m.duration_hours, 0) / totalMissions) : 0;
  const totalSaved = missions.reduce((s, m) => s + m.casualties_saved, 0);

  const sc = STATUS_COLOURS[hero.status] || '#6b7280';

  return (
    <>
      <div className="border-t border-gray-700 bg-[#0a0e1a]">
        <div
          onClick={() => setShowModal(true)}
          className="w-full flex items-center gap-4 px-5 py-3 hover:bg-gray-800/30 transition-colors text-left cursor-pointer group"
          role="button"
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter') setShowModal(true); }}
        >
          <span className="text-2xl">{hero.avatar}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">{hero.alias}</span>
              <span className="text-[10px] text-gray-500">{hero.name}</span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: `${sc}22`, color: sc, border: `1px solid ${sc}` }}>
                {hero.status.toUpperCase()}
              </span>
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5 group-hover:text-gray-400 transition-colors">
              {hero.sector_id} — Click to view mission history
            </div>
          </div>

          <div className="flex gap-3">
            <div className="text-center px-3 py-1 rounded bg-gray-900/60 border border-gray-800">
              <div className="text-lg font-bold font-mono text-white">{totalMissions}</div>
              <div className="text-[9px] text-gray-500 uppercase">Missions</div>
            </div>
            <div className="text-center px-3 py-1 rounded bg-gray-900/60 border border-gray-800">
              <div className={`text-lg font-bold font-mono ${successRate >= 80 ? 'text-emerald-400' : successRate >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                {successRate}%
              </div>
              <div className="text-[9px] text-gray-500 uppercase">Success</div>
            </div>
            <div className="text-center px-3 py-1 rounded bg-gray-900/60 border border-gray-800">
              <div className="text-lg font-bold font-mono text-white">{fmtHours(avgDuration)}</div>
              <div className="text-[9px] text-gray-500 uppercase">Avg Duration</div>
            </div>
            <div className="text-center px-3 py-1 rounded bg-gray-900/60 border border-gray-800">
              <div className="text-lg font-bold font-mono text-cyan-400">{totalSaved.toLocaleString()}</div>
              <div className="text-[9px] text-gray-500 uppercase">Lives Saved</div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-gray-500 text-xs group-hover:text-emerald-400 transition-colors">▶ DETAILS</span>
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="text-gray-500 hover:text-gray-300 text-sm px-1"
            >
              ✕
            </button>
          </div>
        </div>
      </div>

      {showModal && (
        <MissionModal hero={hero} onClose={() => setShowModal(false)} />
      )}
    </>
  );
}

/* ── main HeroMap ─────────────────────────────────────── */

export default function HeroMap({ simTime }: { simTime?: string }) {
  const [sectors, setSectors] = useState<SectorSummary[]>([]);
  const [events, setEvents] = useState<SectorEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [flyTarget, setFlyTarget] = useState<{ coords: [number, number]; zoom: number } | null>(null);
  const [selectedHero, setSelectedHero] = useState<Hero | null>(null);
  const lastFetchedTime = useRef<string>('');
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    injectCSS();
    Promise.all([fetchSectorSummaries(simTime), fetchHeroEvents()])
      .then(([s, e]) => { setSectors(s); setEvents(e); lastFetchedTime.current = simTime || ''; })
      .finally(() => setLoading(false));
  }, []);

  // Re-fetch heroes when simTime changes significantly (new hour)
  useEffect(() => {
    if (!simTime) return;
    const prev = lastFetchedTime.current;
    if (!prev) { lastFetchedTime.current = simTime; return; }
    const prevH = prev.slice(0, 13);
    const curH = simTime.slice(0, 13);
    if (prevH === curH) return;

    lastFetchedTime.current = simTime;
    fetchSectorSummaries(simTime).then(s => {
      setSectors(s);
      if (selectedHero) {
        const updated = s.flatMap(sec => sec.heroes).find(h => h.id === selectedHero.id);
        if (updated) setSelectedHero(updated);
      }
    });
  }, [simTime, selectedHero]);

  const allHeroes = useMemo(() => sectors.flatMap(s => s.heroes), [sectors]);

  const handleHeroSelect = (h: Hero) => {
    setSelectedHero(prev => prev?.id === h.id ? null : h);
    setFlyTarget({ coords: h.coords, zoom: 10 });
  };

  const handleEventFocus = (e: SectorEvent) => {
    setFlyTarget({ coords: e.coords, zoom: 10 });
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-700 bg-[#0d1220] p-6">
        <div className="h-8 w-48 bg-gray-800 rounded animate-pulse mb-4" />
        <div className="h-[500px] bg-gray-800/50 rounded animate-pulse flex items-center justify-center">
          <span className="text-gray-600">Loading Tactical Map…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-700 bg-[#0d1220] overflow-hidden">
      {/* header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <h2 className="font-bold text-white text-sm tracking-wide">TACTICAL MAP</h2>
          <span className="text-[10px] text-gray-500">LIVE</span>
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          {Object.entries(THREAT_COLOURS).map(([level, color]) => (
            <div key={level} className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: color }} />
              <span className="text-gray-400 capitalize">{level}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex" style={{ height: 520 }}>
        {/* sidebar */}
        <div className="w-56 border-r border-gray-800 bg-[#0a0e1a] p-3 flex flex-col">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Hero Roster</div>
          <HeroRoster heroes={allHeroes} selectedId={selectedHero?.id ?? null} onSelect={handleHeroSelect} />

          <div className="mt-3 pt-3 border-t border-gray-800">
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Event Feed</div>
            <EventFeed events={events} onFocus={handleEventFocus} />
          </div>
        </div>

        {/* map */}
        <div className="flex-1 relative">
          <MapContainer
            center={[30, 10]}
            zoom={2}
            minZoom={2}
            maxZoom={16}
            style={{ height: '100%', width: '100%', background: '#0a0e1a' }}
            zoomControl={false}
            ref={mapRef}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            />

            {flyTarget && <FlyTo coords={flyTarget.coords} zoom={flyTarget.zoom} />}

            {sectors.map(sector => (
              <Marker
                key={sector.sector_id}
                position={sector.coords}
                icon={sectorIcon(
                  SECTOR_EMOJI[sector.sector_id] || '📍',
                  THREAT_COLOURS[sector.threat_level],
                  44
                )}
              >
                <Popup maxWidth={300}><SectorCard sector={sector} /></Popup>
              </Marker>
            ))}

            {allHeroes.map(hero => (
              <Marker
                key={hero.id}
                position={hero.coords}
                icon={heroIcon(hero.avatar, STATUS_COLOURS[hero.status])}
              >
                <Popup maxWidth={280}><HeroCard hero={hero} /></Popup>
              </Marker>
            ))}

            {events.filter(e => e.active).map(evt => (
              <CircleMarker
                key={evt.id}
                center={evt.coords}
                radius={25}
                pathOptions={{
                  color: THREAT_COLOURS[evt.severity],
                  fillColor: THREAT_COLOURS[evt.severity],
                  fillOpacity: 0.1,
                  weight: 2,
                  dashArray: '4 4',
                }}
              />
            ))}
          </MapContainer>

          {/* bottom stats bar */}
          <div className="absolute bottom-0 left-0 right-0 z-[1000] bg-gradient-to-t from-[#0a0e1a] to-transparent pt-8 pb-3 px-4">
            <div className="flex gap-4 justify-center">
              {sectors.map(s => {
                const tc = THREAT_COLOURS[s.threat_level];
                return (
                  <button
                    key={s.sector_id}
                    onClick={() => setFlyTarget({ coords: s.coords, zoom: 8 })}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-900/80 border border-gray-700 hover:border-gray-500 transition-colors"
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: tc }} />
                    <span className="text-[10px] font-medium text-gray-300">{s.sector_id}</span>
                    <span className="text-[10px] text-gray-500">{s.hero_count}h</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* hero detail panel — appears below map when a hero is selected */}
      {selectedHero && (
        <HeroDetailPanel
          hero={selectedHero}
          onClose={() => setSelectedHero(null)}
        />
      )}
    </div>
  );
}
