import {
  listOrders,
  listServiceRequests,
  setOrderStatus,
  setServiceRequestStatus
} from "../lib/db.js";
import { json, isAdminAuthed } from "../lib/utils.js";

// Лента обслуживания для персонала.
//   GET  ?hours=24              -> { orders, requests }
//   POST { kind, id, status }   -> сменить статус (kind: order | request)

const ORDER_STATUSES = ["new", "accepted", "done", "cancelled"];
const REQ_STATUSES = ["new", "done"];

function safeBody(body) {
  if (!body) return {};
  if (typeof body === "object") return body;
  try { return JSON.parse(body); } catch { return {}; }
}

export default async function handler(req, res) {
  if (!isAdminAuthed(req)) return json(res, 401, { error: "Unauthorized" });

  try {
    if (req.method === "GET") {
      const hours = Math.min(168, Math.max(1, Number(req.query?.hours) || 24));
      const [orders, requests] = await Promise.all([
        listOrders(hours),
        listServiceRequests(hours)
      ]);
      return json(res, 200, { ok: true, hours, orders, requests });
    }

    if (req.method === "POST") {
      const b = safeBody(req.body);
      const id = String(b.id || "").trim();
      const status = String(b.status || "").trim();
      if (!id) return json(res, 400, { error: "Missing id" });

      if (b.kind === "request") {
        if (!REQ_STATUSES.includes(status)) return json(res, 400, { error: "Bad status" });
        const r = await setServiceRequestStatus(id, status);
        if (!r) return json(res, 404, { error: "Not found" });
        return json(res, 200, { ok: true, request: r });
      }

      if (!ORDER_STATUSES.includes(status)) return json(res, 400, { error: "Bad status" });
      const o = await setOrderStatus(id, status);
      if (!o) return json(res, 404, { error: "Not found" });
      return json(res, 200, { ok: true, order: o });
    }

    return json(res, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error("admin-service error", error);
    return json(res, 500, { error: "Failed", detail: String(error?.message || error) });
  }
}
