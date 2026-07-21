import { json } from "../lib/utils.js";

// Server-side proxy for TMDB movie search. Keeps TMDB_API_KEY out of the
// public Tilda page - the generator form calls this endpoint, never TMDB
// directly. Returns a trimmed list: title, year, and a ready poster URL.

const TMDB_BASE = "https://api.themoviedb.org/3";
const POSTER_BASE = "https://image.tmdb.org/t/p/w500";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "https://spot-bar.site");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return json(res, 405, { error: "Method not allowed" });
  }

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return json(res, 500, { error: "TMDB_API_KEY not configured" });
  }

  const query = String(req.query?.q || "").trim();
  if (!query) {
    return json(res, 400, { error: "Missing query" });
  }

  // Optional language for localized titles (default Russian, since the
  // schedule is in Russian). Falls back to the movie's original title.
  const language = String(req.query?.lang || "ru-RU").trim();

  try {
    const url = new URL(`${TMDB_BASE}/search/movie`);
    url.searchParams.set("query", query);
    url.searchParams.set("language", language);
    url.searchParams.set("include_adult", "false");
    url.searchParams.set("api_key", apiKey);

    const r = await fetch(url.toString());
    const data = await r.json();

    if (!r.ok) {
      return json(res, 502, {
        error: "TMDB request failed",
        detail: data?.status_message || `HTTP ${r.status}`
      });
    }

    const results = Array.isArray(data?.results) ? data.results : [];

    const movies = results.slice(0, 12).map((m) => ({
      tmdb_id: m.id,
      title: String(m.title || m.original_title || "").trim(),
      original_title: String(m.original_title || "").trim(),
      year: String(m.release_date || "").slice(0, 4),
      poster: m.poster_path ? `${POSTER_BASE}${m.poster_path}` : ""
    }));

    return json(res, 200, { ok: true, movies });
  } catch (error) {
    console.error("tmdb-search.js error", error);
    return json(res, 500, {
      error: "TMDB search failed",
      detail: String(error?.message || error)
    });
  }
}
