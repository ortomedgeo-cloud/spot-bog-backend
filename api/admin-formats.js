import { listFormats, createFormat, updateFormat, deleteFormat } from "../lib/db.js";
import { json, isAdminAuthed } from "../lib/utils.js";

// GET  -> list all event formats
// POST -> create format { code, title, price_kind, deposit_text }
// POST with body.id === existing code -> update that format
// POST { action:'delete', code } -> delete a format

const CODE_RE = /^[a-z0-9_-]{1,32}$/;

function safeBody(body) {
  if (!body) return {};
  if (typeof body === "object") return body;
  try { return JSON.parse(body); } catch { return {}; }
}

export default async function handler(req, res) {
  if (!isAdminAuthed(req)) return json(res, 401, { error: "Unauthorized" });

  try {
    if (req.method === "GET") {
      const formats = await listFormats();
      return json(res, 200, { ok: true, formats });
    }

    if (req.method === "POST") {
      const b = safeBody(req.body);

      if (b.action === "delete") {
        const code = String(b.code || "").trim();
        if (!code) return json(res, 400, { error: "Missing code" });
        const n = await deleteFormat(code);
        return json(res, 200, { ok: true, deleted: n });
      }

      const isUpdate = !!b.id;
      const code = String(b.id || b.code || "").trim().toLowerCase();
      const title = String(b.title || "").trim();
      const price_kind = b.price_kind === "included" ? "included" : "deposit";
      const deposit_text = String(b.deposit_text || "").trim() || null;
      const sort_order = Number.isFinite(Number(b.sort_order)) ? Number(b.sort_order) : 0;

      if (!code || !CODE_RE.test(code)) {
        return json(res, 400, { error: "Код формата: только a-z, 0-9, - и _ (до 32 символов)." });
      }
      if (!title) return json(res, 400, { error: "Missing title" });

      const result = isUpdate
        ? await updateFormat(code, { title, price_kind, deposit_text, sort_order })
        : await createFormat({ code, title, price_kind, deposit_text, sort_order });

      if (!result) return json(res, 404, { error: "Format not found" });
      return json(res, 200, { ok: true, format: result });
    }

    return json(res, 405, { error: "Method not allowed" });
  } catch (error) {
    if (String(error?.message || "").includes("duplicate key")) {
      return json(res, 409, { error: "Такой код формата уже есть." });
    }
    console.error("admin-formats error", error);
    return json(res, 500, { error: "Failed", detail: String(error?.message || error) });
  }
}
