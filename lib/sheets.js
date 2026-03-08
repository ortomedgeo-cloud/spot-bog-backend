import { google } from "googleapis";
import { cellByHeader, headerIndexMap, parseNumber } from "./utils.js";

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

export function paymentHeaders() {
  return [
    "created_at",
    "internal_order_id",
    "bog_order_id",
    "status",
    "event_code",
    "event_title",
    "type",
    "price",
    "table_no",
    "guests",
    "customer_name",
    "customer_phone",
    "tilda_page",
    "green_notified_at",
    "raw_callback_status"
  ];
}

export function paymentRowFromRecord(record) {
  return [
    record.created_at ?? "",
    record.internal_order_id ?? "",
    record.bog_order_id ?? "",
    record.status ?? "",
    record.event_code ?? "",
    record.event_title ?? "",
    record.type ?? "",
    record.price ?? "",
    record.table_no ?? "",
    record.guests ?? "",
    record.customer_name ?? "",
    record.customer_phone ?? "",
    record.tilda_page ?? "",
    record.green_notified_at ?? "",
    record.raw_callback_status ?? ""
  ];
}

export async function readRange(range) {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: required("GOOGLE_SHEET_ID"),
    range
  });
  return res.data.values || [];
}

export async function appendRow(sheetName, rowValues) {
  const sheets = getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: required("GOOGLE_SHEET_ID"),
    range: `${sheetName}!A:O`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [rowValues]
    }
  });
}

export async function updateRow(sheetName, rowNumber, rowValues) {
  const sheets = getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId: required("GOOGLE_SHEET_ID"),
    range: `${sheetName}!A${rowNumber}:O${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [rowValues]
    }
  });
}

export async function getEventByCode(eventCode) {
  const sheetName = process.env.EVENTS_SHEET_NAME || "events";
  const range = process.env.EVENTS_RANGE || "A:E";
  const rows = await readRange(`${sheetName}!${range}`);

  if (!rows.length) throw new Error(`Sheet ${sheetName} is empty`);

  const [header, ...data] = rows;
  const idx = headerIndexMap(header);

  const matches = data.filter((row) => {
    const eid = String(cellByHeader(row, idx, "eid")).trim();
    return eid === String(eventCode).trim();
  });

  if (!matches.length) return null;

  const row = matches[matches.length - 1];

  const eid = String(cellByHeader(row, idx, "eid")).trim();
  const title = String(cellByHeader(row, idx, "Title")).trim();
  const type = String(cellByHeader(row, idx, "Type")).trim();
  const price = parseNumber(cellByHeader(row, idx, "Price"));
  const depositText = String(cellByHeader(row, idx, "DepositText")).trim();

  if (!eid) throw new Error(`events row missing eid for ${eventCode}`);
  if (!title) throw new Error(`events row missing Title for ${eventCode}`);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`events row has invalid Price for ${eventCode}`);
  }

  return {
    event_code: eid,
    title,
    type,
    unit_price: price,
    deposit_text: depositText
  };
}

export async function appendPayment(record) {
  const sheetName = process.env.PAYMENTS_SHEET_NAME || "payments";
  await appendRow(sheetName, paymentRowFromRecord(record));
}

export async function findPaymentByBogOrderId(bogOrderId) {
  const sheetName = process.env.PAYMENTS_SHEET_NAME || "payments";
  const rows = await readRange(`${sheetName}!A:O`);
  if (!rows.length) throw new Error(`Sheet ${sheetName} is empty`);

  const [header, ...data] = rows;
  const idx = headerIndexMap(header);
  const target = String(bogOrderId || "").trim();

  const dataIndex = data.findIndex((row) => {
    return String(cellByHeader(row, idx, "bog_order_id")).trim() === target;
  });

  if (dataIndex === -1) return null;

  const rowNumber = dataIndex + 2;
  const row = data[dataIndex];

  return {
    rowNumber,
    record: {
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
    }
  };
}

export async function updatePaymentByRowNumber(rowNumber, record) {
  const sheetName = process.env.PAYMENTS_SHEET_NAME || "payments";
  await updateRow(sheetName, rowNumber, paymentRowFromRecord(record));
}
