import ExcelJS from "exceljs";

// Финансовый отчёт в виде готовой книги Excel.
//
// Зачем не CSV: CSV не умеет ни чисел, ни ширины колонок, ни разделения на
// листы — бухгалтер получал одну простыню, где суммы были текстом (и не
// складывались), а заголовки разделов ехали в первую колонку. Здесь всё, что
// считается, лежит числом с денежным форматом, итоги — настоящие формулы SUM
// (пересчитаются, если строку поправят руками), а разделы разнесены по листам.
//
// Сборка вынесена из обработчика, чтобы её можно было прогнать на любых данных
// без базы.

const INK = "FF111111";        // фон шапок
const PAPER = "FFFFFFFF";
const BAND = "FFF2F2F4";       // подложка разделов
const ACCENT = "FFE75228";     // фирменный оранжевый SPOT.
const LINE = "FFDDDDDD";

const THIN = { style: "thin", color: { argb: LINE } };
const BOX = { top: THIN, left: THIN, bottom: THIN, right: THIN };

const PAY_STATUS = {
  paid: "Оплачено",
  pending: "В процессе",
  failed: "Не прошло",
  refunded: "Возврат",
  partially_refunded: "Частичный возврат"
};

const ORDER_STATUS = {
  new: "Новый",
  in_progress: "В работе",
  served: "Подан",
  done: "Закрыт",
  cancelled: "Отменён"
};

const BOOKING_STATUS = {
  paid: "Оплачено",
  deposit: "Депозит",
  unpaid: "Не оплачено",
  refunded: "Возврат"
};

const SOURCE = { online: "Сайт", manual: "Вручную" };

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// 2026-08-01 -> 01.08.2026. Строкой, а не датой: это подпись периода,
// арифметики над ней не будет.
function ru(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(iso || "");
}

function moneyFmt(currency) {
  return `#,##0.00" ${currency || "GEL"}"`;
}

function titleBlock(ws, { period, generated, currency, span }) {
  ws.mergeCells(1, 1, 1, span);
  const t = ws.getCell(1, 1);
  t.value = "SPOT. — финансовый отчёт";
  t.font = { name: "Calibri", size: 16, bold: true, color: { argb: PAPER } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } };
  t.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 30;

  ws.mergeCells(2, 1, 2, span);
  const p = ws.getCell(2, 1);
  p.value = `Период: ${period}    ·    Валюта: ${currency}    ·    Сформирован: ${generated}`;
  p.font = { size: 10, color: { argb: "FF666666" } };
  p.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(2).height = 20;
}

// Заголовок раздела внутри листа — полоса на всю ширину таблицы.
function sectionRow(ws, text, span) {
  const r = ws.addRow([text]);
  ws.mergeCells(r.number, 1, r.number, span);
  const c = ws.getCell(r.number, 1);
  c.font = { bold: true, size: 11, color: { argb: ACCENT } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND } };
  c.alignment = { vertical: "middle", indent: 1 };
  r.height = 22;
  return r;
}

