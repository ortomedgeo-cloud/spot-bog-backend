// Добор вторых фотографий из Tilda Store в photo_hover_url.
//
//   node scripts/backfill-hover-photos.mjs menu-raw.json --dry
//   DATABASE_URL='...' node scripts/backfill-hover-photos.mjs menu-raw.json
//
// Зачем: при первом сборе меню я забирал только gallery[0], поэтому вторых
// фотографий (те самые «по две» у авторских коктейлей) в базе нет. Скрипт
// заново открывает страницы товаров, берёт gallery[1] и проставляет его тем
// позициям, у которых первая фотография совпадает — это надёжный ключ, потому
// что именно по фото мы связывали переводы при импорте.
//
// Идемпотентен: уже заполненные photo_hover_url не трогает (если не --force).

import { readFileSync } from "fs";

const args = process.argv.slice(2);
const inPath = args.find((a) => !a.startsWith("--")) || "menu-raw.json";
const DRY = args.includes("--dry");
const FORCE = args.includes("--force");
const CONCURRENCY = 6;

function extractProductJson(html) {
  const marker = "var product = ";
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const from = html.indexOf("{", start);
  if (from === -1) return null;

  let depth = 0, inStr = false, esc = false;
  for (let i = from; i < html.length; i++) {
    const ch = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(html.slice(from, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

async function fetchGallery(url, attempt = 1) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "spot-menu-import/1.0" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const p = extractProductJson(await r.text());
    return Array.isArray(p?.gallery) ? p.gallery.map((g) => g.img).filter(Boolean) : [];
  } catch (e) {
    if (attempt < 3) {
      await new Promise((res) => setTimeout(res, 400 * attempt));
      return fetchGallery(url, attempt + 1);
    }
    throw e;
  }
}

async function run() {
  const raw = JSON.parse(readFileSync(inPath, "utf8")).filter((x) => x.url && x.photo_url);
  console.log(`Товаров со ссылкой и фото: ${raw.length}. Собираю галереи…\n`);

  // первая фотография -> вторая
  const second = new Map();
  const queue = raw.slice();
  let done = 0, withSecond = 0, failed = 0;

  async function worker() {
    while (queue.length) {
      const p = queue.shift();
      try {
        const g = await fetchGallery(p.url);
        if (g.length > 1 && g[0]) {
          second.set(g[0], g[1]);
          withSecond++;
        }
      } catch {
        failed++;
      }
      done++;
      if (done % 40 === 0) console.log(`  … ${done}/${raw.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(`\nГалерей с двумя и более фото: ${withSecond}, не открылось: ${failed}`);

  if (!second.size) {
    console.log("Вторых фотографий не нашлось — нечего проставлять.");
    return;
  }

  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.DATABASE_URL);

  const items = await sql`
    SELECT id, title_ru, photo_url, photo_hover_url FROM menu_items WHERE photo_url IS NOT NULL
  `;

  const todo = items.filter(
    (i) => second.has(i.photo_url) && (FORCE || !i.photo_hover_url)
  );

  console.log(`Позиций в базе с фото: ${items.length}`);
  console.log(`Совпало и будет обновлено: ${todo.length}\n`);
  todo.slice(0, 30).forEach((i) => console.log(`  ${i.title_ru}`));
  if (todo.length > 30) console.log(`  … и ещё ${todo.length - 30}`);

  if (DRY) {
    console.log("\nDry run — в базу ничего не записано.");
    return;
  }

  for (const i of todo) {
    await sql`UPDATE menu_items SET photo_hover_url = ${second.get(i.photo_url)} WHERE id = ${i.id}`;
  }
  console.log(`\nОбновлено позиций: ${todo.length}`);
}

run().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
