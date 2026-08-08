import {
  getAdminMenu,
  reorderMenu,
  addPlacement,
  removePlacement,
  createMenuSubcategory,
  updateMenuSubcategory,
  deleteMenuSubcategories,
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
// POST { kind:'subcategory', ... }   -> create/update subcategory inside a category
// POST { action:'delete', kind, ids } -> batch delete (category delete cascades)
// POST { action:'available', ids, available } -> batch in/out of stock
// POST { action:'reorder', categories:[{id,sort}], items:[{id,category_id,sort}] }

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

      // Конструктор меню присылает состояние целиком: порядок категорий,
      // порядок позиций и их принадлежность категориям.
      if (b.action === "reorder") {
        const cats = Array.isArray(b.categories) ? b.categories : [];
        const subs = Array.isArray(b.subcategories) ? b.subcategories : [];
        const its = Array.isArray(b.items) ? b.items : [];
        if (!cats.length && !subs.length && !its.length) {
          return json(res, 400, { error: "Nothing to reorder" });
        }
        const n = await reorderMenu({ categories: cats, subcategories: subs, items: its });
        return json(res, 200, { ok: true, ...n });
      }

      // Дополнительное размещение позиции в другой категории.
      // { action:'placement', item_id, category_id, subcategory_id?, price? }
      if (b.action === "placement") {
        const item_id = String(b.item_id || "").trim();
        const category_id = String(b.category_id || "").trim();
        if (!item_id || !category_id) {
          return json(res, 400, { error: "Missing item_id or category_id" });
        }
        const p = await addPlacement({
          item_id, category_id,
          subcategory_id: b.subcategory_id || null,
          price: b.price,
          sort: b.sort
        });
        return json(res, 200, { ok: true, placement: p });
      }

      if (b.action === "unplace") {
        const ok = await removePlacement(String(b.item_id || ""), String(b.category_id || ""));
        return ok ? json(res, 200, { ok: true }) : json(res, 404, { error: "Not found" });
      }

      if (b.action === "delete") {
        const ids = Array.isArray(b.ids) ? b.ids.map(String).filter(Boolean) : [];
        if (!ids.length) return json(res, 400, { error: "Missing ids" });
        const n = b.kind === "category"
          ? await deleteMenuCategories(ids)
          : b.kind === "subcategory"
            ? await deleteMenuSubcategories(ids)
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

      if (b.kind === "subcategory") {
        if (b.id) {
          const sc = await updateMenuSubcategory(String(b.id), b);
          if (!sc) return json(res, 404, { error: "Subcategory not found" });
          return json(res, 200, { ok: true, subcategory: sc });
        }
        if (!String(b.category_id || "").trim()) {
          return json(res, 400, { error: "Missing category_id" });
        }
        if (!String(b.title_ru || "").trim()) {
          return json(res, 400, { error: "Missing title_ru" });
        }
        const sc = await createMenuSubcategory(b);
        return json(res, 200, { ok: true, subcategory: sc });
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
    if (error?.code === "SAME_CATEGORY" || error?.code === "NOT_FOUND") {
      return json(res, 400, { error: error.code, detail: error.message });
    }
    return json(res, 500, { error: "Failed", detail: String(error?.message || error) });
  }
}
