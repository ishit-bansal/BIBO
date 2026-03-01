import axios from 'axios';

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
});

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
    '/api/reports/batch'
  ).then(r => r.data);

export const fetchPredictions = () =>
  API.get<Prediction[]>('/api/predictions').then(r => r.data);

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
