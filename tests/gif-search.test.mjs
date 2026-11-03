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
    if (url.pathname === "/") {
      assert.equal(url.searchParams.get("iar"), "images");
      return new Response(`<script>vqd='${token}'</script>`);
    }

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
  assert.equal(response.headers.get("x-gif-token-entry"), "images");
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
  assert.deepEqual(await response.json(), { error: "upstream_blocked", stage: "token", upstreamStatus: 202, tokenEntry: "images" });
  assert.equal(upstream.mock.callCount(), 1);
});

test("distinguishes a rate limit on the image endpoint from empty results", async (t) => {
  const upstream = t.mock.method(globalThis, "fetch", async (url) => {
    if (url.pathname === "/") return new Response(`vqd=${token}&ia=images`);
    return new Response("Too many requests", { status: 429 });
  });

  const response = await gifApi.fetch(validRequest());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "upstream_blocked", stage: "images", upstreamStatus: 429, tokenEntry: "images" });
  assert.equal(upstream.mock.callCount(), 2);
});

test("separates an empty search from missing tokens and invalid JSON", async (t) => {
  let tokenPage = "not a search page";
  let imagesPage = "not JSON";
  t.mock.method(globalThis, "fetch", async (url) => new Response(url.pathname === "/i.js" ? imagesPage : tokenPage));

  const missingToken = await gifApi.fetch(validRequest());
  assert.equal(missingToken.status, 502);
  assert.deepEqual(await missingToken.json(), {
    error: "upstream_error", stage: "token", upstreamStatus: 200, reason: "missing_token", tokenEntry: "html",
    missingTokenPages: [
      { entry: "images", upstreamStatus: 200, hasTokenMarker: false },
      { entry: "html", upstreamStatus: 200, hasTokenMarker: false },
    ],
  });

  tokenPage = `vqd=\"${token}\"`;
  const invalidJson = await gifApi.fetch(validRequest());
  assert.equal(invalidJson.status, 502);
  assert.deepEqual(await invalidJson.json(), {
    error: "upstream_error", stage: "images", upstreamStatus: 200, reason: "invalid_json", tokenEntry: "images",
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

  const expected = { error: "upstream_error", reason: "fetch_failed", networkCode: "ECONNRESET", tokenEntry: "images" };
  const tokenFailure = await gifApi.fetch(validRequest());
  assert.equal(tokenFailure.status, 502);
  assert.deepEqual(await tokenFailure.json(), { ...expected, stage: "token" });

  upstream.mock.mockImplementationOnce(async () => new Response(`vqd='${token}'`));
  const imageFailure = await gifApi.fetch(validRequest());
  assert.equal(imageFailure.status, 502);
  assert.deepEqual(await imageFailure.json(), { ...expected, stage: "images" });
});

test("uses the HTML search form if the main page has no usable token", async (t) => {
  const paths = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    paths.push(`${url.hostname}${url.pathname}`);
    assert.equal(url.searchParams.get("q"), "bench press");
    if (url.pathname === "/") return new Response("<script>vqd = 'unknown';</script>");
    if (url.pathname === "/html/") return new Response(`<input value='${token}' type='hidden' name='vqd'>`);

    assert.equal(url.searchParams.get("vqd"), token);
    return Response.json({ results: [{ image: "https://example.com/a.gif", thumbnail: "https://example.com/a.jpg" }] });
  });

  const response = await gifApi.fetch(validRequest());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-gif-token-entry"), "html");
  assert.equal((await response.json()).length, 1);
  assert.deepEqual(paths, ["duckduckgo.com/", "html.duckduckgo.com/html/", "duckduckgo.com/i.js"]);
});

test("stops at a challenge page even when DuckDuckGo responds with HTTP 200", async (t) => {
  const challenge = `<form id="challenge-form">vqd='${token}'</form>`;
  const upstream = t.mock.method(globalThis, "fetch", async () => new Response(challenge));
  const expected = { error: "upstream_blocked", upstreamStatus: 200, reason: "challenge_page", tokenEntry: "images" };

  const first = await gifApi.fetch(validRequest());
  assert.equal(first.status, 503);
  assert.deepEqual(await first.json(), { ...expected, stage: "token" });
  assert.equal(upstream.mock.callCount(), 1);

  upstream.mock.mockImplementationOnce(async () => new Response(`vqd='${token}'`));
  const second = await gifApi.fetch(validRequest());
  assert.equal(second.status, 503);
  assert.deepEqual(await second.json(), { ...expected, stage: "images" });
  assert.equal(upstream.mock.callCount(), 3);
});

test("keeps explicit client headers consistent across both token pages and image search", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url, options });
    if (url.pathname === "/") return new Response("<html>No token</html>");
    if (url.pathname === "/html/") return new Response(`<input name="vqd" value="${token}">`);
    return Response.json({ results: [] });
  });

  const response = await gifApi.fetch(validRequest());
  assert.equal(response.status, 200);
  assert.equal(requests.length, 3);
  const clientHeaders = requests[0].options.headers;
  assert.ok(clientHeaders["User-Agent"]);
  assert.ok(clientHeaders["Accept-Language"]);
  for (const { options } of requests) {
    assert.equal(options.headers["User-Agent"], clientHeaders["User-Agent"]);
    assert.equal(options.headers["Accept-Language"], clientHeaders["Accept-Language"]);
    assert.equal(options.signal, requests[0].options.signal);
  }
  assert.match(clientHeaders.Accept, /text\/html/);
  assert.equal(requests[2].options.headers.Accept, "application/json");
  assert.equal(requests[2].options.headers.Referer, "https://duckduckgo.com/");
});
