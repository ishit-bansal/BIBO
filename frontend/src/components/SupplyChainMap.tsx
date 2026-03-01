import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchSupplyOverview } from '../services/api';
import type { SupplyOverview, Shipment, FactoryState } from '../services/api';

/* ── sprite imports ──────────────────────────────────── */

const FACTORY_SPRITES: Record<string, string> = {
  factory: new URL('../assets/sprites/supplier_icons/factory.png', import.meta.url).href,
  hospital: new URL('../assets/sprites/supplier_icons/hospital.png', import.meta.url).href,
  vibranium_mine: new URL('../assets/sprites/supplier_icons/vibranium_mine.png', import.meta.url).href,
  water_wheel: new URL('../assets/sprites/supplier_icons/water_wheel.png', import.meta.url).href,
};

/* ── colours ──────────────────────────────────────────── */

const RESOURCE_COLORS: Record<string, string> = {
  'Arc Reactor Cores': '#3b82f6',
  'Vibranium (kg)': '#8b5cf6',
  'Medical Kits': '#10b981',
  'Clean Water (L)': '#06b6d4',
  'Pym Particles': '#f59e0b',
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#ef4444',
  high: '#f59e0b',
  normal: '#3b82f6',
  low: '#6b7280',
};

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  in_transit: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'IN TRANSIT' },
  pending: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'PENDING' },
  delivered: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'DELIVERED' },
};

/* ── CSS (no pulse animation) ────────────────────────── */

const SUPPLY_CSS = `
.leaflet-popup-content-wrapper {
  background: #ffffff !important;
  color: #0f172a !important;
  border: 1px solid #e2e8f0 !important;
  border-radius: 12px !important;
  box-shadow: 0 4px 20px rgba(0,0,0,.12) !important;
}
.leaflet-popup-tip {
  background: #ffffff !important;
  border: 1px solid #e2e8f0 !important;
}
.leaflet-popup-close-button {
  color: #64748b !important;
}
`;

function injectCSS() {
  if (document.getElementById('supply-map-css')) return;
  const style = document.createElement('style');
  style.id = 'supply-map-css';
  style.textContent = SUPPLY_CSS;
  document.head.appendChild(style);
}

/* ── icon builders ────────────────────────────────────── */

function factoryIcon(iconKey: string, color: string) {
  const spriteUrl = FACTORY_SPRITES[iconKey];
  if (spriteUrl) {
    return L.divIcon({
      className: '',
      iconSize: [56, 56],
      iconAnchor: [28, 28],
      popupAnchor: [0, -30],
      html: `<div style="width:56px;height:56px;display:flex;align-items:center;justify-content:center;
                   cursor:pointer;position:relative;z-index:500;filter:drop-shadow(0 0 6px ${color});">
               <img src="${spriteUrl}" alt="factory" style="width:56px;height:56px;object-fit:contain;image-rendering:pixelated;" />
             </div>`,
    });
  }
  return L.divIcon({
    className: '',
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    popupAnchor: [0, -26],
    html: `<div style="width:48px;height:48px;border-radius:10px;border:2px solid ${color};
                 background:rgba(255,255,255,.9);display:flex;align-items:center;justify-content:center;
                 font-size:22px;box-shadow:0 0 8px ${color};cursor:pointer;position:relative;z-index:500;">
             📍
           </div>`,
  });
}

function heroDestIcon(emoji: string) {
  return L.divIcon({
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
    html: `<div style="width:28px;height:28px;border-radius:50%;border:2px solid #10b981;
                 background:rgba(255,255,255,.9);display:flex;align-items:center;justify-content:center;
                 font-size:14px;box-shadow:0 0 6px #10b981;cursor:pointer;position:relative;z-index:400;">
             ${emoji}
           </div>`,
  });
}

/* ── auto-fly ─────────────────────────────────────────── */

function FlyTo({ coords, zoom }: { coords: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(coords, zoom, { duration: 1.2 });
  }, [coords, zoom, map]);
  return null;
}

/* ── curved arc between two points ────────────────────── */

function computeArcPoints(
  src: [number, number],
  dst: [number, number],
  numPoints = 50,
  curvature = 0.3,
): [number, number][] {
  const points: [number, number][] = [];
  const midLat = (src[0] + dst[0]) / 2;
  const midLon = (src[1] + dst[1]) / 2;
  const dx = dst[1] - src[1];
  const dy = dst[0] - src[0];
  const dist = Math.sqrt(dx * dx + dy * dy);
  const offsetLat = midLat + (-dx / dist) * dist * curvature;
  const offsetLon = midLon + (dy / dist) * dist * curvature;

  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const lat = (1 - t) * (1 - t) * src[0] + 2 * (1 - t) * t * offsetLat + t * t * dst[0];
    const lon = (1 - t) * (1 - t) * src[1] + 2 * (1 - t) * t * offsetLon + t * t * dst[1];
    points.push([lat, lon]);
  }
  return points;
}

