import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || (
  import.meta.env.DEV ? 'http://localhost:8000' : ''
);

const API = axios.create({ baseURL: API_BASE });

export interface ResourceLog {
  id: number;
  timestamp: string;
  sector_id: string;
  resource_type: string;
  stock_level: number;
  usage_rate_hourly: number;
  snap_event_detected: boolean;
}

export interface LatestStock {
  sector_id: string;
  resource_type: string;
  stock_level: number;
  usage_rate_hourly: number;
  timestamp: string;
}

export interface IntelReport {
  id: number;
  report_id: string;
  hero_alias: string;
  secure_contact: string;
  raw_text: string;
  redacted_text: string | null;
  structured_data: {
    location: string;
    resource_mentioned: string;
    status: string;
    action_required: string;
    urgency: string;
  } | null;
  priority: string;
  timestamp: string;
  processed: boolean;
}

export interface Prediction {
  sector_id: string;
  resource_type: string;
  current_stock: number;
  depletion_rate: number;
  predicted_zero_date: string | null;
  hours_until_zero: number | null;
  confidence_score: number;
  status: string;
  data_points_used: number;
}

export const fetchSectors = () =>
  API.get<string[]>('/api/resources/sectors').then(r => r.data);

export const fetchResourceTypes = () =>
  API.get<string[]>('/api/resources/types').then(r => r.data);

export const fetchResources = (params: {
  sector_id?: string;
  resource_type?: string;
  limit?: number;
  offset?: number;
}) =>
  API.get<ResourceLog[]>('/api/resources', { params }).then(r => r.data);

export const fetchLatestStocks = () =>
  API.get<LatestStock[]>('/api/resources/latest').then(r => r.data);

export const fetchReports = (params?: {
  processed?: boolean;
  priority?: string;
  limit?: number;
  offset?: number;
}) =>
  API.get<IntelReport[]>('/api/reports', { params }).then(r => r.data);

export const submitReport = (data: {
  raw_text: string;
  hero_alias?: string;
  priority?: string;
}) =>
  API.post<IntelReport>('/api/reports', data).then(r => r.data);

export const batchProcessReports = () =>
  API.post<{ status: string; processed_count: number; error_count: number }>(
    '/api/reports/batch',
    undefined,
    { timeout: 300_000 },
  ).then(r => r.data);

export const resetReports = () =>
  API.post<{ status: string; report_count: number }>(
    '/api/reports/reset',
  ).then(r => r.data);

export const fetchPredictions = () =>
  API.get<Prediction[]>('/api/predictions').then(r => r.data);

export interface RedactionLog {
  report_id: string;
  original_text: string;
  redacted_text: string;
  redactions_applied: { type: string; original: string; replacement: string }[];
}

export const fetchRedactionLog = (reportId: string) =>
  API.get<RedactionLog>(`/api/reports/${encodeURIComponent(reportId)}/redaction-log`).then(r => r.data);

export interface TrendLine {
  sector_id: string;
  resource_type: string;
  slope: number;
  r_squared: number;
  ma_window: number;
  data_points_used: number;
  ma_series: { timestamp: string; ma_stock: number }[];
  forecast: { timestamp: string; predicted_stock: number }[];
}

export const fetchTrendLine = (sector: string, resourceType: string) =>
  API.get<TrendLine>(
    `/api/predictions/${encodeURIComponent(sector)}/${encodeURIComponent(resourceType)}/trend`
  ).then(r => r.data);

export interface TimelinePoint {
  timestamp: string;
  tick_index: number;
  total_ticks: number;
  analytics: Record<string, { avg_stock: number; avg_usage: number }>;
}

export const fetchTimeline = () =>
  API.get<TimelinePoint[]>('/api/resources/timeline').then(r => r.data);

export const uploadCSV = (file: File) => {
  const form = new FormData();
  form.append('file', file);
  return API.post<{ status: string; records_imported: number }>(
    '/api/resources/upload',
    form
  ).then(r => r.data);
};

/* ── Data Analysis Lab ──────────────────────────────── */

export interface AnalysisPairStats {
  current: number;
  min: number;
  max: number;
  mean: number;
  std_dev: number;
  depletion_rate: number;
  overall_slope: number;
  r_squared: number;
  noise_std: number;
  trend_acceleration: number;
  predicted_zero: string | null;
  hours_to_zero: number | null;
  status: 'stable' | 'warning' | 'critical' | 'depleted';
  data_points: number;
  risk_score: number;
  stock_pct: number;
  had_crash_recovery: boolean;
}

export interface WeeklyForecastDay {
  day: number;
  hours: number;
  projected_stock: number;
  date: string;
}

export interface AnalysisPair {
  sector_id: string;
  resource_type: string;
  stats: AnalysisPairStats;
  raw: { timestamp: string; stock: number }[];
  ma: { timestamp: string; ma_stock: number }[];
  forecast: { timestamp: string; predicted_stock: number }[];
  regression?: { timestamp: string; reg_stock: number }[];
  weekly_forecast: WeeklyForecastDay[];
}

export interface AnalysisResult {
  pairs: AnalysisPair[];
  total_records: number;
  time_range: { start: string; end: string };
}

export const analyzeCSV = (file: File) => {
  const form = new FormData();
  form.append('file', file);
  return API.post<AnalysisResult>('/api/resources/analyze', form).then(r => r.data);
};

