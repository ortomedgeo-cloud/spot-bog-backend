import { normalizeSeat, createOrder } from "../lib/db.js";
import { notify } from "../lib/notify.js";
import { escapeHtml } from "../lib/telegram.js";
import { json } from "../lib/utils.js";

// Заказ из меню за столом. Публичный эндпоинт: цены берутся ИЗ БАЗЫ по id
// позиций, а не из тела запроса — иначе сумму можно было бы подделать.

export const config = { api: { bodyParser: true } };

const MAX_LINES = 40;

function safeBody(body) {
  if (!body) return {};
  if (typeof body === "object") return body;
  try { return JSON.parse(body); } catch { return {}; }
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  try {
    const b = safeBody(req.body);
    const table = normalizeSeat(b.table);

    if (!table) {
      return json(res, 400, { error: "UNKNOWN_TABLE" });
    }

    const rawLines = Array.isArray(b.items) ? b.items.slice(0, MAX_LINES) : [];
    const lines = rawLines
      .map((l) => ({ menu_item_id: String(l.id || l.menu_item_id || "").trim(), qty: Number(l.qty) || 1 }))
      .filter((l) => l.menu_item_id);

    if (!lines.length) return json(res, 400, { error: "EMPTY_ORDER" });

    const order = await createOrder({
      table_label: table,
      guest_name: String(b.name || "").slice(0, 120).trim(),
      comment: String(b.comment || "").slice(0, 500).trim(),
      mode: b.mode === "takeaway" ? "takeaway" : "in_venue",
      lang: ["ru", "ka", "en"].includes(b.lang) ? b.lang : null,
      lines
    });

    try {
      const body = order.lines
        .map((l) => `• ${escapeHtml(l.title)} × ${l.qty} — ${l.price * l.qty} GEL`)
        .join("\n");
      await notify(
        `🧾 <b>Новый заказ</b> — ${escapeHtml(order.table_label)}` +
        `${b.name ? `\nГость: ${escapeHtml(String(b.name).trim())}` : ""}` +
        `${b.mode === "takeaway" ? `\n<b>С собой</b>` : ""}\n\n${body}\n\n<b>Итого: ${order.total} GEL</b>` +
        `${b.comment ? `\n\nКомментарий: ${escapeHtml(String(b.comment).trim())}` : ""}`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: "✅ Принять", callback_data: `o:accept:${order.id}` },
              { text: "✖ Отменить", callback_data: `o:cancel:${order.id}` }
            ]]
          }
        }
      );
    } catch (e) {
      console.error("order notify failed", e);
    }

    return json(res, 200, {
      ok: true,
      order_id: order.id,
      total: order.total,
      items: order.lines.length
    });
  } catch (error) {
    if (error?.code === "EMPTY_ORDER") {
      return json(res, 400, { error: "EMPTY_ORDER", detail: error.message });
    }
    console.error("order error", error);
    return json(res, 500, { error: "Failed", detail: String(error?.message || error) });
  }
}
