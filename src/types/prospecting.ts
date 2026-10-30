export interface WebsiteAudit {
  url: string;
  finalUrl: string | null;
  status: "analyzed" | "http_error" | "inconclusive";
  httpStatus: number | null;
  responseMs: number | null;
  https: boolean | null;
  title: string | null;
  description: string | null;
  viewport: boolean | null;
  whatsapp: boolean | null;
  contact: boolean | null;
  message: string;
  checkedAt: string;
}

export type OpportunityFilter =
  | "missing_site"
  | "social_site"
  | "few_reviews"
  | "low_rating"
  | "website_flags"
  | "not_analyzed";

export interface Opportunity {
  code: OpportunityFilter;
  label: string;
  evidence: string;
  kind: "observed" | "check";
}

export interface AuditEntry {
  status: "pending" | "done" | "error";
  result?: WebsiteAudit;
  error?: string;
}
