import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import type { Readable } from "node:stream";
import ipaddr from "ipaddr.js";
import { loadBuffer } from "cheerio";
import type { WebsiteAudit } from "../types/prospecting.ts";

export const MAX_HTML_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 4;

export function parseWebsiteUrl(value: unknown): URL {
  if (typeof value !== "string" || value.length > 4000)
    throw new Error("INVALID_URL");
  const url = new URL(value);
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    (!hostname.includes(".") && !isIP(hostname)) ||
    /(^|\.)(localhost|local|internal|test|invalid|onion)$/.test(hostname) ||
    hostname.endsWith(".")
  )
    throw new Error("INVALID_URL");
  if (isIP(hostname) && !isPublicAddress(hostname))
    throw new Error("PRIVATE_ADDRESS");
  url.hash = "";
  return url;
}

export function isPublicAddress(value: string): boolean {
  if (!isIP(value) || value === "168.63.129.16") return false;
  try {
    const address = ipaddr.parse(value);
    if (address.range() !== "unicast") return false;
    if (address.kind() === "ipv6")
      return (address as ipaddr.IPv6).match(
        ipaddr.parse("2000::") as ipaddr.IPv6,
        3,
      );
    return true;
  } catch {
    return false;
  }
}

export interface PageResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
}
export interface Network {
  resolve: (hostname: string) => Promise<{ address: string; family: number }[]>;
  read: (
    url: URL,
    address: { address: string; family: number },
    signal: AbortSignal,
  ) => Promise<PageResponse>;
}

// Connect to the validated address, keeping the original hostname for Host/SNI.
// No second DNS lookup, automatic redirects, cookies or credentials are used.
async function readPublicPage(
  url: URL,
  pinned: { address: string; family: number },
  signal: AbortSignal,
): Promise<PageResponse> {
  return new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      {
        method: "GET",
        agent: false,
        signal,
        lookup: (_host, options, callback) =>
          options.all
            ? callback(null, [pinned])
            : callback(null, pinned.address, pinned.family),
        headers: {
          "User-Agent": "RankGPS-WebsiteCheck/1.0",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Encoding": "identity",
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const headers = response.headers;
        const type = String(headers["content-type"] ?? "").toLowerCase();
        if (
          status < 200 ||
          status >= 300 ||
          !/text\/html|application\/xhtml\+xml/.test(type)
        ) {
          response.destroy();
          resolve({ status, headers, body: Buffer.alloc(0) });
          return;
        }
        const encoding = String(
          headers["content-encoding"] ?? "identity",
        ).toLowerCase();
        let stream: Readable = response;
        if (encoding === "gzip") stream = response.pipe(createGunzip());
        else if (encoding === "br")
          stream = response.pipe(createBrotliDecompress());
        else if (encoding === "deflate")
          stream = response.pipe(createInflate());
        else if (encoding !== "identity") {
          response.destroy();
          reject(new Error("ENCODING"));
          return;
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        let transferred = 0;
        const fail = (error: Error) => {
          stream.destroy();
          response.destroy();
          request.destroy();
          reject(error);
        };
        response.on("error", fail);
        response.on("aborted", () => fail(new Error("TRUNCATED")));
        response.on("data", (chunk: Buffer) => {
          transferred += chunk.length;
          if (transferred > MAX_HTML_BYTES) fail(new Error("TOO_LARGE"));
        });
        stream.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > MAX_HTML_BYTES) fail(new Error("TOO_LARGE"));
          else chunks.push(chunk);
        });
        stream.on("error", fail);
        stream.on("end", () =>
          resolve({ status, headers, body: Buffer.concat(chunks) }),
        );
      },
    );
    request.on("error", reject);
    request.end();
  });
}

const network: Network = {
  resolve: (hostname) => lookup(hostname, { all: true, verbatim: true }),
  read: readPublicPage,
};