export interface HeroWeather {
  condition: string;
  temp_c: number;
  wind_kph: number;
  icon: string;
}

export interface HeroVitals {
  heart_rate: number;
  energy_reserves: number;
  shield_integrity: number;
}

export interface HeroMission {
  id: string;
  name: string;
  outcome: 'success' | 'fail';
  duration_hours: number;
  casualties_saved: number;
  timestamp: string;
  description: string;
  sector: string;
  mission_type: string;
  threat: 'critical' | 'high' | 'medium' | 'low';
}

export interface Hero {
  id: string;
  name: string;
  alias: string;
  avatar: string;
  sector_id: string;
  coords: [number, number];
  health: number;
  power_level: number;
  status: 'active' | 'engaged' | 'standby' | 'critical';
  mission: string;
  mission_start: string;
  comms: string;
  weather: HeroWeather;
  vitals: HeroVitals;
  recent_activity: string;
  mission_history: HeroMission[];
}

export interface SectorEvent {
  id: string;
  sector_id: string;
  coords: [number, number];
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  timestamp: string;
  active: boolean;
}

export interface SectorSummary {
  sector_id: string;
  coords: [number, number];
  heroes: Hero[];
  hero_count: number;
  avg_health: number;
  weather: HeroWeather;
  threat_level: 'critical' | 'high' | 'medium' | 'stable';
  active_events: SectorEvent[];
}

export const fetchHeroes = (time?: string) =>
  API.get<Hero[]>('/api/heroes', { params: time ? { time } : undefined }).then(r => r.data);

export const fetchHeroEvents = () =>
  API.get<SectorEvent[]>('/api/heroes/events').then(r => r.data);

export const fetchSectorSummaries = (time?: string) =>
  API.get<SectorSummary[]>('/api/heroes/sectors', { params: time ? { time } : undefined }).then(r => r.data);

/* ── Supply Chain types ───────────────────────────────── */

export interface FactoryResourceState {
  current_stock: number;
  max_capacity: number;
  fill_pct: number;
  production_rate: number;
  total_produced: number;
  total_shipped: number;
  warning: boolean;
  critical: boolean;
  hours_until_empty: number | null;
}

export interface FactoryState {
  id: string;
  name: string;
  sector: string;
  coords: [number, number];
  icon: string;
  resources: Record<string, FactoryResourceState>;
}

export interface Shipment {
  shipment_id: string;
  resource_type: string;
  quantity: number;
  priority: string;
  source_factory_id: string;
  source_name: string;
  source_sector: string;
  source_lat: number;
  source_lon: number;
  dest_sector: string;
  dest_hero: string;
  dest_lat: number;
  dest_lon: number;
  depart_time: string;
  arrive_time: string;
  travel_hours: number;
  status: 'pending' | 'in_transit' | 'delivered';
  progress_pct: number;
  eta_hours: number;
}

export interface SupplyWarning {
  type: 'critical' | 'warning';
  factory: string;
  resource: string;
  stock_pct: number;
}

export interface SupplyOverview {
  timestamp: string;
  factories: FactoryState[];
  active_shipments: Shipment[];
  pending_shipments: Shipment[];
  delivered_count: number;
  total_shipments: number;
  warnings: SupplyWarning[];
}

export const fetchSupplyOverview = (time?: string) =>
  API.get<SupplyOverview>('/api/supply/overview', { params: time ? { time } : undefined }).then(r => r.data);

/* ── AI Chat ──────────────────────────────────────────── */

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResourceContext {
  sector_id: string;
  resource_type: string;
  current: number;
  min: number;
  max: number;
  mean: number;
  std_dev: number;
  depletion_rate: number;
  overall_slope: number;
  r_squared: number;
  noise_std: number;
  trend_acceleration: number;
  predicted_zero: string | null;
  hours_to_zero: number | null;
  status: string;
  risk_score: number;
  data_points: number;
  had_crash_recovery: boolean;
  min_at?: { timestamp: string; stock: number };
  max_at?: { timestamp: string; stock: number };
  sampled_points?: { timestamp: string; stock: number }[];
  weekly_forecast: { day: number; projected_stock: number; date: string }[];
}

export interface ChatCSVContext {
  total_records: number;
  time_range_start: string;
  time_range_end: string;
  resources: ChatResourceContext[];
}

export const sendChatMessage = (
  message: string,
  csvContext: ChatCSVContext | null,
  history: ChatMessage[],
) =>
  API.post<{ reply: string }>('/api/chat', {
    message,
    csv_context: csvContext,
    history: history.slice(-6),
  }).then(r => r.data.reply);

// --- Auth / Face Management ---

export interface FaceRecord {
  id: string;
  name: string;
  role: 'admin' | 'user';
  descriptor: number[];
}

export const fetchFaces = () =>
  API.get<FaceRecord[]>('/api/auth/faces').then(r => r.data);

export const enrollFace = (data: { name: string; role: string; descriptor: number[] }, authRole: string, authName: string) =>
  API.post<{ status: string; id: string; name: string; role: string }>(
    '/api/auth/faces',
    data,
    { headers: { 'X-Auth-Role': authRole, 'X-Auth-Name': authName } },
  ).then(r => r.data);

export const removeFace = (faceId: string, authRole: string) =>
  API.delete<{ status: string; id: string }>(
    `/api/auth/faces/${faceId}`,
    { headers: { 'X-Auth-Role': authRole } },
  ).then(r => r.data);
