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

// Номер гостя приходит из формы брони в произвольном виде: «+995 555 24-84-32»,
// «995555248432», «8 999 …», а нередко это вообще инстаграм («@nickname») —
// люди пишут туда что угодно. Возвращаем chatId только для того, что реально
// похоже на номер; всё остальное — null, и гостю просто не пишем.
export function phoneToChatId(raw) {
  const s = String(raw || "").trim();
  if (!s || s.startsWith("@")) return null;          // инстаграм-ник
  if (/[a-zA-Zа-яА-Я]/.test(s.replace(/^\+/, ""))) return null; // текст, а не номер

  let digits = s.replace(/\D/g, "");
  if (!digits) return null;

  // Российский формат 8XXXXXXXXXX -> 7XXXXXXXXXX
  if (digits.length === 11 && digits.startsWith("8")) digits = "7" + digits.slice(1);
  // Грузинский номер без кода страны: 555248432 -> 995555248432
  if (digits.length === 9 && digits.startsWith("5")) digits = "995" + digits;

  // Международные номера: от 10 (без кода) до 15 цифр по E.164
  if (digits.length < 10 || digits.length > 15) return null;

  return `${digits}@c.us`;
}

// Похоже ли значение на телефон, по которому реально можно связаться.
// Используется формой брони: инстаграм-ник в поле телефона больше не проходит.
export function looksLikePhone(raw) {
  return phoneToChatId(raw) !== null;
}
