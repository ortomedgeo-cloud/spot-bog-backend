import crypto from "crypto";

// Шифрование секретов, которые персонал вводит через админку (токены ботов,
// API-ключи), для хранения в БД. Мастер-ключ остаётся переменной окружения —
// шифруем именно для того, чтобы в самой базе (Neon-консоль, дамп, утёкшая
// строка подключения) значения не лежали в открытом виде.
//
// Формат хранимой строки: base64(iv).base64(authTag).base64(ciphertext)
// AES-256-GCM: iv отдельный на каждое значение, authTag ловит порчу/подмену.

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function deriveKey() {
  return crypto.createHash("sha256").update(required("NOTIFY_SECRET_KEY")).digest();
}

export function encryptSecret(plaintext) {
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

export function decryptSecret(stored) {
  const key = deriveKey();
  const [ivB64, tagB64, dataB64] = String(stored).split(".");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString("utf8");
}

export function secretsEnabled() {
  return !!process.env.NOTIFY_SECRET_KEY;
}
