import {
  MAX_POINTS,
  type RankingRequest,
  type PointResult,
  type RankedPlace,
} from "../types/ranking.ts";

export function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseRankingRequest(value: unknown): RankingRequest | null {
  if (!isRecord(value)) return null;
  const { apiKey, term, business, points } = value;
  if (
    typeof apiKey !== "string" ||
    !/^[\x21-\x7e]{1,512}$/.test(apiKey.trim()) ||
    typeof term !== "string" ||
    !term.trim() ||
    term.trim().length > 200 ||
    typeof business !== "string" ||
    !normalizeName(business) ||
    business.trim().length > 200 ||
    !Array.isArray(points) ||
    points.length !== MAX_POINTS
  )
    return null;
  const parsedPoints = [];
  for (const point of points) {
    if (
      !isRecord(point) ||
      typeof point.id !== "string" ||
      !point.id.trim() ||
      point.id.length > 100 ||
      typeof point.lat !== "number" ||
      !Number.isFinite(point.lat) ||
      Math.abs(point.lat) > 90 ||
      typeof point.lng !== "number" ||
      !Number.isFinite(point.lng) ||
      Math.abs(point.lng) > 180
    )
      return null;
    parsedPoints.push({ id: point.id, lat: point.lat, lng: point.lng });
  }
  if (
    new Set(parsedPoints.map((point) => point.id)).size !== MAX_POINTS ||
    new Set(
      parsedPoints.map(
        (point) => `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`,
      ),
    ).size !== MAX_POINTS
  )
    return null;
  return {
    apiKey: apiKey.trim(),
    term: term.trim(),
    business: business.trim(),
    points: parsedPoints,
  };
}

export function classifyPlaces(
  data: unknown,
  business: string,
  pointId: string,
): PointResult {
  if (
    !isRecord(data) ||
    !Array.isArray(data.places) ||
    data.places.length > 200
  )
    throw new Error("Invalid provider response");
  const places: RankedPlace[] = data.places.map((place: unknown) => {
    if (
      !isRecord(place) ||
      typeof place.title !== "string" ||
      !place.title.trim() ||
      typeof place.position !== "number" ||
      !Number.isSafeInteger(place.position) ||
      place.position < 1
    ) {
      throw new Error("Invalid provider result");
    }
    return {
      title: place.title.slice(0, 500),
      address:
        typeof place.address === "string" ? place.address.slice(0, 1000) : "",
      position: place.position,
    };
  });
  const matches = places.filter(
    (place) => normalizeName(place.title) === normalizeName(business),
  );
  return {
    pointId,
    status:
      matches.length === 1
        ? "found"
        : matches.length > 1
          ? "ambiguous"
          : "not_found",
    position: matches.length === 1 ? matches[0].position : null,
    places,
    matches,
  };
}

export function providerError(status: number) {
  if (status === 401 || status === 403)
    return "Chave inválida ou sem autorização. Confira ou troque a API Key.";
  if (status === 402)
    return "Créditos indisponíveis. Confira seu saldo na Serper ou troque a chave.";
  if (status === 429)
    return "Limite da Serper atingido. Confira os créditos e aguarde antes de tentar novamente.";
  return "A Serper não concluiu esta consulta. Tente novamente mais tarde.";
}

export async function queryPoint(
  input: RankingRequest,
  point: RankingRequest["points"][number],
  signal?: AbortSignal,
): Promise<PointResult> {
  const errorResult = (message: string): PointResult => ({
    pointId: point.id,
    status: "error",
    position: null,
    places: [],
    matches: [],
    message,
  });
  const timeout = AbortSignal.timeout(22000);
  try {
    const response = await fetch("https://google.serper.dev/maps", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": input.apiKey,
      },
      body: JSON.stringify({
        q: input.term,
        hl: "pt-br",
        // Keep the point as the search center, leaving zoom to the provider.
        ll: `@${point.lat},${point.lng}`,
        page: 1,
      }),
      cache: "no-store",
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!response.ok) return errorResult(providerError(response.status));
    const data: unknown = await response.json();
    try {
      return classifyPlaces(data, input.business, point.id);
    } catch {
      return errorResult(
        "A Serper retornou dados em formato inesperado. A posição não pôde ser determinada.",
      );
    }
  } catch (error) {
    return errorResult(
      timeout.aborted ||
        (error instanceof Error && error.name === "TimeoutError")
        ? "A consulta excedeu o tempo limite. Tente novamente mais tarde."
        : "Falha de conexão com a Serper. Tente novamente mais tarde.",
    );
  }
}
