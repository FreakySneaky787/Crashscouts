/** Discover (phase 6, ADR 0025): types and pure helpers for the /discover page; unit-tested. */
import { TEST_METHODS, type CampaignStatusCode, type TestMethod } from "./campaigns";
import type { CatalogItem } from "./profile";
import { PROJECT_STATUSES, type ProjectStatus } from "./projects";

export type DiscoverTab = "projects" | "campaigns";

export type DiscoverParams = {
  tab: DiscoverTab;
  q: string;
  category: string;
  language: string;
  software_type: string;
  platform: string;
  status: ProjectStatus | "";
  has_campaign: boolean;
  method: TestMethod | "";
  free_places: boolean;
  /** "all" shows every licence; otherwise only open source (preselected, owner's decision). */
  open_source: "all" | "";
  sort: "new" | "";
  page: number;
};

export type DiscoverProject = {
  slug: string;
  name: string;
  summary: string;
  logo_key: string | null;
  open_source: boolean;
  status: ProjectStatus;
  platforms: CatalogItem[];
  software_types: CatalogItem[];
  active_campaigns: number;
  last_activity: string;
  created_at: string;
};

export type DiscoverCampaign = {
  project: string;
  project_name: string;
  open_source: boolean;
  slug: string;
  title: string;
  summary: string;
  status: CampaignStatusCode;
  starts_at: string;
  ends_at: string;
  timezone: string;
  participants: number;
  target_testers: number;
  method: TestMethod;
  platforms: CatalogItem[];
  last_activity: string;
};

export type DiscoverPage<T> = { results: T[]; total: number; page: number; pages: number };

const SLUG = /^[a-z0-9-]{1,60}$/;
const FILTERS = ["category", "language", "software_type", "platform"] as const;

/** Reads the page's URL; anything unexpected falls back to the default. */
export function readDiscoverParams(search: URLSearchParams): DiscoverParams {
  const slug = (key: string) => {
    const value = search.get(key) ?? "";
    return SLUG.test(value) ? value : "";
  };
  const status = search.get("status") ?? "";
  const method = search.get("method") ?? "";
  const page = Number.parseInt(search.get("page") ?? "1", 10);
  return {
    tab: search.get("tab") === "campaigns" ? "campaigns" : "projects",
    q: (search.get("q") ?? "").trim().slice(0, 200),
    category: slug("category"),
    language: slug("language"),
    software_type: slug("software_type"),
    platform: slug("platform"),
    status: (PROJECT_STATUSES as readonly string[]).includes(status) ? (status as ProjectStatus) : "",
    has_campaign: search.get("has_campaign") === "1",
    method: (TEST_METHODS as string[]).includes(method) ? (method as TestMethod) : "",
    free_places: search.get("free_places") === "1",
    open_source: search.get("open_source") === "all" ? "all" : "",
    sort: search.get("sort") === "new" ? "new" : "",
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 10_000) : 1,
  };
}

/** The query for the Discover API of the chosen tab (only the filters that tab knows). */
export function discoverApiQuery(params: DiscoverParams): string {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  for (const key of FILTERS) if (params[key]) query.set(key, params[key]);
  if (params.open_source) query.set("open_source", "all");
  if (params.sort) query.set("sort", params.sort);
  if (params.tab === "projects") {
    if (params.status) query.set("status", params.status);
    if (params.has_campaign) query.set("has_campaign", "1");
  } else {
    if (params.method) query.set("method", params.method);
    if (params.free_places) query.set("free_places", "1");
  }
  if (params.page > 1) query.set("page", String(params.page));
  return query.toString();
}

/** A link to /discover with the same search and filters, on another page or tab. */
export function discoverHref(params: DiscoverParams, change: Partial<DiscoverParams> = {}): string {
  const next = { ...params, ...change };
  const query = new URLSearchParams();
  if (next.tab === "campaigns") query.set("tab", "campaigns");
  const api = new URLSearchParams(discoverApiQuery(next));
  for (const [key, value] of api) query.set(key, value);
  const text = query.toString();
  return text ? `/discover?${text}` : "/discover";
}

/** Search results and filtered lists are not indexed; the plain lists are. */
export function isFiltered(params: DiscoverParams): boolean {
  return Boolean(
    params.q ||
      FILTERS.some((key) => params[key]) ||
      params.status ||
      params.has_campaign ||
      params.method ||
      params.free_places ||
      params.open_source ||
      params.sort ||
      params.page > 1,
  );
}
