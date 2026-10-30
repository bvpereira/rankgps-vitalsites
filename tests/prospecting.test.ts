import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeBusiness } from "../src/lib/businesses.ts";
import {
  isSocialWebsite,
  matchesOpportunity,
  opportunitiesFor,
  websiteSignals,
} from "../src/lib/opportunities.ts";
import {
  auditWebsite,
  inspectHtml,
  isPublicAddress,
  MAX_HTML_BYTES,
  parseWebsiteUrl,
  type Network,
  type PageResponse,
} from "../src/lib/website-audit.ts";
import { POST } from "../src/app/api/website-audit/route.ts";

const company = (fields: Record<string, unknown> = {}) =>
  normalizeBusiness(
    { title: "Empresa de teste", ...fields },
    1,
    "fake-key-for-tests",
  );
const html = Buffer.from(
  '<!doctype html><html><head><title>Empresa &amp; Serviços</title><meta name="description" content="Serviços na cidade"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><a href="https://wa.me/5522999990000">WhatsApp</a><a href="/contato">Fale conosco</a></body></html>',
);
const response = (
  body = html,
  status = 200,
  headers: PageResponse["headers"] = {
    "content-type": "text/html; charset=utf-8",
  },
): PageResponse => ({ status, body, headers });
const publicNetwork = (read: Network["read"]): Network => ({
  resolve: async () => [{ address: "93.184.215.14", family: 4 }],
  read,
});

test("opportunities separate missing API data from known low review counts and ratings", () => {
  const missing = opportunitiesFor(company(), 20);
  assert.deepEqual(
    missing.map((signal) => signal.code),
    ["missing_site"],
  );
  assert.equal(missing[0].kind, "check");
  assert.match(missing[0].evidence, /Confira/);
  const known = company({
    website: "https://example.com",
    rating: 3.9,
    ratingCount: 0,
  });
  assert.deepEqual(
    opportunitiesFor(known, 20).map((signal) => signal.code),
    ["few_reviews", "low_rating"],
  );
  assert.equal(
    matchesOpportunity(company({ ratingCount: 21 }), ["few_reviews"], 20),
    false,
  );
  assert.equal(
    matchesOpportunity(company({ ratingCount: 21 }), ["few_reviews"], 25),
    true,
  );
  assert.equal(
    matchesOpportunity(company({ rating: 4 }), ["low_rating"], 20),
    false,
  );
});

test("multiple filters use OR; no filters include all; unknown audits do not imply a website defect", () => {
  assert.equal(matchesOpportunity(company(), [], 20), true);
  assert.equal(
    matchesOpportunity(company(), ["missing_site", "low_rating"], 20),
    true,
  );
  assert.equal(
    matchesOpportunity(
      company({ website: "https://example.com" }),
      ["website_flags"],
      20,
    ),
    false,
  );
  assert.equal(
    matchesOpportunity(
      company({ website: "https://example.com" }),
      ["not_analyzed"],
      20,
    ),
    true,
  );
  assert.equal(matchesOpportunity(company(), ["not_analyzed"], 20), false);
});

test("social links are recognized by hostname rather than arbitrary URL text", () => {
  assert.equal(isSocialWebsite("https://www.instagram.com/empresa"), true);
  assert.equal(isSocialWebsite("https://linktr.ee/empresa"), true);
  assert.equal(
    isSocialWebsite("https://example.com/?url=instagram.com"),
    false,
  );
  assert.equal(
    isSocialWebsite("https://instagram.com.example.com/empresa"),
    false,
  );
  assert.equal(
    matchesOpportunity(
      company({ website: "https://wa.me/123" }),
      ["not_analyzed"],
      20,
    ),
    false,
  );
});

test("extracts HTML evidence without executing scripts or mistaking unrelated links for WhatsApp", () => {
  const facts = inspectHtml(html, "text/html; charset=utf-8");
  assert.equal(facts.title, "Empresa & Serviços");
  assert.equal(facts.description, "Serviços na cidade");
  assert.equal(facts.viewport, true);
  assert.equal(facts.whatsapp, true);
  assert.equal(facts.contact, true);
  const scriptOnly = inspectHtml(
    Buffer.from(
      '<script>const contact="https://wa.me/123";</script><a href="https://example.com/?wa.me=1">Link</a>',
    ),
  );
  assert.equal(scriptOnly.contact, false);
  assert.equal(scriptOnly.whatsapp, false);
  assert.equal(scriptOnly.viewport, false);
  assert.equal(
    inspectHtml(Buffer.from("<title>Just a moment...</title>")).challenge,
    true,
  );
});

test("blocks private, metadata, mapped, reserved and non-web destinations", () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.100.100.200",
    "0.0.0.0",
    "224.0.0.1",
    "198.18.0.1",
    "168.63.129.16",
    "::1",
    "::2",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "2002:7f00:1::",
    "2001:db8::1",
    "3fff::1",
  ])
    assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress("93.184.215.14"), true);
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
  for (const url of [
    "file:///etc/passwd",
    "ftp://example.com",
    "http://localhost",
    "http://127.1",
    "http://2130706433",
    "http://[::1]",
    "https://user:pass@example.com",
    "https://example.com:8443",
    "http://service.internal",
    "https://example.com.",
  ])
    assert.throws(() => parseWebsiteUrl(url), url);
});

