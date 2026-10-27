import { ProviderFailure } from "./businesses.ts";

export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function readBody(request: Request): Promise<unknown> {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const url = new URL(origin);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.host !== (request.headers.get("host") ?? new URL(request.url).host)
      )
        throw new Error();
    } catch {
      throw new ProviderFailure(403, "Origem da solicitação não permitida.");
    }
  }
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new ProviderFailure(403, "Origem da solicitação não permitida.");
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new ProviderFailure(415, "Envie os dados em JSON.");
  if (Number(request.headers.get("content-length")) > 8000)
    throw new ProviderFailure(413, "Solicitação muito grande.");
  const body = await request.text();
  if (body.length > 8000)
    throw new ProviderFailure(413, "Solicitação muito grande.");
  try {
    return JSON.parse(body);
  } catch {
    throw new ProviderFailure(400, "Solicitação inválida.");
  }
}

export function errorResponse(error: unknown) {
  return error instanceof ProviderFailure
    ? json({ error: error.message }, error.status)
    : json({ error: "Não foi possível concluir a consulta." }, 500);
}
