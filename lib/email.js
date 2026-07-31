function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

// Уведомления персоналу по почте через Resend HTTP API.
//
// Без SMTP: в serverless-окружении SMTP-соединения ведут себя нестабильно
// (таймауты, отсутствие keep-alive между вызовами), да и подтянули бы
// зависимость. Resend отвечает обычным HTTP-запросом — то же, что fetch
// к любому REST API.
//
// Нужные переменные:
//   RESEND_API_KEY     — ключ API
//   NOTIFY_EMAIL_TO    — получатель(и), через запятую
//   NOTIFY_EMAIL_FROM  — отправитель, необязательно (по умолчанию onboarding@resend.dev)

function stripHtml(html) {
  return String(html ?? "").replace(/<[^>]+>/g, "");
}

export async function sendEmailNotification(text, { subject = "SPOT — уведомление" } = {}) {
  const apiKey = required("RESEND_API_KEY");
  const to = required("NOTIFY_EMAIL_TO")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const from = process.env.NOTIFY_EMAIL_FROM || "onboarding@resend.dev";

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html: text,
      text: stripHtml(text)
    })
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`Resend send failed: ${JSON.stringify(data)}`);
  }

  return data;
}
