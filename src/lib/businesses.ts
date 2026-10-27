import {
  PAGE_LIMIT,
  type Business,
  type BusinessPage,
  type PublicValue,
} from "../types/business.ts";

export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const text = (value: unknown, max = 4000): string | null =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
const number = (value: unknown, min: number, max = Infinity): number | null =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max
    ? value
    : null;
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export function safeUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 4000) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

// Only the public place object is returned, never provider/request metadata.
// Keep additional business fields without allowing credential fields into the UI.
function publicValue(
  value: unknown,
  apiKey: string,
  depth = 0,
): PublicValue | undefined {
  if (depth > 6) return undefined;
  if (typeof value === "string")
    return value.split(apiKey).join("[oculto]").slice(0, 12000);
  if (typeof value === "boolean" || value === null) return value;
  if (typeof value === "number")
    return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value))
    return value
      .slice(0, 100)
      .map((item) => publicValue(item, apiKey, depth + 1) ?? null);
  if (!record(value)) return undefined;
  const entries = Object.entries(value)
    .slice(0, 100)
    .flatMap(([key, item]) => {
      if (
        /key|token|secret|password|authorization|cookie|searchparameters|headers|__proto__|constructor|prototype/i.test(
          key,
        )
      )
        return [];
      const cleaned = publicValue(item, apiKey, depth + 1);
      return cleaned === undefined
        ? []
        : [[key.split(apiKey).join("[oculto]"), cleaned]];
    });
  return Object.fromEntries(entries);
}

export function parseLl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match =
    /^@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?)z)?$/.exec(value);
  if (
    !match ||
    Math.abs(Number(match[1])) > 90 ||
    Math.abs(Number(match[2])) > 180 ||
    (match[3] && (Number(match[3]) < 1 || Number(match[3]) > 21))
  )
    return null;
  return value;
}

export function parseSearch(value: unknown) {
  if (!record(value)) return null;
  const apiKey = text(value.apiKey, 513);
  const query = text(value.query, 301);
  const page = value.page;
  if (
    !apiKey ||
    !/^[\x21-\x7e]{1,512}$/.test(apiKey) ||
    !query ||
    query.length > 300 ||
    !Number.isInteger(page) ||
    typeof page !== "number" ||
    page < 1 ||
    page > PAGE_LIMIT
  )
    return null;
  const ll = parseLl(value.ll);
  if (page > 1 && !ll) return null;
  return { apiKey, query, page, ll: page === 1 ? null : ll };
}

export function parseDetails(value: unknown) {
  if (!record(value)) return null;
  const apiKey = text(value.apiKey, 513);
  const placeId = text(value.placeId, 301);
  const cid = text(value.cid, 31);
  if (!apiKey || !/^[\x21-\x7e]{1,512}$/.test(apiKey)) return null;
  if (placeId && /^[a-zA-Z0-9_-]{5,300}$/.test(placeId))
    return { apiKey, placeId };
  if (cid && /^\d{1,30}$/.test(cid)) return { apiKey, cid };
  return null;
}

export function normalizeBusiness(
  value: unknown,
  page: number,
  apiKey: string,
): Business {
  if (!record(value)) throw new Error("INVALID_DATA");
  const cleaned = publicValue(value, apiKey);
  if (!record(cleaned)) throw new Error("INVALID_DATA");
  const name = text(cleaned.title, 1000);
  if (!name) throw new Error("INVALID_DATA");
  const primaryCategory = text(cleaned.type) ?? text(cleaned.category);
  const categories = Array.isArray(cleaned.types)
    ? cleaned.types
        .filter(
          (item): item is string => typeof item === "string" && !!item.trim(),
        )
        .map((item) => item.trim())
    : [];
  const unique = new Map(categories.map((item) => [normalize(item), item]));
  if (primaryCategory) unique.delete(normalize(primaryCategory));
  const placeId = text(cleaned.placeId, 300);
  const cid =
    typeof cleaned.cid === "string" && /^\d{1,30}$/.test(cleaned.cid)
      ? cleaned.cid
      : null;
  const address = text(cleaned.address);
  const latitude = number(cleaned.latitude, -90, 90);
  const longitude = number(cleaned.longitude, -180, 180);
  // Never merge branches just because they share a name or website.
  const id = placeId
    ? `place:${placeId}`
    : cid
      ? `cid:${cid}`
      : `local:${normalize(name)}|${normalize(address ?? "")}|${latitude ?? ""},${longitude ?? ""}`;
  const mapsUrl = placeId
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${encodeURIComponent(placeId)}`
    : cid
      ? `https://www.google.com/maps?cid=${cid}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${address ?? ""}`.trim())}`;
  return {
    id,
    name,
    address,
    primaryCategory,
    secondaryCategories: [...unique.values()],
    categoriesProvided: Array.isArray(cleaned.types),
    website: safeUrl(cleaned.website),
    phone: text(cleaned.phoneNumber, 100),
    rating: number(cleaned.rating, 0, 5),
    ratingCount: number(cleaned.ratingCount, 0),
    description: text(cleaned.description),
    latitude,
    longitude,
    placeId,
    cid,
    mapsUrl,
    sourcePage: page,
    sourcePosition: Number.isSafeInteger(cleaned.position)
      ? number(cleaned.position, 1)
      : null,
    fields: cleaned as Record<string, PublicValue>,
  };
}

