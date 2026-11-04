import assert from "node:assert/strict";
import { test } from "node:test";
import gifApi from "../api/gifs.js";

const endpoint = "https://gym.example/api/gifs";
const token = "4-12345678901234567890";
const validRequest = () => new Request(`${endpoint}?q=bench+press`);

test("rejects unsupported methods and invalid queries before fetching", async (t) => {
  const upstream = t.mock.method(globalThis, "fetch");
  const method = await gifApi.fetch(new Request(endpoint, { method: "POST" }));
  assert.equal(method.status, 405);
  assert.equal(method.headers.get("allow"), "GET");
  assert.equal((await gifApi.fetch(new Request(endpoint))).status, 400);
  assert.equal((await gifApi.fetch(new Request(`${endpoint}?q=${"a".repeat(121)}`))).status, 400);
  assert.equal(upstream.mock.callCount(), 0);
});

test("requests GIFs with the token and returns bounded, deduplicated HTTPS results", async (t) => {
  const image = "https://images.example/gif?id=1";
  const thumbnail = "https://thumbs.example/1.jpg";
  const source = "https://example.org/exercise";
  const query = "жим лёжа";
  const upstream = t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(url.origin, "https://duckduckgo.com");
    assert.equal(url.searchParams.get("q"), query);
    if (url.pathname === "/") return new Response(`<script>vqd='${token}'</script>`);

    assert.equal(url.pathname, "/i.js");
    assert.equal(url.searchParams.get("vqd"), token);
    assert.ok(url.searchParams.get("f").split(",").includes("type:gif"));
    assert.equal(url.searchParams.get("p"), "1");
    return Response.json({
      results: [
        null,
        { image: "http://images.example/1.gif", thumbnail },
        { image: "https://images.example/no-thumbnail.gif" },
        { image, thumbnail, url: source, title: "Unused upstream data" },
        { image, thumbnail, url: source },
        ...Array.from({ length: 15 }, (_, i) => ({ image: `https://images.example/${i}.gif`, thumbnail })),
      ],
    });
  });

  const response = await gifApi.fetch(new Request(`${endpoint}?q=${encodeURIComponent("  жим   лёжа  ")}`));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /s-maxage=/);
  const results = await response.json();
  assert.equal(results.length, 12);
  assert.deepEqual(results[0], { image, thumbnail, source });
  assert.equal(upstream.mock.callCount(), 2);
});

test("does not retry a 202 response from the token page", async (t) => {
  const upstream = t.mock.method(globalThis, "fetch", async () => new Response("challenge", { status: 202 }));
  const response = await gifApi.fetch(validRequest());
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { error: "upstream_blocked", stage: "token", upstreamStatus: 202 });
  assert.equal(upstream.mock.callCount(), 1);
});

test("distinguishes a rate limit on the image endpoint from empty results", async (t) => {
  const upstream = t.mock.method(globalThis, "fetch", async (url) => {
    if (url.pathname === "/") return new Response(`vqd=${token}&ia=images`);
    return new Response("Too many requests", { status: 429 });
  });

  const response = await gifApi.fetch(validRequest());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "upstream_blocked", stage: "images", upstreamStatus: 429 });
  assert.equal(upstream.mock.callCount(), 2);
});

test("separates an empty search from missing tokens and invalid JSON", async (t) => {
  let tokenPage = "not a search page";
  let imagesPage = "not JSON";
  t.mock.method(globalThis, "fetch", async (url) => new Response(url.pathname === "/" ? tokenPage : imagesPage));

  const missingToken = await gifApi.fetch(validRequest());
  assert.equal(missingToken.status, 502);
  assert.deepEqual(await missingToken.json(), {
    error: "upstream_error", stage: "token", upstreamStatus: 200, reason: "missing_token",
  });

  tokenPage = `vqd=\"${token}\"`;
  const invalidJson = await gifApi.fetch(validRequest());
  assert.equal(invalidJson.status, 502);
  assert.deepEqual(await invalidJson.json(), {
    error: "upstream_error", stage: "images", upstreamStatus: 200, reason: "invalid_json",
  });

  imagesPage = JSON.stringify({ results: [] });
  const empty = await gifApi.fetch(validRequest());
  assert.equal(empty.status, 200);
  assert.equal(empty.headers.get("cache-control"), "no-store");
  assert.deepEqual(await empty.json(), []);
});

test("reports a failed connection without including the raw error or the token", async (t) => {
  const upstream = t.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("private request details", { cause: { code: "ECONNRESET" } });
  });

  const expected = { error: "upstream_error", reason: "fetch_failed", networkCode: "ECONNRESET" };
  const tokenFailure = await gifApi.fetch(validRequest());
  assert.equal(tokenFailure.status, 502);
  assert.deepEqual(await tokenFailure.json(), { ...expected, stage: "token" });

  upstream.mock.mockImplementationOnce(async () => new Response(`vqd='${token}'`));
  const imageFailure = await gifApi.fetch(validRequest());
  assert.equal(imageFailure.status, 502);
  assert.deepEqual(await imageFailure.json(), { ...expected, stage: "images" });
});
