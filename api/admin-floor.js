import {
  getFloorPlan,
  saveFloorSettings,
  saveFloorTables,
  deleteFloorTable,
  floorLabelsInUse
} from "../lib/db.js";
import { json, isAdminAuthed } from "../lib/utils.js";

// План зала для админки.
//   GET                                  -> { settings, tables, inUse }
//   POST { settings }                    -> размеры холста, шаг сетки, подпись экрана
//   POST { tables: [...] }               -> сохранить расстановку целиком
//   POST { action:'delete', label }      -> убрать стол из плана (брони не трогаем)
//
// inUse — сколько броней ссылается на каждую метку. Нужно, чтобы редактор
// предупреждал перед переименованием и удалением: метка связывает план с
// бронями, и рассинхрон здесь тихо ломает занятость мест.

function safeBody(body) {
  if (!body) return {};
  if (typeof body === "object") return body;
  try { return JSON.parse(body); } catch { return {}; }
}

export default async function handler(req, res) {
  if (!isAdminAuthed(req)) return json(res, 401, { error: "Unauthorized" });

  try {
    if (req.method === "GET") {
      const plan = await getFloorPlan();
      return json(res, 200, { ok: true, ...plan, inUse: await floorLabelsInUse() });
    }

    if (req.method === "POST") {
      const b = safeBody(req.body);

      if (b.action === "delete") {
        const label = String(b.label || "").trim();
        if (!label) return json(res, 400, { error: "Missing label" });
        const r = await deleteFloorTable(label);
        return json(res, 200, { ok: true, ...r });
      }

      if (b.settings) await saveFloorSettings(b.settings);

      if (Array.isArray(b.tables)) {
        // Метка обязательна и должна быть уникальной: она — ключ брони.
        const seen = new Set();
        for (const t of b.tables) {
          const label = String(t?.label || "").trim();
          if (!label) return json(res, 400, { error: "EMPTY_LABEL", detail: "У стола должна быть метка" });
          if (seen.has(label)) return json(res, 400, { error: "DUPLICATE_LABEL", detail: `Метка «${label}» повторяется` });
          seen.add(label);
        }
        await saveFloorTables(b.tables);
      }

      const plan = await getFloorPlan();
      return json(res, 200, { ok: true, ...plan, inUse: await floorLabelsInUse() });
    }

    return json(res, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error("admin-floor error", error);
    return json(res, 500, { error: "Failed", detail: String(error?.message || error) });
  }
}