function headerRow(ws, labels) {
  const r = ws.addRow(labels);
  r.eachCell((cell) => {
    cell.font = { bold: true, size: 10, color: { argb: PAPER } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = BOX;
  });
  r.height = 24;
  return r;
}

// Строка «подпись — сумма — пояснение». Пояснение здесь не украшение: без него
// депозит и полная стоимость билета выглядят одинаково, и отчёт врёт.
function kvRow(ws, label, value, fmt, note, opts = {}) {
  const r = ws.addRow([label, value, note || ""]);
  const l = ws.getCell(r.number, 1);
  const v = ws.getCell(r.number, 2);
  const n = ws.getCell(r.number, 3);

  l.font = { bold: !!opts.bold, size: 11, italic: !!opts.muted };
  l.alignment = { indent: opts.indent ? 2 : 1, vertical: "middle" };
  if (opts.muted) l.font = { ...l.font, color: { argb: "FF777777" } };

  v.numFmt = fmt;
  v.font = { bold: !!opts.bold, size: 11 };
  v.alignment = { horizontal: "right", vertical: "middle" };

  n.font = { size: 9.5, color: { argb: "FF888888" }, italic: true };
  n.alignment = { vertical: "middle", wrapText: true };

  if (opts.total) {
    [l, v].forEach((c) => {
      c.border = { top: { style: "double", color: { argb: INK } } };
      c.font = { ...c.font, bold: true, size: 12 };
    });
  }
  r.height = opts.total ? 24 : 18;
  return r;
}

function sheetSummary(wb, report, ctx) {
  const ws = wb.addWorksheet("Сводка", {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });
  ws.columns = [{ width: 44 }, { width: 18 }, { width: 52 }];

  const t = report.totals;
  const s = report.settings;
  const M = ctx.money;

  titleBlock(ws, { ...ctx, span: 3 });
  ws.addRow([]);

  sectionRow(ws, "ПОСТУПЛЕНИЯ ПО БРОНЯМ", 3);
  kvRow(ws, "Билеты (полная стоимость)", num(t.ticketsPaid), M,
    "Форматы, где цена — это вся стоимость: киноужин, drinking night");
  kvRow(ws, "Депозиты", num(t.depositsPaid), M,
    "Вычитаются из счёта гостя за столом — это не выручка, а аванс");
  kvRow(ws, "Итого получено", num(t.taxBase), M, "", { bold: true });
  ws.addRow([]);

  sectionRow(ws, "ОТКУДА ПРИШЛИ ДЕНЬГИ", 3);
  kvRow(ws, "Онлайн по данным банка", num(t.onlineCaptured), M,
    "Фактически captured в BOG — с этой суммой сверяется выписка");
  kvRow(ws, "Онлайн по броням", num(t.onlineAmount), M,
    "Расхождение с предыдущей строкой означает, что не дошёл callback");
  kvRow(ws, "На месте (ручные брони)", num(t.manualAmount), M,
    "Наличные и терминал — мимо онлайн-эквайринга");
  ws.addRow([]);

  sectionRow(ws, "УДЕРЖАНИЯ", 3);
  kvRow(ws, `Комиссия эквайринга (${num(s.acquiring_fee_pct)}%)`, -num(t.fee), M,
    "Считается только с онлайн-поступлений");
  kvRow(ws, `Налог с оборота (${num(s.tax_pct)}%)`, -num(t.tax), M,
    "Ставка справочная — что именно облагается, подтверждает бухгалтер");
  kvRow(ws, "После комиссии и налога", num(t.netAfterFeeAndTax), M, "", { total: true });
  ws.addRow([]);

  sectionRow(ws, "ЗАГРУЗКА", 3);
  kvRow(ws, "Броней за период", num(t.bookings), "#,##0", "");
  kvRow(ws, "Гостей", num(t.guests), "#,##0", "");
  kvRow(ws, "Средний чек на бронь",
    num(t.bookings) ? num(t.taxBase) / num(t.bookings) : 0, M, "");
  kvRow(ws, "Средний чек на гостя",
    num(t.guests) ? num(t.taxBase) / num(t.guests) : 0, M, "");
  kvRow(ws, "Неоплаченные брони", num(t.depositsUnpaid) + num(t.ticketsUnpaid), M,
    "Забронировано, но деньги не получены — долг или бронь по договорённости");
  ws.addRow([]);

  const ordersActive = (report.orders || []).filter((o) => o.status !== "cancelled");
  const ordersTotal = ordersActive.reduce((n, o) => n + num(o.total), 0);
  sectionRow(ws, "СПРАВОЧНО: ЗАКАЗЫ СО СТОЛИКА", 3);
  kvRow(ws, "Оборот кухни и бара", ordersTotal, M,
    "Оплата идёт мимо системы, поэтому в поступления не входит", { muted: true });
  kvRow(ws, "Заказов", ordersActive.reduce((n, o) => n + num(o.n), 0), "#,##0", "", { muted: true });

  return ws;
}

function sheetDays(wb, report, ctx) {
  const ws = wb.addWorksheet("По дням", {
    views: [{ state: "frozen", ySplit: 5, showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });
  ws.columns = [
    { width: 14 }, { width: 10 }, { width: 10 },
    { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 16 }
  ];

  titleBlock(ws, { ...ctx, span: 8 });
  ws.addRow([]);
  sectionRow(ws, "ПО ДНЯМ ПОКАЗА", 8);
  headerRow(ws, ["Дата", "Броней", "Гостей", "Билеты", "Депозиты", "Онлайн", "На месте", "Всего"]);

  const first = ws.rowCount + 1;
  const days = report.days || [];

  days.forEach((d, i) => {
    const r = ws.addRow([
      ru(d.iso), num(d.bookings), num(d.guests),
      num(d.tickets), num(d.deposits), num(d.online), num(d.manual),
      num(d.tickets) + num(d.deposits)
    ]);
    r.eachCell((cell, col) => {
      cell.border = BOX;
      if (col >= 4) cell.numFmt = ctx.money;
      if (col >= 2) cell.alignment = { horizontal: "right" };
      // Полосатая заливка: глазами вести строку по восьми колонкам иначе тяжело.
      if (i % 2) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAFAFA" } };
    });
  });

  const last = ws.rowCount;
  if (!days.length) {
    const r = ws.addRow(["За период броней нет"]);
    ws.mergeCells(r.number, 1, r.number, 8);
    ws.getCell(r.number, 1).font = { italic: true, color: { argb: "FF888888" } };
    return ws;
  }

  // Итог — формулой, а не готовым числом: если строку поправят руками,
  // сумма пересчитается, а не станет тихо врать.
  const total = ws.addRow([
    "Итого",
    { formula: `SUM(B${first}:B${last})` },
    { formula: `SUM(C${first}:C${last})` },
    { formula: `SUM(D${first}:D${last})` },
    { formula: `SUM(E${first}:E${last})` },
    { formula: `SUM(F${first}:F${last})` },
    { formula: `SUM(G${first}:G${last})` },
    { formula: `SUM(H${first}:H${last})` }
  ]);
  total.eachCell((cell, col) => {
    cell.font = { bold: true };
    cell.border = { ...BOX, top: { style: "double", color: { argb: INK } } };
    if (col >= 4) cell.numFmt = ctx.money;
    if (col >= 2) cell.alignment = { horizontal: "right" };
  });
  total.height = 22;

  ws.autoFilter = {
    from: { row: first - 1, column: 1 },
    to: { row: last, column: 8 }
  };

  return ws;
}

function sheetBookings(wb, bookings, ctx) {
  const ws = wb.addWorksheet("Брони", {
    views: [{ state: "frozen", ySplit: 5, showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });
  ws.columns = [
    { width: 12 }, { width: 8 }, { width: 30 }, { width: 12 }, { width: 20 },
    { width: 18 }, { width: 9 }, { width: 14 }, { width: 14 }, { width: 12 }
  ];

  titleBlock(ws, { ...ctx, span: 10 });
  ws.addRow([]);
  sectionRow(ws, "БРОНИ ЗА ПЕРИОД", 10);
  headerRow(ws, [
    "Дата", "Время", "Событие", "Стол", "Гость",
    "Телефон", "Гостей", "Сумма", "Оплата", "Источник"
  ]);

  const first = ws.rowCount + 1;
  (bookings || []).forEach((b, i) => {
    const r = ws.addRow([
      ru(b.iso), b.time || "", b.title || "", b.table_label || "",
      b.guest_name || "", b.guest_phone || b.guest_instagram || "",
      num(b.guests), num(b.amount),
      BOOKING_STATUS[b.payment_status] || b.payment_status || "",
      SOURCE[b.source] || b.source || ""
    ]);
    r.eachCell((cell, col) => {
      cell.border = BOX;
      cell.alignment = { vertical: "middle" };
      if (col === 8) { cell.numFmt = ctx.money; cell.alignment = { horizontal: "right" }; }
      if (col === 7) cell.alignment = { horizontal: "center" };
      // Телефон текстом: иначе Excel съест плюс и обрежет ведущие нули.
      if (col === 6) cell.numFmt = "@";
      if (i % 2) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAFAFA" } };
    });
    // Неоплаченные подсвечиваем — это то, что ищут в списке в первую очередь.
    if (b.payment_status === "unpaid") {
      ws.getCell(r.number, 9).font = { color: { argb: "FF991B1B" }, bold: true };
    }
  });

  const last = ws.rowCount;
  if (last < first) {
    const r = ws.addRow(["За период броней нет"]);
    ws.mergeCells(r.number, 1, r.number, 10);
    ws.getCell(r.number, 1).font = { italic: true, color: { argb: "FF888888" } };
    return ws;
  }

  const total = ws.addRow([
    "Итого", "", "", "", "", "",
    { formula: `SUM(G${first}:G${last})` },
    { formula: `SUM(H${first}:H${last})` }, "", ""
  ]);
  total.eachCell((cell, col) => {
    cell.font = { bold: true };
    cell.border = { ...BOX, top: { style: "double", color: { argb: INK } } };
    if (col === 8) cell.numFmt = ctx.money;
    if (col === 7) cell.alignment = { horizontal: "center" };
  });

  ws.autoFilter = {
    from: { row: first - 1, column: 1 },
    to: { row: last, column: 10 }
  };

  return ws;
}

// Мелкая таблица «статус — количество — сумма» с итогом. Их на листе три,
// поэтому вынесено отдельно.
function miniTable(ws, { title, head, rows, span, moneyCol, money }) {
  sectionRow(ws, title, span);
  headerRow(ws, head);
  const first = ws.rowCount + 1;

  if (!rows.length) {
    const r = ws.addRow(["Нет данных"]);
    ws.mergeCells(r.number, 1, r.number, span);
    ws.getCell(r.number, 1).font = { italic: true, color: { argb: "FF888888" } };
    ws.addRow([]);
    return;
  }

  rows.forEach((row, i) => {
    const r = ws.addRow(row);
    r.eachCell((cell, col) => {
      cell.border = BOX;
      if (col === moneyCol) { cell.numFmt = money; cell.alignment = { horizontal: "right" }; }
      else if (col > 1) cell.alignment = { horizontal: "center" };
      if (i % 2) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAFAFA" } };
    });
  });

  const last = ws.rowCount;
  const cols = "ABCDEFGH";
  const total = ws.addRow([
    "Итого",
    { formula: `SUM(${cols[1]}${first}:${cols[1]}${last})` },
    { formula: `SUM(${cols[2]}${first}:${cols[2]}${last})` }
  ]);
  total.eachCell((cell, col) => {
    cell.font = { bold: true };
    cell.border = { ...BOX, top: { style: "double", color: { argb: INK } } };
    if (col === moneyCol) { cell.numFmt = money; cell.alignment = { horizontal: "right" }; }
    else if (col > 1) cell.alignment = { horizontal: "center" };
  });
  ws.addRow([]);
}

function sheetExtras(wb, report, ctx) {
  const ws = wb.addWorksheet("Платежи и кухня", {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });
  ws.columns = [{ width: 34 }, { width: 14 }, { width: 18 }];

  titleBlock(ws, { ...ctx, span: 3 });
  ws.addRow([]);

  miniTable(ws, {
    title: "ОНЛАЙН-ПЛАТЕЖИ ПО ДАННЫМ БАНКА",
    head: ["Статус", "Штук", "Сумма"],
    rows: (report.payments || []).map((p) => [
      PAY_STATUS[p.status] || p.status, num(p.n), num(p.amount)
    ]),
    span: 3, moneyCol: 3, money: ctx.money
  });

  miniTable(ws, {
    title: "ЗАКАЗЫ СО СТОЛИКА ПО СТАТУСАМ",
    head: ["Статус", "Штук", "Сумма"],
    rows: (report.orders || []).map((o) => [
      ORDER_STATUS[o.status] || o.status, num(o.n), num(o.total)
    ]),
    span: 3, moneyCol: 3, money: ctx.money
  });

  miniTable(ws, {
    title: "ЧТО ЧАЩЕ ВСЕГО ЗАКАЗЫВАЮТ",
    head: ["Позиция", "Штук", "Сумма"],
    rows: (report.topItems || []).map((i) => [i.title, num(i.qty), num(i.amount)]),
    span: 3, moneyCol: 3, money: ctx.money
  });

  return ws;
}

export function buildFinanceWorkbook({ report, bookings = [], generatedAt = new Date() }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SPOT.";
  wb.created = generatedAt;

  const currency = report?.settings?.currency || "GEL";
  const ctx = {
    money: moneyFmt(currency),
    currency,
    period: `${ru(report?.period?.from)} — ${ru(report?.period?.to)}`,
    generated: generatedAt.toLocaleString("ru-RU", { timeZone: "Asia/Tbilisi" })
  };

  sheetSummary(wb, report, ctx);
  sheetDays(wb, report, ctx);
  sheetBookings(wb, bookings, ctx);
  sheetExtras(wb, report, ctx);

  return wb;
}

// Имя файла: spot-финансы-01.08.2026-31.08.2026.xlsx, но латиницей — кириллица
// в Content-Disposition ломается у части почтовых клиентов, а файл потом
// пересылают бухгалтеру именно почтой.
export function financeFileName(report) {
  const from = String(report?.period?.from || "").replace(/-/g, "");
  const to = String(report?.period?.to || "").replace(/-/g, "");
  return `spot-finance-${from}-${to}.xlsx`;
}
