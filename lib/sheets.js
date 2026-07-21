import { google } from "googleapis";
import {
  cellByHeader,
  extractReserveInfo,
  headerIndexMap,
  makeInternalOrderId,
  normalizeSheetDate,
  parseNumber,
  sanitizeForSheet
} from "./utils.js";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function getAuth() {
  return new google.auth.JWT(
    required("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    null,
    String(required("GOOGLE_PRIVATE_KEY")).replace(/\\n/g, "\n"),
    SCOPES
  );
}

function getSheets() {
  return google.sheets({ version: "v4", auth: getAuth() });
}

function normalizeKey(name) {
  return String(name || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function toLetter(n) {
  let num = Number(n);
  let out = "";

  while (num > 0) {
    const rem = (num - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    num = Math.floor((num - 1) / 26);
  }

  return out || "A";
}

async function readRows(sheetName, range = "A:Z", options = {}) {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: required("GOOGLE_SHEET_ID"),
    range: `${sheetName}!${range}`,
    ...(options.valueRenderOption ? { valueRenderOption: options.valueRenderOption } : {}),
    ...(options.dateTimeRenderOption ? { dateTimeRenderOption: options.dateTimeRenderOption } : {})
  });

  return res.data.values || [];
}

// NOTE: values.append() (Sheets' table auto-detection) used to live here.
// It was replaced everywhere by updateRow() with an explicit row number,
// because append() misjudges where the "table" ends/which columns it
// spans whenever the sheet has sparse or irregular rows in between —
// that's what caused both the column-shift bug and rows landing in the
// first free gap instead of at the true end of the sheet.

async function updateRow(sheetName, rowNumber, rowValues, rangeWidth) {
  const sheets = getSheets();
  const lastCol = rangeWidth || rowValues.length;
  const endCol = toLetter(lastCol);

  // Sanitize here too, so update() behaves identically to append().
  const normalized = new Array(lastCol).fill("");
  rowValues.forEach((value, i) => {
    if (i < lastCol) normalized[i] = sanitizeForSheet(value);
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: required("GOOGLE_SHEET_ID"),
    range: `${sheetName}!A${rowNumber}:${endCol}${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [normalized] }
  });
}

function buildRowFromHeader(header, valuesByName) {
  const row = new Array(header.length).fill("");
  const index = headerIndexMap(header);

  for (const [rawKey, value] of Object.entries(valuesByName)) {
    const idx = index.get(normalizeKey(rawKey));
    if (idx !== undefined) row[idx] = value ?? "";
  }

  return row;
}

function mapPaymentRow(row, idx) {
  return {
    created_at: String(cellByHeader(row, idx, "created_at") || ""),
    internal_order_id: String(cellByHeader(row, idx, "internal_order_id") || ""),
    bog_order_id: String(cellByHeader(row, idx, "bog_order_id") || ""),
    status: String(cellByHeader(row, idx, "status") || ""),
    event_code: String(cellByHeader(row, idx, "event_code") || ""),
    event_title: String(cellByHeader(row, idx, "event_title") || ""),
    type: String(cellByHeader(row, idx, "type") || ""),
    price: String(cellByHeader(row, idx, "price") || ""),
    table_no: String(cellByHeader(row, idx, "table_no") || ""),
    guests: String(cellByHeader(row, idx, "guests") || ""),
    customer_name: String(cellByHeader(row, idx, "customer_name") || ""),
    customer_phone: String(cellByHeader(row, idx, "customer_phone") || ""),
    tilda_page: String(cellByHeader(row, idx, "tilda_page") || ""),
    green_notified_at: String(cellByHeader(row, idx, "green_notified_at") || ""),
    raw_callback_status: String(cellByHeader(row, idx, "raw_callback_status") || "")
  };
}

export async function getEventByCode(eventCode) {
  const sheetName = process.env.EVENTS_SHEET_NAME || "events";
  const rows = await readRows(sheetName, process.env.EVENTS_RANGE || "A:E");

  if (!rows.length) {
    throw new Error(`Sheet ${sheetName} is empty`);
  }

  const [header, ...data] = rows;
  const idx = headerIndexMap(header);
  const target = String(eventCode || "").trim();

  const row = data.find(
    (r) => String(cellByHeader(r, idx, "eid") || "").trim() === target
  );

  if (!row) return null;

  const unitPrice = parseNumber(cellByHeader(row, idx, "Price"));

  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    throw new Error(`Invalid Price for event ${target}`);
  }

  return {
    event_code: String(cellByHeader(row, idx, "eid") || "").trim(),
    title: String(cellByHeader(row, idx, "Title") || "").trim(),
    type: String(cellByHeader(row, idx, "Type") || "").trim(),
    unit_price: unitPrice,
    deposit_text: String(cellByHeader(row, idx, "DepositText") || "").trim()
  };
}

// Reads the schedule for the staff manual-booking form:
//   - films come from the `events` sheet (eid -> Title), one entry per eid
//   - available sessions come from the `Ссылки` (Links) sheet, parsed from
//     the booking-link column, NOT the human-readable "Дата, время" column.
// The link is the only trustworthy source of eid+date+time: the display
// column in Ссылки often disagrees with what's actually inside the link,
// and bookings are matched by the link's eid+date everywhere else.
export async function getSessions() {
  const eventsSheet = process.env.EVENTS_SHEET_NAME || "events";
  const linksSheet = process.env.LINKS_SHEET_NAME || "Ссылки";

  const [eventRows, linkRows] = await Promise.all([
    readRows(eventsSheet, process.env.EVENTS_RANGE || "A:E"),
    readRows(linksSheet, "A:C")
  ]);

  // eid -> title map from events
  const films = new Map();
  if (eventRows.length) {
    const [eh, ...edata] = eventRows;
    const eidx = headerIndexMap(eh);
    edata.forEach((r) => {
      const eid = String(cellByHeader(r, eidx, "eid") || "").trim();
      const title = String(cellByHeader(r, eidx, "Title") || "").trim();
      if (eid) films.set(eid, title);
    });
  }

  // Parse sessions from the links column (column C).
  const sessionsByEid = new Map();
  if (linkRows.length) {
    // Skip header row; the links sheet has no machine-friendly header names,
    // so we address the link by position (3rd column) rather than by name.
    linkRows.slice(1).forEach((r) => {
      const link = String(r[2] || "").trim();
      if (!link) return;

      const info = extractReserveInfo(link);
      const eid = String(info.eid || "").trim();
      const date = String(info.date || "").trim();
      const time = String(info.time || "").trim();

      if (!eid || !date || !time) return;

      if (!sessionsByEid.has(eid)) sessionsByEid.set(eid, []);
      const list = sessionsByEid.get(eid);

      // de-dupe identical date+time entries
      if (!list.some((s) => s.date === date && s.time === time)) {
        list.push({ date, time });
      }
    });
  }

  // Build the film list: one entry per eid that has at least one session,
  // carrying its title (from events) and its available sessions.
  const result = [];
  for (const [eid, sessions] of sessionsByEid.entries()) {
    sessions.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    result.push({
      eid,
      title: films.get(eid) || eid, // fall back to eid if title missing
      sessions
    });
  }

  result.sort((a, b) => a.title.localeCompare(b.title, "ru"));

  return result;
}

// Appends a new session row to the Ссылки (Links) sheet. Builds the reserve
// link server-side so date/time/eid/poster are always consistent with what
// the rest of the system reads back (no more hand-built links). Column layout
// matches the existing sheet: A = human label, B = human date/time, C = link.
export async function appendSessionLink({
  eid,
  date,
  time,
  title,
  poster,
  duration = 120
}) {
  const linksSheet = process.env.LINKS_SHEET_NAME || "Ссылки";

  const cleanEid = String(eid || "").trim();
  const cleanDate = normalizeSheetDate(date);
  const cleanTime = String(time || "").trim();
  const cleanTitle = String(title || "").trim();
  const cleanPoster = String(poster || "").trim();

  if (!cleanEid) throw new Error("Missing eid");
  if (!cleanDate) throw new Error("Missing or invalid date");
  if (!cleanTime) throw new Error("Missing time");

  // Build the reserve link. poster is URL-encoded so it survives as a single
  // query param (TMDB paths contain no spaces, but encode defensively).
  const params = new URLSearchParams();
  params.set("date", cleanDate);
  params.set("time", cleanTime);
  params.set("eid", cleanEid);
  if (cleanPoster) params.set("poster", cleanPoster);
  params.set("duration", String(duration));

  const link = `spot-bar.site/reserve?${params.toString()}`;

  // Read current rows to find the true end (same approach as Bookings: never
  // rely on values.append() auto-detection).
  const rows = await readRows(linksSheet, "A:C");
  const humanDateTime = `${cleanDate} ${cleanTime}`;
  const rowValues = [cleanTitle, humanDateTime, link];

  const nextRowNumber = rows.length + 1; // +1 for 1-indexing; header is row 1
  await updateRow(linksSheet, nextRowNumber, rowValues, 3);

  return { ok: true, eid: cleanEid, date: cleanDate, time: cleanTime, link };
}

// Appends a new event row to the events sheet (eid, Title, Type, Price,
// DepositText), so staff can add films/dinners via the admin form instead of
// editing Google Sheets directly. Column order matches getEventByCode's reads.
export async function appendEvent({ eid, title, type, price, deposit_text }) {
  const sheetName = process.env.EVENTS_SHEET_NAME || "events";

  const cleanEid = String(eid || "").trim();
  const cleanTitle = String(title || "").trim();
  const cleanType = String(type || "").trim();
  const priceNum = parseNumber(price);
  const cleanDeposit = String(deposit_text || "").trim();

  if (!cleanEid) throw new Error("Missing eid");
  if (!cleanTitle) throw new Error("Missing title");
  if (!cleanType) throw new Error("Missing type");
  if (!Number.isFinite(priceNum) || priceNum <= 0) {
    throw new Error("Invalid price");
  }

  const rows = await readRows(sheetName, process.env.EVENTS_RANGE || "A:E");

  if (rows.length) {
    const [header, ...data] = rows;
    const idx = headerIndexMap(header);
    const dupe = data.some(
      (r) => String(cellByHeader(r, idx, "eid") || "").trim() === cleanEid
    );
    if (dupe) {
      const err = new Error(`Event with eid "${cleanEid}" already exists`);
      err.code = "EID_EXISTS";
      throw err;
    }
  }

  const rowValues = [cleanEid, cleanTitle, cleanType, priceNum, cleanDeposit];
  const nextRowNumber = rows.length + 1; // header is row 1

  await updateRow(sheetName, nextRowNumber, rowValues, 5);

  return { ok: true, eid: cleanEid, title: cleanTitle };
}

export async function appendPayment(record) {
  const sheetName = process.env.PAYMENTS_SHEET_NAME || "payments";
  const rows = await readRows(sheetName, "A:Z");

  if (!rows.length) {
    throw new Error(`Sheet ${sheetName} is empty`);
  }

  const [header, ...data] = rows;

  const row = buildRowFromHeader(header, {
    created_at: record.created_at,
    internal_order_id: record.internal_order_id,
    bog_order_id: record.bog_order_id,
    status: record.status,
    event_code: record.event_code,
    event_title: record.event_title,
    type: record.type,
    price: record.price,
    table_no: record.table_no,
    guests: record.guests,
    customer_name: record.customer_name,
    customer_phone: record.customer_phone,
    tilda_page: record.tilda_page,
    green_notified_at: record.green_notified_at,
    raw_callback_status: record.raw_callback_status
  });

  // Same fix as Bookings: write to an explicit row instead of relying on
  // values.append()'s table auto-detection (see comment in
  // appendBookingRowIfNotExists for why that's unreliable).
  const nextRowNumber = data.length + 2;

  await updateRow(sheetName, nextRowNumber, row, header.length);
}

export async function findPaymentRowByBogOrderId(bogOrderId) {
  const sheetName = process.env.PAYMENTS_SHEET_NAME || "payments";
  const rows = await readRows(sheetName, "A:Z");

  if (!rows.length) {
    throw new Error(`Sheet ${sheetName} is empty`);
  }

  const [header, ...data] = rows;
  const idx = headerIndexMap(header);
  const target = String(bogOrderId || "").trim();

  const dataIndex = data.findIndex(
    (row) => String(cellByHeader(row, idx, "bog_order_id") || "").trim() === target
  );

  if (dataIndex === -1) return null;

  return {
    sheetRowNumber: dataIndex + 2,
    data: mapPaymentRow(data[dataIndex], idx)
  };
}

export async function findPaymentRowByInternalOrderId(internalOrderId) {
  const sheetName = process.env.PAYMENTS_SHEET_NAME || "payments";
  const rows = await readRows(sheetName, "A:Z");

  if (!rows.length) {
    throw new Error(`Sheet ${sheetName} is empty`);
  }

  const [header, ...data] = rows;
  const idx = headerIndexMap(header);
  const target = String(internalOrderId || "").trim();

  const dataIndex = data.findIndex(
    (row) => String(cellByHeader(row, idx, "internal_order_id") || "").trim() === target
  );

  if (dataIndex === -1) return null;

  return {
    sheetRowNumber: dataIndex + 2,
    data: mapPaymentRow(data[dataIndex], idx)
  };
}

export async function updatePaymentStatus(rowNumber, record) {
  const sheetName = process.env.PAYMENTS_SHEET_NAME || "payments";
  const rows = await readRows(sheetName, "A:Z");

  if (!rows.length) {
    throw new Error(`Sheet ${sheetName} is empty`);
  }

  const [header] = rows;

  const row = buildRowFromHeader(header, {
    created_at: record.created_at,
    internal_order_id: record.internal_order_id,
    bog_order_id: record.bog_order_id,
    status: record.status,
    event_code: record.event_code,
    event_title: record.event_title,
    type: record.type,
    price: record.price,
    table_no: record.table_no,
    guests: record.guests,
    customer_name: record.customer_name,
    customer_phone: record.customer_phone,
    tilda_page: record.tilda_page,
    green_notified_at: record.green_notified_at,
    raw_callback_status: record.raw_callback_status
  });

  await updateRow(sheetName, rowNumber, row);
}

function buildBookingRow(header, booking) {
  const valuesByName = {
    Date: booking.reserveDate || "",
    Time: booking.reserveTime || "",
    table: booking.tableNo || "",
    Name: booking.customerName || "",
    Phone: booking.customerPhone || "",
    persons: booking.guests || "",
    amount: booking.totalAmount || "",
    Event: booking.eventTitle || "",
    "WA Status": booking.waStatus || "",
    eid: booking.eventCode || "",
    Type: booking.type || "",
    Price: booking.unitPrice || "",
    DepositText: booking.depositText || "",
    Payment: booking.paymentOk ? "TRUE" : "FALSE",
    booking_id: booking.bookingId || "",
    status: booking.status || "list"
  };

  return buildRowFromHeader(header, valuesByName).slice(0, 16);
}

export async function getBookedTablesForSession(eid, date) {
  const sheetName = process.env.BOOKINGS_SHEET_NAME || "Bookings";
  const rows = await readRows(sheetName, "A:P", {
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "SERIAL_NUMBER"
  });

  if (!rows.length) return [];

  const [header, ...data] = rows;
  const idx = headerIndexMap(header);
  const targetEid = String(eid || "").trim();
  const targetDate = normalizeSheetDate(date);

  return data
    .filter((row) =>
      String(cellByHeader(row, idx, "eid") || "").trim() === targetEid &&
      normalizeSheetDate(cellByHeader(row, idx, "Date")) === targetDate
    )
    .map((row) => String(cellByHeader(row, idx, "table") || "").trim())
    .filter(Boolean);
}

// NOTE: the exists-check + append below is not atomic (read-then-write across
// two network calls). A duplicate row is only possible if BOG delivers the
// same "paid" webhook twice within roughly this function's round-trip time.
// Accepted risk: low likelihood (gated by payment status in api/callback.js),
// low impact (a stray Bookings row, not a payment-correctness issue).
export async function appendBookingRowIfNotExists({
  booking_id,
  reserve_url,
  table_no,
  customer_name,
  customer_phone,
  guests,
  amount,
  event_code,
  wa_status,
  status = "list"
}) {
  const sheetName = process.env.BOOKINGS_SHEET_NAME || "Bookings";
  const rows = await readRows(sheetName, "A:P");

  if (!rows.length) {
    throw new Error(`Sheet ${sheetName} is empty`);
  }

  const [header, ...data] = rows;
  const idx = headerIndexMap(header);
  const bookingIdTarget = String(booking_id || "").trim();

  if (!bookingIdTarget) {
    throw new Error("Missing booking_id for Bookings append");
  }

  const exists = data.some(
    (row) => String(cellByHeader(row, idx, "booking_id") || "").trim() === bookingIdTarget
  );

  if (exists) return;

  const reserve = extractReserveInfo(reserve_url);
  const event = await getEventByCode(event_code);

  if (!event) {
    throw new Error(`Event not found while writing booking: ${event_code}`);
  }

  const row = buildBookingRow(header, {
    reserveDate: reserve.date,
    reserveTime: reserve.time,
    tableNo: table_no,
    customerName: customer_name,
    customerPhone: customer_phone,
    guests,
    totalAmount: amount,
    eventTitle: event.title,
    waStatus: wa_status,
    eventCode: event.event_code,
    type: event.type,
    unitPrice: event.unit_price,
    depositText: event.deposit_text,
    paymentOk: true,
    bookingId: booking_id,
    status
  });

  // Write to an explicit row number instead of using values.append().
  // append() relies on Sheets' own "table" auto-detection: it scans down
  // from the anchor range looking for where the existing data ends, and
  // stops at the first fully blank row/column mismatch it finds. Any gap
  // or irregular row above (like sparsely-filled columns) makes it land
  // in the wrong place - which is exactly what caused both the column
  // shift and the "landed in the middle, not at the end" issues.
  // `data` above already comes from a full read of the sheet, so its
  // length tells us precisely where the real last row is.
  const nextRowNumber = data.length + 2; // +1 for header row, +1 for 1-indexing

  await updateRow(sheetName, nextRowNumber, row, 16);
}

// Manual booking entry (staff form for phone/social/walk-in reservations).
// Writes a Bookings row in exactly the same shape as the automatic (paid)
// flow, so the availability widget and the sheet stay consistent. Differs
// from appendBookingRowIfNotExists in that date/time/table come straight
// from the form (not a reserve_url), the booking_id is generated here with
// a "manual-" prefix, and the Payment flag reflects the status the staff
// member picked rather than always TRUE.
export async function appendManualBooking({
  event_code,
  date,
  time,
  table_no,
  customer_name,
  customer_phone,
  guests,
  amount,
  payment_status // "paid" | "unpaid" | "deposit"
}) {
  const sheetName = process.env.BOOKINGS_SHEET_NAME || "Bookings";

  const eid = String(event_code || "").trim();
  const reserveDate = normalizeSheetDate(date);
  const reserveTime = String(time || "").trim();
  const table = String(table_no || "").trim();

  if (!eid) throw new Error("Missing event_code");
  if (!reserveDate) throw new Error("Missing or invalid date");
  if (!reserveTime) throw new Error("Missing time");
  if (!table) throw new Error("Missing table");

  const event = await getEventByCode(eid);
  if (!event) {
    throw new Error(`Event not found: ${eid}`);
  }

  // Guard against double-booking: reject if this table is already taken for
  // this exact eid+date session. Same source of truth as the widget.
  const alreadyBooked = await getBookedTablesForSession(eid, reserveDate);
  const isTaken = alreadyBooked
    .map((t) => t.toLowerCase())
    .includes(table.toLowerCase());

  if (isTaken) {
    const err = new Error(`Table "${table}" is already booked for this session`);
    err.code = "TABLE_TAKEN";
    throw err;
  }

  const rows = await readRows(sheetName, "A:P");
  if (!rows.length) {
    throw new Error(`Sheet ${sheetName} is empty`);
  }

  const [header, ...data] = rows;

  const paymentOk = String(payment_status || "").trim().toLowerCase() === "paid";

  const row = buildBookingRow(header, {
    reserveDate,
    reserveTime,
    tableNo: table,
    customerName: customer_name,
    customerPhone: customer_phone,
    guests,
    totalAmount: amount,
    eventTitle: event.title,
    waStatus: "manual",
    eventCode: event.event_code,
    type: event.type,
    unitPrice: event.unit_price,
    depositText: event.deposit_text,
    paymentOk,
    bookingId: `manual-${makeInternalOrderId("m")}`,
    status: "list"
  });

  const nextRowNumber = data.length + 2;
  await updateRow(sheetName, nextRowNumber, row, 16);

  return { ok: true, table, date: reserveDate, time: reserveTime, eid };
}
