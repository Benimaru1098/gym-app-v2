const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

export function getExerciseMedia(value) {
  const mediaUrl = typeof value === "string" ? value.trim() : "";
  if (!mediaUrl) {
    return { type: "empty" };
  }

  let url;
  try {
    url = new URL(mediaUrl);
  } catch {
    return { type: "invalid" };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { type: "invalid" };
  }

  const hostname = url.hostname.replace(/\.$/, "");
  const isShareLink = hostname === "youtu.be";
  if (!isShareLink && !YOUTUBE_HOSTS.has(hostname)) {
    return { type: "gif", src: url.href };
  }

  const path = url.pathname.slice(1).replace(/\/$/, "").split("/");
  const [route, pathId] = path;
  const isShort = route === "shorts";
  let videoId;

  if (isShareLink) {
    videoId = path.length === 1 ? route : null;
  } else if (route === "watch" && path.length === 1) {
    videoId = url.searchParams.get("v");
  } else if (path.length === 2 && (isShort || route === "embed" || route === "live")) {
    videoId = pathId;
  }

  if (!/^[\w-]{11}$/.test(videoId ?? "")) {
    return { type: "invalid" };
  }

  return {
    type: "youtube",
    isShort,
    embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?playsinline=1`,
  };
}