/* ── shipment arc component ───────────────────────────── */

function ShipmentArc({ shipment, isSelected, onClick }: {
  shipment: Shipment;
  isSelected: boolean;
  onClick: () => void;
}) {
  const src: [number, number] = [shipment.source_lat, shipment.source_lon];
  const dst: [number, number] = [shipment.dest_lat, shipment.dest_lon];
  const arcPoints = useMemo(() => computeArcPoints(src, dst), [src[0], src[1], dst[0], dst[1]]);
  const color = RESOURCE_COLORS[shipment.resource_type] || '#3b82f6';

  const progressIdx = Math.floor((shipment.progress_pct / 100) * arcPoints.length);
  const completedPath = arcPoints.slice(0, Math.max(2, progressIdx));
  const remainingPath = arcPoints.slice(Math.max(0, progressIdx - 1));
  const dotPos = arcPoints[Math.min(progressIdx, arcPoints.length - 1)];

  return (
    <>
      <Polyline
        positions={completedPath}
        pathOptions={{
          color,
          weight: isSelected ? 4 : 3,
          opacity: 0.85,
        }}
        eventHandlers={{ click: onClick }}
      />
      <Polyline
        positions={remainingPath}
        pathOptions={{
          color,
          weight: isSelected ? 3 : 2,
          opacity: 0.25,
          dashArray: '8 6',
        }}
        eventHandlers={{ click: onClick }}
      />
      <CircleMarker
        center={dotPos}
        radius={isSelected ? 7 : 5}
        pathOptions={{
          color: '#ffffff',
          fillColor: color,
          fillOpacity: 1,
          weight: 2,
        }}
      >
        <Popup maxWidth={260}>
          <div className="text-xs">
            <div className="font-bold text-sm mb-1.5" style={{ color }}>{shipment.shipment_id}</div>
            <div className="space-y-0.5">
              <div><span className="text-gray-500 font-medium">Resource:</span> <span className="text-gray-800">{shipment.resource_type}</span></div>
              <div><span className="text-gray-500 font-medium">Qty:</span> <span className="text-gray-800">{shipment.quantity.toLocaleString()}</span></div>
              <div><span className="text-gray-500 font-medium">From:</span> <span className="text-gray-800">{shipment.source_name}</span></div>
              <div><span className="text-gray-500 font-medium">To:</span> <span className="text-gray-800">{shipment.dest_hero} ({shipment.dest_sector})</span></div>
              <div><span className="text-gray-500 font-medium">Progress:</span> <span className="text-gray-800 font-semibold">{shipment.progress_pct}%</span></div>
              <div><span className="text-gray-500 font-medium">ETA:</span> <span className="text-gray-800">{shipment.eta_hours}h</span></div>
            </div>
          </div>
        </Popup>
      </CircleMarker>
    </>
  );
}

/* ── factory popup ────────────────────────────────────── */

