function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
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

export async function sendTelegramMessage(text, { silent = false, token, chatId } = {}) {
  token = token || required("TELEGRAM_BOT_TOKEN");
  chatId = chatId || required("TELEGRAM_CHAT_ID");

  const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      disable_notification: silent
    })
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data?.ok === false) {
    throw new Error(`Telegram send failed: ${JSON.stringify(data)}`);
  }
  return data;
}
