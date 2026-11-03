import gifApi from "../api/gifs.js";

const target = process.argv[2];
if (!target) {
  console.error("Usage: node scripts/probe-gif-search.mjs --direct | https://your-preview.vercel.app");
  process.exit(1);
}

const direct = target === "--direct";
const endpoint = new URL("/api/gifs", direct ? "http://localhost" : target);
const batches = [
  ["barbell bench press"],
  ["lat pulldown", "жим ногами", "dumbbell biceps curl"],
  ["трицепс на блоке", "seated cable row", "разведение гантелей в стороны", "leg extension", "romanian deadlift"],
];

async function probe(query) {
  const url = new URL(endpoint);
  url.searchParams.set("q", query);
  const start = performance.now();

  try {
    const response = direct ? await gifApi.fetch(new Request(url)) : await fetch(url, { signal: AbortSignal.timeout(10000) });
    const body = await response.json().catch(() => null);
    const results = response.ok && Array.isArray(body) ? body.length : null;
    return {
      query,
      status: response.status,
      results,
      error: body?.error ?? (results === null ? "unexpected_response" : ""),
      stage: body?.stage ?? "",
      upstream: body?.upstreamStatus ?? "",
      reason: body?.reason ?? "",
      networkCode: body?.networkCode ?? "",
      cache: response.headers.get("x-vercel-cache") ?? "",
      ms: Math.round(performance.now() - start),
    };
  } catch (error) {
    return { query, status: 0, results: null, error: error.message, ms: Math.round(performance.now() - start) };
  }
}

for (const batch of batches) {
  console.log(`Concurrent searches: ${batch.length}`);
  const results = await Promise.all(batch.map(probe));
  console.table(results);

  if (results.some((row) => row.results === null)) {
    console.error("Stopped after a failed batch; not increasing traffic.");
    process.exitCode = 1;
    break;
  }
}