function FactoryPopup({ factory }: { factory: FactoryState }) {
  const spriteUrl = FACTORY_SPRITES[factory.icon];
  return (
    <div className="w-64">
      <div className="flex items-center gap-3 mb-3">
        {spriteUrl ? (
          <img src={spriteUrl} alt={factory.name} style={{ width: 36, height: 36, objectFit: 'contain', imageRendering: 'pixelated' as const }} />
        ) : (
          <span className="text-xl">{factory.icon}</span>
        )}
        <div>
          <div className="font-bold text-sm text-gray-900">{factory.name}</div>
          <div className="text-[10px] text-gray-500">{factory.sector}</div>
        </div>
      </div>
      {Object.entries(factory.resources).map(([res, info]) => {
        const color = RESOURCE_COLORS[res] || '#6b7280';
        const barColor = info.critical ? '#ef4444' : info.warning ? '#f59e0b' : '#10b981';
        return (
          <div key={res} className="mb-2">
            <div className="flex justify-between text-[10px] mb-0.5">
              <span className="font-medium" style={{ color }}>{res}</span>
              <span className="text-gray-600">{Math.round(info.current_stock)} / {info.max_capacity}</span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${info.fill_pct}%`, background: barColor }} />
            </div>
            <div className="flex justify-between text-[9px] text-gray-500 mt-0.5">
              <span>+{info.production_rate}/hr</span>
              <span>{info.total_shipped} shipped</span>
              {info.hours_until_empty && <span className="text-red-500 font-medium">Empty in {Math.round(info.hours_until_empty)}h</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── sidebar shipment list ────────────────────────────── */

function ShipmentList({ shipments, selectedId, onSelect }: {
  shipments: Shipment[];
  selectedId: string | null;
  onSelect: (s: Shipment) => void;
}) {
  if (shipments.length === 0) {
    return <div className="text-xs text-gray-500 p-2">No active shipments</div>;
  }
  return (
    <div className="space-y-1.5 max-h-[calc(100vh-400px)] overflow-y-auto pr-1 custom-scrollbar bg-white">
      {shipments.map(s => {
        const color = RESOURCE_COLORS[s.resource_type] || '#3b82f6';
        const isActive = s.shipment_id === selectedId;
        return (
          <button
            key={s.shipment_id}
            onClick={() => onSelect(s)}
            className={`w-full text-left p-2 rounded-lg transition-colors ${
              isActive ? 'bg-blue-50 border border-blue-300' : 'bg-white hover:bg-gray-50 border border-gray-200'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <div className="h-2 w-2 rounded-full" style={{ background: color }} />
              <span className="text-[10px] font-bold text-gray-800">{s.shipment_id}</span>
              <span className="ml-auto text-[9px] font-bold px-1 rounded"
                    style={{ color: PRIORITY_COLORS[s.priority] }}>
                {s.priority.toUpperCase()}
              </span>
            </div>
            <div className="text-[10px] text-gray-600 truncate">{s.resource_type} x{s.quantity}</div>
            <div className="text-[10px] text-gray-500 truncate">
              {s.source_name.split(' ').slice(0, 2).join(' ')} → {s.dest_hero}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${s.progress_pct}%`, background: color }} />
              </div>
              <span className="text-[9px] font-mono text-gray-600 font-medium">{s.progress_pct}%</span>
            </div>
            <div className="text-[9px] text-gray-500 mt-0.5">ETA: {s.eta_hours > 0 ? `${s.eta_hours}h` : 'Arrived'}</div>
          </button>
        );
      })}
    </div>
  );
}

/* ── factory stock sidebar ────────────────────────────── */

function FactoryStockPanel({ factories, onFlyTo }: {
  factories: FactoryState[];
  onFlyTo: (coords: [number, number]) => void;
}) {
  return (
    <div className="space-y-2 max-h-52 overflow-y-auto pr-1 custom-scrollbar">
      {factories.map(f => {
        const hasWarning = Object.values(f.resources).some(r => r.warning);
        const spriteUrl = FACTORY_SPRITES[f.icon];
        return (
          <button
            key={f.id}
            onClick={() => onFlyTo(f.coords)}
            className="w-full text-left p-2 rounded-lg bg-white hover:bg-gray-50 border border-gray-200 transition-colors"
          >
            <div className="flex items-center gap-2 mb-1">
              {spriteUrl ? (
                <img src={spriteUrl} alt={f.name} style={{ width: 20, height: 20, objectFit: 'contain', imageRendering: 'pixelated' as const }} />
              ) : (
                <span className="text-sm">{f.icon}</span>
              )}
              <span className="text-[10px] font-bold text-gray-800 truncate">{f.name}</span>
              {hasWarning && <span className="ml-auto text-[9px] text-red-500 font-medium">⚠</span>}
            </div>
            {Object.entries(f.resources).map(([res, info]) => {
              const barColor = info.critical ? '#ef4444' : info.warning ? '#f59e0b' : '#10b981';
              return (
                <div key={res} className="mb-0.5">
                  <div className="flex justify-between text-[9px] text-gray-600">
                    <span>{res.split(' ')[0]}</span>
                    <span>{info.fill_pct}%</span>
                  </div>
                  <div className="h-1 rounded-full bg-gray-200 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${info.fill_pct}%`, background: barColor }} />
                  </div>
                </div>
              );
            })}
          </button>
        );
      })}
    </div>
  );
}

/* ── shipment detail panel (below map) ────────────────── */

