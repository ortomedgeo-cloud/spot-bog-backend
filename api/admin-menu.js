import {
  getAdminMenu,
  createMenuCategory,
  updateMenuCategory,
  createMenuItem,
  updateMenuItem,
  deleteMenuCategories,
  deleteMenuItems,
  setMenuItemsAvailability
} from "../lib/db.js";
import { json, isAdminAuthed } from "../lib/utils.js";

// Menu management for the admin panel.
//
// GET                                 -> { categories, items } (everything)
// POST { kind:'category', ... }       -> create category (or update when id given)
// POST { kind:'item', ... }           -> create item (or update when id given)
// POST { action:'delete', kind, ids } -> batch delete (category delete cascades)
// POST { action:'available', ids, available } -> batch in/out of stock

function safeBody(body) {
  if (!body) return {};
  if (typeof body === "object") return body;
  try { return JSON.parse(body); } catch { return {}; }
}

export default async function handler(req, res) {
  if (!isAdminAuthed(req)) return json(res, 401, { error: "Unauthorized" });

  try {
    if (req.method === "GET") {
      const menu = await getAdminMenu();
      return json(res, 200, { ok: true, ...menu });
    }

    if (req.method === "POST") {
      const b = safeBody(req.body);

      if (b.action === "delete") {
        const ids = Array.isArray(b.ids) ? b.ids.map(String).filter(Boolean) : [];
        if (!ids.length) return json(res, 400, { error: "Missing ids" });
        const n = b.kind === "category"
          ? await deleteMenuCategories(ids)
          : await deleteMenuItems(ids);
        return json(res, 200, { ok: true, deleted: n });
      }

      if (b.action === "available") {
        const ids = Array.isArray(b.ids) ? b.ids.map(String).filter(Boolean) : [];
        if (!ids.length) return json(res, 400, { error: "Missing ids" });
        const n = await setMenuItemsAvailability(ids, !!b.available);
        return json(res, 200, { ok: true, updated: n });
      }

      if (b.kind === "category") {
        if (b.id) {
          const cat = await updateMenuCategory(String(b.id), b);
          if (!cat) return json(res, 404, { error: "Category not found" });
          return json(res, 200, { ok: true, category: cat });
        }
        if (!String(b.title_ru || "").trim()) {
          return json(res, 400, { error: "Missing title_ru" });
        }
        const cat = await createMenuCategory(b);
        return json(res, 200, { ok: true, category: cat });
      }

      if (b.kind === "item") {
        if (b.id) {
          const item = await updateMenuItem(String(b.id), b);
          if (!item) return json(res, 404, { error: "Item not found" });
          return json(res, 200, { ok: true, item });
        }
        if (!String(b.category_id || "").trim()) {
          return json(res, 400, { error: "Missing category_id" });
        }
        if (!String(b.title_ru || "").trim()) {
          return json(res, 400, { error: "Missing title_ru" });
        }
        const item = await createMenuItem(b);
        return json(res, 200, { ok: true, item });
      }

      return json(res, 400, { error: "Unknown kind/action" });
    }

    return json(res, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error("admin-menu error", error);
    return json(res, 500, { error: "Failed", detail: String(error?.message || error) });
  }
}
