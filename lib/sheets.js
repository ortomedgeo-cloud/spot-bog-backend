import { google } from "googleapis";
import {
  cellByHeader,
  extractReserveInfo,
  headerIndexMap,
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

async function readRows(sheetName, range = "A:Z") {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: required("GOOGLE_SHEET_ID"),
    range: `${sheetName}!${range}`
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
