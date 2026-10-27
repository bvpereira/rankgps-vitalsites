import { parseRankingRequest, queryPoint } from "../../../lib/ranking.ts";

export const runtime = "nodejs";
export const maxDuration = 30;

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  // Next may build request.url with an internal hostname behind a proxy.
  // Compare against the incoming Host instead of that internal origin.
  let validOrigin = true;
  if (origin) {
    try {
      const parsed = new URL(origin);
      validOrigin =
        ["http:", "https:"].includes(parsed.protocol) &&
        parsed.host ===
          (request.headers.get("host") ?? new URL(request.url).host);
    } catch {
      validOrigin = false;
    }
  }
  if (!validOrigin || request.headers.get("sec-fetch-site") === "cross-site") {
    return json({ error: "Origem da solicitação não permitida." }, 403);
  }
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    return json({ error: "Envie os dados em JSON." }, 415);
  }
  if (Number(request.headers.get("content-length")) > 16000)
    return json({ error: "Solicitação muito grande." }, 413);
  let input;
  try {
    const body = await request.text();
    if (body.length > 16000)
      return json({ error: "Solicitação muito grande." }, 413);
    input = parseRankingRequest(JSON.parse(body));
  } catch {
    return json({ error: "Solicitação inválida." }, 400);
  }
  if (!input)
    return json(
      {
        error:
          "Preencha chave, termo e nome do estabelecimento, com exatamente 5 pontos distintos e coordenadas válidas.",
      },
      400,
    );

  // Never persist, cache, log, or echo the request body or upstream error body.
  const results = await Promise.all(
    input.points.map((point) => queryPoint(input, point, request.signal)),
  );
  return json({
    results,
    searchedAt: new Date().toISOString(),
  });
}
