const TMDB_API_BASE = "https://api.themoviedb.org/3";
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 80;
const recentRequests = new Map();

function reject(res, status, message) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json({ error: message });
}

function getAllowedRequest(path, query) {
  const keys = Object.keys(query);
  if (path === "/configuration") {
    return keys.length === 0 ? { path } : null;
  }

  if (path === "/search/movie" || path === "/search/tv") {
    if (keys.some((key) => key !== "query" && key !== "include_adult")) return null;
    const title = typeof query.query === "string" ? query.query.trim() : "";
    const includeAdult = typeof query.include_adult === "string" ? query.include_adult : "false";
    if (!title || title.length > 120 || includeAdult !== "false") return null;
    return { path, query: { query: title, include_adult: "false" } };
  }

  const detailMatch = /^\/(movie|tv)\/(\d{1,12})$/.exec(path);
  if (!detailMatch) return null;

  const [, mediaType, id] = detailMatch;
  if (mediaType === "movie") {
    if (keys.some((key) => key !== "append_to_response")) return null;
    if (query.append_to_response && query.append_to_response !== "credits") return null;
    return { path: `/${mediaType}/${id}`, query: query.append_to_response ? { append_to_response: "credits" } : {} };
  }

  return keys.length === 0 ? { path: `/${mediaType}/${id}`, query: {} } : null;
}

function isSameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (!origin || !host) return true;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

function isRateLimited(req) {
  const ip = String(req.headers["x-forwarded-for"] ?? "unknown").split(",")[0].trim();
  const now = Date.now();
  if (recentRequests.size > 1_000) {
    for (const [knownIp, entry] of recentRequests) {
      if (now - entry.startedAt >= RATE_LIMIT_WINDOW_MS) recentRequests.delete(knownIp);
    }
  }
  const previous = recentRequests.get(ip);
  if (!previous || now - previous.startedAt >= RATE_LIMIT_WINDOW_MS) {
    recentRequests.set(ip, { startedAt: now, count: 1 });
    return false;
  }

  previous.count += 1;
  return previous.count > RATE_LIMIT_MAX_REQUESTS;
}

module.exports = async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return reject(res, 405, "Only GET requests are supported.");
  }

  if (!isSameOrigin(req)) return reject(res, 403, "Cross-origin requests are not allowed.");
  if (isRateLimited(req)) {
    res.setHeader("Retry-After", "60");
    return reject(res, 429, "Too many catalog requests. Wait a minute and try again.");
  }

  const token = process.env.TMDB_API_READ_ACCESS_TOKEN;
  if (!token) return reject(res, 503, "The shared TMDB catalog is not configured.");

  const path = typeof req.query.path === "string" ? req.query.path : "";
  const query = { ...req.query };
  delete query.path;
  const allowedRequest = getAllowedRequest(path, query);
  if (!allowedRequest) return reject(res, 400, "This TMDB catalog request is not supported.");

  const upstreamUrl = new URL(`${TMDB_API_BASE}${allowedRequest.path}`);
  for (const [key, value] of Object.entries(allowedRequest.query ?? {})) {
    upstreamUrl.searchParams.set(key, value);
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
    });

    if (upstream.status === 429) {
      res.setHeader("Retry-After", upstream.headers.get("retry-after") ?? "60");
      return reject(res, 429, "TMDB is receiving too many requests. Try again shortly.");
    }
    if (upstream.status === 401 || upstream.status === 403) {
      return reject(res, 502, "The shared TMDB connection was rejected. The site owner must check the Vercel setting.");
    }
    if (!upstream.ok) return reject(res, 502, "TMDB could not complete this catalog request.");

    const data = await upstream.json();
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).json(data);
  } catch {
    return reject(res, 502, "TMDB is temporarily unavailable. Try again later.");
  }
};
