import { CHANNELS, channelStatus, notify } from "../lib/notify.js";
import { setNotifyChannel } from "../lib/db.js";
import { json, isAdminAuthed } from "../lib/utils.js";

// Настройки каналов уведомлений для админки.
//   GET                          -> { ok, channels }
//   POST { channel, enabled }    -> переключить канал, вернуть обновлённый список
//   POST { test: 'telegram' }    -> отправить пробное сообщение в этот канал

function safeBody(body) {
  if (!body) return {};
  if (typeof body === "object") return body;
  try { return JSON.parse(body); } catch { return {}; }
}

export default async function handler(req, res) {
  if (!isAdminAuthed(req)) return json(res, 401, { error: "Unauthorized" });

  try {
    if (req.method === "GET") {
      return json(res, 200, { ok: true, channels: await channelStatus() });
    }

    if (req.method === "POST") {
      const b = safeBody(req.body);

      if (b.test) {
        const channel = String(b.test);
        if (!CHANNELS[channel]) return json(res, 400, { error: "UNKNOWN_CHANNEL" });

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
