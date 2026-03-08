
import { google } from "googleapis";
import {
  cellByHeader,
  headerIndexMap,
  nowIso,
  parseDdMmYyyy,
  parseNumber,
  parseTimeHm
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

function columnLettersFromCount(count) {
  let n = Number(count);
  let result = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result || "A";
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
  const lastCol = columnLettersFromCount(rowValues.length);
  await sheets.spreadsheets.values.append({
    spreadsheetId: required("GOOGLE_SHEET_ID"),
    range: `${sheetName}!A:${lastCol}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [rowValues]
    }
  });
}

export async function updateRow(sheetName, rowNumber, rowValues) {
  const sheets = getSheets();
  const lastCol = columnLettersFromCount(rowValues.length);
  await sheets.spreadsheets.values.update({
    spreadsheetId: required("GOOGLE_SHEET_ID"),
    range: `${sheetName}!A${rowNumber}:${lastCol}${rowNumber}`,
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

export function buildBookingRow({
  reserveDate,
  reserveTime,
  tableNo,
  customerName,
  customerPhone,
  guests,
  totalAmount,
  eventTitle,
  waStatus,
  eventCode,
  type,
  unitPrice,
  depositText,
  paymentOk,
  bookingId,
  status
}) {
  const parsedDate = parseDdMmYyyy(reserveDate);
  const parsedTime = parseTimeHm(reserveTime);

  const dateCell = parsedDate
    ? `=DATE(${parsedDate.year},${parsedDate.month},${parsedDate.day})`
    : reserveDate || "";
  const timeCell = parsedTime
    ? `=TIME(${parsedTime.hour},${parsedTime.minute},0)`
    : reserveTime || "";

  return [
    dateCell,
    timeCell,
    tableNo ?? "",
    customerName ?? "",
    customerPhone ?? "",
    guests ?? "",
    totalAmount ?? "",
    eventTitle ?? "",
    waStatus ?? "",
    eventCode ?? "",
    type ?? "",
    unitPrice ?? "",
    depositText ?? "",
    paymentOk ?? true,
    bookingId ?? "",
    status ?? "list",
    "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""
  ];
}

export async function findBookingByBookingId(bookingId) {
  const sheetName = process.env.BOOKINGS_SHEET_NAME || "Bookings";
  const rows = await readRange(`${sheetName}!A:AE`);
  if (!rows.length) throw new Error(`Sheet ${sheetName} is empty`);

  const [header, ...data] = rows;
  const idx = headerIndexMap(header);
  const target = String(bookingId || "").trim();
  if (!target) return null;

  const dataIndex = data.findIndex((row) => {
    return String(cellByHeader(row, idx, "booking_id")).trim() === target;
  });

  if (dataIndex === -1) return null;
  return {
    rowNumber: dataIndex + 2,
    header,
    row: data[dataIndex]
  };
}

export async function appendBookingFromPayment(record, waStatus) {
  const sheetName = process.env.BOOKINGS_SHEET_NAME || "Bookings";
  const reserveInfo = record.reserve_info || {};
  const guests = Number(record.guests || 0);
  const totalAmount = Number(record.price || 0);
  const unitPrice = guests > 0 ? totalAmount / guests : totalAmount;

  const row = buildBookingRow({
    reserveDate: reserveInfo.date || "",
    reserveTime: reserveInfo.time || "",
    tableNo: record.table_no || "",
    customerName: record.customer_name || "",
    customerPhone: record.customer_phone || "",
    guests: record.guests || "",
    totalAmount: record.price || "",
    eventTitle: record.event_title || "",
    waStatus: waStatus || "",
    eventCode: record.event_code || "",
    type: record.type || "",
    unitPrice,
    depositText: record.deposit_text || "",
    paymentOk: true,
    bookingId: record.internal_order_id || "",
    status: "list"
  });

  await appendRow(sheetName, row);
}

export async function updateBookingWaStatusByBookingId(bookingId, waStatus) {
  const found = await findBookingByBookingId(bookingId);
  if (!found) return false;

  const sheetName = process.env.BOOKINGS_SHEET_NAME || "Bookings";
  const rows = await readRange(`${sheetName}!A:AE`);
  const [header, ...data] = rows;
  const row = [...data[found.rowNumber - 2]];
  const idx = headerIndexMap(header);
  const waIdx = idx.get("wa status");
  if (waIdx === undefined) return false;

  while (row.length < header.length) row.push("");
  row[waIdx] = waStatus;
  await updateRow(sheetName, found.rowNumber, row);
  return true;
}

export async function ensureBookingWritten(record, waStatus) {
  const existing = await findBookingByBookingId(record.internal_order_id);
  if (existing) {
    if (waStatus) {
      await updateBookingWaStatusByBookingId(record.internal_order_id, waStatus);
    }
    return false;
  }

  await appendBookingFromPayment(record, waStatus);
  return true;
}