function ShipmentDetail({ shipment, onClose }: { shipment: Shipment; onClose: () => void }) {
  const color = RESOURCE_COLORS[shipment.resource_type] || '#3b82f6';
  const badge = STATUS_BADGE[shipment.status] || STATUS_BADGE.pending;
  const departDt = new Date(shipment.depart_time);
  const arriveDt = new Date(shipment.arrive_time);

  return (
    <div className="border-t border-gray-300 bg-white px-5 py-3">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-bold text-gray-900">{shipment.shipment_id}</span>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${badge.bg} ${badge.text}`}>{badge.label}</span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ color: PRIORITY_COLORS[shipment.priority], background: `${PRIORITY_COLORS[shipment.priority]}15`, border: `1px solid ${PRIORITY_COLORS[shipment.priority]}33` }}>
              {shipment.priority.toUpperCase()}
            </span>
          </div>
          <div className="text-[10px] text-gray-600">
            <span className="font-medium" style={{ color }}>{shipment.resource_type}</span> x{shipment.quantity.toLocaleString()} · {shipment.source_name} → {shipment.dest_hero} ({shipment.dest_sector})
          </div>
        </div>

        <div className="flex gap-3">
          <div className="text-center px-3 py-1 rounded bg-gray-50 border border-gray-200">
            <div className="text-sm font-bold font-mono" style={{ color }}>{shipment.progress_pct}%</div>
            <div className="text-[9px] text-gray-500">Progress</div>
          </div>
          <div className="text-center px-3 py-1 rounded bg-gray-50 border border-gray-200">
            <div className="text-sm font-bold font-mono text-gray-800">{shipment.eta_hours > 0 ? `${shipment.eta_hours}h` : '✓'}</div>
            <div className="text-[9px] text-gray-500">ETA</div>
          </div>
          <div className="text-center px-3 py-1 rounded bg-gray-50 border border-gray-200">
            <div className="text-sm font-bold font-mono text-gray-700">
              {departDt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
            <div className="text-[9px] text-gray-500">Departed</div>
          </div>
          <div className="text-center px-3 py-1 rounded bg-gray-50 border border-gray-200">
            <div className="text-sm font-bold font-mono text-gray-700">
              {arriveDt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
            <div className="text-[9px] text-gray-500">Arrives</div>
          </div>
        </div>

        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm px-1">✕</button>
      </div>

      <div className="mt-2 h-2 rounded-full bg-gray-200 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${shipment.progress_pct}%`, background: `linear-gradient(90deg, ${color}, ${color}cc)` }} />
      </div>
      <div className="flex justify-between mt-1 text-[9px] text-gray-500">
        <span>{shipment.source_name}</span>
        <span>{shipment.dest_hero} — {shipment.dest_sector}</span>
      </div>
    </div>
  );
}

/* ── unique hero icons for destinations ───────────────── */

const HERO_EMOJI: Record<string, string> = {
  Thor: '⚡', Spiderman: '🕷️', Batman: '🦇',
  'Captain America': '🦅', Hulk: '💪', Superman: '💫',
};

/* ── main SupplyChainMap ──────────────────────────────── */

export default function SupplyChainMap({ simTime }: { simTime?: string }) {
  const [data, setData] = useState<SupplyOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [flyTarget, setFlyTarget] = useState<{ coords: [number, number]; zoom: number } | null>(null);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [showFilter, setShowFilter] = useState<'all' | 'in_transit' | 'pending'>('in_transit');
  const lastFetchedTime = useRef('');

  const fetchData = useCallback((time?: string) => {
    fetchSupplyOverview(time).then(d => {
      setData(d);
      lastFetchedTime.current = time || '';
    }).catch(err => console.error('Supply fetch error:', err));
  }, []);

  useEffect(() => {
    injectCSS();
    fetchData(simTime);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!simTime) return;
    const prev = lastFetchedTime.current;
    if (!prev) { lastFetchedTime.current = simTime; return; }
    const prevH = prev.slice(0, 13);
    const curH = simTime.slice(0, 13);
    if (prevH === curH) return;
    fetchData(simTime);
  }, [simTime, fetchData]);

  const activeShipments = useMemo(() => {
    if (!data) return [];
    if (showFilter === 'all') return [...data.active_shipments, ...data.pending_shipments];
    if (showFilter === 'pending') return data.pending_shipments;
    return data.active_shipments;
  }, [data, showFilter]);

  const uniqueDestinations = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    const dests: { hero: string; coords: [number, number] }[] = [];
    for (const s of data.active_shipments) {
      if (!seen.has(s.dest_hero)) {
        seen.add(s.dest_hero);
        dests.push({ hero: s.dest_hero, coords: [s.dest_lat, s.dest_lon] });
      }
    }
    return dests;
  }, [data]);

  if (loading || !data) {
    return (
      <div className="basic-container-shaded supply-map-light rounded-lg border border-gray-300 bg-white p-6">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-4" />
        <div className="h-[500px] bg-gray-100 rounded animate-pulse flex items-center justify-center">
          <span className="text-gray-600">Loading Supply Chain…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="basic-container-shaded supply-map-light rounded-lg border border-gray-300 bg-white overflow-hidden">
      {/* header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-300 bg-white">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-blue-500" />
          <h2 className="font-bold text-gray-900 text-sm tracking-wide">SUPPLY CHAIN</h2>
          <span className="text-[10px] text-gray-500">LIVE</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-[10px]">
            <span className="text-blue-600 font-bold">{data.active_shipments.length} in transit</span>
            <span className="text-amber-600">{data.pending_shipments.length} pending</span>
            <span className="text-emerald-600">{data.delivered_count} delivered</span>
          </div>
          {data.warnings.length > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-red-500 text-[10px] font-medium">⚠ {data.warnings.length} stock alert{data.warnings.length > 1 ? 's' : ''}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            {Object.entries(RESOURCE_COLORS).map(([res, col]) => (
              <div key={res} className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ background: col }} />
                <span className="text-[9px] text-gray-600">{res.split(' ')[0]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex" style={{ height: 520 }}>
        {/* sidebar */}
        <div className="w-72 border-r border-gray-300 bg-white p-4 flex flex-col">
          <div className="flex gap-1 mb-2">
            {(['in_transit', 'pending', 'all'] as const).map(f => (
              <button
                key={f}
                onClick={() => setShowFilter(f)}
                className={`flex-1 text-[9px] font-bold py-1 rounded transition-colors ${
                  showFilter === f ? 'bg-blue-100 text-blue-700 border border-blue-300' : 'bg-white text-gray-600 border border-gray-300 hover:text-gray-800'
                }`}
              >
                {f === 'in_transit' ? 'ACTIVE' : f.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="text-[10px] font-bold text-gray-700 uppercase tracking-wider mb-2">
            Shipments ({activeShipments.length})
          </div>
          <ShipmentList
            shipments={activeShipments}
            selectedId={selectedShipment?.shipment_id ?? null}
            onSelect={s => {
              setSelectedShipment(prev => prev?.shipment_id === s.shipment_id ? null : s);
              setFlyTarget({
                coords: [(s.source_lat + s.dest_lat) / 2, (s.source_lon + s.dest_lon) / 2],
                zoom: 4,
              });
            }}
          />

          <div className="mt-3 pt-3 border-t border-gray-300">
            <div className="text-[10px] font-bold text-gray-700 uppercase tracking-wider mb-2">Factory Stock</div>
            <FactoryStockPanel
              factories={data.factories}
              onFlyTo={coords => setFlyTarget({ coords, zoom: 6 })}
            />
          </div>
        </div>

        {/* map */}
        <div className="flex-1 relative">
          <MapContainer
            center={[30, 10]}
            zoom={2}
            minZoom={2}
            maxZoom={16}
            style={{ height: '100%', width: '100%', background: '#ffffff' }}
            zoomControl={false}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            />

            {flyTarget && <FlyTo coords={flyTarget.coords} zoom={flyTarget.zoom} />}

            {/* factory markers */}
            {data.factories.map(f => {
              const hasWarning = Object.values(f.resources).some(r => r.warning);
              return (
                <Marker
                  key={f.id}
                  position={f.coords}
                  icon={factoryIcon(f.icon, hasWarning ? '#ef4444' : '#3b82f6')}
                  zIndexOffset={1000}
                >
                  <Popup maxWidth={300}><FactoryPopup factory={f} /></Popup>
                </Marker>
              );
            })}

            {/* hero destination markers */}
            {uniqueDestinations.map(d => (
              <Marker
                key={d.hero}
                position={d.coords}
                icon={heroDestIcon(HERO_EMOJI[d.hero] || '📍')}
              />
            ))}

            {/* shipment arcs */}
            {data.active_shipments.map(s => (
              <ShipmentArc
                key={s.shipment_id}
                shipment={s}
                isSelected={selectedShipment?.shipment_id === s.shipment_id}
                onClick={() => setSelectedShipment(prev => prev?.shipment_id === s.shipment_id ? null : s)}
              />
            ))}
          </MapContainer>
        </div>
      </div>

      {/* shipment detail panel */}
      {selectedShipment && (
        <ShipmentDetail
          shipment={selectedShipment}
          onClose={() => setSelectedShipment(null)}
        />
      )}
    </div>
  );
}
