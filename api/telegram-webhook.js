import { setOrderStatus } from "../lib/db.js";
import { getChannelValues } from "../lib/notify.js";
import { escapeHtml, answerCallbackQuery, editMessageText } from "../lib/telegram.js";
import { json } from "../lib/utils.js";

// Receives Telegram's callback_query updates for the buttons attached to
// order notifications (see api/order.js) — this is how staff work orders
// entirely from the chat, with no "Заказы" list in the admin panel.
//
// Setup (one-time, by whoever holds the bot token):
//   curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
//     -d url=https://<domain>/api/telegram-webhook \
//     -d secret_token=<TELEGRAM_WEBHOOK_SECRET>
// TELEGRAM_WEBHOOK_SECRET is optional but recommended — without it anyone
// who finds this URL can forge order status changes.

export const config = { api: { bodyParser: true } };

const ACTION_STATUS = { accept: "accepted", done: "done", cancel: "cancelled" };
const STATUS_LABEL = { accepted: "✅ Принят", done: "🍽 Готово", cancelled: "✖ Отменён" };

function safeBody(body) {
  if (!body) return {};
  if (typeof body === "object") return body;
  try { return JSON.parse(body); } catch { return {}; }
}

export default async function handler(req, res) {
  // Telegram doesn't care about the response body, only the 200 — always
  // return one, even on our own errors, so it doesn't retry-storm us.
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expectedSecret && req.headers["x-telegram-bot-api-secret-token"] !== expectedSecret) {
    return json(res, 401, { error: "Unauthorized" });
  }

  try {
    const update = safeBody(req.body);
    const cq = update.callback_query;
    if (!cq) return json(res, 200, { ok: true });

    const { TELEGRAM_BOT_TOKEN: token } = await getChannelValues("telegram");
    if (!token) {
      console.error("telegram-webhook: no bot token configured");
      return json(res, 200, { ok: true });
    }

    const [ns, action, id] = String(cq.data || "").split(":");
    const status = ns === "o" ? ACTION_STATUS[action] : null;

    if (!status || !id) {
      await answerCallbackQuery(cq.id, "Неизвестное действие", { token }).catch(() => {});
      return json(res, 200, { ok: true });
    }

    const order = await setOrderStatus(id, status);
    if (!order) {
      await answerCallbackQuery(cq.id, "Заказ не найден", { token }).catch(() => {});
      return json(res, 200, { ok: true });
    }

    const who = escapeHtml(cq.from?.first_name || cq.from?.username || "");
    const chatId = cq.message?.chat?.id;
    const messageId = cq.message?.message_id;
    // .text is Telegram's own plain-text rendering of what we sent (HTML
    // entities already resolved back to characters) — safe to reuse verbatim
    // only because the edit below sends it without parse_mode.
    const original = cq.message?.text || "";

    const keyboard = status === "accepted"
      ? { inline_keyboard: [[{ text: "🍽 Готово", callback_data: `o:done:${id}` }]] }
      : { inline_keyboard: [] };

    if (chatId && messageId) {
      try {
        await editMessageText(
          chatId, messageId,
          original + `\n\n${STATUS_LABEL[status]}${who ? " — " + who : ""}`,
          { token, reply_markup: keyboard }
        );
      } catch (e) {
        console.error("telegram-webhook: edit message failed", e);
      }
    }

    await answerCallbackQuery(cq.id, STATUS_LABEL[status], { token }).catch(() => {});
    return json(res, 200, { ok: true });
  } catch (error) {
    console.error("telegram-webhook error", error);
    return json(res, 200, { ok: true });
  }
}
