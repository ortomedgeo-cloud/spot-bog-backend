// Pulls the BOG receipt for every order in the payments sheet and reports why
// they failed. The callback already stores the raw payload, but only for
// callbacks we actually received and only as an opaque JSON blob — this asks
// BOG directly, so it also covers orders whose callback never landed.
//
// Usage:
//   node --env-file=.env scripts/audit-orders.js
//   node --env-file=.env scripts/audit-orders.js --since=2026-07-01
//   node --env-file=.env scripts/audit-orders.js --since=2026-07-01 --csv > audit.csv
//
// The distinction that matters when talking to BOG:
//   - code 122  -> declined by the acquirer (BOG itself), not by the customer's
//                  bank. Merchant/terminal side. These are the ones to escalate.
//   - code 101/103/105/106/107 -> issuer side (card limits, funds, expiry).
//   - reject_reason "expiration" with an empty code -> nobody ever attempted
//                  payment; the order just timed out. Funnel/UX, not payments.

import { getAccessToken, getPaymentDetails } from "../lib/bog.js";
import { listPayments } from "../lib/sheets.js";

const ACQUIRER_DECLINE_CODE = "122";
const REQUEST_DELAY_MS = 250;

function parseArgs(argv) {
  const args = { since: "", csv: false, limit: 0 };

  for (const arg of argv.slice(2)) {
    if (arg === "--csv") args.csv = true;
    else if (arg.startsWith("--since=")) args.since = arg.slice(8).trim();
    else if (arg.startsWith("--limit=")) args.limit = Number(arg.slice(8)) || 0;
  }

  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function csvCell(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// One order -> one flat row, whatever shape the receipt came back in.
function summarize(payment, receipt) {
  const detail = receipt?.payment_detail || {};

  return {
    created_at: payment.created_at,
    internal_order_id: payment.internal_order_id,
    bog_order_id: payment.bog_order_id,
    sheet_status: payment.status,
    amount: receipt?.purchase_units?.request_amount ?? payment.price,
    order_status: receipt?.order_status?.key || "",
    reject_reason: receipt?.reject_reason || "",
    code: detail.code == null ? "" : String(detail.code),
    code_description: detail.code_description || "",
    transfer_method: detail.transfer_method?.key || "",
    card_type: detail.card_type || "",
    payer_identifier: detail.payer_identifier || "",
    pg_trx_id: detail.pg_trx_id || "",
    event_title: payment.event_title,
    customer_name: payment.customer_name
  };
}

// "No attempt" = the customer never picked a payment method, so there is no
// code and no transfer_method — the order simply expired.
function bucketOf(row) {
  if (row.order_status === "completed") return "completed";
  if (row.code) return `code ${row.code} — ${row.code_description}`;
  if (row.reject_reason === "expiration") return "expiration (no attempt)";
  if (row.order_status) return `${row.order_status} (no code)`;
  return "unknown";
}

function printReport(rows) {
  const buckets = new Map();
  const methods = new Map();

  for (const row of rows) {
    const bucket = bucketOf(row);
    buckets.set(bucket, (buckets.get(bucket) || 0) + 1);

    if (row.transfer_method) {
      const key = `${row.transfer_method}${row.code ? ` / code ${row.code}` : " / ok"}`;
      methods.set(key, (methods.get(key) || 0) + 1);
    }
  }

  const sorted = [...buckets.entries()].sort((a, b) => b[1] - a[1]);
  const total = rows.length;

  console.log(`\nOrders checked: ${total}\n`);
  console.log("By outcome:");
  for (const [bucket, count] of sorted) {
    const pct = ((count / total) * 100).toFixed(1).padStart(5);
    console.log(`  ${pct}%  ${String(count).padStart(4)}  ${bucket}`);
  }

  if (methods.size) {
    console.log("\nBy payment method (attempts only):");
    for (const [key, count] of [...methods.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(count).padStart(4)}  ${key}`);
    }
  }

  const acquirerDeclines = rows.filter((row) => row.code === ACQUIRER_DECLINE_CODE);

  if (acquirerDeclines.length) {
    console.log(
      `\nAcquirer declines (code ${ACQUIRER_DECLINE_CODE}) — send these pg_trx_id values to BOG:`
    );
    for (const row of acquirerDeclines) {
      console.log(
        `  ${row.created_at}  ${String(row.amount).padStart(8)} GEL  ` +
        `${(row.transfer_method || "-").padEnd(10)}  ${row.pg_trx_id || "-"}`
      );
    }

    const amounts = acquirerDeclines
      .map((row) => Number(row.amount))
      .filter(Number.isFinite);

    if (amounts.length) {
      console.log(
        `  amount range: ${Math.min(...amounts)} — ${Math.max(...amounts)} GEL`
      );
    }
  }

  console.log("");
}

function printCsv(rows) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  console.log(headers.join(","));
  for (const row of rows) {
    console.log(headers.map((h) => csvCell(row[h])).join(","));
  }
}

async function main() {
  const args = parseArgs(process.argv);

  const payments = (await listPayments())
    .map((entry) => entry.data)
    .filter((payment) => payment.bog_order_id)
    .filter((payment) => !args.since || payment.created_at >= args.since);

  const selected = args.limit ? payments.slice(-args.limit) : payments;

  if (!selected.length) {
    console.error("No payment rows with a bog_order_id matched.");
    return;
  }

  console.error(`Fetching ${selected.length} receipts from BOG…`);

  // One token for the whole run rather than one per order.
  const token = await getAccessToken();
  const rows = [];

  for (const payment of selected) {
    try {
      const receipt = await getPaymentDetails(payment.bog_order_id, token);
      rows.push(summarize(payment, receipt));
    } catch (error) {
      console.error(
        `  ! ${payment.bog_order_id}: ${error?.message || error}`
      );
    }

    await sleep(REQUEST_DELAY_MS);
  }

  if (args.csv) printCsv(rows);
  else printReport(rows);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
