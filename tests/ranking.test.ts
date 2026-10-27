import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyPlaces,
  parseRankingRequest,
  providerError,
  queryPoint,
} from "../src/lib/ranking.ts";
import { POST } from "../src/app/api/ranking/route.ts";

const input = {
  apiKey: "fake-key-for-tests-only",
  term: "dentista",
  business: "Vital Odontologia",
  points: Array.from({ length: 5 }, (_, i) => ({
    id: `p${i}`,
    lat: -22.52 + i * 0.001,
    lng: -41.94,
  })),
};
const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/ranking", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

test("validates the five points and rejects malformed or duplicate coordinates", () => {
  assert.deepEqual(parseRankingRequest(input), input);
  for (const bad of [
    null,
    {},
    { ...input, points: input.points.slice(0, 4) },
    { ...input, points: [...input.points, input.points[0]] },
    { ...input, points: Array(5).fill(input.points[0]) },
    { ...input, apiKey: "key\r\ninjected" },
    { ...input, apiKey: " " },
    { ...input, term: " " },
    { ...input, business: "---" },
    {
      ...input,
      points: input.points.map((p, i) => (i === 0 ? { ...p, lat: NaN } : p)),
    },
    {
      ...input,
      points: input.points.map((p, i) => (i === 0 ? { ...p, lng: 181 } : p)),
    },
    { ...input, points: input.points.map((p) => ({ ...p, id: "same" })) },
    {
      ...input,
      points: input.points.map((p) => ({ ...p, lat: -22, lng: -41 })),
    },
  ])
    assert.equal(parseRankingRequest(bad), null);
});

test("legacy zoom selections cannot restrict the new search", () => {
  for (const searchZoom of [14, 16, 18])
    assert.deepEqual(parseRankingRequest({ ...input, searchZoom }), input);
});

test("all five queries preserve coordinates and term without imposing zoom", async (t) => {
  const callBodies: Array<{ q: string; ll: string }> = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: RequestInfo | URL, options: RequestInit) => {
      callBodies.push(JSON.parse(options.body as string));
      return Response.json({ places: [] });
    },
  );
  for (const searchZoom of [16, 18]) {
    callBodies.length = 0;
    const response = await POST(
      request({ ...input, term: "dentista rio das ostras", searchZoom }),
    );
    assert.equal(response.status, 200);
    assert.equal(callBodies.length, 5);
    assert.deepEqual(
      callBodies.map((body) => body.ll),
      input.points.map((p) => `@${p.lat},${p.lng}`),
    );
    assert.ok(callBodies.every((body) => body.q === "dentista rio das ostras"));
  }
});

test("uses the provider position and normalized exact name, not substring matches", () => {
  const result = classifyPlaces(
    {
      places: [
        { title: "Outra clínica", position: 1 },
        { title: " VÍTAL — ODONTOLOGIA ", position: 7, address: "Rua A" },
      ],
    },
    input.business,
    "p1",
  );
  assert.equal(result.position, 7);
  assert.equal(result.status, "found");
  assert.equal(result.matches[0].address, "Rua A");
  assert.equal(
    classifyPlaces(
      { places: [{ title: "Vital Odontologia Infantil", position: 1 }] },
      input.business,
      "p1",
    ).status,
    "not_found",
  );
});

test("distinguishes ambiguity and empty results from invalid provider data", () => {
  const ambiguous = classifyPlaces(
    {
      places: [
        { title: input.business, position: 2, address: "Rua A" },
        { title: input.business, position: 9, address: "Rua B" },
      ],
    },
    input.business,
    "p1",
  );
  assert.equal(ambiguous.status, "ambiguous");
  assert.equal(ambiguous.position, null);
  assert.equal(ambiguous.matches.length, 2);
  assert.equal(
    classifyPlaces({ places: [] }, input.business, "p1").status,
    "not_found",
  );
  for (const bad of [
    {},
    null,
    { places: null },
    { places: [{ title: input.business }] },
    { places: [{ title: input.business, position: 0 }] },
  ]) {
    assert.throws(() => classifyPlaces(bad, input.business, "p1"));
  }
});

test("invalid requests never call the provider; rejects cross-origin and malformed JSON", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Must not call provider");
  });
  assert.equal((await POST(request({}))).status, 400);
  assert.equal(
    (
      await POST(
        request(
          {},
          { origin: "http://127.0.0.1:3001", host: "127.0.0.1:3001" },
        ),
      )
    ).status,
    400,
  );
  assert.equal((await POST(request(input, { origin: "null" }))).status, 403);
  assert.equal(
    (await POST(request(input, { origin: "https://other.example" }))).status,
    403,
  );
  assert.equal(
    (await POST(request(input, { "Content-Type": "text/plain" }))).status,
    415,
  );
  assert.equal(
    (await POST(request(input, { "Content-Length": "20000" }))).status,
    413,
  );
  assert.equal(
    (
      await POST(
        new Request("http://localhost/api/ranking", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{",
        }),
      )
    ).status,
    400,
  );
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("five independent Maps calls carry the entered key and coordinates; partial failures stay separate", async (t) => {
  let calls = 0;
  const fetchMock = t.mock.method(
    globalThis,
    "fetch",
    async (url: RequestInfo | URL, options: RequestInit) => {
      const i = calls++;
      assert.equal(url, "https://google.serper.dev/maps");
      assert.equal(new Headers(options.headers).get("X-API-KEY"), input.apiKey);
      assert.equal(options.cache, "no-store");
      assert.deepEqual(JSON.parse(options.body as string), {
        q: "dentista",
        hl: "pt-br",
        ll: `@${input.points[i].lat},${input.points[i].lng}`,
        page: 1,
      });
      if (i === 3)
        return new Response(
          "upstream body must never be echoed: " + input.apiKey,
          { status: 429 },
        );
      if (i === 4) throw new Error("network diagnostic: " + input.apiKey);
      return Response.json({
        searchParameters: { apiKey: input.apiKey },
        places:
          i === 2
            ? []
            : [{ title: input.business, address: "Rua A", position: i + 3 }],
      });
    },
  );
  const response = await POST(request(input));
  const text = await response.text();
  const data = JSON.parse(text);
  assert.equal(fetchMock.mock.callCount(), 5);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(text.includes(input.apiKey), false);
  assert.deepEqual(
    data.results.map((r: { status: string }) => r.status),
    ["found", "found", "not_found", "error", "error"],
  );
  assert.deepEqual(
    data.results.map((r: { pointId: string }) => r.pointId),
    input.points.map((p) => p.id),
  );
  assert.equal(data.results[0].position, 3);
  assert.ok(data.searchedAt);
});

test("authentication, credits, provider errors and timeout have safe messages and no retries", async (t) => {
  for (const status of [401, 403, 402, 429, 500]) {
    const mock = t.mock.method(
      globalThis,
      "fetch",
      async () => new Response(input.apiKey, { status }),
    );
    const result = await queryPoint(input, input.points[0]);
    assert.equal(result.status, "error");
    assert.equal(result.message, providerError(status));
    assert.equal(mock.mock.callCount(), 1);
    mock.mock.restore();
  }
  const timeoutMock = t.mock.method(globalThis, "fetch", async () => {
    throw new DOMException("secret diagnostic", "TimeoutError");
  });
  assert.match(
    (await queryPoint(input, input.points[0])).message!,
    /tempo limite/,
  );
  assert.equal(timeoutMock.mock.callCount(), 1);
  timeoutMock.mock.restore();
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ unexpected: true }),
  );
  assert.match(
    (await queryPoint(input, input.points[0])).message!,
    /formato inesperado/,
  );
});
