const SEARCH_URL = "https://duckduckgo.com/";
const IMAGE_SEARCH_URL = new URL("i.js", SEARCH_URL);
const TOKEN_PAGES = [
  { name: "images", url: SEARCH_URL, params: { iar: "images", t: "h_" } },
  { name: "html", url: "https://html.duckduckgo.com/html/" },
];
const UPSTREAM_TIMEOUT_MS = 6000;
const MAX_RESULTS = 12;
const BLOCK_STATUSES = new Set([202, 403, 429]);
const CHALLENGE_PAGE = /anomaly-modal|id\s*=\s*["']challenge-form["']|bots use duckduckgo too/i;
// Keep the same client headers for token acquisition and the image request.
const CLIENT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

function extractToken(html) {
  const inline = html.match(/\bvqd\s*=\s*["']?(\d+-\d+(?:-\d+)?)(?=["'&;\s]|$)/)?.[1];
  if (inline) return inline;

  for (const [tag] of html.matchAll(/<input\b[^>]*>/gi)) {
    if (!/\sname\s*=\s*(?:"vqd"|'vqd'|vqd(?=[\s/>]))/i.test(tag)) continue;
    const value = tag.match(/\svalue\s*=\s*["']?(\d+-\d+(?:-\d+)?)(?=["'\s/>])/i)?.[1];
    if (value) return value;
  }

  return null;
}

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

function upstreamFailure(response, stage, details) {
  const blocked = BLOCK_STATUSES.has(response.status);
  return failure(blocked ? "upstream_blocked" : "upstream_error", blocked ? 503 : 502, {
    stage,
    upstreamStatus: response.status,
    ...details,
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
  let upstreamStatus;
  let tokenEntry;
  const missingTokenPages = [];
  const diagnostics = () => ({ tokenEntry, missingTokenPages: missingTokenPages.length ? missingTokenPages : undefined });

  try {
    let vqd;
    for (const page of TOKEN_PAGES) {
      tokenEntry = page.name;
      upstreamStatus = undefined;
      const searchUrl = new URL(page.url);
      searchUrl.search = new URLSearchParams({ q: query, ...page.params });
      const searchPage = await fetch(searchUrl, {
        signal,
        headers: { ...CLIENT_HEADERS, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
      });
      upstreamStatus = searchPage.status;
      if (!searchPage.ok || BLOCK_STATUSES.has(upstreamStatus)) return upstreamFailure(searchPage, stage, diagnostics());

      const html = await searchPage.text();
      if (CHALLENGE_PAGE.test(html)) {
        return failure("upstream_blocked", 503, { stage, upstreamStatus, reason: "challenge_page", ...diagnostics() });
      }

      vqd = extractToken(html);
      if (vqd) break;
      missingTokenPages.push({ entry: tokenEntry, upstreamStatus, hasTokenMarker: /\bvqd\b/i.test(html) });
    }

    if (!vqd) {
      return failure("upstream_error", 502, { stage, upstreamStatus, reason: "missing_token", ...diagnostics() });
    }

    stage = "images";
    upstreamStatus = undefined;
    const imagesUrl = new URL(IMAGE_SEARCH_URL);
    imagesUrl.search = new URLSearchParams({ q: query, vqd, o: "json", l: "wt-wt", p: "1", f: ",,type:gif,," });
    const imagesPage = await fetch(imagesUrl, {
      signal,
      headers: { ...CLIENT_HEADERS, Accept: "application/json", Referer: SEARCH_URL },
    });
    upstreamStatus = imagesPage.status;
    if (!imagesPage.ok || BLOCK_STATUSES.has(upstreamStatus)) return upstreamFailure(imagesPage, stage, diagnostics());

    const body = await imagesPage.text();
    if (body.trimStart().startsWith("<") && CHALLENGE_PAGE.test(body)) {
      return failure("upstream_blocked", 503, { stage, upstreamStatus, reason: "challenge_page", ...diagnostics() });
    }
    const data = JSON.parse(body);
    if (!Array.isArray(data?.results)) {
      return failure("upstream_error", 502, { stage, upstreamStatus, reason: "invalid_results", ...diagnostics() });
    }

    const results = extractResults(data.results);
    return Response.json(results, {
      headers: {
        "Cache-Control": results.length ? "public, max-age=0, s-maxage=900" : "no-store",
        "X-Gif-Token-Entry": tokenEntry,
      },
    });
  } catch (error) {
    if (signal.aborted) return failure("upstream_timeout", 504, { stage, upstreamStatus, ...diagnostics() });

    if (upstreamStatus === undefined) {
      const code = error?.cause?.code;
      const networkCode = typeof code === "string" && /^[A-Z][A-Z0-9_]{2,47}$/.test(code) ? code : undefined;
      return failure("upstream_error", 502, { stage, reason: "fetch_failed", networkCode, ...diagnostics() });
    }

    const reason = stage === "images" && error instanceof SyntaxError ? "invalid_json" : "response_read_failed";
    return failure("upstream_error", 502, { stage, upstreamStatus, reason, ...diagnostics() });
  }
}

export default { fetch: searchGifs };
