const SEARCH_URL = "https://duckduckgo.com/";
const IMAGE_SEARCH_URL = new URL("i.js", SEARCH_URL);
const UPSTREAM_TIMEOUT_MS = 6000;
const MAX_RESULTS = 12;
const BLOCK_STATUSES = new Set([202, 403, 429]);

function httpsUrl(value) {
  if (typeof value !== "string") return null;

  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function extractResults(items) {
  const results = [];
  const seen = new Set();

  for (const item of items) {
    const image = httpsUrl(item?.image);
    const thumbnail = httpsUrl(item?.thumbnail);
    if (!image || !thumbnail || image === thumbnail || seen.has(image)) continue;

    seen.add(image);
    results.push({ image, thumbnail, source: httpsUrl(item.url) });
    if (results.length === MAX_RESULTS) break;
  }

  return results;
}

function failure(error, status, details = {}, headers = {}) {
  return Response.json({ error, ...details }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

function upstreamFailure(response, stage) {
  const blocked = BLOCK_STATUSES.has(response.status);
  return failure(blocked ? "upstream_blocked" : "upstream_error", blocked ? 503 : 502, {
    stage,
    upstreamStatus: response.status,
  });
}

async function searchGifs(request) {
  if (request.method !== "GET") {
    return failure("method_not_allowed", 405, {}, { Allow: "GET" });
  }

  const query = (new URL(request.url).searchParams.get("q") ?? "").trim().replace(/\s+/g, " ");
  if (!query || query.length > 120) return failure("invalid_query", 400);

  const signal = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);
  let stage = "token";

  try {
    const searchUrl = new URL(SEARCH_URL);
    searchUrl.search = new URLSearchParams({ q: query, ia: "images" });
    const searchPage = await fetch(searchUrl, { signal, headers: { Accept: "text/html" } });
    if (!searchPage.ok || BLOCK_STATUSES.has(searchPage.status)) return upstreamFailure(searchPage, stage);

    const html = await searchPage.text();
    const vqd = html.match(/\bvqd=["']?(\d+-\d+(?:-\d+)?)(?=["'&;\s]|$)/)?.[1];
    if (!vqd) return failure("upstream_error", 502, { stage });

    stage = "images";
    const imagesUrl = new URL(IMAGE_SEARCH_URL);
    imagesUrl.search = new URLSearchParams({ q: query, vqd, o: "json", l: "wt-wt", p: "1", f: ",,type:gif,," });
    const imagesPage = await fetch(imagesUrl, { signal, headers: { Accept: "application/json", Referer: SEARCH_URL } });
    if (!imagesPage.ok || BLOCK_STATUSES.has(imagesPage.status)) return upstreamFailure(imagesPage, stage);

    const data = await imagesPage.json();
    if (!Array.isArray(data?.results)) return failure("upstream_error", 502, { stage });

    const results = extractResults(data.results);
    return Response.json(results, {
      headers: { "Cache-Control": results.length ? "public, max-age=0, s-maxage=900" : "no-store" },
    });
  } catch {
    return signal.aborted ? failure("upstream_timeout", 504, { stage }) : failure("upstream_error", 502, { stage });
  }
}

export default { fetch: searchGifs };