test("validates all DNS answers and pins the approved address for the connection", async () => {
  let calls = 0;
  const result = await auditWebsite(
    "https://example.com",
    publicNetwork(async (url, pinned) => {
      calls++;
      assert.equal(url.hostname, "example.com");
      assert.equal(pinned.address, "93.184.215.14");
      return response();
    }),
  );
  assert.equal(result.status, "analyzed");
  assert.equal(result.https, true);
  assert.equal(calls, 1);
  const blocked = await auditWebsite("https://example.com", {
    resolve: async () => [
      { address: "93.184.215.14", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ],
    read: async () => {
      throw new Error("must not connect");
    },
  });
  assert.equal(blocked.status, "inconclusive");
  assert.equal(blocked.finalUrl, null);
});

test("revalidates redirects and never connects to private IPs after a public redirect", async () => {
  let calls = 0;
  const result = await auditWebsite(
    "https://example.com",
    publicNetwork(async () => {
      calls++;
      return response(Buffer.alloc(0), 302, {
        location: "http://169.254.169.254/latest/meta-data",
      });
    }),
  );
  assert.equal(calls, 1);
  assert.equal(result.status, "inconclusive");
  const urls: string[] = [];
  const redirected = await auditWebsite(
    "http://example.com",
    publicNetwork(async (url) => {
      urls.push(url.href);
      return url.protocol === "http:"
        ? response(Buffer.alloc(0), 301, { location: "https://example.com/" })
        : response();
    }),
  );
  assert.equal(redirected.https, true);
  assert.deepEqual(urls, ["http://example.com/", "https://example.com/"]);
});

test("timeouts, blocks, challenges, oversized HTML and non-HTML remain inconclusive", async () => {
  for (const page of [
    response(Buffer.from("<title>Security checkpoint</title>")),
    response(Buffer.alloc(MAX_HTML_BYTES + 1)),
    response(Buffer.from("file"), 200, { "content-type": "application/pdf" }),
    ...[401, 403, 429, 503].map((status) => response(Buffer.alloc(0), status)),
  ]) {
    const result = await auditWebsite(
      "https://example.com",
      publicNetwork(async () => page),
    );
    assert.equal(result.status, "inconclusive");
    assert.deepEqual(websiteSignals(result), []);
  }
  const abort = new AbortController();
  abort.abort();
  const cancelled = await auditWebsite(
    "https://example.com",
    publicNetwork(async () => {
      throw new Error("must not connect");
    }),
    abort.signal,
  );
  assert.equal(cancelled.status, "inconclusive");
  const failed = await auditWebsite("https://example.com", {
    resolve: async () => {
      throw new Error("ENOTFOUND");
    },
    read: async () => response(),
  });
  assert.equal(failed.status, "inconclusive");
  assert.match(failed.message, /não comprova/);
});

test("HTTP errors and absent HTML evidence produce scoped review signals, never a mobile score", async () => {
  const error = await auditWebsite(
    "https://example.com",
    publicNetwork(async () => response(Buffer.alloc(0), 404)),
  );
  assert.equal(error.status, "http_error");
  assert.match(websiteSignals(error)[0].label, /404/);
  const simple = await auditWebsite(
    "http://example.com",
    publicNetwork(async () => response(Buffer.from("<h1>Empresa</h1>"))),
  );
  const signals = websiteSignals(simple);
  assert.ok(signals.some((signal) => signal.label.includes("HTTP")));
  assert.ok(
    signals.some(
      (signal) => signal.label.includes("celular") && signal.kind === "check",
    ),
  );
  assert.ok(
    !signals.some((signal) =>
      /site fora|site ruim|não responsivo/i.test(signal.label),
    ),
  );
  assert.equal(
    matchesOpportunity(
      company({ website: simple.url }),
      ["website_flags"],
      20,
      simple,
    ),
    true,
  );
  assert.equal(
    matchesOpportunity(
      company({ website: simple.url }),
      ["not_analyzed"],
      20,
      simple,
    ),
    false,
  );
});

test("audit route rejects invalid URL and cross-origin requests without requiring or exposing a Serper key", async () => {
  const request = (
    body: unknown,
    origin = "https://rankgps.vitalsites.com.br",
  ) =>
    new Request("https://rankgps.vitalsites.com.br/api/website-audit", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin },
      body: JSON.stringify(body),
    });
  assert.equal((await POST(request({ url: "http://127.0.0.1" }))).status, 400);
  assert.equal(
    (
      await POST(
        request({ url: "https://example.com" }, "https://unrelated.example"),
      )
    ).status,
    403,
  );
  assert.equal(
    (await POST(request({ apiKey: "private-test-key" }))).status,
    400,
  );
});
