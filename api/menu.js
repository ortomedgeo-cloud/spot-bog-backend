import { getPublicMenu } from "../lib/db.js";
import { json } from "../lib/utils.js";

// Public menu for the site. GET /api/menu?lang=ru|ka|en
// Returns visible categories with available items, localized (falls back to ru).

const ALLOWED_ORIGINS = new Set([
  "https://spot-bar.site",
  "https://www.spot-bar.site"
]);

function setCors(req, res) {
  const origin = String(req.headers?.origin || "");
  res.setHeader(
    "Access-Control-Allow-Origin",
    ALLOWED_ORIGINS.has(origin) ? origin : "https://spot-bar.site"
  );
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

  try {
    const lang = String(req.query?.lang || "ru").toLowerCase();
    // ?menu=pool — барная карта у бассейна, свой набор и свои цены
    const menuKey = String(req.query?.menu || "main").toLowerCase().slice(0, 20);
    const menu = await getPublicMenu(lang, menuKey);
    return json(res, 200, { ok: true, lang, menu_key: menuKey, menu });
  } catch (error) {
    console.error("menu error", error);
    return json(res, 500, { error: "Failed", detail: String(error?.message || error) });
  }
}
