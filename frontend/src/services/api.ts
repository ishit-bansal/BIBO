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

export const uploadCSV = (file: File) => {
  const form = new FormData();
  form.append('file', file);
  return API.post<{ status: string; records_imported: number }>(
    '/api/resources/upload',
    form
  ).then(r => r.data);
};
