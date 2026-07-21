import { json, isAdminAuthed } from "../lib/utils.js";

// Tiny endpoint the admin page pings on load to decide whether to show the
// login overlay. Returns 200 if the session cookie is valid, 401 otherwise.

export default function handler(req, res) {
  if (isAdminAuthed(req)) {
    return json(res, 200, { ok: true });
  }
  return json(res, 401, { ok: false });
}
