export const RESULT_LIMIT = 50;
export const PAGE_LIMIT = 10;

export type PublicValue =
  | string
  | number
  | boolean
  | null
  | PublicValue[]
  | { [key: string]: PublicValue };

export interface Business {
  id: string;
  name: string;
  address: string | null;
  primaryCategory: string | null;
  secondaryCategories: string[];
  categoriesProvided: boolean;
  website: string | null;
  phone: string | null;
  rating: number | null;
  ratingCount: number | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
  cid: string | null;
  mapsUrl: string;
  sourcePage: number;
  sourcePosition: number | null;
  fields: Record<string, PublicValue>;
}

export interface BusinessPage {
  businesses: Business[];
  page: number;
  ll: string | null;
  hasMore: boolean;
  credits: number | null;
  fetchedAt: string;
}

export interface SearchSnapshot {
  query: string;
  businesses: Business[];
  pages: number;
  credits: number;
  creditsKnown: boolean;
  searchedAt: string;
  complete: boolean;
}
