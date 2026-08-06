function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

// Telegram's HTML parse_mode rejects the ENTIRE message if any interpolated
// text contains a stray <, > or & — one guest comment like "no nuts &
// dairy" silently kills the whole notification (sendMessage errors, notify()
// only logs it). Anything not written by us (guest name/comment/instagram,
// TMDB movie titles) must go through this before landing in a template.
export function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Уведомления персоналу через Telegram-бота.
//
// Почему бот, а не WhatsApp: бот живёт на серверах Telegram и не зависит от
// чьего-то телефона — не разрядится, не разлогинится, не потребует QR. И он
// бесплатный. WhatsApp остаётся для переписки С ГОСТЕМ, где он уместен.
//
// Нужные переменные:
//   TELEGRAM_BOT_TOKEN — токен от @BotFather
//   TELEGRAM_CHAT_ID   — id группы персонала (для групп отрицательный, вида -100…)

async function callTelegram(token, method, payload) {
  const resp = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data?.ok === false) {
    throw new Error(`Telegram ${method} failed: ${JSON.stringify(data)}`);
  }
  return data;
}

export async function sendTelegramMessage(text, { silent = false, token, chatId, reply_markup } = {}) {
  token = token || required("TELEGRAM_BOT_TOKEN");
  chatId = chatId || required("TELEGRAM_CHAT_ID");

  return callTelegram(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    disable_notification: silent,
    ...(reply_markup ? { reply_markup } : {})
  });
}

// Staff tap a button under the order message (accept/cancel/done) instead of
// working from a list in the admin panel — these two calls are what makes
// that button do something: acknowledge the tap, then rewrite the message so
// the next person sees the new status instead of stale buttons.
export async function answerCallbackQuery(callbackQueryId, text, { token } = {}) {
  token = token || required("TELEGRAM_BOT_TOKEN");
  return callTelegram(token, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: false
  });
}

// No parse_mode here on purpose: `text` is usually the plain text Telegram
// gave back in callback_query.message.text (entities already stripped out of
// it), so re-parsing it as HTML would trip over the same escaping issue
// escapeHtml() exists for. Plain text edits sidestep that entirely.
export async function editMessageText(chatId, messageId, text, { token, reply_markup } = {}) {
  token = token || required("TELEGRAM_BOT_TOKEN");
  return callTelegram(token, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    ...(reply_markup ? { reply_markup } : { reply_markup: { inline_keyboard: [] } })
  });
}
