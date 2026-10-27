import { callMaps, pageFromData, parseSearch } from "../../../lib/businesses.ts";
import { errorResponse, json, readBody } from "../../../lib/http.ts";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const input = parseSearch(await readBody(request));
    if (!input) return json({ error: "Informe uma chave válida e uma busca de até 300 caracteres. A paginação precisa da área retornada na primeira página." }, 400);
    const data = await callMaps(input.apiKey, { q: input.query, page: input.page, ...(input.ll ? { ll: input.ll } : {}) }, request.signal);
    return json(pageFromData(data, input.page, input.apiKey, input.ll));
  } catch (error) { return errorResponse(error); }
}
