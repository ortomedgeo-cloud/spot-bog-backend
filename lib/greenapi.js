function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

export async function sendWhatsappNotification(message, { idInstance, token, chatId } = {}) {
  idInstance = idInstance || required("GREEN_API_ID_INSTANCE");
  token = token || required("GREEN_API_TOKEN");
  chatId = chatId || required("GREEN_API_CHAT_ID");

  const url = `https://api.green-api.com/waInstance${idInstance}/sendMessage/${token}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ chatId, message })
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`GreenAPI send failed: ${JSON.stringify(data)}`);
  }

  return data;
}
