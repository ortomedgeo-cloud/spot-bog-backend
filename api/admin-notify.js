import {
  CHANNELS,
  channelStatus,
  notify,
  secretsAvailable,
  saveSecretField,
  clearSecretField
} from "../lib/notify.js";
import { setNotifyChannel } from "../lib/db.js";
import { json, isAdminAuthed } from "../lib/utils.js";

// Настройки каналов уведомлений для админки.
//   GET                            -> { ok, secretsAvailable, channels }
//   POST { channel, enabled }      -> переключить канал, вернуть обновлённый список
//   POST { channel, secrets: {} }  -> сохранить одно или несколько полей (токены/ключи)
//   POST { channel, clearSecret }  -> убрать сохранённое поле, вернуться к переменной окружения
//   POST { test: 'telegram' }      -> отправить пробное сообщение в этот канал

function safeBody(body) {
  if (!body) return {};
  if (typeof body === "object") return body;
  try { return JSON.parse(body); } catch { return {}; }
}

export default async function handler(req, res) {
  if (!isAdminAuthed(req)) return json(res, 401, { error: "Unauthorized" });

  try {
    if (req.method === "GET") {
      return json(res, 200, { ok: true, secretsAvailable: secretsAvailable(), channels: await channelStatus() });
    }

    if (req.method === "POST") {
      const b = safeBody(req.body);

      if (b.test) {
        const channel = String(b.test);
        if (!CHANNELS[channel]) return json(res, 400, { error: "UNKNOWN_CHANNEL" });
        if (CHANNELS[channel].broadcast === false) {
          // Каналу нужен адресат: он пишет гостю по номеру из конкретной брони.
          return json(res, 400, {
            error: "NO_TEST",
            detail: "Канал пишет гостю по номеру из брони — проверяется реальной оплатой"
          });
        }

        const statuses = await channelStatus();
        const status = statuses.find((s) => s.channel === channel);
        if (!status?.configured || !status?.enabled) {
          return json(res, 400, { error: "NOT_ACTIVE" });
        }

        const result = await notify(
          "🔔 <b>Тестовое уведомление</b> — проверка канала " + CHANNELS[channel].title,
          { only: channel }
        );
        const outcome = result.results.find((r) => r.channel === channel);
        if (!outcome?.ok) {
          return json(res, 502, { error: "SEND_FAILED", detail: outcome?.error || "unknown" });
        }
        return json(res, 200, { ok: true });
      }

      if (b.secrets && typeof b.secrets === "object") {
        const channel = String(b.channel || "");
        if (!CHANNELS[channel]) return json(res, 400, { error: "UNKNOWN_CHANNEL" });

        const entries = Object.entries(b.secrets).filter(([, v]) => String(v ?? "").trim());
        if (!entries.length) return json(res, 400, { error: "EMPTY_SECRETS" });

        for (const [name, value] of entries) {
          try {
            await saveSecretField(channel, name, String(value).trim());
          } catch (error) {
            if (error.code === "UNKNOWN_FIELD") return json(res, 400, { error: "UNKNOWN_FIELD", detail: name });
            if (error.code === "NO_SECRET_KEY") return json(res, 400, { error: "NO_SECRET_KEY", detail: error.message });
            throw error;
          }
        }
        return json(res, 200, { ok: true, channels: await channelStatus() });
      }

      if (b.clearSecret) {
        const channel = String(b.channel || "");
        if (!CHANNELS[channel]) return json(res, 400, { error: "UNKNOWN_CHANNEL" });
        try {
          await clearSecretField(channel, String(b.clearSecret));
        } catch (error) {
          if (error.code === "UNKNOWN_FIELD") return json(res, 400, { error: "UNKNOWN_FIELD", detail: b.clearSecret });
          throw error;
        }
        return json(res, 200, { ok: true, channels: await channelStatus() });
      }

      const channel = String(b.channel || "");
      if (!CHANNELS[channel]) return json(res, 400, { error: "UNKNOWN_CHANNEL" });
      if (typeof b.enabled !== "boolean") return json(res, 400, { error: "BAD_ENABLED" });

      await setNotifyChannel(channel, b.enabled);
      return json(res, 200, { ok: true, channels: await channelStatus() });
    }

    return json(res, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error("admin-notify error", error);
    return json(res, 500, { error: "Failed", detail: String(error?.message || error) });
  }
}
