import assert from "node:assert/strict";
import { test } from "node:test";
import {
  callMaps,
  mergeBusinesses,
  mergeDetails,
  normalizeBusiness,
  pageFromData,
  parseDetails,
  parseLl,
  parseSearch,
  ProviderFailure,
  safeUrl,
} from "../src/lib/businesses.ts";
import { collectBusinesses } from "../src/lib/search.ts";
import { POST as search } from "../src/app/api/businesses/route.ts";
import { POST as details } from "../src/app/api/businesses/details/route.ts";
import type { SearchSnapshot } from "../src/types/business.ts";

const apiKey = "fake-serper-key-for-tests";
const ll = "@-22.5269,-41.945,13z";
const place = (id = 1) => ({
  title: `Escritório ${id}`,
  placeId: `ChIJ_test_${id}`,
  cid: String(1000 + id),
  position: id,
  address: `Rua ${id}, Rio das Ostras`,
  type: "Advogado",
  types: ["Advogado", "Direito civil", "Direito trabalhista"],
  website: "https://example.com/",
  phoneNumber: "(22) 99999-0000",
  rating: 4.8,
  ratingCount: 120,
  latitude: -22.52,
  longitude: -41.94,
  description: "Escritório de advocacia",
});
const request = (body: unknown, headers: Record<string, string> = {}) => {
  const requestHeaders = new Headers({ "Content-Type": "application/json" });
  for (const [name, value] of Object.entries(headers))
    requestHeaders.set(name, value);
  return new Request("https://rankgps.vitalsites.com.br/api/businesses", {
    method: "POST",
    headers: requestHeaders,
    body: JSON.stringify(body),
  });
};

test("validates search, key, page bounds and provider area for subsequent pages", () => {
  assert.deepEqual(
    parseSearch({ apiKey, query: " advogado em Rio das Ostras ", page: 1, ll }),
    { apiKey, query: "advogado em Rio das Ostras", page: 1, ll: null },
  );
  assert.equal(parseSearch({ apiKey, query: "advogado", page: 2, ll })?.ll, ll);
  for (const bad of [
    null,
    {},
    { apiKey, query: " ", page: 1 },
    { apiKey, query: "a".repeat(301), page: 1 },
    { apiKey: "k\r\ninjected", query: "a", page: 1 },
    { apiKey: "a".repeat(513), query: "a", page: 1 },
    ...[0, 11, 1.5, "1"].map((page) => ({ apiKey, query: "a", page })),
    { apiKey, query: "a", page: 2 },
    { apiKey, query: "a", page: 2, ll: "@91,1,13z" },
  ])
    assert.equal(parseSearch(bad), null);
  assert.equal(parseLl("@-22.52,-41.94"), "@-22.52,-41.94");
  assert.equal(parseLl("@1,1,30z"), null);
});

test("exposes provided categories, contact and extra fields without inventing missing values", () => {
  const business = normalizeBusiness(
    {
      ...place(),
      types: [
        "Advogado",
        "Direito civil",
        "direito civil",
        "Direito trabalhista",
      ],
      openingHours: { monday: "09:00–18:00" },
      attributes: { accessibility: true },
    },
    2,
    apiKey,
  );
  assert.equal(business.primaryCategory, "Advogado");
  assert.deepEqual(business.secondaryCategories, [
    "direito civil",
    "Direito trabalhista",
  ]);
  assert.equal(business.website, "https://example.com/");
  assert.deepEqual(business.fields.openingHours, { monday: "09:00–18:00" });
  assert.equal(business.sourcePage, 2);
  const missing = normalizeBusiness({ title: "Empresa" }, 1, apiKey);
  for (const value of [
    missing.primaryCategory,
    missing.website,
    missing.phone,
    missing.rating,
    missing.ratingCount,
    missing.description,
  ])
    assert.equal(value, null);
  assert.equal(missing.categoriesProvided, false);
  assert.deepEqual(missing.secondaryCategories, []);
  const noPrimary = normalizeBusiness(
    { title: "Empresa", types: ["Categoria adicional"] },
    1,
    apiKey,
  );
  assert.equal(noPrimary.primaryCategory, null);
  assert.deepEqual(noPrimary.secondaryCategories, ["Categoria adicional"]);
});

