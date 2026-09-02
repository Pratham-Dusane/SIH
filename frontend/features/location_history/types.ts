// Location History & Context Research Types (F12)

export interface SourceItem {
  id: string;
  title: string;
  publisher: string;
  date?: string;
  url?: string;
  excerpt: string;
  source_type: 'official' | 'academic' | 'institutional' | 'news' | 'gazetteer';
}

export interface HistoricalTimelineItem {
  id: string;
  year: number;
  date_str: string;
  title: string;
  category:
    | 'natural_disasters'
    | 'urban_development'
    | 'infrastructure'
    | 'agriculture'
    | 'environmental'
    | 'government_projects'
    | 'industry_mining'
    | 'general';
  description: string;
  spatial_relevance: 'direct_aoi' | 'district_wide' | 'regional';
  source_ids: string[];
}

export interface HistoricalEventCategory {
  category: string;
  label: string;
  events: HistoricalTimelineItem[];
}

export interface HistoricalDevelopment {
  urban_expansion: string;
  infrastructure_evolution: string;
  environmental_record: string;
  agricultural_transition: string;
}

export interface RelevantHistoricalContext {
  summary: string;
  interpretation_notes: string;
  methodological_caveat: string;
}

export interface LocationOverview {
  location_name: string;
  district: string;
  state: string;
  country: string;
  unit_id?: string;
  centroid?: [number, number];
  bounds_wgs84?: number[];
  period_analysed: string;
  topics: string[];
}

export interface HistoricalContextReport {
  id: string;
  created_at: string;
  overview: LocationOverview;
  timeline: HistoricalTimelineItem[];
  major_events: HistoricalEventCategory[];
  development_summary: HistoricalDevelopment;
  context_analysis: RelevantHistoricalContext;
  sources: SourceItem[];
  search_queries_used: string[];
  cached?: boolean;
}