export function mergeBusinesses(
  current: Business[],
  incoming: Business[],
  limit = 50,
) {
  const result = [...current];
  const ids = new Set(current.map((item) => item.id));
  const placeIds = new Set(current.map((item) => item.placeId).filter(Boolean));
  const cids = new Set(current.map((item) => item.cid).filter(Boolean));
  for (const item of incoming) {
    if (
      ids.has(item.id) ||
      (item.placeId && placeIds.has(item.placeId)) ||
      (item.cid && cids.has(item.cid))
    )
      continue;
    result.push(item);
    ids.add(item.id);
    if (item.placeId) placeIds.add(item.placeId);
    if (item.cid) cids.add(item.cid);
    if (result.length >= limit) break;
  }
  return result.slice(0, limit);
}

export function mergeDetails(original: Business, details: Business): Business {
  const merged = {
    ...original,
    ...details,
    id: original.id,
    sourcePage: original.sourcePage,
    sourcePosition: original.sourcePosition,
    fields: { ...original.fields, ...details.fields },
  };
  for (const field of [
    "address",
    "primaryCategory",
    "website",
    "phone",
    "rating",
    "ratingCount",
    "description",
    "latitude",
    "longitude",
    "placeId",
    "cid",
  ] as const) {
    Object.assign(merged, { [field]: details[field] ?? original[field] });
  }
  if (!details.categoriesProvided) {
    merged.categoriesProvided = original.categoriesProvided;
    merged.secondaryCategories = original.secondaryCategories;
  }
  return merged;
}

export class ProviderFailure extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function callMaps(
  apiKey: string,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch("https://google.serper.dev/maps", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
      body: JSON.stringify({ ...payload, hl: "pt-br" }),
      cache: "no-store",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(22000)])
        : AbortSignal.timeout(22000),
    });
  } catch {
    throw new ProviderFailure(
      502,
      "A conexão com a Serper falhou ou excedeu o tempo limite. A chamada pode ter consumido créditos.",
    );
  }
  if (!response.ok) {
    const message =
      response.status === 401 || response.status === 403
        ? "Chave inválida ou sem autorização. Confira ou troque sua API Key."
        : response.status === 402
          ? "Créditos indisponíveis na Serper. Confira seu saldo ou troque a chave."
          : response.status === 429
            ? "Limite da Serper atingido. Aguarde antes de tentar novamente."
            : "A Serper não concluiu a consulta. Tente novamente mais tarde.";
    throw new ProviderFailure(
      [401, 403, 402, 429].includes(response.status) ? response.status : 502,
      message,
    );
  }
  try {
    const data: unknown = await response.json();
    if (!record(data)) throw new Error();
    return data;
  } catch {
    throw new ProviderFailure(
      502,
      "A Serper retornou uma resposta inválida. A chamada pode ter consumido créditos.",
    );
  }
}

export function pageFromData(
  data: Record<string, unknown>,
  page: number,
  apiKey: string,
  previousLl: string | null,
): BusinessPage {
  if (!Array.isArray(data.places) || data.places.length > 200)
    throw new ProviderFailure(
      502,
      "A Serper retornou resultados em formato inesperado.",
    );
  let businesses: Business[];
  try {
    businesses = data.places.map((place) =>
      normalizeBusiness(place, page, apiKey),
    );
  } catch {
    throw new ProviderFailure(
      502,
      "Uma ficha retornada pela Serper está em formato inesperado.",
    );
  }
  const ll = parseLl(data.ll) ?? previousLl;
  return {
    businesses,
    page,
    ll,
    hasMore: businesses.length > 0 && !!ll && page < PAGE_LIMIT,
    credits: number(data.credits, 0),
    fetchedAt: new Date().toISOString(),
  };
}