test("rejects executable URLs and never echoes a credential from provider data", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,test",
    "https://user:pass@example.com",
    "//example.com",
  ])
    assert.equal(safeUrl(url), null);
  const business = normalizeBusiness(
    {
      ...place(),
      title: `Empresa ${apiKey}`,
      apiKey,
      headers: { authorization: apiKey },
      info: { token: "sensitive", text: apiKey },
      website: "javascript:alert(1)",
    },
    1,
    apiKey,
  );
  assert.equal(business.website, null);
  assert.ok(!JSON.stringify(business).includes(apiKey));
  assert.ok(!JSON.stringify(business).includes("sensitive"));
  assert.ok(!("apiKey" in business.fields));
});

test("deduplicates by Google identifiers while preserving separate branches and original order", () => {
  const first = normalizeBusiness(place(1), 1, apiKey);
  const second = normalizeBusiness(
    { ...place(2), title: first.name },
    1,
    apiKey,
  );
  const duplicate = normalizeBusiness({ ...place(1), position: 15 }, 2, apiKey);
  assert.deepEqual(
    mergeBusinesses([first], [duplicate, second]).map((b) => b.placeId),
    [first.placeId, second.placeId],
  );
  assert.equal(
    mergeBusinesses(
      [],
      Array.from({ length: 60 }, (_, i) =>
        normalizeBusiness(place(i), 1, apiKey),
      ),
    ).length,
    50,
  );
});

test("page response carries provider area and stops pagination safely if it is absent", () => {
  assert.equal(
    pageFromData({ places: [place()], ll, credits: 3 }, 1, apiKey, null)
      .hasMore,
    true,
  );
  assert.equal(
    pageFromData({ places: [place()] }, 1, apiKey, null).hasMore,
    false,
  );
  assert.equal(pageFromData({ places: [place()] }, 2, apiKey, ll).ll, ll);
  assert.equal(pageFromData({ places: [], ll }, 2, apiKey, ll).hasMore, false);
  assert.throws(
    () => pageFromData({ places: [{ address: "Sem nome" }] }, 1, apiKey, null),
    ProviderFailure,
  );
});

test("details add public data without erasing known contacts or changing list order", () => {
  const original = normalizeBusiness(place(1), 3, apiKey);
  const extra = normalizeBusiness(
    {
      title: original.name,
      placeId: original.placeId,
      description: "Nova descrição",
      openingHours: { monday: "09–18" },
    },
    1,
    apiKey,
  );
  const merged = mergeDetails(original, extra);
  assert.equal(merged.website, original.website);
  assert.equal(merged.phone, original.phone);
  assert.equal(merged.sourcePage, 3);
  assert.equal(merged.sourcePosition, original.sourcePosition);
  assert.equal(merged.description, "Nova descrição");
  assert.deepEqual(merged.secondaryCategories, original.secondaryCategories);
  assert.deepEqual(merged.fields.openingHours, { monday: "09–18" });
});

test("collects exactly the first 50 unique businesses across pages with provider area", async () => {
  const snapshots: SearchSnapshot[] = [];
  const calls: { page: number; area: string | null }[] = [];
  const message = await collectBusinesses({
    query: "advogado em Rio das Ostras",
    signal: new AbortController().signal,
    fetchPage: async (page, area) => {
      calls.push({ page, area });
      return pageFromData(
        {
          places: Array.from({ length: 20 }, (_, i) =>
            place((page - 1) * 20 + i + 1),
          ),
          ll,
          credits: 3,
        },
        page,
        apiKey,
        area,
      );
    },
    onPage: (snapshot) => snapshots.push(snapshot),
  });
  assert.equal(message, "");
  assert.deepEqual(calls, [
    { page: 1, area: null },
    { page: 2, area: ll },
    { page: 3, area: ll },
  ]);
  assert.equal(snapshots.at(-1)?.businesses.length, 50);
  assert.equal(snapshots.at(-1)?.businesses.at(-1)?.name, "Escritório 50");
  assert.equal(snapshots.at(-1)?.credits, 9);
  assert.equal(snapshots.at(-1)?.complete, true);
});

test("stops on repeated pages, empty pages, missing area, or the page limit", async () => {
  for (const mode of ["repeated", "empty", "no-area", "limit"]) {
    let calls = 0;
    let latest: SearchSnapshot | undefined;
    const message = await collectBusinesses({
      query: "advogado",
      signal: new AbortController().signal,
      fetchPage: async (page) => {
        calls++;
        return pageFromData(
          {
            places:
              mode === "empty" && page === 2
                ? []
                : [place(mode === "limit" ? page : 1)],
            ...(mode === "no-area" ? {} : { ll }),
          },
          page,
          apiKey,
          null,
        );
      },
      onPage: (snapshot) => {
        latest = snapshot;
      },
    });
    assert.ok(message);
    assert.equal(calls, mode === "no-area" ? 1 : mode === "limit" ? 10 : 2);
    assert.equal(latest?.creditsKnown, false);
  }
});

