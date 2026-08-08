// Перенос картинок с Tilda CDN на ImgBB.
//
//   node scripts/migrate-images.mjs --dry
//   IMGBB_API_KEY='...' DATABASE_URL='...' node scripts/migrate-images.mjs
//
// Качает каждую картинку с tildacdn, заливает в ImgBB, подменяет ссылку в базе.
//
// Затрагивает: menu_items.photo_url, menu_items.photo_hover_url,
//              events.poster_url, sessions.poster_url.
//
// Постеры TMDB (image.tmdb.org) НЕ трогаем: это чужой стабильный CDN, он никуда
// не денется вместе с подпиской, и гонять их через ImgBB незачем.
//
// Идемпотентность: карта переносов пишется в imgbb-map.json. Повторный запуск
// не перезаливает то, что уже перенесено, — важно, потому что у ImgBB есть
// лимиты, а один и тот же файл встречается в нескольких строках базы.

import { readFileSync, writeFileSync, existsSync } from "fs";

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const MAP_PATH = (args.find((a) => a.startsWith("--map=")) || "").split("=")[1] || "imgbb-map.json";
const CONCURRENCY = 3;          // ImgBB не любит наплыв, три потока безопасно
const RETRIES = 3;

const TILDA = /^https?:\/\/[^/]*tildacdn\.(com|one|net|pub)\//i;

function loadMap() {
  if (!existsSync(MAP_PATH)) return {};
  try { return JSON.parse(readFileSync(MAP_PATH, "utf8")); } catch { return {}; }
}
function saveMap(map) {
  writeFileSync(MAP_PATH, JSON.stringify(map, null, 2), "utf8");
}

async function fetchImage(url, attempt = 1) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "spot-image-migration/1.0" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length) throw new Error("пустой файл");
    // ImgBB принимает до 32 МБ, но такие картинки на сайте всё равно не нужны
    if (buf.length > 32 * 1024 * 1024) throw new Error("больше 32 МБ");
    return buf;
  } catch (e) {
    if (attempt < RETRIES) {
      await new Promise((res) => setTimeout(res, 500 * attempt));
      return fetchImage(url, attempt + 1);
    }
    throw e;
  }
}

async function uploadToImgbb(buf, name, attempt = 1) {
  const key = process.env.IMGBB_API_KEY;
  if (!key) throw new Error("Не задан IMGBB_API_KEY");

  const form = new URLSearchParams();
  form.set("key", key);
  form.set("image", buf.toString("base64"));
  if (name) form.set("name", name.slice(0, 100));

  try {
    const r = await fetch("https://api.imgbb.com/1/upload", { method: "POST", body: form });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d?.success) {
      throw new Error(d?.error?.message || `HTTP ${r.status}`);
    }
    // display_url отдаёт прямую ссылку на файл, url — тоже прямую;
    // берём display_url, он стабильнее для встраивания.
    return d.data.display_url || d.data.url;
  } catch (e) {
    if (attempt < RETRIES) {
      await new Promise((res) => setTimeout(res, 800 * attempt));
      return uploadToImgbb(buf, name, attempt + 1);
    }
    throw e;
  }
}

function nameFromUrl(url) {
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop() || "image";
    return last.replace(/\.[a-z0-9]+$/i, "");
  } catch { return "image"; }
}

async function run() {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.DATABASE_URL);

  // Собираем все ссылки на Tilda из всех полей.
  const targets = [];
  const push = (table, idField, id, field, url) => {
    if (url && TILDA.test(url)) targets.push({ table, idField, id, field, url });
  };

  const items = await sql`SELECT id, photo_url, photo_hover_url FROM menu_items`;
  items.forEach((r) => {
    push("menu_items", "id", r.id, "photo_url", r.photo_url);
    push("menu_items", "id", r.id, "photo_hover_url", r.photo_hover_url);
  });

  const events = await sql`SELECT id, poster_url FROM events`;
  events.forEach((r) => push("events", "id", r.id, "poster_url", r.poster_url));

  const sessions = await sql`SELECT id, poster_url FROM sessions WHERE poster_url IS NOT NULL`;
  sessions.forEach((r) => push("sessions", "id", r.id, "poster_url", r.poster_url));

  const unique = [...new Set(targets.map((t) => t.url))];

  console.log(`Ссылок на Tilda: ${targets.length} в ${unique.length} уникальных файлах`);
  console.log(`  menu_items: ${targets.filter((t) => t.table === "menu_items").length}`);
  console.log(`  events:     ${targets.filter((t) => t.table === "events").length}`);
  console.log(`  sessions:   ${targets.filter((t) => t.table === "sessions").length}\n`);

  if (!unique.length) { console.log("Переносить нечего."); return; }

  const map = loadMap();
  const already = unique.filter((u) => map[u]).length;
  if (already) console.log(`Уже перенесено ранее: ${already}\n`);

  if (DRY) {
    console.log("Файлы к переносу (первые 20):");
    unique.filter((u) => !map[u]).slice(0, 20).forEach((u) => console.log("  ", u));
    console.log(`\nDry run — ничего не скачано и не изменено.`);
    return;
  }

  // --- заливаем ---
  const queue = unique.filter((u) => !map[u]);
  let done = 0, failed = [];

  async function worker() {
    while (queue.length) {
      const url = queue.shift();
      try {
        const buf = await fetchImage(url);
        map[url] = await uploadToImgbb(buf, nameFromUrl(url));
        saveMap(map);          // пишем сразу: обрыв не потеряет уже залитое
      } catch (e) {
        failed.push({ url, error: String(e.message || e) });
      }
      done++;
      if (done % 10 === 0) console.log(`  … ${done}/${unique.length - already}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(`\nЗалито: ${Object.keys(map).length}, ошибок: ${failed.length}`);

  // --- переписываем ссылки ---
  let updated = 0;
  for (const t of targets) {
    const fresh = map[t.url];
    if (!fresh) continue;
    if (t.table === "menu_items" && t.field === "photo_url") {
      await sql`UPDATE menu_items SET photo_url = ${fresh} WHERE id = ${t.id}`;
    } else if (t.table === "menu_items" && t.field === "photo_hover_url") {
      await sql`UPDATE menu_items SET photo_hover_url = ${fresh} WHERE id = ${t.id}`;
    } else if (t.table === "events") {
      await sql`UPDATE events SET poster_url = ${fresh} WHERE id = ${t.id}`;
    } else if (t.table === "sessions") {
      await sql`UPDATE sessions SET poster_url = ${fresh} WHERE id = ${t.id}`;
    }
    updated++;
  }

  console.log(`Ссылок обновлено в базе: ${updated}`);
  console.log(`Карта переносов: ${MAP_PATH} — сохраните её, это единственная связь старых ссылок с новыми.`);

  if (failed.length) {
    console.log(`\nНе перенеслось:`);
    failed.slice(0, 20).forEach((f) => console.log(`  ${f.url} — ${f.error}`));
    console.log(`Запустите скрипт ещё раз: уже перенесённое пропустится.`);
  }

  const left = await sql`
    SELECT count(*)::int AS n FROM menu_items
    WHERE photo_url ILIKE '%tildacdn%' OR photo_hover_url ILIKE '%tildacdn%'
  `;
  console.log(`\nОсталось ссылок на Tilda в menu_items: ${left[0].n}`);
}

run().catch((e) => { console.error("FAILED:", e); process.exit(1); });
