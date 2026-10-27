import { callMaps, normalizeBusiness, parseDetails, ProviderFailure } from "../../../../lib/businesses.ts";
import { errorResponse, json, readBody } from "../../../../lib/http.ts";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const input = parseDetails(await readBody(request));
    if (!input) return json({ error: "Informe chave e identificador válido da empresa." }, 400);
    const { apiKey, ...identifier } = input;
    const data = await callMaps(apiKey, identifier, request.signal);
    if (!Array.isArray(data.places)) throw new ProviderFailure(502, "A Serper retornou detalhes em formato inesperado.");
    const businesses = data.places.map((place) => normalizeBusiness(place, 1, apiKey));
    const business = businesses.find((place) => ("placeId" in identifier && place.placeId === identifier.placeId) || ("cid" in identifier && place.cid === identifier.cid));
    if (!business) throw new ProviderFailure(404, "A Serper não retornou uma ficha com o identificador solicitado. Os dados da busca foram preservados.");
    return json({ business, credits: typeof data.credits === "number" && Number.isFinite(data.credits) && data.credits >= 0 ? data.credits : null });
  } catch (error) { return errorResponse(error); }
}