export function inspectHtml(body: Buffer, contentType = "") {
  const charset = /charset\s*=\s*["']?([a-zA-Z0-9_-]+)/i.exec(contentType)?.[1];
  const $ = loadBuffer(body, {
    encoding: { transportLayerEncodingLabel: charset },
  });
  const title =
    $("title").first().text().replace(/\s+/g, " ").trim().slice(0, 500) || null;
  const meta = (name: string) =>
    $("meta")
      .filter(
        (_, element) => ($(element).attr("name") ?? "").toLowerCase() === name,
      )
      .first()
      .attr("content")
      ?.trim() ?? "";
  const description = meta("description").slice(0, 2000) || null;
  const viewport = /width\s*=\s*device-width/i.test(meta("viewport"));
  let whatsapp = false;
  let contact = false;
  $("a[href]").each((_, element) => {
    const href = $(element).attr("href")?.trim() ?? "";
    const label = $(element)
      .text()
      .trim()
      .normalize("NFD")
      .replace(/\p{M}/gu, "");
    if (/^(mailto:|tel:)/i.test(href)) contact = true;
    try {
      const link = new URL(href, "https://relative-link.invalid/");
      if (["https:", "http:"].includes(link.protocol)) {
        if (/(^|\.)(wa\.me|whatsapp\.com)$/i.test(link.hostname)) {
          whatsapp = true;
          contact = true;
        }
        if (
          /(?:^|\/)(contato|contact|contact-us|fale-conosco)(?:\/|$|\.)/i.test(
            link.pathname,
          ) ||
          /^(contato|contact|fale conosco|entre em contato)$/i.test(label)
        )
          contact = true;
      }
    } catch {
      /* Malformed links do not prove a contact path. */
    }
  });
  if ($("form").length > 0) contact = true;
  const challenge =
    /just a moment|attention required|access denied|verifique.*humano|verify.*human|security checkpoint|checking your browser/i.test(
      title ?? "",
    );
  return { title, description, viewport, whatsapp, contact, challenge };
}

export async function auditWebsite(
  value: string,
  dependencies: Network = network,
  outerSignal?: AbortSignal,
): Promise<WebsiteAudit> {
  const original = parseWebsiteUrl(value);
  const started = Date.now();
  const timeout = AbortSignal.timeout(15000);
  const signal = outerSignal
    ? AbortSignal.any([outerSignal, timeout])
    : timeout;
  const base: WebsiteAudit = {
    url: original.href,
    finalUrl: null,
    status: "inconclusive",
    httpStatus: null,
    responseMs: null,
    https: null,
    title: null,
    description: null,
    viewport: null,
    whatsapp: null,
    contact: null,
    message: "",
    checkedAt: new Date().toISOString(),
  };
  let url = original;
  const visited = new Set<string>();
  try {
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
      signal.throwIfAborted();
      url = parseWebsiteUrl(url.href);
      if (visited.has(url.href)) throw new Error("REDIRECT_LOOP");
      visited.add(url.href);
      const host = url.hostname.replace(/^\[|\]$/g, "");
      const answers = isIP(host)
        ? [{ address: host, family: isIP(host) }]
        : await abortable(dependencies.resolve(host), signal);
      if (
        !answers.length ||
        answers.some((answer) => !isPublicAddress(answer.address))
      )
        throw new Error("PRIVATE_ADDRESS");
      signal.throwIfAborted();
      const pinned =
        answers.find((answer) => answer.family === 4) ?? answers[0];
      const response = await abortable(
        dependencies.read(url, pinned, signal),
        signal,
      );
      if (
        [301, 302, 303, 307, 308].includes(response.status) &&
        response.headers.location
      ) {
        if (redirect === MAX_REDIRECTS) throw new Error("REDIRECT_LIMIT");
        url = parseWebsiteUrl(new URL(response.headers.location, url).href);
        continue;
      }
      const result = {
        ...base,
        finalUrl: url.href,
        httpStatus: response.status,
        responseMs: Date.now() - started,
        https: url.protocol === "https:",
      };
      if ([401, 403, 429, 503].includes(response.status))
        return {
          ...result,
          message: `Verificação inconclusiva: resposta HTTP ${response.status}. Pode haver proteção ou bloqueio de consultas automáticas.`,
        };
      if (response.status >= 400)
        return {
          ...result,
          status: "http_error",
          message: `A página respondeu com HTTP ${response.status} nesta consulta. Confira o endereço no navegador.`,
        };
      if (
        response.status < 200 ||
        response.status >= 300 ||
        !/text\/html|application\/xhtml\+xml/i.test(
          String(response.headers["content-type"]),
        )
      )
        return {
          ...result,
          message:
            "A resposta não é uma página HTML analisável. Confira o endereço no navegador.",
        };
      if (!response.body.length || response.body.length > MAX_HTML_BYTES)
        throw new Error("TOO_LARGE");
      const { challenge, ...facts } = inspectHtml(
        response.body,
        String(response.headers["content-type"]),
      );
      if (challenge)
        return {
          ...result,
          message:
            "Foi identificada uma página de proteção ou verificação. Não foi possível analisar o conteúdo do site.",
        };
      return {
        ...result,
        ...facts,
        status: "analyzed",
        message:
          "Verificação do HTML recebido desta URL, sem executar JavaScript ou avaliar o layout visual.",
      };
    }
    throw new Error("REDIRECT_LIMIT");
  } catch {
    return {
      ...base,
      message:
        "Não foi possível concluir a análise: o site pode ter bloqueado a consulta, excedido o limite de tempo/tamanho ou redirecionado para um endereço não permitido. Isso não comprova que esteja fora do ar.",
    };
  }
}

async function abortable<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error("ABORTED"));
    signal.addEventListener("abort", abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}
