function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

export async function sendWhatsappNotification(message) {
  const url =
    `https://api.green-api.com/waInstance${required("GREEN_API_ID_INSTANCE")}` +
    `/sendMessage/${required("GREEN_API_TOKEN")}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chatId: required("GREEN_API_CHAT_ID"),
      message
    })
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`GreenAPI send failed: ${JSON.stringify(data)}`);
  }

  return data;
}
