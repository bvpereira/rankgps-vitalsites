export const MAX_POINTS = 5;

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
}

export interface City {
  id: number;
  name: string;
  region: string;
  country: string;
  lat: number;
  lng: number;
}

export const INITIAL_CENTER: [number, number] = [-22.5269, -41.945];

export interface RankedPlace {
  title: string;
  address: string;
  position: number;
}

export interface PointResult {
  pointId: string;
  status: "found" | "not_found" | "ambiguous" | "error";
  position: number | null;
  places: RankedPlace[];
  matches: RankedPlace[];
  message?: string;
}

export interface RankingRequest {
  apiKey: string;
  term: string;
  business: string;
  points: MapPoint[];
}

export interface RankingResponse {
  results: PointResult[];
  searchedAt: string;
}
