import { auditWebsite, parseWebsiteUrl } from "../../../lib/website-audit.ts";
import { record } from "../../../lib/businesses.ts";
import { errorResponse, json, readBody } from "../../../lib/http.ts";

export const runtime = "nodejs";
export const maxDuration = 25;

export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    if (!record(body))
      return json({ error: "Informe a URL pública do site." }, 400);
    let url: URL;
    try {
      url = parseWebsiteUrl(body.url);
    } catch {
      return json(
        {
          error:
            "Informe um site público com HTTP ou HTTPS e porta padrão, sem credenciais.",
        },
        400,
      );
    }
    return json({
      audit: await auditWebsite(url.href, undefined, request.signal),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