test("keeps successful pages available if a later request fails or is cancelled", async () => {
  let latest: SearchSnapshot | undefined;
  await assert.rejects(
    collectBusinesses({
      query: "advogado",
      signal: new AbortController().signal,
      fetchPage: async (page) => {
        if (page === 2) throw new Error("network");
        return pageFromData({ places: [place()], ll }, page, apiKey, null);
      },
      onPage: (snapshot) => {
        latest = snapshot;
      },
    }),
    /network/,
  );
  assert.equal(latest?.businesses.length, 1);
  const abort = new AbortController();
  let calls = 0;
  const message = await collectBusinesses({
    query: "a",
    signal: abort.signal,
    fetchPage: async () => {
      calls++;
      return pageFromData({ places: [place()], ll }, 1, apiKey, null);
    },
    onPage: () => abort.abort(),
  });
  assert.equal(calls, 1);
  assert.match(message, /interrompida/);
});

test("search route calls only Serper Maps, passes pagination and omits request metadata", async (t) => {
  let payload: Record<string, unknown> | undefined;
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string, options: RequestInit) => {
      assert.equal(url, "https://google.serper.dev/maps");
      assert.equal(
        (options.headers as Record<string, string>)["X-API-KEY"],
        apiKey,
      );
      assert.equal(options.cache, "no-store");
      payload = JSON.parse(String(options.body));
      return Response.json({
        places: [place()],
        ll,
        credits: 3,
        searchParameters: { apiKey },
      });
    },
  );
  const response = await search(
    request({ apiKey, query: "advogado", page: 2, ll }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(payload, { q: "advogado", page: 2, ll, hl: "pt-br" });
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.text();
  assert.ok(!body.includes(apiKey));
  assert.ok(!body.includes("searchParameters"));
});

test("invalid input and cross-site requests do not spend provider credits", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("must not fetch");
  });
  assert.equal(
    (await search(request({ apiKey, query: "a", page: 2 }))).status,
    400,
  );
  assert.equal(
    (
      await search(
        request(
          { apiKey, query: "a", page: 1 },
          { origin: "https://evil.example" },
        ),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await search(
        request(
          { apiKey, query: "a", page: 1 },
          { "sec-fetch-site": "cross-site" },
        ),
      )
    ).status,
    403,
  );
  assert.equal(
    (await search(request({}, { "content-type": "text/plain" }))).status,
    415,
  );
  assert.equal(
    (await search(request({ apiKey, query: "a".repeat(9000), page: 1 })))
      .status,
    413,
  );
  assert.equal(mock.mock.callCount(), 0);
});

test("provider errors are safe and remain errors rather than empty business lists", async (t) => {
  for (const status of [401, 403, 402, 429, 500]) {
    t.mock.method(
      globalThis,
      "fetch",
      async () => new Response(`secret ${apiKey}`, { status }),
    );
    const response = await search(
      request({ apiKey, query: "advogado", page: 1 }),
    );
    assert.equal(response.status, status === 500 ? 502 : status);
    const body = await response.text();
    assert.ok(!body.includes(apiKey));
    assert.ok(!body.includes("businesses"));
    t.mock.restoreAll();
  }
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error(`timeout ${apiKey}`);
  });
  await assert.rejects(
    callMaps(apiKey, { q: "a" }),
    (error: Error) => !error.message.includes(apiKey),
  );
});

test("individual details verify the exact business identifier", async (t) => {
  assert.equal(parseDetails({ apiKey, cid: "1001" })?.cid, "1001");
  assert.equal(parseDetails({ apiKey, placeId: "invalid/id" }), null);
  assert.equal(parseDetails({ apiKey, cid: "123.4" }), null);
  let payload: Record<string, unknown> | undefined;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, options: RequestInit) => {
      payload = JSON.parse(String(options.body));
      return Response.json({ places: [place(1)], credits: 3 });
    },
  );
  const response = await details(request({ apiKey, placeId: "ChIJ_test_1" }));
  assert.equal(response.status, 200);
  assert.deepEqual(payload, { placeId: "ChIJ_test_1", hl: "pt-br" });
  assert.equal(
    (await details(request({ apiKey, placeId: "ChIJ_test_2" }))).status,
    404,
  );
});
