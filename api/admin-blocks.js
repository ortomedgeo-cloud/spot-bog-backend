import { blockTable, unblockTable, getSessionBlocks } from "../lib/db.js";
import { json, isAdminAuthed } from "../lib/utils.js";

// Закрытие столов под конкретный сеанс: «этот держим под стафф»,
// «этот обещали гостю по телефону». Стол виден на схеме, но с сайта его
// не забронируют; администратор посадить за него может.
//
//   GET  ?session_id=s_x
//   POST { action:'block'|'unblock', session_id, table_label, reason? }

function safeBody(body) {
  if (!body) return {};
  if (typeof body === "object") return body;
  try { return JSON.parse(body); } catch { return {}; }
}

export default async function handler(req, res) {
  if (!isAdminAuthed(req)) return json(res, 401, { error: "Unauthorized" });

  try {
    if (req.method === "GET") {
      const sessionId = String(req.query?.session_id || "").trim();
      if (!sessionId) return json(res, 400, { error: "Missing session_id" });
      return json(res, 200, { ok: true, blocks: await getSessionBlocks(sessionId) });
    }

    if (req.method === "POST") {
      const b = safeBody(req.body);
      const sessionId = String(b.session_id || "").trim();
      const label = String(b.table_label || "").trim();
      if (!sessionId || !label) return json(res, 400, { error: "Missing session_id or table_label" });

      if (b.action === "unblock") {
        await unblockTable(sessionId, label);
        return json(res, 200, { ok: true, blocks: await getSessionBlocks(sessionId) });
      }

      await blockTable(sessionId, label, String(b.reason || "").slice(0, 200).trim());
      return json(res, 200, { ok: true, blocks: await getSessionBlocks(sessionId) });
    }

    return json(res, 405, { error: "Method not allowed" });
  } catch (error) {
    if (error?.code === "TABLE_TAKEN") {
      return json(res, 409, { error: "TABLE_TAKEN", detail: error.message });
    }
    console.error("admin-blocks error", error);
    return json(res, 500, { error: "Failed", detail: String(error?.message || error) });
  }
}
