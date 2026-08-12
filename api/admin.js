// Serves the staff admin panel at /admin (rewrite in vercel.json).
// Stage 4: fully DB-backed. Tabs: Сегодня / События / Сеансы. Manual booking
// is a floating action button (modal). "Для Эрика" is a separate area behind
// a second password (ERIK_PANEL_PASS) showing live-parsed BOG payment logs.

const SEATS = [
  "Стол 1", "Стол 2", "Стол 3", "Стол 4", "Стол 5", "Стол 6",
  "Стол 7", "Стол 8", "Стол 9", "Стол 10",
  "Бар 1", "Бар 2", "Бар 3", "Бар 4"
];

function page() {
  // Форматы событий (подпись в админке, шаблон условий, тип цены) живут в
  // таблице event_formats — грузятся с клиента через /api/admin-formats, а не
  // зашиты здесь, чтобы их можно было добавлять из вкладки «Форматы».
  const cfg = JSON.stringify({ seats: SEATS, formats: {} });
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>SPOT. — админ</title>
<style>
  * { box-sizing:border-box; }
  body { margin:0; background:#f5f5f7; font-family:-apple-system,"Segoe UI",Roboto,sans-serif; color:#111; }
  .wrap { max-width:720px; margin:0 auto; padding:20px 16px 90px; }
  h1 { font-size:22px; margin:6px 0 18px; display:flex; justify-content:space-between; align-items:center; }
  h1 a { font-size:13px; color:#888; text-decoration:none; font-weight:400; }
  .tabs { display:flex; gap:6px; margin-bottom:20px; background:#e6e6ea; padding:5px; border-radius:12px; }
  .tab { flex:1; text-align:center; padding:10px 6px; font-size:14px; font-weight:600; border-radius:8px; cursor:pointer; color:#555; }
  .tab.active { background:#fff; color:#111; box-shadow:0 1px 3px rgba(0,0,0,.1); }
  .panel { display:none; }
  .panel.active { display:block; }
  .card { background:#fff; border-radius:14px; padding:18px; margin-bottom:14px; }
  .row { margin-bottom:14px; }
  .row label { display:block; font-size:13px; font-weight:600; margin-bottom:5px; }
  .row input, .row select, .row textarea { width:100%; padding:10px 12px; font-size:15px; border:1px solid #ccc; border-radius:8px; background:#fff; font-family:inherit; }
  .row textarea { min-height:80px; resize:vertical; }
  .two { display:flex; gap:12px; } .two > div { flex:1; }
  .hint { font-size:12px; color:#666; margin-top:4px; }
  .btn { padding:11px 16px; font-size:15px; font-weight:700; color:#fff; background:#111; border:none; border-radius:10px; cursor:pointer; }
  .btn:disabled { opacity:.5; }
  .btn.small { padding:7px 12px; font-size:13px; }
  .btn.ghost { background:#eee; color:#111; }
  .msg { margin-top:12px; padding:11px 13px; border-radius:8px; font-size:14px; display:none; }
  .msg.ok { background:#eefaf0; border:1px solid #c6efd2; color:#166534; display:block; }
  .msg.err { background:#fdecec; border:1px solid #f5c2c2; color:#991b1b; display:block; }

  /* seats */
  .seats { display:flex; flex-wrap:wrap; gap:8px; margin:6px 0 4px; }
  .seat { min-width:54px; padding:8px 6px; text-align:center; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; user-select:none; background:#BDBDBD; color:#fff; }
  .seat.free { background:#4CAF50; } .seat.booked { background:#F44336; cursor:not-allowed; opacity:.85; } .seat.picked { box-shadow:0 0 0 3px #111 inset; }

  /* movie cards */
  .cards { display:flex; flex-wrap:wrap; gap:10px; margin-top:10px; }
  .mcard { width:96px; cursor:pointer; border:2px solid transparent; border-radius:8px; overflow:hidden; background:#f4f4f4; }
  .mcard.picked { border-color:#111; }
  .mcard img { width:100%; height:140px; object-fit:cover; display:block; background:#ddd; }
  .mcard .cap { font-size:11px; padding:4px 5px; line-height:1.25; }
  .noposter { display:flex; align-items:center; justify-content:center; height:140px; font-size:11px; color:#888; text-align:center; padding:4px; }
  .search { display:flex; gap:8px; } .search input { flex:1; }

  /* today */
  .sess { border-left:4px solid #111; padding:10px 14px; background:#fff; border-radius:10px; margin-bottom:12px; }
  .sess h3 { margin:0 0 4px; font-size:16px; }
  .sess .meta { font-size:13px; color:#666; margin-bottom:8px; }
  .bk { display:flex; justify-content:space-between; font-size:13px; padding:5px 0; border-top:1px solid #f0f0f0; }
  .bk .st { font-weight:700; min-width:64px; }
  .badge { font-size:11px; padding:2px 7px; border-radius:99px; }
  .badge.paid { background:#eefaf0; color:#166534; }
  .badge.deposit { background:#fff7e6; color:#92400e; }
  .badge.unpaid { background:#fdecec; color:#991b1b; }
  .badge.refunded { background:#f3e8ff; color:#6b21a8; }
  .badge.online { background:#eef4ff; color:#1e40af; }
  .badge.manual { background:#f3f4f6; color:#374151; }

  /* sessions list */
  .srow { display:flex; align-items:center; gap:10px; padding:10px 0; border-bottom:1px solid #eee; }
  .srow img { width:40px; height:56px; object-fit:cover; border-radius:6px; background:#ddd; }
  .srow .info { flex:1; min-width:0; }
  .srow .t { font-weight:600; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .srow .d { font-size:12px; color:#666; }
  .srow.arch { opacity:.5; }

  /* обслуживание */
  #svc-badge { display:none; margin-left:6px; background:#F44336; color:#fff; border-radius:99px; font-size:11px; padding:1px 6px; }
  #svc-badge.on { display:inline-block; }
  .svc { background:#fff; border-radius:12px; padding:14px 16px; margin-bottom:10px; border-left:4px solid #ddd; }
  .svc.new { border-left-color:#F44336; }
  .svc.accepted { border-left-color:#f59e0b; }
  .svc.done { border-left-color:#4CAF50; opacity:.6; }
  .svc.cancelled { opacity:.45; text-decoration:line-through; }
  .svc__top { display:flex; justify-content:space-between; align-items:baseline; gap:10px; }
  .svc__seat { font-weight:700; font-size:16px; }
  .svc__when { font-size:12px; color:#888; white-space:nowrap; }
  .svc__body { font-size:14px; margin-top:6px; }
  .svc__body .li { display:flex; justify-content:space-between; padding:2px 0; }
  .svc__total { font-weight:700; margin-top:6px; }
  .svc__note { font-size:13px; color:#555; margin-top:6px; font-style:italic; }
  .svc__acts { display:flex; gap:6px; margin-top:10px; flex-wrap:wrap; }
  .svc__kind { font-weight:700; font-size:15px; }

  /* каналы уведомлений */
  .nch { padding:10px 0; border-bottom:1px solid #eee; }
  .nch:last-child { border-bottom:none; }
  .nch__row { display:flex; align-items:center; gap:12px; }
  .nch__main { flex:1; min-width:0; }
  .nch__name { font-weight:600; font-size:14px; }
  .nch__hint { font-size:12px; color:#888; margin-top:2px; }
  .nch__hint.off { color:#f59e0b; }
  .nch__hint.missing { color:#F44336; }
  .nch__test-msg { font-size:12px; margin-left:8px; }
  .tgl { position:relative; display:inline-block; width:40px; height:22px; flex:none; }
  .tgl input { opacity:0; width:0; height:0; }
  .tgl span { position:absolute; inset:0; background:#ccc; border-radius:22px; cursor:pointer; transition:.15s; }
  .tgl span:before { content:''; position:absolute; width:16px; height:16px; left:3px; top:3px; background:#fff; border-radius:50%; transition:.15s; }
  .tgl input:checked + span { background:#4CAF50; }
  .tgl input:checked + span:before { transform:translateX(18px); }
  .tgl input:disabled + span { opacity:.4; cursor:default; }
  .nch__keys { margin-top:8px; }
  .nch__keys summary { cursor:pointer; font-size:12px; color:#666; }
  .nfld { display:flex; align-items:center; gap:8px; margin-top:8px; flex-wrap:wrap; }
  .nfld label { font-size:12px; color:#666; width:170px; flex:none; }
  .nfld input { flex:1; min-width:160px; padding:6px 8px; border:1px solid #ccc; border-radius:6px; font-size:13px; }
  .nsecret-banner { font-size:12px; color:#92400e; background:#fff7e6; border-radius:8px; padding:8px 10px; margin-bottom:10px; }
  .srow input.sel { width:18px; height:18px; flex:none; cursor:pointer; }
  .batchbar { display:none; gap:8px; align-items:center; flex-wrap:wrap; background:#111; color:#fff; padding:10px 12px; border-radius:10px; margin:10px 0; font-size:13px; }
  .batchbar.show { display:flex; }
  .batchbar select, .batchbar input { padding:7px 9px; border-radius:8px; border:none; font-size:13px; }
  .batchbar .btn.small { background:#fff; color:#111; }
  .batchbar .btn.small.danger { background:#F44336; color:#fff; }

  /* calendar */
  #cal-pop { position:absolute; z-index:70; background:#fff; border-radius:14px; box-shadow:0 10px 40px rgba(0,0,0,.22); padding:14px; width:280px; display:none; }
  #cal-pop.show { display:block; }
  .cal-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
  .cal-head b { font-size:15px; text-transform:capitalize; }
  .cal-nav { width:32px; height:32px; border:none; background:#f2f2f4; border-radius:8px; font-size:16px; cursor:pointer; }
  .cal-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:3px; }
  .cal-dow { text-align:center; font-size:11px; color:#999; padding:4px 0; font-weight:600; }
  .cal-day { text-align:center; padding:8px 0; font-size:14px; border-radius:8px; cursor:pointer; border:none; background:none; }
  .cal-day:hover { background:#f0f0f2; }
  .cal-day.other { color:#ccc; }
  .cal-day.today { font-weight:800; color:#111; box-shadow:0 0 0 1px #111 inset; }
  .cal-day.sel { background:#111; color:#fff; }
  .cal-foot { display:flex; gap:8px; margin-top:12px; }
  .cal-foot .btn { flex:1; padding:10px; font-size:14px; }
  .cal-input-wrap { position:relative; }
  .cal-input-wrap input { cursor:pointer; }

  /* FAB */
  #fab { position:fixed; right:18px; bottom:18px; z-index:40; padding:14px 20px; font-size:15px; font-weight:700; color:#fff; background:#111; border:none; border-radius:99px; box-shadow:0 6px 20px rgba(0,0,0,.25); cursor:pointer; }

  /* modal */
  .modal-bg { position:fixed; inset:0; background:rgba(0,0,0,.45); display:none; align-items:flex-end; justify-content:center; z-index:50; }
  .modal-bg.open { display:flex; }
  .modal { background:#fff; border-radius:16px 16px 0 0; width:100%; max-width:720px; max-height:88vh; overflow:auto; padding:20px 18px 26px; }
  .modal h2 { margin:0 0 14px; font-size:18px; display:flex; justify-content:space-between; }
  .modal h2 span.x { cursor:pointer; color:#999; font-weight:400; }

  /* login overlays */
  .login-ov { position:fixed; inset:0; background:#f5f5f7; display:flex; align-items:center; justify-content:center; z-index:60; }
  .login-ov.hidden { display:none; }
  .login-box { background:#fff; border-radius:14px; padding:26px 22px; width:100%; max-width:340px; box-shadow:0 4px 24px rgba(0,0,0,.08); }
  .login-box h2 { margin:0 0 16px; font-size:19px; }
  .login-box input { width:100%; padding:11px 12px; font-size:15px; border:1px solid #ccc; border-radius:8px; margin-bottom:12px; }
  .login-box .err { color:#991b1b; font-size:13px; margin-top:8px; display:none; }
  .login-box .err.show { display:block; }

  /* erik */
  #erik-area { display:none; }
  .pay { background:#fff; border-radius:10px; padding:12px 14px; margin-bottom:10px; cursor:pointer; }
  .pay .top { display:flex; justify-content:space-between; font-size:14px; }
  .pay .sub { font-size:12px; color:#666; margin-top:3px; }
  .pay .detail { display:none; margin-top:10px; border-top:1px solid #eee; padding-top:10px; font-size:13px; }
  .pay.open .detail { display:block; }
  .kv { display:flex; padding:3px 0; }
  .kv .k { min-width:170px; color:#666; }
  .verdict { padding:8px 10px; border-radius:8px; margin-bottom:8px; font-weight:600; font-size:13px; }
  .verdict.good { background:#eefaf0; color:#166534; }
  .verdict.bad { background:#fdecec; color:#991b1b; }
  .verdict.meh { background:#fff7e6; color:#92400e; }

  .btn.small.danger { background:#F44336; color:#fff; }

  /* форматы */
  .fmt-grp { margin-bottom:18px; }
  .fmt-grp__h { display:flex; align-items:baseline; gap:10px; margin-bottom:8px; }
  .fmt-grp__h b { font-size:15px; }
  .fmt-grp__h span { font-size:12.5px; color:#888; }
  .fmt-ev { background:#fff; border-radius:10px; padding:11px 13px; margin-bottom:7px; }
  .fmt-ev__t { display:flex; justify-content:space-between; gap:10px; align-items:baseline; }
  .fmt-ev__n { font-weight:600; font-size:14px; }
  .fmt-ss { display:flex; gap:5px; flex-wrap:wrap; margin-top:7px; }
  .fmt-ss span { font-size:11px; padding:3px 8px; border-radius:6px; background:#f1f0ee; color:#555; cursor:pointer; }
  .fmt-ss span:hover { background:#E75228; color:#fff; }

  /* неделя */
  .wk-head { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  .wk-range { flex:1; min-width:180px; font-size:14px; font-weight:600; }
  .wk-range small { display:block; font-weight:400; font-size:12px; color:#888; }
  .wk-day { margin-bottom:18px; }
  .wk-day__h { display:flex; align-items:baseline; gap:8px; margin:0 0 8px; padding-bottom:6px; border-bottom:1px solid #e6e4e1; }
  .wk-day__h b { font-size:15px; text-transform:capitalize; }
  .wk-day__h span { font-size:12.5px; color:#888; }
  .wk-day.today .wk-day__h b { color:#E75228; }
  .wk-sess { background:#fff; border-radius:12px; padding:12px 14px; margin-bottom:8px; cursor:pointer; border-left:4px solid #ddd; }
  .wk-sess:hover { box-shadow:0 2px 10px rgba(0,0,0,.06); }
  .wk-sess.full { border-left-color:#F44336; }
  .wk-sess.some { border-left-color:#f59e0b; }
  .wk-sess.empty { border-left-color:#4CAF50; }
  .wk-sess__t { display:flex; justify-content:space-between; gap:10px; align-items:baseline; }
  .wk-sess__n { font-weight:700; font-size:15px; }
  .wk-sess__m { font-size:12.5px; color:#777; margin-top:3px; }
  .wk-seats { display:flex; gap:4px; flex-wrap:wrap; margin-top:8px; }
  .wk-seat { font-size:10.5px; padding:3px 7px; border-radius:6px; background:#eceff1; color:#607d8b; }
  .wk-seat.busy { background:#ffebee; color:#c62828; }
  .wk-seat.block { background:#ede7f6; color:#5e35b1; }

  /* финансы */
  .fin-cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin-bottom:14px; }
  .fin-card { background:#fff; border-radius:12px; padding:13px 15px; }
  .fin-card .l { font-size:12px; color:#777; }
  .fin-card .v { font-size:21px; font-weight:700; margin-top:3px; }
  .fin-card .s { font-size:11.5px; color:#999; margin-top:2px; }
  .fin-card.accent .v { color:#E75228; }
  .fin-note { background:#fff7e6; border:1px solid #f5d98b; color:#7a5600; font-size:12.5px; padding:10px 12px; border-radius:8px; margin-bottom:12px; line-height:1.5; }
  .fin-tbl { width:100%; border-collapse:collapse; font-size:13px; }
  .fin-tbl th { text-align:left; font-size:11.5px; color:#888; font-weight:600; padding:6px 8px; border-bottom:1px solid #eee; white-space:nowrap; }
  .fin-tbl td { padding:7px 8px; border-bottom:1px solid #f4f4f4; white-space:nowrap; }
  .fin-tbl td.num, .fin-tbl th.num { text-align:right; }
  .fin-tbl tr:hover td { background:#fafafa; }
  .fin-tbl tfoot td { font-weight:700; border-top:2px solid #eee; }

  /* окно сеанса и архив */
  .sd-bg { position:fixed; inset:0; z-index:60; background:rgba(0,0,0,.5); display:none; align-items:flex-start; justify-content:center; overflow:auto; padding:20px 12px 60px; }
  .sd-bg.open { display:flex; }
  .sd { background:#f5f5f7; border-radius:16px; width:100%; max-width:940px; }
  .sd__h { display:flex; align-items:flex-start; gap:14px; padding:16px 18px; background:#fff; border-radius:16px 16px 0 0; border-bottom:1px solid #eee; position:sticky; top:0; z-index:2; }
  .sd__h img { width:52px; height:74px; object-fit:cover; border-radius:7px; background:#eee; flex:none; }
  .sd__t { flex:1; min-width:0; }
  .sd__t h2 { margin:0 0 3px; font-size:18px; }
  .sd__t .m { font-size:13px; color:#777; }
  .sd__x { background:none; border:none; font-size:26px; line-height:1; color:#999; cursor:pointer; padding:0 4px; }
  .sd__body { padding:16px 18px 22px; }
  .sd__stats { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px; }
  .sd__stat { background:#fff; border-radius:10px; padding:9px 13px; font-size:13px; }
  .sd__stat b { display:block; font-size:17px; }

  .sd-plan { background:#fff; border-radius:12px; padding:12px; margin-bottom:14px; overflow:auto; }
  .sd-plan__in { position:relative; transform-origin:top left; }
  .sdt { position:absolute; box-sizing:border-box; display:flex; align-items:center; justify-content:center;
         text-align:center; font-size:11px; font-weight:600; line-height:1.15; padding:2px; cursor:pointer;
         background:#e8f5e9; border:2px solid #a5d6a7; color:#2e7d32; }
  .sdt.busy { background:#ffebee; border-color:#ef9a9a; color:#b71c1c; }
  .sdt.closed { background:#eceff1; border-color:#b0bec5; color:#78909c; border-style:dashed; }
  .sdt small { display:block; font-weight:400; font-size:9px; opacity:.8; }
  .sdt.sel { outline:3px solid #E75228; outline-offset:1px; z-index:3; }

  .bk { background:#fff; border-radius:10px; padding:11px 13px; margin-bottom:8px; }
  .bk__top { display:flex; justify-content:space-between; gap:10px; align-items:baseline; }
  .bk__seat { font-weight:700; font-size:15px; }
  .bk__who { font-size:14px; }
  .bk__c { font-size:12.5px; color:#666; margin-top:3px; }
  .bk__c a { color:#333; }
  .bk__acts { display:flex; gap:6px; margin-top:9px; flex-wrap:wrap; }
  .bk.edit { outline:2px solid #E75228; }

  .arch-row { display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid #eee; cursor:pointer; }
  .arch-row:hover { background:#fafafa; }
  .arch-row .d { font-size:12.5px; color:#888; white-space:nowrap; }
  .arch-row .t { flex:1; font-weight:600; font-size:14px; }
  .arch-row .n { font-size:12.5px; color:#666; white-space:nowrap; }

  /* размещения позиции в других категориях */
  .plc { display:flex; gap:5px; flex-wrap:wrap; align-items:center; margin-top:5px; }
  .plc span { font-size:11px; padding:3px 8px; border-radius:6px; background:#ede7f6; color:#5e35b1; }
  .plc span b { font-weight:600; }
  .plc span i { font-style:normal; margin-left:5px; cursor:pointer; opacity:.6; }
  .plc span i:hover { opacity:1; }
  .plc button { font-size:11px; padding:3px 9px; border:1px dashed #ccc; background:none; border-radius:6px; cursor:pointer; color:#777; }
  .plc button:hover { border-color:#E75228; color:#E75228; }

  /* загрузка фото */
  .up { display:flex; gap:6px; align-items:center; margin-top:5px; }
  .up input[type=file] { display:none; }
  .up button { font-size:12px; padding:6px 11px; border:1px solid #ddd; background:#fff; border-radius:7px; cursor:pointer; color:#444; }
  .up button:hover { border-color:#E75228; color:#E75228; }
  .up button:disabled { opacity:.5; cursor:default; }
  .up .st { font-size:11.5px; color:#888; }
  .up img { width:32px; height:32px; object-fit:cover; border-radius:5px; background:#eee; }

  /* конструктор зала */
  .fl-bar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:10px; }
  .fl-bar .grp { display:flex; gap:6px; align-items:center; background:#fff; border-radius:10px; padding:6px 10px; }
  .fl-bar label { font-size:12px; color:#666; }
  .fl-bar input[type=number] { width:64px; padding:5px 7px; border:1px solid #ddd; border-radius:6px; font-size:13px; }
  .fl-wrap { position:relative; background:#fff; border-radius:12px; padding:10px; overflow:auto; }
  .fl-canvas {
    position:relative; margin:0 auto; background:#faf9f8;
    border:1px solid #e6e4e1; border-radius:10px; touch-action:none; user-select:none;
  }
  .fl-screen {
    position:absolute; left:50%; transform:translateX(-50%); top:10px;
    font-size:10px; letter-spacing:.3em; color:#aaa; border:1px solid #e0ddd9;
    border-radius:6px; padding:5px 26px; pointer-events:none;
  }
  .fl-t {
    position:absolute; box-sizing:border-box; cursor:grab;
    background:#2f2b28; color:#fff; border:2px solid #46403b;
    display:flex; align-items:center; justify-content:center; text-align:center;
    font-size:12px; font-weight:600; line-height:1.1; padding:2px;
  }
  .fl-t.bar { background:#3a3330; border-color:#5b524c; }
  .fl-t.off { opacity:.35; }
  .fl-t.closed { background:#4a3b36; border-style:dashed; }
  .fl-t.sel { border-color:#E75228; box-shadow:0 0 0 3px rgba(231,82,40,.25); z-index:5; }
  .fl-t small { display:block; font-weight:400; font-size:9.5px; opacity:.65; }
  .fl-h {
    position:absolute; right:-7px; bottom:-7px; width:15px; height:15px;
    background:#fff; border:2px solid #E75228; border-radius:4px; cursor:se-resize;
  }
  .fl-side { background:#fff; border-radius:12px; padding:14px; margin-top:10px; }
  .fl-side .row { margin-bottom:10px; }
  .fl-warn { background:#fff7e6; border:1px solid #f5d98b; color:#8a6100; font-size:12.5px; padding:9px 11px; border-radius:8px; margin-bottom:10px; }
  .fl-save { position:sticky; bottom:0; background:#111; color:#fff; border-radius:10px; padding:10px 14px; display:none; align-items:center; gap:12px; font-size:13px; margin-top:10px; }
  .fl-save.show { display:flex; }
  .fl-save span { flex:1; }

  /* конструктор меню */
  .mb-sub { border-top:1px solid #f0f0f0; }
  .mb-sub__h { display:flex; align-items:center; gap:7px; padding:7px 6px 6px; background:#fcfcfc; }
  .mb-sub__t { flex:1; font-size:12.5px; font-weight:600; color:#666; letter-spacing:.02em; text-transform:uppercase; }
  .mb-sub__t em { font-style:normal; color:#bbb; font-weight:400; text-transform:none; letter-spacing:0; }
  .mb-sub .arrows button { width:20px; height:14px; font-size:9px; }
  .mb-star { background:none; border:none; cursor:pointer; font-size:14px; padding:2px 4px; flex:none; filter:grayscale(1); opacity:.45; }
  .mb-star.on { filter:none; opacity:1; }
  .mb-addsub { width:100%; margin-top:6px; padding:8px; font-size:12.5px; color:#666; background:#fff; border:1px dashed #ddd; border-radius:8px; cursor:pointer; }
  .mb-addsub:hover { border-color:#E75228; color:#E75228; }
  .mb-cat { background:#fff; border-radius:12px; margin-bottom:10px; overflow:hidden; }
  .mb-cat.drag-over { outline:2px dashed #E75228; outline-offset:-2px; }
  .mb-cat__h { display:flex; align-items:center; gap:8px; padding:11px 13px; background:#fafafa; border-bottom:1px solid #eee; }
  .mb-cat__h.hidden-cat { opacity:.5; }
  .mb-cat__t { flex:1; font-weight:700; font-size:15px; }
  .mb-cat__t small { display:block; font-weight:400; font-size:12px; color:#888; }
  .mb-items { padding:4px 8px 8px; min-height:14px; }
  .mb-it { display:flex; align-items:center; gap:9px; padding:8px 6px; border-bottom:1px solid #f2f2f2; background:#fff; }
  .mb-it:last-child { border-bottom:none; }
  .mb-it.out { opacity:.45; }
  .mb-it.dragging { opacity:.35; }
  .mb-it img { width:34px; height:34px; border-radius:6px; object-fit:cover; background:#eee; flex:none; }
  .mb-it__t { flex:1; font-size:13.5px; min-width:0; }
  .mb-it__t b { display:block; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .mb-it__t small { color:#888; font-size:11.5px; }
  .grab { cursor:grab; color:#bbb; font-size:15px; user-select:none; flex:none; padding:0 2px; letter-spacing:-2px; }
  .grab:active { cursor:grabbing; }
  .arrows { display:flex; flex-direction:column; gap:2px; flex:none; }
  .arrows button { width:22px; height:16px; line-height:1; font-size:10px; padding:0; border:1px solid #ddd; background:#fff; border-radius:4px; cursor:pointer; color:#666; }
  .arrows button:disabled { opacity:.3; cursor:default; }
  .mb-move { font-size:11.5px; padding:4px 6px; border:1px solid #ddd; border-radius:6px; max-width:118px; }
  .mb-save { position:sticky; bottom:0; background:#111; color:#fff; border-radius:10px; padding:10px 14px; display:none; align-items:center; gap:12px; font-size:13px; margin-top:10px; }
  .mb-save.show { display:flex; }
  .mb-save span { flex:1; }
  .mb-eye { background:none; border:none; cursor:pointer; font-size:15px; padding:2px 4px; flex:none; }
</style>
</head>
<body>

<!-- main admin login -->
<div class="login-ov" id="login">
  <div class="login-box">
    <h2>Вход в админ-панель</h2>
    <input id="login-user" placeholder="Логин" autocomplete="username">
    <input id="login-pass" type="password" placeholder="Пароль" autocomplete="current-password">
    <button class="btn" style="width:100%" id="login-btn">Войти</button>
    <div class="err" id="login-err"></div>
  </div>
</div>

<div class="wrap">
  <h1>SPOT. — админ <a href="#" id="erik-link">для Эрика</a></h1>

  <div class="tabs" id="main-tabs">
    <div class="tab active" data-tab="today">Неделя</div>
    <div class="tab" data-tab="events">События</div>
    <div class="tab" data-tab="formats">Форматы</div>
    <div class="tab" data-tab="sessions">Сеансы</div>
    <div class="tab" data-tab="menu">Меню</div>
    <div class="tab" data-tab="floor">Зал</div>
    <div class="tab" data-tab="archive">Архив</div>
    <div class="tab" data-tab="finance">Финансы</div>
    <div class="tab" data-tab="svc">Обслуживание<span id="svc-badge"></span></div>
  </div>

  <!-- ===== TODAY ===== -->
  <div class="panel active" id="panel-today">
    <div class="card wk-head">
      <button class="btn small ghost" id="wk-prev">← Прошлая</button>
      <div class="wk-range" id="wk-range"></div>
      <button class="btn small ghost" id="wk-next">Следующая →</button>
      <button class="btn small ghost" id="wk-this">Текущая</button>
    </div>
    <div id="today-list"><div class="hint">Загрузка…</div></div>
  </div>

  <!-- ===== EVENTS ===== -->
  <div class="panel" id="panel-events">
    <div class="card">
      <div class="row"><label>Название события *</label><input id="ev-title" placeholder="Название — фильм, вечеринка, концерт, что угодно"></div>
      <div class="row"><label>Поиск в TMDB (необязательно)</label>
        <div class="hint">Только для фильмов — подставит название и постер. Вечеринки, концерты и всё остальное просто впиши в название выше.</div>
        <div class="search"><input id="ev-query" placeholder="например Рататуй"><button class="btn small" id="ev-searchbtn">Искать</button></div>
        <div class="cards" id="ev-results"></div>
        <div class="hint" id="ev-picked"></div>
      </div>
      <div class="row two">
        <div><label>Формат *</label><select id="ev-format"></select></div>
        <div><label>Цена (GEL, с человека) *</label><input id="ev-price" type="number" min="0" step="0.01" placeholder="30"></div>
      </div>
      <div class="row"><label>Постер (URL)</label><input id="ev-poster" placeholder="оставь пустым — возьмётся из TMDB">
        <div class="hint">Своя картинка вместо найденной в TMDB. Нужна для того, чего в TMDB нет: футбол, концерты, вечеринки.</div></div>
      <div class="row"><label>DepositText (шаблон по формату, можно править)</label><textarea id="ev-deposit"></textarea></div>
      <button class="btn" id="ev-create">Создать событие</button>
      <button class="btn ghost" id="ev-cancel" style="display:none;margin-left:8px">Отмена</button>
      <div class="msg" id="ev-msg"></div>
    </div>
    <div class="card" id="ev-seating" style="display:none">
      <label style="font-size:13px;font-weight:600">Рассадка для этого события</label>
      <div class="hint">Вместимость по умолчанию — из вкладки «Зал». Здесь можно уменьшить/увеличить её только для этого события (на все его сеансы). Пустое поле = вместимость по умолчанию.</div>
      <div id="ev-seating-list" style="margin-top:8px"><div class="hint">Загрузка…</div></div>
      <button class="btn small" id="ev-seating-save" style="margin-top:8px">Сохранить рассадку</button>
      <div class="msg" id="ev-seating-msg"></div>
    </div>
    <div class="card">
      <label style="font-size:13px;font-weight:600">Существующие события</label>
      <div class="batchbar" id="ev-batch">
        <span><b id="ev-batch-n">0</b> выбрано</span>
        <input id="ev-batch-price" type="number" min="0" step="0.01" placeholder="Цена" style="width:80px">
        <select id="ev-batch-format"></select>
        <button class="btn small" id="ev-batch-apply">Применить</button>
        <button class="btn small danger" id="ev-batch-del">Удалить</button>
      </div>
      <div id="ev-list" style="margin-top:8px"><div class="hint">Загрузка…</div></div>
    </div>
  </div>

  <!-- ===== FORMATS ===== -->
  <div class="panel" id="panel-formats">
    <div class="card">
      <div class="hint">Формат — это ярлык события: подпись в списке, тип цены и шаблон условий отмены. «Movie Night (mov)» и «Movie Dinner (din)» уже есть, новые (например «Movie Brunch») можно добавить здесь.</div>
      <div class="row"><label>Код * (латиница, без пробелов, напр. brunch)</label><input id="fm-code" placeholder="brunch"></div>
      <div class="row"><label>Название *</label><input id="fm-title" placeholder="Movie Brunch"></div>
      <div class="row"><label>Тип цены</label><select id="fm-kind">
        <option value="deposit">Депозит (вычитается из счёта)</option>
        <option value="included">Включено в стоимость</option>
      </select></div>
      <div class="row"><label>Текст условий (шаблон, подставится в форму события)</label><textarea id="fm-deposit"></textarea></div>
      <button class="btn" id="fm-create">Добавить формат</button>
      <button class="btn ghost" id="fm-cancel" style="display:none;margin-left:8px">Отмена</button>
      <div class="msg" id="fm-msg"></div>
    </div>
    <div class="card">
      <label style="font-size:13px;font-weight:600">Существующие форматы</label>
      <div id="fm-mgmt-list" style="margin-top:8px"><div class="hint">Загрузка…</div></div>
    </div>
    <div id="fmt-list"><div class="hint">Загрузка…</div></div>
  </div>

  <!-- ===== SESSIONS ===== -->
  <div class="panel" id="panel-sessions">
    <div class="card">
      <div class="row"><label>Событие *</label><select id="ss-event"><option value="">Загрузка…</option></select></div>
      <div class="row two">
        <div><label>Дата *</label><input id="ss-date" readonly placeholder="выбери в календаре"></div>
        <div><label>Время * (ЧЧ:ММ)</label><input id="ss-time" placeholder="21:00"></div>
      </div>
      <div class="row"><label>Постер сеанса (URL)</label><input id="ss-poster" placeholder="пусто — берётся постер события">
        <div class="hint">Перекрывает постер события только для этого сеанса — удобно для особых показов.</div></div>
      <button class="btn" id="ss-create">Создать сеанс</button>
      <button class="btn ghost" id="ss-cancel" style="display:none;margin-left:8px">Отмена</button>
      <div class="msg" id="ss-msg"></div>
    </div>
    <div class="card">
      <label style="font-size:13px;font-weight:600">Все сеансы (клик по «Ссылка» — копирование)</label>
      <div class="batchbar" id="ss-batch">
        <span><b id="ss-batch-n">0</b> выбрано</span>
        <select id="ss-batch-event"><option value="">переназначить на… —</option></select>
        <button class="btn small" id="ss-batch-apply">Применить</button>
        <button class="btn small danger" id="ss-batch-del">Удалить</button>
      </div>
      <div id="ss-list" style="margin-top:8px"><div class="hint">Загрузка…</div></div>
    </div>
  </div>

  <!-- ===== MENU ===== -->
  <div class="panel" id="panel-menu">
    <div class="card">
      <label style="font-size:13px;font-weight:600">Категория</label>
      <div class="row two" style="margin-top:8px">
        <div><label>Название (RU) *</label><input id="mc-ru" placeholder="Кухня"></div>
        <div><label>Меню</label><select id="mc-menu">
          <option value="main">Основное</option>
          <option value="pool">Бар у бассейна</option>
        </select></div>
        <div><label>Порядок</label><input id="mc-sort" type="number" value="0"></div>
      </div>
      <div class="row two">
        <div><label>ქართული</label><input id="mc-ka" placeholder="სამზარეულო"></div>
        <div><label>English</label><input id="mc-en" placeholder="Kitchen"></div>
      </div>
      <button class="btn" id="mc-save">Добавить категорию</button>
      <button class="btn ghost" id="mc-cancel" style="display:none;margin-left:8px">Отмена</button>
      <div class="msg" id="mc-msg"></div>
    </div>

    <div class="card">
      <label style="font-size:13px;font-weight:600">Позиция меню</label>
      <div class="row" style="margin-top:8px"><label>Категория *</label><select id="mi-cat"><option value="">—</option></select></div>
      <div class="row two">
        <div><label>Название (RU) *</label><input id="mi-ru" placeholder="Хачапури"></div>
        <div><label>Цена (GEL) *</label><input id="mi-price" type="number" min="0" step="0.01"></div>
      </div>
      <div class="row two">
        <div><label>ქართული</label><input id="mi-ka"></div>
        <div><label>English</label><input id="mi-en"></div>
      </div>
      <div class="row"><label>Описание (RU)</label><textarea id="mi-dru" style="min-height:56px"></textarea></div>
      <div class="row two">
        <div><label>Описание ქარ</label><textarea id="mi-dka" style="min-height:56px"></textarea></div>
        <div><label>Описание EN</label><textarea id="mi-den" style="min-height:56px"></textarea></div>
      </div>
      <div class="row two">
        <div><label>Фото (URL)</label><input id="mi-photo" placeholder="https://..."></div>
        <div><label>Фото при наведении</label><input id="mi-photo2" placeholder="необязательно"></div>
        <div><label>Порядок</label><input id="mi-sort" type="number" value="0"></div>
      </div>
      <button class="btn" id="mi-save">Добавить позицию</button>
      <button class="btn ghost" id="mi-cancel" style="display:none;margin-left:8px">Отмена</button>
      <div class="msg" id="mi-msg"></div>
    </div>

    <div class="card">
      <label style="font-size:13px;font-weight:600">Меню</label>
      <div class="hint" style="margin:6px 0 10px">Перетаскивай за ⠿ или двигай стрелками. Позицию можно перенести в другую категорию выпадающим списком. Глаз скрывает категорию с сайта, кружок снимает позицию с продажи. Звезда — показывать в «Всё меню». Работает на трёх уровнях: категория, подкатегория, отдельное блюдо. По умолчанию видно всё: снимай звезду у того, что загромождает главную, — внутри самой категории всё останется на месте.</div><div id="menu-list" style="margin-top:8px"><div class="hint">Загрузка…</div></div><div class="mb-save" id="mb-save"><span id="mb-save-t">Порядок изменён</span><button class="btn small" id="mb-save-btn">Сохранить</button><button class="btn small ghost" id="mb-undo-btn">Отменить</button></div>
    </div>
  </div>

  <!-- ===== FLOOR ===== -->
  <div class="panel" id="panel-floor">
    <div class="card">
      <div class="fl-bar">
        <button class="btn small" id="fl-add">+ Стол</button>
        <button class="btn small ghost" id="fl-add-bar">+ Барное место</button>
        <div class="grp"><label>Сетка</label><input id="fl-grid" type="number" min="0" max="100" step="5"></div>
        <div class="grp"><label>Холст</label>
          <input id="fl-cw" type="number" min="400" max="3000" step="20">×
          <input id="fl-ch" type="number" min="300" max="3000" step="20"></div>
        <button class="btn small ghost" id="fl-reload">Сбросить правки</button>
      </div>
      <div class="hint">Перетаскивай столы мышью, тяни за угол — меняешь размер. Стрелками — точное смещение, Shift+стрелки — крупный шаг. Delete убирает выбранный стол из плана.</div>
    </div>

    <div class="fl-wrap"><div class="fl-canvas" id="fl-canvas"></div></div>

    <div class="fl-side" id="fl-side"><div class="hint">Выбери стол на схеме, чтобы изменить его.</div></div>

    <div class="fl-save" id="fl-save">
      <span id="fl-save-t">План изменён</span>
      <button class="btn small" id="fl-save-btn">Сохранить</button>
      <button class="btn small ghost" id="fl-undo-btn">Отменить</button>
    </div>
  </div>

  <!-- ===== ARCHIVE ===== -->
  <div class="panel" id="panel-archive">
    <div class="card" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <input id="ar-q" placeholder="Поиск: фильм, имя гостя, телефон, инстаграм" style="flex:1;min-width:220px;padding:9px 12px;border:1px solid #ccc;border-radius:8px">
      <button class="btn small" id="ar-find">Искать</button>
      <button class="btn small ghost" id="ar-clear">Сбросить</button>
    </div>
    <div id="ar-guests"></div>
    <div class="card">
      <label style="font-size:13px;font-weight:600">Прошедшие сеансы</label>
      <div id="ar-list" style="margin-top:8px"><div class="hint">Загрузка…</div></div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn small ghost" id="ar-prev">← Раньше</button>
        <button class="btn small ghost" id="ar-next">Позже →</button>
      </div>
    </div>
  </div>

  <!-- ===== FINANCE ===== -->
  <div class="panel" id="panel-finance">
    <div class="card" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <label style="font-size:13px;font-weight:600">Период</label>
      <input id="fin-from" readonly style="width:130px;padding:8px 10px;border:1px solid #ccc;border-radius:8px;cursor:pointer">
      <span style="color:#888">—</span>
      <input id="fin-to" readonly style="width:130px;padding:8px 10px;border:1px solid #ccc;border-radius:8px;cursor:pointer">
      <button class="btn small" id="fin-go">Показать</button>
      <button class="btn small ghost" id="fin-month">Этот месяц</button>
      <button class="btn small ghost" id="fin-prev-month">Прошлый месяц</button>
      <button class="btn small ghost" id="fin-csv">Выгрузить CSV</button>
    </div>

    <div id="fin-body"><div class="hint">Загрузка…</div></div>

    <div class="card">
      <label style="font-size:13px;font-weight:600">Ставки</label>
      <div class="row two" style="margin-top:8px">
        <div><label>Комиссия эквайринга, %</label><input id="fin-fee" type="number" min="0" max="100" step="0.01"></div>
        <div><label>Налог с оборота, %</label><input id="fin-tax" type="number" min="0" max="100" step="0.01"></div>
      </div>
      <button class="btn small" id="fin-save">Сохранить ставки</button>
      <div class="hint">Комиссия зависит от договора с банком, налоговая ставка — от статуса ИП. Уточните обе у бухгалтера: расчёт в отчёте справочный.</div>
      <div class="msg" id="fin-msg"></div>
    </div>
  </div>

  <!-- ===== SERVICE ===== -->
  <div class="panel" id="panel-svc">
    <div class="card" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <label style="font-size:13px;font-weight:600">Период:</label>
      <select id="svc-hours" style="padding:8px;border:1px solid #ccc;border-radius:8px">
        <option value="6">6 часов</option>
        <option value="24" selected>сутки</option>
        <option value="72">3 дня</option>
      </select>
      <label style="font-size:13px;display:flex;align-items:center;gap:6px">
        <input type="checkbox" id="svc-auto" checked style="width:16px;height:16px"> автообновление
      </label>
      <button class="btn small ghost" id="svc-reload">Обновить</button>
      <span class="hint" id="svc-stamp"></span>
    </div>

    <div class="card" id="notify-card">
      <label style="font-size:13px;font-weight:600">Каналы уведомлений</label>
      <div id="notify-list" style="margin-top:10px"><div class="hint">Загрузка…</div></div>
    </div>

    <label style="font-size:13px;font-weight:600">Просьбы</label>
    <div id="svc-reqs" style="margin:8px 0 22px"><div class="hint">Загрузка…</div></div>

    <label style="font-size:13px;font-weight:600">Заказы</label>
    <div id="svc-orders" style="margin-top:8px"><div class="hint">Загрузка…</div></div>
  </div>

  <!-- ===== ERIK ===== -->
  <div id="erik-area">
    <div class="card" id="erik-gate">
      <div class="row"><label>Пароль раздела</label><input id="erik-pass" type="password" placeholder="Второй пароль"></div>
      <button class="btn" id="erik-enter">Открыть</button>
      <div class="msg" id="erik-gate-msg"></div>
    </div>
    <div id="erik-content" style="display:none">
      <div class="card" style="display:flex;gap:10px;align-items:center">
        <label style="font-size:13px;font-weight:600">Период:</label>
        <select id="erik-days" style="padding:8px;border:1px solid #ccc;border-radius:8px">
          <option value="7">7 дней</option>
          <option value="30" selected>30 дней</option>
          <option value="90">90 дней</option>
        </select>
        <button class="btn small ghost" id="erik-reload">Обновить</button>
        <button class="btn small ghost" id="erik-back">← к админке</button>
      </div>
      <div id="erik-list"><div class="hint">Загрузка…</div></div>
    </div>
  </div>
</div>

<div id="cal-pop">
  <div class="cal-head">
    <button class="cal-nav" id="cal-prev">‹</button>
    <b id="cal-title"></b>
    <button class="cal-nav" id="cal-next">›</button>
  </div>
  <div class="cal-grid" id="cal-grid"></div>
  <div class="cal-foot">
    <button class="btn ghost" id="cal-close">Отмена</button>
    <button class="btn" id="cal-ok">Выбрать</button>
  </div>
</div>

<div class="sd-bg" id="sd-bg">
  <div class="sd">
    <div class="sd__h">
      <img id="sd-poster" alt="">
      <div class="sd__t"><h2 id="sd-title"></h2><div class="m" id="sd-meta"></div></div>
      <button class="sd__x" id="sd-close" aria-label="Закрыть">×</button>
    </div>
    <div class="sd__body">
      <div class="sd__stats" id="sd-stats"></div>
      <div class="hint" style="margin:-6px 0 10px">Клик по свободному столу — закрыть его на этот сеанс (под стафф или бронь по телефону). Клик по закрытому — снова открыть.</div>
      <div class="sd-plan"><div class="sd-plan__in" id="sd-plan"></div></div>
      <div id="sd-list"></div>
    </div>
  </div>
</div>

<button id="fab">+ Ручная бронь</button>

<!-- manual booking modal -->
<div class="modal-bg" id="mb-modal">
  <div class="modal">
    <h2>Ручная бронь <span class="x" id="mb-close">✕</span></h2>
    <div class="row"><label>Сеанс *</label><select id="mb-session"><option value="">Загрузка…</option></select></div>
    <div class="row"><label>Стол / Бар *</label><div class="seats" id="mb-seats"></div><input id="mb-table" type="hidden"><div class="hint" id="mb-seatshint">Выбери сеанс.</div></div>
    <div class="row two"><div><label>Имя</label><input id="mb-name"></div><div><label>Телефон</label><input id="mb-phone" placeholder="+995 …"></div></div>
    <div class="row"><label>Instagram</label><input id="mb-instagram" placeholder="@nickname"></div>
    <div class="row two"><div><label>Персон</label><input id="mb-guests" type="number" min="1" value="2"></div><div><label>Сумма (GEL)</label><input id="mb-amount" type="number" min="0" step="0.01"></div></div>
    <div class="row"><label>Статус оплаты</label><select id="mb-payment"><option value="paid">Оплачено</option><option value="deposit">Депозит внесён</option><option value="unpaid">Не оплачено</option></select></div>
    <div class="row"><label>Комментарий</label><textarea id="mb-comment" placeholder="день рождения, аллергия, просьба перезвонить и т.п."></textarea></div>
    <button class="btn" style="width:100%" id="mb-submit">Создать бронь</button>
    <div class="msg" id="mb-msg"></div>
  </div>
</div>

<script>
const CFG = ${cfg};
const SEATS = CFG.seats;
const $ = (id) => document.getElementById(id);
const api = (p) => '/api/' + p;
const F = { credentials: 'same-origin' };

function msg(el, text, ok){ el.textContent = text; el.className = 'msg ' + (ok ? 'ok' : 'err'); }
function esc(s){ return String(s??'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

// ---------- main login ----------
const loginBox = $('login');
function showLogin(){ loginBox.classList.remove('hidden'); }
function hideLogin(){ loginBox.classList.add('hidden'); }
function handle401(){ showLogin(); }

$('login-btn').addEventListener('click', doLogin);
$('login-pass').addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });

async function doLogin(){
  const errEl = $('login-err'); errEl.classList.remove('show');
  const user=$('login-user').value, pass=$('login-pass').value;
  if(!user||!pass){ errEl.textContent='Введи логин и пароль.'; errEl.classList.add('show'); return; }
  const btn=$('login-btn'); btn.disabled=true;
  try{
    const r=await fetch(api('admin-login'),{method:'POST',...F,headers:{'Content-Type':'application/json'},body:JSON.stringify({user,pass})});
    const d=await r.json().catch(()=>({}));
    if(r.ok&&d.ok){ $('login-pass').value=''; hideLogin(); boot(); }
    else{ errEl.textContent=d.error||'Ошибка входа'; errEl.classList.add('show'); }
  }catch(e){ errEl.textContent='Сетевая ошибка'; errEl.classList.add('show'); }
  finally{ btn.disabled=false; }
}

(async()=>{
  try{ const r=await fetch(api('admin-check'), F); if(r.ok){ hideLogin(); boot(); } else showLogin(); }
  catch(e){ showLogin(); }
})();

// ---------- tabs ----------
document.querySelectorAll('#main-tabs .tab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('#main-tabs .tab').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));
  t.classList.add('active');
  $('panel-'+t.dataset.tab).classList.add('active');
  if(t.dataset.tab==='today') loadToday();
  if(t.dataset.tab==='events') { loadEventsList(); }
  if(t.dataset.tab==='formats') { loadFormatMgmt(); loadFormats(); }
  if(t.dataset.tab==='sessions') { loadEventOptions(); loadSessionsList(); }
  if(t.dataset.tab==='menu') loadMenu();
  if(t.dataset.tab==='floor') loadFloor();
  if(t.dataset.tab==='archive') loadArchive();
  if(t.dataset.tab==='finance') loadFinance();
  if(t.dataset.tab==='svc') { loadSvc(); loadNotify(); }
}));

let BOOTED=false;
async function boot(){
  if(BOOTED) return; BOOTED=true;
  loadToday();
  loadEventsList();
  loadEventOptions();
  loadSessionsList();
  await loadFormatsCfg();
  fillFormatSelects();
  ['mi-photo','mi-photo2','ev-poster','ss-poster'].forEach(attachUpload);
  $('ev-deposit').value = depositTemplate($('ev-format').value || 'mov');
  loadMenu();
  loadSvc();
  loadNotify();
  startSvcPoll();
}

// ---------- CALENDAR ----------
const CAL = { view:new Date(), sel:null, onPick:null, anchor:null };
const MONTHS = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
const DOWS = ['пн','вт','ср','чт','пт','сб','вс'];

function pad2(n){ return String(n).padStart(2,'0'); }
function fmtDdMm(d){ return pad2(d.getDate())+'-'+pad2(d.getMonth()+1)+'-'+d.getFullYear(); }
function sameDay(a,b){ return a&&b&&a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate(); }

function calRender(){
  const v=CAL.view;
  $('cal-title').textContent = MONTHS[v.getMonth()]+' '+v.getFullYear();
  const grid=$('cal-grid'); grid.innerHTML='';
  DOWS.forEach(d=>{ const el=document.createElement('div'); el.className='cal-dow'; el.textContent=d; grid.appendChild(el); });
  const first=new Date(v.getFullYear(), v.getMonth(), 1);
  let start=(first.getDay()+6)%7; // Monday-first
  const today=new Date();
  for(let i=0;i<42;i++){
    const d=new Date(v.getFullYear(), v.getMonth(), 1-start+i);
    const b=document.createElement('button');
    b.className='cal-day'+(d.getMonth()!==v.getMonth()?' other':'')+(sameDay(d,today)?' today':'')+(sameDay(d,CAL.sel)?' sel':'');
    b.textContent=d.getDate();
    b.onclick=(ev)=>{ ev.stopPropagation(); CAL.sel=d; calRender(); };
    grid.appendChild(b);
  }
}

function calOpen(anchorEl, initial, onPick){
  CAL.onPick=onPick; CAL.anchor=anchorEl;
  CAL.sel = initial || null;
  CAL.view = initial ? new Date(initial) : new Date();
  calRender();
  const pop=$('cal-pop');
  const r=anchorEl.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(window.scrollX + r.left, window.scrollX + window.innerWidth - 296)) + 'px';
  pop.style.top  = (window.scrollY + r.bottom + 6) + 'px';
  pop.classList.add('show');
}
function calClose(){ $('cal-pop').classList.remove('show'); }

$('cal-prev').addEventListener('click', ()=>{ CAL.view=new Date(CAL.view.getFullYear(), CAL.view.getMonth()-1, 1); calRender(); });
$('cal-next').addEventListener('click', ()=>{ CAL.view=new Date(CAL.view.getFullYear(), CAL.view.getMonth()+1, 1); calRender(); });
$('cal-close').addEventListener('click', calClose);
$('cal-ok').addEventListener('click', ()=>{
  if(!CAL.sel){ calClose(); return; }
  if(CAL.onPick) CAL.onPick(CAL.sel);
  calClose();
});
document.addEventListener('click', (e)=>{
  const pop=$('cal-pop');
  if(!pop.classList.contains('show')) return;
  // A day click re-renders the grid, detaching the clicked button before the
  // event bubbles here — a detached target must not count as "outside".
  if(!document.contains(e.target)) return;
  if(pop.contains(e.target) || e.target===CAL.anchor) return;
  calClose();
});

function parseDdMm(s){
  const m=String(s||'').match(/^(\\d{1,2})-(\\d{1,2})-(\\d{4})$/);
  return m ? new Date(Number(m[3]), Number(m[2])-1, Number(m[1])) : null;
}

// ---------- calendar wiring ----------
document.addEventListener('DOMContentLoaded', ()=>{});
$('ss-date').addEventListener('click', ()=>{
  calOpen($('ss-date'), parseDdMm($('ss-date').value), (d)=>{ $('ss-date').value = fmtDdMm(d); });
});
// ---------- НЕДЕЛЯ ----------
// Расписание живёт неделями, поэтому главный экран — неделя, а не день:
// видно и сегодняшний вечер, и что будет в выходные.

let WK_FROM = null, WK_TO = null;
const DOW = ['понедельник','вторник','среда','четверг','пятница','суббота','воскресенье'];
const MON = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];

function wkShift(days){
  if(!WK_FROM) return;
  const f=new Date(WK_FROM+'T00:00:00Z'), t=new Date(WK_TO+'T00:00:00Z');
  f.setUTCDate(f.getUTCDate()+days); t.setUTCDate(t.getUTCDate()+days);
  WK_FROM=f.toISOString().slice(0,10); WK_TO=t.toISOString().slice(0,10);
  loadToday();
}
function wkHuman(iso){
  const d=new Date(iso+'T00:00:00Z');
  return d.getUTCDate()+' '+MON[d.getUTCMonth()];
}
function wkTodayIso(){
  return new Date(Date.now()+4*3600*1000).toISOString().slice(0,10);
}

$('wk-prev').addEventListener('click', ()=>wkShift(-7));
$('wk-next').addEventListener('click', ()=>wkShift(7));
$('wk-this').addEventListener('click', ()=>{ WK_FROM=null; WK_TO=null; loadToday(); });

// Имя loadToday сохранено: его дёргают другие места после изменений броней.
async function loadToday(){
  const box=$('today-list');
  box.innerHTML='<div class="hint">Загрузка…</div>';
  try{
    const u=new URL(api('admin-week'), location.origin);
    if(WK_FROM && WK_TO){ u.searchParams.set('from', WK_FROM); u.searchParams.set('to', WK_TO); }
    const r=await fetch(u, F);
    if(r.status===401){ handle401(); return; }
    const d=await r.json();
    WK_FROM=d.from; WK_TO=d.to;

    $('wk-range').innerHTML = wkHuman(d.from)+' — '+wkHuman(d.to)+
      '<small>'+(d.sessions||[]).length+' сеансов на неделе</small>';

    const today=wkTodayIso();
    // Раскладываем по дням недели, включая пустые: пустой день — это тоже
    // информация, сразу видно дыры в расписании.
    const days=[];
    for(let i=0;i<7;i++){
      const dt=new Date(d.from+'T00:00:00Z'); dt.setUTCDate(dt.getUTCDate()+i);
      const iso=dt.toISOString().slice(0,10);
      days.push({ iso, dow:DOW[(dt.getUTCDay()+6)%7], human:wkHuman(iso),
                  items:(d.sessions||[]).filter(s=>s.iso===iso) });
    }

    box.innerHTML = days.map(day=>{
      const rows = day.items.length ? day.items.map(s=>{
        const busy=(s.bookings||[]).length, blocked=(s.blocks||[]).length;
        const cls = s.free===0 ? 'full' : (busy||blocked ? 'some' : 'empty');
        const seats=(s.bookings||[]).map(b=>
            '<span class="wk-seat busy" title="'+esc((b.guest_name||'')+' · '+(b.guest_phone||''))+'">'+
            esc(b.table_label)+' · '+esc(b.guest_name||'—')+'</span>')
          .concat((s.blocks||[]).map(b=>
            '<span class="wk-seat block" title="'+esc(b.reason||'закрыт')+'">'+esc(b.table_label)+' · закрыт</span>'))
          .join('');
        return '<div class="wk-sess '+cls+'" data-open="'+esc(s.id)+'">'+
          '<div class="wk-sess__t"><span class="wk-sess__n">'+esc(s.time)+' · '+esc(s.title)+'</span>'+
            '<span class="badge '+(s.free===0?'unpaid':'paid')+'">'+(s.free===0?'занято':'свободно '+s.free)+'</span></div>'+
          '<div class="wk-sess__m">'+esc(s.format)+' · '+esc(String(s.price))+' GEL · '+
            busy+' брон. · '+s.guests+' гост.'+(blocked?' · '+blocked+' закрыто':'')+'</div>'+
          (seats?'<div class="wk-seats">'+seats+'</div>':'')+
        '</div>';
      }).join('') : '<div class="hint" style="padding:2px 0 6px">Сеансов нет</div>';

      return '<div class="wk-day'+(day.iso===today?' today':'')+'">'+
        '<div class="wk-day__h"><b>'+esc(day.dow)+'</b><span>'+esc(day.human)+
          (day.iso===today?' · сегодня':'')+'</span></div>'+rows+'</div>';
    }).join('');

    box.querySelectorAll('[data-open]').forEach(el=>el.onclick=()=>openSession(el.dataset.open));
  }catch(e){ box.innerHTML='<div class="hint">Ошибка загрузки.</div>'; }
}

// ---------- ЗАГРУЗКА ФОТО ----------
// Файл уходит через наш эндпоинт: ключ ImgBB лежит на сервере, в браузер
// его отдавать нельзя. Ссылка подставляется в поле, дальше всё как раньше.

function attachUpload(inputId){
  const input=$(inputId);
  if(!input || input.dataset.upWired) return;
  input.dataset.upWired='1';

  const box=document.createElement('div');
  box.className='up';
  box.innerHTML='<input type="file" accept="image/*"><button type="button">Загрузить файл</button>'+
    '<span class="st"></span><img alt="" style="display:none">';
  input.parentElement.appendChild(box);

  const file=box.querySelector('input[type=file]');
  const btn=box.querySelector('button');
  const st=box.querySelector('.st');
  const prev=box.querySelector('img');

  const showPreview=()=>{
    const v=input.value.trim();
    if(v){ prev.src=v; prev.style.display=''; } else { prev.style.display='none'; }
  };
  input.addEventListener('change', showPreview);
  showPreview();

  btn.onclick=()=>file.click();

  file.onchange=async()=>{
    const f=file.files && file.files[0];
    if(!f) return;
    if(f.size > 8*1024*1024){ st.textContent='Файл больше 8 МБ'; return; }

    btn.disabled=true; st.textContent='Загружаю…';
    try{
      const base64=await new Promise((res,rej)=>{
        const rd=new FileReader();
        rd.onload=()=>res(String(rd.result).split(',')[1]);
        rd.onerror=()=>rej(new Error('read'));
        rd.readAsDataURL(f);
      });
      const r=await fetch(api('admin-upload'),{method:'POST',...F,headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ image:base64, name:f.name })});
      if(r.status===401){ handle401(); return; }
      const d=await r.json().catch(()=>({}));
      if(!r.ok || !d.ok){ st.textContent='Ошибка: '+(d.detail||d.error||'?'); return; }
      input.value=d.url;
      input.dispatchEvent(new Event('change',{bubbles:true}));
      showPreview();
      st.textContent='Готово';
      setTimeout(()=>{ st.textContent=''; }, 2000);
    }catch(e){ st.textContent='Не загрузилось'; }
    finally{ btn.disabled=false; file.value=''; }
  };
}

// ---------- ФОРМАТЫ ----------// ---------- ФОРМАТЫ ----------
async function loadFormatsCfg(){
  try{
    const r=await fetch(api('admin-formats'), F);
    if(r.status===401){ handle401(); return; }
    const d=await r.json();
    const formats={};
    (d.formats||[]).forEach(f=>{ formats[f.code]={ title:f.title, price_kind:f.price_kind, deposit_text:f.deposit_text||'' }; });
    CFG.formats=formats;
  }catch(e){ /* оставляем CFG.formats как есть — пусто, форма покажет это */ }
}
function depositTemplate(fmt){
  const f = CFG.formats[fmt];
  return f ? f.deposit_text : '';
}
function fillFormatSelects(){
  const opts = Object.keys(CFG.formats)
    .map(k=>'<option value="'+esc(k)+'">'+esc(CFG.formats[k].title)+'</option>').join('');
  $('ev-format').innerHTML = opts || '<option value="">нет форматов — добавь во вкладке «Форматы»</option>';
  $('ev-batch-format').innerHTML = '<option value="">формат —</option>'+opts;
}

// ---------- EVENTS ----------
let EV_PICK = { title:'', poster:'', tmdb_id:null };
let EV_EDIT = null; // event being edited: {id,title,poster_url}

function evResetForm(){
  EV_EDIT=null; EV_PICK={ title:'', poster:'', tmdb_id:null };
  $('ev-title').value='';
  $('ev-picked').textContent=''; $('ev-price').value=''; $('ev-poster').value='';
  $('ev-results').innerHTML='';
  $('ev-deposit').value = depositTemplate($('ev-format').value);
  $('ev-create').textContent='Создать событие';
  $('ev-cancel').style.display='none';
  $('ev-seating').style.display='none';
}

// ---------- Рассадка под событие ----------
async function loadEventSeating(eventId){
  const box=$('ev-seating-list'), m=$('ev-seating-msg');
  box.innerHTML='<div class="hint">Загрузка…</div>'; m.style.display='none';
  try{
    const [fr, orr] = await Promise.all([
      fetch(api('admin-floor'), F),
      fetch(api('admin-event-overrides')+'?event_id='+encodeURIComponent(eventId), F)
    ]);
    if(fr.status===401 || orr.status===401){ handle401(); return; }
    const fd=await fr.json(), od=await orr.json();
    const tables=(fd.tables||[]).filter(t=>t.active!==false);
    const byLabel={};
    (od.overrides||[]).forEach(o=>{ byLabel[o.table_label]=o; });

    box.innerHTML = tables.length ? tables.map(t=>{
      const o=byLabel[t.label];
      return '<div class="row two" data-label="'+esc(t.label)+'" data-defmin="'+t.capacity_min+'" data-defmax="'+t.capacity_max+'" style="align-items:end">'+
        '<div><label>'+esc(t.label)+' <span class="hint">(по умолчанию '+t.capacity_min+'–'+t.capacity_max+')</span></label></div>'+
        '<div style="display:flex;gap:8px">'+
          '<input class="ev-seat-min" type="number" min="1" placeholder="'+t.capacity_min+'" value="'+(o?o.capacity_min:'')+'" style="width:70px">'+
          '<input class="ev-seat-max" type="number" min="1" placeholder="'+t.capacity_max+'" value="'+(o?o.capacity_max:'')+'" style="width:70px">'+
        '</div></div>';
    }).join('') : '<div class="hint">В плане зала нет активных столов.</div>';
  }catch(e){ box.innerHTML='<div class="hint">Ошибка загрузки.</div>'; }
}

$('ev-seating-save').addEventListener('click', async ()=>{
  if(!EV_EDIT) return;
  const m=$('ev-seating-msg'); m.style.display='none';
  const overrides=[];
  $('ev-seating-list').querySelectorAll('[data-label]').forEach(row=>{
    const minRaw=row.querySelector('.ev-seat-min').value.trim();
    const maxRaw=row.querySelector('.ev-seat-max').value.trim();
    if(minRaw===''&&maxRaw==='') return; // ничего не задали для этого стола — берём план по умолчанию
    // Задали только одну границу — вторая берётся из плана по умолчанию, а не отбрасывает всю строку.
    const min = minRaw!=='' ? Number(minRaw) : Number(row.dataset.defmin);
    const max = maxRaw!=='' ? Number(maxRaw) : Number(row.dataset.defmax);
    overrides.push({ table_label: row.dataset.label, capacity_min:min, capacity_max:max });
  });
  const btn=$('ev-seating-save'); btn.disabled=true;
  try{
    const r=await fetch(api('admin-event-overrides'),{method:'POST',...F,headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ event_id:EV_EDIT.id, overrides })});
    if(r.status===401){ handle401(); return; }
    const d=await r.json().catch(()=>({}));
    if(r.ok&&d.ok) msg(m,'Рассадка сохранена.',true);
    else msg(m,'Ошибка: '+(d.detail||d.error||'?'),false);
  }catch(e){ msg(m,'Сетевая ошибка.',false); }
  finally{ btn.disabled=false; }
});


$('ev-searchbtn').addEventListener('click', evSearch);
$('ev-query').addEventListener('keydown', e => { if(e.key==='Enter'){ e.preventDefault(); evSearch(); } });

async function evSearch(){
  const q=$('ev-query').value.trim(); if(!q) return;
  const box=$('ev-results'); box.innerHTML='<div class="hint">Поиск…</div>';
  try{
    const u=new URL(api('tmdb-search'), location.origin); u.searchParams.set('q', q);
    const r=await fetch(u, F); const d=await r.json();
    const mv=d.movies||[];
    if(!mv.length){ box.innerHTML='<div class="hint">Ничего не найдено.</div>'; return; }
    box.innerHTML='';
    mv.forEach(m=>{
      const c=document.createElement('div'); c.className='mcard';
      const yr=m.year?' ('+m.year+')':'';
      c.innerHTML=(m.poster?'<img src="'+esc(m.poster)+'">':'<div class="noposter">нет постера</div>')+'<div class="cap">'+esc(m.title)+yr+'</div>';
      c.onclick=()=>{
        document.querySelectorAll('#ev-results .mcard').forEach(k=>k.classList.remove('picked'));
        c.classList.add('picked');
        EV_PICK={ title:m.title, poster:m.poster||'', tmdb_id:m.tmdb_id||null };
        $('ev-title').value=m.title;         // подставили, но можно переписать
        $('ev-poster').value=m.poster||'';   // подставили, но можно заменить своей
        $('ev-picked').textContent='Выбрано: '+m.title+yr;
      };
      box.appendChild(c);
    });
  }catch(e){ box.innerHTML='<div class="hint">Ошибка поиска.</div>'; }
}

$('ev-format').addEventListener('change', ()=>{
  const cur=$('ev-deposit').value.trim();
  // Перезаписываем условия только если в поле стоит нетронутый шаблон:
  // отредактированный вручную текст затирать нельзя.
  const templates = Object.keys(CFG.formats).map(k=>CFG.formats[k].deposit_text);
  if(!cur || templates.indexOf(cur)!==-1){
    $('ev-deposit').value = depositTemplate($('ev-format').value);
  }
});

$('ev-cancel').addEventListener('click', evResetForm);

$('ev-create').addEventListener('click', async ()=>{
  const m=$('ev-msg'); m.style.display='none';
  // Название вводится вручную (TMDB — необязательная подсказка, только
  // подставляет название/постер для фильмов; вечеринки и концерты просто
  // вписываются в поле напрямую).
  const title = $('ev-title').value.trim();
  // Приоритет у поля: если туда вписали свой URL — используем его,
  // иначе постер выбранного в TMDB фильма, иначе прежний у события.
  const poster = $('ev-poster').value.trim()
    || (EV_PICK.title ? EV_PICK.poster : '')
    || (EV_EDIT ? (EV_EDIT.poster_url||'') : '');
  if(!title){ msg(m,'Введи название события.',false); return; }
  const price=$('ev-price').value.trim();
  if(!price){ msg(m,'Укажи цену.',false); return; }
  const btn=$('ev-create'); btn.disabled=true;
  try{
    const body={ tmdb_id:EV_PICK.tmdb_id, title, poster_url:poster, format:$('ev-format').value, price, deposit_text:$('ev-deposit').value };
    if(EV_EDIT) body.id = EV_EDIT.id;
    const r=await fetch(api('admin-events'),{method:'POST',...F,headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body)});
    if(r.status===401){ handle401(); return; }
    const d=await r.json().catch(()=>({}));
    if(r.ok&&d.ok){
      msg(m,(EV_EDIT?'Событие обновлено: ':'Событие создано: ')+d.event.title,true);
      evResetForm(); loadEventsList(); loadEventOptions();
    }
    else msg(m,'Ошибка: '+(d.detail||d.error||'?'),false);
  }catch(e){ msg(m,'Сетевая ошибка.',false); }
  finally{ btn.disabled=false; }
});

async function loadEventsList(){
  const box=$('ev-list');
  try{
    const r=await fetch(api('admin-events'), F);
    if(r.status===401){ handle401(); return; }
    const d=await r.json();
    // Во вкладке «События» — все показы, включая форматы (форматы также
    // дублируются во вкладке «Форматы» с своим ритмом публикации).
    const evs=(d.events||[]);
    box.innerHTML = evs.length ? evs.map((e,i) =>
      '<div class="srow" data-i="'+i+'" style="cursor:pointer" title="Нажми, чтобы редактировать">'+
      '<input type="checkbox" class="sel" data-id="'+esc(e.id)+'">'+
      (e.poster_url?'<img src="'+esc(e.poster_url)+'">':'<img>')+
      '<div class="info"><div class="t">'+esc(e.title)+'</div><div class="d">'+esc(e.format)+' · '+esc(String(e.price))+' GEL'+(e.poster_url?'':' · без постера')+'</div></div>'+
      '<button class="btn small ghost">Изм.</button></div>'
    ).join('') : '<div class="hint">Событий нет.</div>';
    box.querySelectorAll('input.sel').forEach(cb=>{
      cb.addEventListener('click', e=>e.stopPropagation());
      cb.addEventListener('change', evBatchRefresh);
    });
    box.querySelectorAll('.srow').forEach(row=>{
      row.onclick=()=>{
        const e=evs[Number(row.dataset.i)];
        EV_EDIT={ id:e.id, title:e.title, poster_url:e.poster_url||'' };
        EV_PICK={ title:'', poster:'', tmdb_id:null };
        $('ev-title').value=e.title||'';
        $('ev-format').value=e.format||'mov';
        $('ev-price').value=e.price;
        $('ev-poster').value=e.poster_url||'';
        $('ev-deposit').value=e.deposit_text||depositTemplate($('ev-format').value);
        $('ev-picked').textContent='Редактирование: '+e.title+(e.poster_url?'':' — постера нет, найди фильм в TMDB или впиши свой URL выше');
        $('ev-create').textContent='Сохранить изменения';
        $('ev-cancel').style.display='inline-block';
        $('ev-seating').style.display='';
        loadEventSeating(e.id);
        window.scrollTo({top:0,behavior:'smooth'});
      };
    });
  }catch(e){ box.innerHTML='<div class="hint">Ошибка.</div>'; }
}

// ---------- ФОРМАТЫ ----------
// Киноужины и прочие форматы расписываются на месяц вперёд, поэтому показываем
// их вместе с ближайшими сеансами — видно, что уже поставлено в расписание.

async function loadFormats(){
  const box=$('fmt-list');
  box.innerHTML='<div class="hint">Загрузка…</div>';
  try{
    const [er, sr] = await Promise.all([
      fetch(api('admin-events'), F),
      fetch(api('admin-sessions'), F)
    ]);
    if(er.status===401 || sr.status===401){ handle401(); return; }
    const ed=await er.json(), sd=await sr.json();
    const evs=(ed.events||[]).filter(e=>e.format!=='mov');
    const ss=sd.sessions||[];

    if(!evs.length){ box.innerHTML='<div class="hint">Событий-форматов нет. Создай во вкладке «События», выбрав формат din, drink или alacarte.</div>'; return; }

    const groups={};
    evs.forEach(e=>{ (groups[e.format]=groups[e.format]||[]).push(e); });

    box.innerHTML = Object.keys(groups).map(fmt=>{
      const title=(CFG.formats[fmt]||{}).title || fmt;
      const list=groups[fmt];
      const rows=list.map(e=>{
        const mine=ss.filter(x=>x.event_id===e.id);
        const chips=mine.length
          ? mine.map(x=>'<span data-open="'+esc(x.id)+'">'+esc(x.date)+' '+esc(x.time)+'</span>').join('')
          : '<span style="background:none;color:#bbb;cursor:default">сеансов нет</span>';
        return '<div class="fmt-ev">'+
          '<div class="fmt-ev__t"><span class="fmt-ev__n">'+esc(e.title)+'</span>'+
            '<span class="hint">'+esc(String(e.price))+' GEL · '+mine.length+' сеанс.</span></div>'+
          '<div class="fmt-ss">'+chips+'</div></div>';
      }).join('');
      return '<div class="fmt-grp"><div class="fmt-grp__h"><b>'+esc(title)+'</b>'+
        '<span>'+list.length+' событий</span></div>'+rows+'</div>';
    }).join('');

    box.querySelectorAll('[data-open]').forEach(el=>el.onclick=()=>openSession(el.dataset.open));
  }catch(e){ box.innerHTML='<div class="hint">Ошибка загрузки.</div>'; }
}

// ---------- УПРАВЛЕНИЕ ФОРМАТАМИ (создание/редактирование/удаление) ----------
let FM_EDIT = null; // код формата, который сейчас редактируем

function fmResetForm(){
  FM_EDIT=null;
  $('fm-code').value=''; $('fm-code').disabled=false;
  $('fm-title').value=''; $('fm-kind').value='deposit'; $('fm-deposit').value='';
  $('fm-create').textContent='Добавить формат';
  $('fm-cancel').style.display='none';
}

$('fm-cancel').addEventListener('click', fmResetForm);

$('fm-create').addEventListener('click', async ()=>{
  const m=$('fm-msg'); m.style.display='none';
  const code=$('fm-code').value.trim().toLowerCase();
  const title=$('fm-title').value.trim();
  if(!FM_EDIT && !/^[a-z0-9_-]{1,32}$/.test(code)){ msg(m,'Код: латиница/цифры/-/_, до 32 символов.',false); return; }
  if(!title){ msg(m,'Укажи название.',false); return; }
  const body={
    id: FM_EDIT || undefined,
    code: FM_EDIT ? undefined : code,
    title,
    price_kind: $('fm-kind').value,
    deposit_text: $('fm-deposit').value
  };
  const btn=$('fm-create'); btn.disabled=true;
  try{
    const r=await fetch(api('admin-formats'),{method:'POST',...F,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(r.status===401){ handle401(); return; }
    const d=await r.json().catch(()=>({}));
    if(r.ok&&d.ok){
      msg(m,(FM_EDIT?'Формат обновлён: ':'Формат создан: ')+d.format.title,true);
      fmResetForm();
      await loadFormatsCfg(); fillFormatSelects();
      loadFormatMgmt(); loadFormats();
    }
    else msg(m,'Ошибка: '+(d.detail||d.error||'?'),false);
  }catch(e){ msg(m,'Сетевая ошибка.',false); }
  finally{ btn.disabled=false; }
});

async function loadFormatMgmt(){
  const box=$('fm-mgmt-list');
  try{
    const r=await fetch(api('admin-formats'), F);
    if(r.status===401){ handle401(); return; }
    const d=await r.json();
    const list=d.formats||[];
    box.innerHTML = list.length ? list.map((f,i)=>
      '<div class="srow" data-i="'+i+'" style="cursor:pointer" title="Нажми, чтобы редактировать">'+
      '<div class="info"><div class="t">'+esc(f.title)+'</div><div class="d">'+esc(f.code)+' · '+esc(f.price_kind==='included'?'включено в стоимость':'депозит')+'</div></div>'+
      '<button class="btn small ghost" data-del="'+esc(f.code)+'">Удалить</button></div>'
    ).join('') : '<div class="hint">Форматов нет.</div>';
    box.querySelectorAll('.srow').forEach(row=>{
      row.addEventListener('click', (e)=>{
        if(e.target.closest('[data-del]')) return;
        const f=list[Number(row.dataset.i)];
        FM_EDIT=f.code;
        $('fm-code').value=f.code; $('fm-code').disabled=true;
        $('fm-title').value=f.title;
        $('fm-kind').value=f.price_kind||'deposit';
        $('fm-deposit').value=f.deposit_text||'';
        $('fm-create').textContent='Сохранить изменения';
        $('fm-cancel').style.display='inline-block';
        window.scrollTo({top:0,behavior:'smooth'});
      });
    });
    box.querySelectorAll('[data-del]').forEach(btn=>{
      btn.addEventListener('click', async (e)=>{
        e.stopPropagation();
        const code=btn.dataset.del;
        if(!confirm('Удалить формат «'+code+'»? События с этим форматом останутся, но формат пропадёт из списков.')) return;
        try{
          const r=await fetch(api('admin-formats'),{method:'POST',...F,headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'delete',code})});
          if(r.status===401){ handle401(); return; }
          await loadFormatsCfg(); fillFormatSelects();
          loadFormatMgmt(); loadFormats();
        }catch(e){ alert('Сетевая ошибка.'); }
      });
    });
  }catch(e){ box.innerHTML='<div class="hint">Ошибка загрузки.</div>'; }
}

// ---------- SESSIONS ----------
async function loadEventOptions(){
  try{
    const r=await fetch(api('admin-events'), F);
    if(r.status===401){ handle401(); return; }
    const d=await r.json(); const evs=d.events||[];
    $('ss-event').innerHTML = '<option value="">Выбери событие</option>'+
      evs.map(e=>'<option value="'+esc(e.id)+'">'+esc(e.title)+' ('+esc(e.format)+', '+esc(String(e.price))+' GEL)</option>').join('');
  }catch(e){ $('ss-event').innerHTML='<option value="">Ошибка</option>'; }
}

let SS_EDIT = null; // session id being edited

function ssResetForm(){
  SS_EDIT=null;
  $('ss-event').value=''; $('ss-date').value=''; $('ss-time').value=''; $('ss-poster').value='';
  $('ss-create').textContent='Создать сеанс';
  $('ss-cancel').style.display='none';
}
$('ss-cancel').addEventListener('click', ssResetForm);

$('ss-create').addEventListener('click', async ()=>{
  const m=$('ss-msg'); m.style.display='none';
  const event_id=$('ss-event').value, date=$('ss-date').value.trim(), time=$('ss-time').value.trim();
  if(!SS_EDIT && (!event_id||!date||!time)){ msg(m,'Выбери событие, дату и время.',false); return; }
  if(SS_EDIT && !event_id && !date && !time){ msg(m,'Нечего менять.',false); return; }
  const btn=$('ss-create'); btn.disabled=true;
  try{
    const body={event_id,date,time,poster_url:$('ss-poster').value.trim()};
    if(SS_EDIT) body.id = SS_EDIT;
    const r=await fetch(api('admin-sessions'),{method:'POST',...F,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(r.status===401){ handle401(); return; }
    const d=await r.json().catch(()=>({}));
    if(r.ok&&d.ok){
      if(SS_EDIT){ msg(m,'Сеанс обновлён.',true); ssResetForm(); }
      else {
        // Ссылка на текущий домен: работает и на vercel.app до переключения DNS,
        // и на spot-bar.site после — без правки кода.
        const link=location.origin+'/reserve?session_id='+d.session.id;
        msg(m,'Сеанс создан. Ссылка: '+link,true);
        $('ss-date').value=''; $('ss-time').value='';
      }
      loadSessionsList(); loadToday();
    } else msg(m,'Ошибка: '+(d.detail||d.error||'?'),false);
  }catch(e){ msg(m,'Сетевая ошибка.',false); }
  finally{ btn.disabled=false; }
});

async function loadSessionsList(){
  const box=$('ss-list');
  try{
    const r=await fetch(api('admin-sessions'), F);
    if(r.status===401){ handle401(); return; }
    const d=await r.json(); const ss=d.sessions||[];
    box.innerHTML = ss.length ? ss.map((s,i) => {
      const link=location.origin+'/reserve?session_id='+s.id;
      return '<div class="srow'+(s.is_archived?' arch':'')+'" data-i="'+i+'">'+
        '<input type="checkbox" class="sel" data-id="'+esc(s.id)+'">'+
        (s.poster_url?'<img src="'+esc(s.poster_url)+'">':'<img>')+
        '<div class="info"><div class="t">'+esc(s.title)+'</div><div class="d">'+esc(s.date)+' · '+esc(s.time)+' · '+esc(String(s.price))+' GEL'+(s.own_poster_url?' · свой постер':'')+'</div></div>'+
        '<button class="btn small ghost" data-edit="'+esc(s.id)+'">Изм.</button>'+
        '<button class="btn small ghost" data-link="'+esc(link)+'">Ссылка</button></div>';
    }).join('') : '<div class="hint">Сеансов нет.</div>';
    box.querySelectorAll('button[data-link]').forEach(b=>{
      b.onclick=async()=>{
        try{ await navigator.clipboard.writeText(b.dataset.link); b.textContent='Скопировано!'; setTimeout(()=>b.textContent='Ссылка',1500); }
        catch(e){ prompt('Скопируй ссылку:', b.dataset.link); }
      };
    });
    box.querySelectorAll('input.sel').forEach(cb=>{
      cb.addEventListener('change', ssBatchRefresh);
    });
    box.querySelectorAll('button[data-edit]').forEach(b=>{
      b.onclick=()=>{
        const s=ss.find(x=>x.id===b.dataset.edit);
        SS_EDIT=s.id;
        $('ss-event').value=s.event_id||'';
        $('ss-date').value=s.date||''; $('ss-time').value=s.time||'';
        $('ss-poster').value=s.own_poster_url||'';   // своё, не унаследованное от события
        $('ss-create').textContent='Сохранить изменения';
        $('ss-cancel').style.display='inline-block';
        window.scrollTo({top:0,behavior:'smooth'});
      };
    });
  }catch(e){ box.innerHTML='<div class="hint">Ошибка.</div>'; }
}

// ---------- MANUAL BOOKING (FAB + modal) ----------
let MB_BOOKED=new Set();
$('fab').addEventListener('click', async ()=>{
  $('mb-modal').classList.add('open');
  // fill sessions
  try{
    const r=await fetch(api('admin-sessions'), F);
    if(r.status===401){ handle401(); return; }
    const d=await r.json(); const ss=d.sessions||[];
    $('mb-session').innerHTML='<option value="">Выбери сеанс</option>'+
      ss.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.title)+' — '+esc(s.date)+' '+esc(s.time)+'</option>').join('');
  }catch(e){ $('mb-session').innerHTML='<option value="">Ошибка</option>'; }
  renderMbSeats();
});
$('mb-close').addEventListener('click', ()=>$('mb-modal').classList.remove('open'));
$('mb-modal').addEventListener('click', (e)=>{ if(e.target===$('mb-modal')) $('mb-modal').classList.remove('open'); });

function renderMbSeats(){
  const box=$('mb-seats'); box.innerHTML='';
  const ready=!!$('mb-session').value;
  SEATS.forEach(label=>{
    const el=document.createElement('div'); el.className='seat'; el.textContent=label;
    const bk=MB_BOOKED.has(label.toLowerCase());
    if(ready) el.classList.add(bk?'booked':'free');
    if($('mb-table').value===label && !bk) el.classList.add('picked');
    el.onclick=()=>{ if(bk||!ready) return; $('mb-table').value=label; renderMbSeats(); };
    box.appendChild(el);
  });
}

$('mb-session').addEventListener('change', async ()=>{
  $('mb-table').value=''; MB_BOOKED=new Set();
  const sid=$('mb-session').value;
  if(!sid){ renderMbSeats(); return; }
  $('mb-seatshint').textContent='Загрузка занятости…';
  try{
    const u=new URL(api('availability'), location.origin); u.searchParams.set('session_id', sid);
    const r=await fetch(u); const d=await r.json();
    const bk=d.booked||[];
    MB_BOOKED=new Set(bk.map(t=>String(t).trim().toLowerCase()));
    $('mb-seatshint').textContent = bk.length ? ('Занято: '+bk.join(', ')) : 'Все столы свободны.';
  }catch(e){ $('mb-seatshint').textContent='Ошибка загрузки занятости.'; }
  renderMbSeats();
});

$('mb-submit').addEventListener('click', async ()=>{
  const m=$('mb-msg'); m.style.display='none';
  const p={ session_id:$('mb-session').value, table:$('mb-table').value.trim(),
    name:$('mb-name').value.trim(), phone:$('mb-phone').value.trim(),
    instagram:$('mb-instagram').value.trim(),
    guests:$('mb-guests').value.trim(), amount:$('mb-amount').value.trim(),
    payment_status:$('mb-payment').value,
    comment:$('mb-comment').value.trim() };
  if(!p.session_id||!p.table){ msg(m,'Выбери сеанс и стол.',false); return; }
  const btn=$('mb-submit'); btn.disabled=true; btn.textContent='Сохранение…';
  try{
    const r=await fetch(api('manual-booking'),{method:'POST',...F,headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});
    if(r.status===401){ handle401(); return; }
    const d=await r.json().catch(()=>({}));
    if(r.ok&&d.ok){
      msg(m,'Бронь создана: '+d.table+', '+d.title+' '+d.date+' '+d.time,true);
      $('mb-name').value=''; $('mb-phone').value=''; $('mb-instagram').value=''; $('mb-amount').value=''; $('mb-table').value=''; $('mb-comment').value='';
      $('mb-session').dispatchEvent(new Event('change'));
      loadToday();
    } else if(r.status===409){ msg(m,'Стол уже занят на этот сеанс.',false); $('mb-session').dispatchEvent(new Event('change')); }
    else msg(m,'Ошибка: '+(d.detail||d.error||'?'),false);
  }catch(e){ msg(m,'Сетевая ошибка.',false); }
  finally{ btn.disabled=false; btn.textContent='Создать бронь'; }
});

// ---------- ОБСЛУЖИВАНИЕ ----------
// Дашборд — основной канал: он не зависит от мессенджера. Если бот отвалится,
// заказы всё равно видны здесь, поэтому лента сама подтягивается каждые 15 с,
// а в заголовке вкладки висит счётчик непринятых.

const SVC_KIND = { waiter:'Официант', bill:'Счёт', blanket:'Плед', charger:'Зарядка', ashtray:'Пепельница' };
let SVC_TIMER = null;

function ago(iso){
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime())/1000));
  if(s < 60) return s + ' сек назад';
  const m = Math.floor(s/60);
  if(m < 60) return m + ' мин назад';
  const h = Math.floor(m/60);
  if(h < 24) return h + ' ч назад';
  return new Date(iso).toLocaleString('ru-RU');
}

function startSvcPoll(){
  if(SVC_TIMER) clearInterval(SVC_TIMER);
  SVC_TIMER = setInterval(()=>{ if($('svc-auto')?.checked) loadSvc(true); }, 15000);
}

async function loadSvc(quiet){
  const reqBox = $('svc-reqs'), ordBox = $('svc-orders');
  if(!quiet){ reqBox.innerHTML='<div class="hint">Загрузка…</div>'; ordBox.innerHTML='<div class="hint">Загрузка…</div>'; }
  try{
    const u = new URL(api('admin-service'), location.origin);
    u.searchParams.set('hours', $('svc-hours').value);
    const r = await fetch(u, F);
    if(r.status===401){ handle401(); return; }
    const d = await r.json();

    const reqs = d.requests || [], orders = d.orders || [];

    // счётчик непринятых
    const pending = reqs.filter(x=>x.status==='new').length + orders.filter(o=>o.status==='new').length;
    const badge = $('svc-badge');
    if(badge){ badge.textContent = pending || ''; badge.classList.toggle('on', pending>0); }
    document.title = pending ? ('(' + pending + ') SPOT. — админ') : 'SPOT. — админ';
    $('svc-stamp').textContent = 'обновлено ' + new Date().toLocaleTimeString('ru-RU');

    reqBox.innerHTML = reqs.length ? reqs.map(x =>
      '<div class="svc '+esc(x.status)+'">'+
        '<div class="svc__top"><span class="svc__seat">'+esc(x.table_label)+'</span>'+
          '<span class="svc__when">'+esc(ago(x.created_at))+'</span></div>'+
        '<div class="svc__kind">'+esc(SVC_KIND[x.kind]||x.kind)+'</div>'+
        (x.comment?'<div class="svc__note">'+esc(x.comment)+'</div>':'')+
        (x.status==='new'
          ? '<div class="svc__acts"><button class="btn small" data-rq="'+esc(x.id)+'" data-st="done">Выполнено</button></div>'
          : '')+
      '</div>'
    ).join('') : '<div class="hint">Просьб нет.</div>';

    ordBox.innerHTML = orders.length ? orders.map(o => {
      const lines = (o.items||[]).map(i =>
        '<div class="li"><span>'+esc(i.title)+' × '+esc(String(i.qty))+'</span><span>'+esc(String(Number(i.price)*i.qty))+' GEL</span></div>'
      ).join('');
      const acts = o.status==='new'
        ? '<button class="btn small" data-or="'+esc(o.id)+'" data-st="accepted">Принять</button>'+
          '<button class="btn small ghost" data-or="'+esc(o.id)+'" data-st="cancelled">Отменить</button>'
        : (o.status==='accepted'
            ? '<button class="btn small" data-or="'+esc(o.id)+'" data-st="done">Готово</button>'
            : '');
      return '<div class="svc '+esc(o.status)+'">'+
        '<div class="svc__top"><span class="svc__seat">'+esc(o.table_label)+
          (o.mode==='takeaway'?' <span class="badge manual">с собой</span>':'')+
          (o.guest_name?' · '+esc(o.guest_name):'')+'</span>'+
          '<span class="svc__when">'+esc(ago(o.created_at))+'</span></div>'+
        '<div class="svc__body">'+lines+'<div class="svc__total">Итого: '+esc(String(Number(o.total)))+' GEL</div></div>'+
        (o.comment?'<div class="svc__note">'+esc(o.comment)+'</div>':'')+
        (acts?'<div class="svc__acts">'+acts+'</div>':'')+
      '</div>';
    }).join('') : '<div class="hint">Заказов нет.</div>';

    ordBox.querySelectorAll('button[data-or]').forEach(b=>{
      b.onclick=()=>svcSet({ kind:'order', id:b.dataset.or, status:b.dataset.st });
    });
    reqBox.querySelectorAll('button[data-rq]').forEach(b=>{
      b.onclick=()=>svcSet({ kind:'request', id:b.dataset.rq, status:b.dataset.st });
    });
  }catch(e){
    if(!quiet){ ordBox.innerHTML='<div class="hint">Ошибка загрузки.</div>'; }
  }
}

async function svcSet(payload){
  try{
    const r=await fetch(api('admin-service'),{method:'POST',...F,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(r.status===401){ handle401(); return; }
    const d=await r.json().catch(()=>({}));
    if(r.ok&&d.ok) loadSvc(true);
    else alert('Ошибка: '+(d.detail||d.error||'?'));
  }catch(e){ alert('Сетевая ошибка.'); }
}

$('svc-reload').addEventListener('click', ()=>loadSvc());
$('svc-hours').addEventListener('change', ()=>loadSvc());

// ---------- ФИНАНСЫ ----------
// Считаем по данным, которые и так проходят через систему. Главное различие,
// без которого отчёт врёт: у обычных показов и à la carte цена брони —
// депозит (вычитается из счёта), у киноужина и drinking night — полная
// стоимость. Поэтому суммы разнесены, а не сложены в одну «выручку».

let FIN = null;

function finIsoToday(shiftDays){
  const d=new Date(Date.now()+4*3600*1000+(shiftDays||0)*86400000);
  return d.toISOString().slice(0,10);
}
function finMonth(offset){
  const n=new Date(Date.now()+4*3600*1000);
  const y=n.getUTCFullYear(), m=n.getUTCMonth()+(offset||0);
  const a=new Date(Date.UTC(y,m,1)), b=new Date(Date.UTC(y,m+1,0));
  return { from:a.toISOString().slice(0,10), to:b.toISOString().slice(0,10) };
}
function finFmtIso(iso){
  const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? (m[3]+'-'+m[2]+'-'+m[1]) : iso;
}
function money(v){ return (Math.round((Number(v)||0)*100)/100).toLocaleString('ru-RU'); }

async function loadFinance(){
  const box=$('fin-body');
  if(!$('fin-from').value){
    const r=finMonth(0);
    $('fin-from').value=finFmtIso(r.from);
    $('fin-to').value=finFmtIso(r.to);
  }
  box.innerHTML='<div class="hint">Загрузка…</div>';
  try{
    const u=new URL(api('admin-finance'), location.origin);
    u.searchParams.set('from', finIsoFromField('fin-from'));
    u.searchParams.set('to', finIsoFromField('fin-to'));
    const r=await fetch(u, F);
    if(r.status===401){ handle401(); return; }
    const d=await r.json();
    if(!r.ok || !d.ok){ box.innerHTML='<div class="hint">Ошибка: '+esc(d.detail||d.error||'?')+'</div>'; return; }
    FIN=d;
    $('fin-fee').value=d.settings.acquiring_fee_pct;
    $('fin-tax').value=d.settings.tax_pct;
    finRender();
  }catch(e){ box.innerHTML='<div class="hint">Сетевая ошибка.</div>'; }
}

// Поля показывают ДД-ММ-ГГГГ, а API ждёт ISO
function finIsoFromField(id){
  const m=String($(id).value||'').match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return m ? (m[3]+'-'+m[2]+'-'+m[1]) : $(id).value;
}

function finRender(){
  const t=FIN.totals, s=FIN.settings;
  const cur=s.currency||'GEL';

  const ordersActive=(FIN.orders||[]).filter(o=>o.status!=='cancelled')
    .reduce((n,o)=>n+Number(o.total||0),0);

  const cards =
    '<div class="fin-cards">'+
      '<div class="fin-card accent"><div class="l">Получено по броням</div><div class="v">'+money(t.taxBase)+' '+esc(cur)+'</div>'+
        '<div class="s">билеты '+money(t.ticketsPaid)+' + депозиты '+money(t.depositsPaid)+'</div></div>'+
      '<div class="fin-card"><div class="l">Онлайн через банк</div><div class="v">'+money(t.onlineCaptured)+' '+esc(cur)+'</div>'+
        '<div class="s">комиссия '+money(t.fee)+' ('+esc(String(s.acquiring_fee_pct))+'%)</div></div>'+
      '<div class="fin-card"><div class="l">На месте (ручные брони)</div><div class="v">'+money(t.manualAmount)+' '+esc(cur)+'</div>'+
        '<div class="s">наличные и терминал</div></div>'+
      '<div class="fin-card"><div class="l">Налог '+esc(String(s.tax_pct))+'%</div><div class="v">'+money(t.tax)+' '+esc(cur)+'</div>'+
        '<div class="s">справочно, от '+money(t.taxBase)+'</div></div>'+
      '<div class="fin-card"><div class="l">После комиссии и налога</div><div class="v">'+money(t.netAfterFeeAndTax)+' '+esc(cur)+'</div>'+
        '<div class="s">'+t.bookings+' броней · '+t.guests+' гостей</div></div>'+
      '<div class="fin-card"><div class="l">Заказы со столика</div><div class="v">'+money(ordersActive)+' '+esc(cur)+'</div>'+
        '<div class="s">оборот кухни и бара, оплата мимо системы</div></div>'+
    '</div>';

  const note =
    '<div class="fin-note"><b>Как читать.</b> «Получено по броням» — это полная стоимость киноужинов и drinking night '+
    'плюс депозиты обычных показов и à la carte. Депозит потом вычитается из счёта гостя, поэтому он не равен '+
    'итоговой выручке вечера. Заказы со столика показаны отдельно: они оплачиваются наличными или на терминале, '+
    'мимо системы. Комиссия и налог — расчёт по заданным ставкам, сверяйтесь с бухгалтером.'+
    (t.depositsUnpaid+t.ticketsUnpaid>0
      ? ' Неоплаченных броней на '+money(t.depositsUnpaid+t.ticketsUnpaid)+' '+esc(cur)+' — в расчёт не вошли.'
      : '')+
    '</div>';

  const rows=(FIN.days||[]).map(d=>
    '<tr><td>'+esc(d.date)+'</td>'+
      '<td class="num">'+d.bookings+'</td>'+
      '<td class="num">'+d.guests+'</td>'+
      '<td class="num">'+money(d.tickets)+'</td>'+
      '<td class="num">'+money(d.deposits)+'</td>'+
      '<td class="num">'+money(d.online)+'</td>'+
      '<td class="num">'+money(d.manual)+'</td>'+
      '<td class="num">'+money(d.tickets+d.deposits)+'</td></tr>'
  ).join('');

  const tbl = rows
    ? '<div class="card" style="overflow-x:auto"><table class="fin-tbl">'+
      '<thead><tr><th>Дата</th><th class="num">Броней</th><th class="num">Гостей</th>'+
      '<th class="num">Билеты</th><th class="num">Депозиты</th><th class="num">Онлайн</th>'+
      '<th class="num">На месте</th><th class="num">Всего</th></tr></thead>'+
      '<tbody>'+rows+'</tbody>'+
      '<tfoot><tr><td>Итого</td><td class="num">'+t.bookings+'</td><td class="num">'+t.guests+'</td>'+
      '<td class="num">'+money(t.ticketsPaid+t.ticketsUnpaid)+'</td>'+
      '<td class="num">'+money(t.depositsPaid+t.depositsUnpaid)+'</td>'+
      '<td class="num">'+money(t.onlineAmount)+'</td><td class="num">'+money(t.manualAmount)+'</td>'+
      '<td class="num">'+money(t.ticketsPaid+t.depositsPaid)+'</td></tr></tfoot></table></div>'
    : '<div class="card"><div class="hint">За этот период броней нет.</div></div>';

  // Сверка: расхождение значит, что callback банка не дошёл и бронь
  // не создалась — это надо чинить, а не списывать на округление.
  const diff = Number(t.onlineCaptured) - Number(t.onlineAmount);
  const recon = Math.abs(diff) > 0.5
    ? '<div class="fin-note">Банк показывает '+money(t.onlineCaptured)+' '+esc(cur)+
      ' онлайн-оплат, а по броням проходит '+money(t.onlineAmount)+' '+esc(cur)+
      '. Разница '+money(diff)+' — обычно это платёж, по которому не дошёл callback: проверьте «для Эрика».</div>'
    : '';

  const top=(FIN.topItems||[]).length
    ? '<div class="card"><label style="font-size:13px;font-weight:600">Что заказывают со столиков</label>'+
      '<table class="fin-tbl" style="margin-top:8px"><thead><tr><th>Позиция</th><th class="num">Шт.</th><th class="num">Сумма</th></tr></thead><tbody>'+
      FIN.topItems.map(i=>'<tr><td>'+esc(i.title)+'</td><td class="num">'+i.qty+'</td><td class="num">'+money(i.amount)+'</td></tr>').join('')+
      '</tbody></table></div>'
    : '';

  $('fin-body').innerHTML = cards + note + recon + tbl + top;
}

$('fin-go').addEventListener('click', loadFinance);
$('fin-month').addEventListener('click', ()=>{
  const r=finMonth(0);
  $('fin-from').value=finFmtIso(r.from); $('fin-to').value=finFmtIso(r.to); loadFinance();
});
$('fin-prev-month').addEventListener('click', ()=>{
  const r=finMonth(-1);
  $('fin-from').value=finFmtIso(r.from); $('fin-to').value=finFmtIso(r.to); loadFinance();
});
$('fin-from').addEventListener('click', ()=>{
  calOpen($('fin-from'), parseDdMm($('fin-from').value), d=>{ $('fin-from').value=fmtDdMm(d); });
});
$('fin-to').addEventListener('click', ()=>{
  calOpen($('fin-to'), parseDdMm($('fin-to').value), d=>{ $('fin-to').value=fmtDdMm(d); });
});

// Выгрузка для бухгалтера: CSV с разделителем «;» и BOM — иначе Excel
// открывает кириллицу кракозябрами и не разбивает строку на колонки.
$('fin-csv').addEventListener('click', ()=>{
  if(!FIN) return;
  const rows=[['Дата','Броней','Гостей','Билеты','Депозиты','Онлайн','На месте','Всего']];
  (FIN.days||[]).forEach(d=>rows.push([d.date,d.bookings,d.guests,d.tickets,d.deposits,d.online,d.manual,d.tickets+d.deposits]));
  const t=FIN.totals;
  rows.push([]);
  rows.push(['Итого получено по броням', t.taxBase]);
  rows.push(['в т.ч. билеты (полная стоимость)', t.ticketsPaid]);
  rows.push(['в т.ч. депозиты', t.depositsPaid]);
  rows.push(['Онлайн по данным банка', t.onlineCaptured]);
  rows.push(['Комиссия эквайринга '+FIN.settings.acquiring_fee_pct+'%', t.fee]);
  rows.push(['Налог '+FIN.settings.tax_pct+'%', t.tax]);
  rows.push(['После комиссии и налога', t.netAfterFeeAndTax]);
  const csv='\\ufeff'+rows.map(r=>r.join(';')).join('\\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  a.download='spot-finance-'+finIsoFromField('fin-from')+'_'+finIsoFromField('fin-to')+'.csv';
  a.click();
  URL.revokeObjectURL(a.href);
});

$('fin-save').addEventListener('click', async ()=>{
  const m=$('fin-msg'); m.style.display='none';
  try{
    const r=await fetch(api('admin-finance'),{method:'POST',...F,headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ acquiring_fee_pct:$('fin-fee').value, tax_pct:$('fin-tax').value })});
    if(r.status===401){ handle401(); return; }
    const d=await r.json().catch(()=>({}));
    if(r.ok&&d.ok){ msg(m,'Ставки сохранены.',true); loadFinance(); }
    else msg(m,'Ошибка: '+(d.detail||d.error||'?'),false);
  }catch(e){ msg(m,'Сетевая ошибка.',false); }
});

// ---------- ОКНО СЕАНСА ----------
// Рабочее окно администратора: схема зала с занятыми местами и список броней
// с контактами. Отсюда же бронь правится, переносится и отменяется — раньше
// для этого приходилось лезть в базу.

let SD = null;          // текущий сеанс
let SD_EDIT = null;     // id брони в режиме правки

async function openSession(sessionId){
  $('sd-bg').classList.add('open');
  $('sd-title').textContent='Загрузка…';
  $('sd-meta').textContent=''; $('sd-stats').innerHTML='';
  $('sd-plan').innerHTML=''; $('sd-list').innerHTML='';
  try{
    const u=new URL(api('admin-bookings'), location.origin);
    u.searchParams.set('session_id', sessionId);
    const r=await fetch(u, F);
    if(r.status===401){ handle401(); return; }
    const d=await r.json();
    if(!r.ok || !d.ok){ $('sd-title').textContent='Не удалось открыть сеанс'; return; }
    SD=d; SD_EDIT=null;
    sdRender();
  }catch(e){ $('sd-title').textContent='Сетевая ошибка'; }
}

$('sd-close').addEventListener('click', ()=>$('sd-bg').classList.remove('open'));
$('sd-bg').addEventListener('click', e=>{ if(e.target===$('sd-bg')) $('sd-bg').classList.remove('open'); });

function sdRender(){
  if(!SD) return;
  const s=SD.session, t=SD.totals;

  $('sd-poster').src = s.poster_url || '';
  $('sd-poster').style.visibility = s.poster_url ? 'visible' : 'hidden';
  $('sd-title').textContent = s.title;
  $('sd-meta').textContent = s.date+' · '+s.time+' · '+s.format+' · '+s.price+' GEL';

  $('sd-stats').innerHTML =
    '<div class="sd__stat">Броней<b>'+t.bookings+'</b></div>'+
    '<div class="sd__stat">Гостей<b>'+t.guests+'</b></div>'+
    '<div class="sd__stat">Свободно столов<b>'+t.free+'</b></div>'+
    '<div class="sd__stat">Закрыто<b>'+(SD.blocks||[]).length+'</b></div>'+
    '<div class="sd__stat">Сумма<b>'+Number(t.revenue)+' GEL</b></div>';

  // схема: занятые столы подписаны именем гостя
  const byLabel={};
  SD.bookings.forEach(b=>{ byLabel[b.table_label]=b; });
  const W=Number(SD.plan.settings.canvas_w)||1000, H=Number(SD.plan.settings.canvas_h)||700;
  const blocked={};
  (SD.blocks||[]).forEach(b=>{ blocked[b.table_label]=b.reason||''; });
  const box=$('sd-plan');
  const avail=box.parentElement.clientWidth-24;
  const scale=Math.min(1, avail/W);
  box.style.width=W+'px'; box.style.height=H+'px';
  box.style.transform='scale('+scale+')';
  box.parentElement.style.height=(H*scale+4)+'px';

  box.innerHTML = SD.plan.tables.map(p=>{
    const b=byLabel[p.label];
    const isBlocked = (p.label in blocked);
    const cls = b ? 'busy' : ((p.bookable===false || isBlocked) ? 'closed' : '');
    const sel = (b && b.id===SD_EDIT) ? ' sel' : '';
    const style='left:'+p.x+'px;top:'+p.y+'px;width:'+p.w+'px;height:'+p.h+'px;'+
      'border-radius:'+(p.shape==='circle'?'50%':'8px')+';'+
      (p.rotation?('transform:rotate('+p.rotation+'deg);'):'');
    const note = b ? (b.guest_name||'—')
      : (isBlocked ? (blocked[p.label] || 'закрыт')
      : (p.bookable===false ? 'закрыт' : 'свободен'));
    return '<div class="sdt '+cls+sel+'" data-seat="'+esc(p.label)+'" style="'+style+'">'+
      '<span>'+esc(p.label.replace('Стол ','').replace('Бар ','B'))+
      '<small>'+esc(note)+'</small></span></div>';
  }).join('');

  // Клик по столу: занятый — прокрутка к брони, свободный — закрыть на этот
  // сеанс, закрытый — открыть обратно. Частая операция за стойкой.
  box.querySelectorAll('[data-seat]').forEach(el=>el.onclick=()=>{
    const label=el.dataset.seat;
    const b=byLabel[label];
    if(b){
      const card=document.querySelector('[data-bk="'+b.id+'"]');
      if(card) card.scrollIntoView({ behavior:'smooth', block:'center' });
      return;
    }
    if(label in blocked){
      if(confirm('Открыть «'+label+'» для брони с сайта?')) sdBlock(label, false);
      return;
    }
    const reason=prompt('Закрыть «'+label+'» на этот сеанс. Причина:','под стафф');
    if(reason===null) return;
    sdBlock(label, true, reason);
  });

  sdList();
}

function sdList(){
  const free = SD.plan.tables.filter(p=>!SD.bookings.some(b=>b.table_label===p.label));
  $('sd-list').innerHTML = SD.bookings.length
    ? SD.bookings.map(b=>{
        if(b.id===SD_EDIT){
          const seatOpts=[b.table_label].concat(free.map(p=>p.label))
            .map(l=>'<option value="'+esc(l)+'"'+(l===b.table_label?' selected':'')+'>'+esc(l)+'</option>').join('');
          return '<div class="bk edit" data-bk="'+esc(b.id)+'">'+
            '<div class="row two"><div><label>Столик</label><select id="bk-seat">'+seatOpts+'</select></div>'+
              '<div><label>Гостей</label><input id="bk-guests" type="number" min="1" max="20" value="'+esc(String(b.guests||''))+'"></div></div>'+
            '<div class="row two"><div><label>Имя</label><input id="bk-name" value="'+esc(b.guest_name||'')+'"></div>'+
              '<div><label>Телефон</label><input id="bk-phone" value="'+esc(b.guest_phone||'')+'"></div></div>'+
            '<div class="row two"><div><label>Instagram</label><input id="bk-insta" value="'+esc(b.guest_instagram||'')+'"></div>'+
              '<div><label>Сумма</label><input id="bk-amount" type="number" min="0" step="0.01" value="'+esc(String(b.amount||''))+'"></div></div>'+
            '<div class="row"><label>Статус оплаты</label><select id="bk-status">'+
              ['paid','deposit','unpaid','refunded'].map(v=>'<option value="'+v+'"'+(b.payment_status===v?' selected':'')+'>'+
                (v==='paid'?'Оплачено':v==='deposit'?'Депозит':v==='refunded'?'Возвращено':'Не оплачено')+'</option>').join('')+'</select></div>'+
            '<div class="row"><label>Комментарий</label><textarea id="bk-comment">'+esc(b.comment||'')+'</textarea></div>'+
            '<div class="bk__acts">'+
              '<button class="btn small" data-save="'+esc(b.id)+'">Сохранить</button>'+
              '<button class="btn small ghost" data-cancel="1">Отмена</button>'+
              '<button class="btn small ghost" data-move="'+esc(b.id)+'">Перенести на другой сеанс</button>'+
              (b.source==='online' && b.payment_status==='paid'
                ? '<button class="btn small danger" data-refund="'+esc(b.id)+'">Возврат</button>'
                : '')+
              '<button class="btn small danger" data-del="'+esc(b.id)+'">Отменить бронь</button>'+
            '</div></div>';
        }
        const phone=(b.guest_phone||'').replace(/[^\d+]/g,'');
        return '<div class="bk" data-bk="'+esc(b.id)+'">'+
          '<div class="bk__top"><span class="bk__seat">'+esc(b.table_label)+'</span>'+
            '<span><span class="badge '+esc(b.payment_status)+'">'+esc(b.payment_status)+'</span> '+
            '<span class="badge '+esc(b.source)+'">'+esc(b.source)+'</span></span></div>'+
          '<div class="bk__who">'+esc(b.guest_name||'—')+' · '+esc(String(b.guests||'?'))+' чел · '+esc(String(Number(b.amount)||0))+' GEL</div>'+
          '<div class="bk__c">'+
            (b.guest_phone?'<a href="tel:'+esc(phone)+'">'+esc(b.guest_phone)+'</a>':'без телефона')+
            (b.guest_instagram?' · <a href="https://instagram.com/'+esc(String(b.guest_instagram).replace(/^@/,''))+'" target="_blank" rel="noopener">'+esc(b.guest_instagram)+'</a>':'')+
            (b.guest_phone?' · <a href="https://wa.me/'+esc(phone.replace(/\D/g,''))+'" target="_blank" rel="noopener">WhatsApp</a>':'')+
          '</div>'+
          (b.comment?'<div class="bk__c">💬 '+esc(b.comment)+'</div>':'')+
          '<div class="bk__acts"><button class="btn small ghost" data-edit="'+esc(b.id)+'">Изменить</button></div>'+
        '</div>';
      }).join('')
    : '<div class="hint">Броней на этот сеанс пока нет.</div>';

  $('sd-list').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{ SD_EDIT=b.dataset.edit; sdRender(); });
  $('sd-list').querySelectorAll('[data-cancel]').forEach(b=>b.onclick=()=>{ SD_EDIT=null; sdRender(); });
  $('sd-list').querySelectorAll('[data-save]').forEach(b=>b.onclick=()=>sdSave(b.dataset.save));
  $('sd-list').querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>sdDelete(b.dataset.del));
  $('sd-list').querySelectorAll('[data-move]').forEach(b=>b.onclick=()=>sdMove(b.dataset.move));
  $('sd-list').querySelectorAll('[data-refund]').forEach(b=>b.onclick=()=>sdRefund(b.dataset.refund));
}

async function sdBlock(label, block, reason){
  try{
    const r=await fetch(api('admin-blocks'),{method:'POST',...F,headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ action: block?'block':'unblock', session_id:SD.session.id, table_label:label, reason })});
    if(r.status===401){ handle401(); return; }
    const d=await r.json().catch(()=>({}));
    if(!r.ok || !d.ok){ alert('Ошибка: '+(d.detail||d.error||'?')); return; }
    SD.blocks=d.blocks||[];
    sdRender(); loadToday();
  }catch(e){ alert('Сетевая ошибка.'); }
}

async function sdPost(payload){
  const r=await fetch(api('admin-bookings'),{method:'POST',...F,headers:{'Content-Type':'application/json'},
    body:JSON.stringify(payload)});
  if(r.status===401){ handle401(); return null; }
  const d=await r.json().catch(()=>({}));
  if(!r.ok || !d.ok){ alert('Ошибка: '+(d.detail||d.error||'?')); return null; }
  return d;
}

async function sdSave(id){
  const ok = await sdPost({
    action:'update', id,
    table_label:$('bk-seat').value,
    guest_name:$('bk-name').value.trim(),
    guest_phone:$('bk-phone').value.trim(),
    guest_instagram:$('bk-insta').value.trim(),
    guests:$('bk-guests').value,
    amount:$('bk-amount').value,
    payment_status:$('bk-status').value,
    comment:$('bk-comment').value.trim()
  });
  if(ok){ SD_EDIT=null; openSession(SD.session.id); loadToday(); }
}

async function sdDelete(id){
  if(!confirm('Отменить бронь? Запись будет удалена, место освободится.')) return;
  const ok=await sdPost({ action:'delete', id });
  if(ok){ SD_EDIT=null; openSession(SD.session.id); loadToday(); }
}

async function sdRefund(id){
  const full = confirm('Вернуть деньги гостю? Это действие нельзя отменить после отправки запроса в банк.\\n\\nOK — полный возврат.\\nОтмена — ввести частичную сумму.');
  let amount = null;
  if(!full){
    const raw = prompt('Сумма частичного возврата, GEL:');
    if(raw===null) return;
    amount = Number(String(raw).replace(',', '.'));
    if(!Number.isFinite(amount) || amount<=0){ alert('Некорректная сумма.'); return; }
  }
  try{
    const r=await fetch(api('admin-refund'),{method:'POST',...F,headers:{'Content-Type':'application/json'},
      body:JSON.stringify(amount!=null ? { id, amount } : { id })});
    if(r.status===401){ handle401(); return; }
    const d=await r.json().catch(()=>({}));
    if(!r.ok || !d.ok){ alert('Ошибка возврата: '+(d.detail||d.error||'?')); return; }
    alert('Возврат отправлен в BOG. Подтверждение придёт по вебхуку — статус обновится автоматически.');
    SD_EDIT=null; openSession(SD.session.id); loadToday();
  }catch(e){ alert('Сетевая ошибка.'); }
}

async function sdMove(id){
  // Список ближайших сеансов, чтобы не заставлять вспоминать id.
  let list=[];
  try{
    const r=await fetch(api('admin-sessions'), F);
    const d=await r.json();
    list=(d.sessions||[]).filter(x=>x.id!==SD.session.id).slice(0,40);
  }catch(e){}
  if(!list.length){ alert('Других сеансов нет.'); return; }
  const text=list.map((x,i)=>(i+1)+') '+x.title+' — '+x.date+' '+x.time).join('\\n');
  const pick=prompt('На какой сеанс перенести? Введите номер:\\n\\n'+text);
  const idx=Number(pick)-1;
  if(!(idx>=0 && idx<list.length)) return;
  const ok=await sdPost({ action:'move', id, session_id:list[idx].id });
  if(ok){ SD_EDIT=null; openSession(SD.session.id); loadToday(); }
}

// ---------- АРХИВ ----------
let AR_OFFSET = 0;
const AR_LIMIT = 30;

async function loadArchive(){
  const box=$('ar-list');
  box.innerHTML='<div class="hint">Загрузка…</div>';
  try{
    const u=new URL(api('admin-bookings'), location.origin);
    u.searchParams.set('archive','1');
    u.searchParams.set('limit', AR_LIMIT);
    u.searchParams.set('offset', AR_OFFSET);
    const q=$('ar-q').value.trim();
    if(q) u.searchParams.set('q', q);
    const r=await fetch(u, F);
    if(r.status===401){ handle401(); return; }
    const d=await r.json();
    const list=d.sessions||[];
    box.innerHTML = list.length ? list.map(s=>
      '<div class="arch-row" data-s="'+esc(s.id)+'">'+
        '<span class="d">'+esc(s.date)+' '+esc(s.time)+'</span>'+
        '<span class="t">'+esc(s.title)+'</span>'+
        '<span class="n">'+s.bookings+' брон. · '+s.guests+' гост. · '+Number(s.revenue)+' GEL</span>'+
      '</div>'
    ).join('') : '<div class="hint">Ничего не найдено.</div>';
    box.querySelectorAll('[data-s]').forEach(el=>el.onclick=()=>openSession(el.dataset.s));
    $('ar-prev').disabled = false;
    $('ar-next').disabled = AR_OFFSET===0;
  }catch(e){ box.innerHTML='<div class="hint">Ошибка загрузки.</div>'; }
}

$('ar-find').addEventListener('click', ()=>{ AR_OFFSET=0; loadArchive(); searchGuestsUI(); });
$('ar-q').addEventListener('keydown', e=>{ if(e.key==='Enter'){ AR_OFFSET=0; loadArchive(); searchGuestsUI(); } });
$('ar-clear').addEventListener('click', ()=>{ $('ar-q').value=''; AR_OFFSET=0; $('ar-guests').innerHTML=''; loadArchive(); });
$('ar-prev').addEventListener('click', ()=>{ AR_OFFSET+=AR_LIMIT; loadArchive(); });
$('ar-next').addEventListener('click', ()=>{ AR_OFFSET=Math.max(0, AR_OFFSET-AR_LIMIT); loadArchive(); });

// Поиск гостя отдельно от сеансов: «этот человек у нас уже был?»
async function searchGuestsUI(){
  const q=$('ar-q').value.trim();
  const box=$('ar-guests');
  if(!q){ box.innerHTML=''; return; }
  try{
    const u=new URL(api('admin-bookings'), location.origin);
    u.searchParams.set('guest', q);
    const r=await fetch(u, F);
    if(r.status===401){ handle401(); return; }
    const d=await r.json();
    const g=d.guests||[];
    box.innerHTML = g.length
      ? '<div class="card"><label style="font-size:13px;font-weight:600">Гости ('+g.length+')</label>'+
        g.map(x=>'<div class="arch-row" data-gs="'+esc(x.session_id)+'">'+
          '<span class="d">'+esc(x.date)+' '+esc(x.time)+'</span>'+
          '<span class="t">'+esc(x.guest_name||'—')+' · '+esc(x.table_label)+'</span>'+
          '<span class="n">'+esc(x.title)+' · '+esc(x.guest_phone||x.guest_instagram||'')+'</span>'+
        '</div>').join('')+'</div>'
      : '';
    box.querySelectorAll('[data-gs]').forEach(el=>el.onclick=()=>openSession(el.dataset.gs));
  }catch(e){ box.innerHTML=''; }
}

// ---------- КОНСТРУКТОР ЗАЛА ----------
// Метка стола («Стол 5») — ключ, по которому бронь занимает место. Поэтому
// геометрию можно менять свободно, а переименование и удаление показывают
// предупреждение: у метки может быть история броней.
//
// Правки копятся локально и уходят одним запросом по кнопке — случайное
// движение мышью не должно менять схему на боевом сайте мгновенно.

let FLOOR = { settings:{}, tables:[], inUse:{} };
let FL_UID = 0;          // счётчик внутренних идентификаторов
let FL_SNAP = null;
let FL_SEL = null;      // выбранная метка
let FL_DIRTY = false;
let FL_DRAG = null;

function flDirty(){ FL_DIRTY = true; $('fl-save').classList.add('show'); }
function flGrid(){ return Math.max(0, Number($('fl-grid').value) || 0); }
function flSnap(v){ const g = flGrid(); return g ? Math.round(v / g) * g : Math.round(v); }

async function loadFloor(){
  try{
    const r = await fetch(api('admin-floor'), F);
    if(r.status===401){ handle401(); return; }
    const d = await r.json();
    // Внутри редактора столы опознаём по uid, а не по метке: метки может
    // случайно совпасть (и совпадала), и тогда find() по label находил чужой
    // стол — двигался не тот, который тянешь.
    FLOOR = {
      settings: d.settings||{},
      tables: (d.tables||[]).map((t,i)=>({ ...t, uid: 'u'+i })),
      inUse: d.inUse||{}
    };
    FL_UID = (d.tables||[]).length;
    FL_SNAP = JSON.stringify(FLOOR.tables);
    FL_DIRTY = false; FL_SEL = null;
    $('fl-save').classList.remove('show');
    $('fl-grid').value = FLOOR.settings.grid ?? 20;
    $('fl-cw').value = FLOOR.settings.canvas_w ?? 1000;
    $('fl-ch').value = FLOOR.settings.canvas_h ?? 700;
    flRender();
  }catch(e){ $('fl-canvas').innerHTML='<div class="hint" style="padding:20px">Ошибка загрузки плана.</div>'; }
}

function flRender(){
  const cv = $('fl-canvas');
  const W = Number($('fl-cw').value) || 1000;
  const H = Number($('fl-ch').value) || 700;
  const g = flGrid();

  cv.style.width = W + 'px';
  cv.style.height = H + 'px';
  // Сетка рисуется фоном — не плодим тысячи элементов ради разметки.
  cv.style.backgroundImage = g
    ? 'linear-gradient(#ecebe9 1px, transparent 1px), linear-gradient(90deg, #ecebe9 1px, transparent 1px)'
    : 'none';
  cv.style.backgroundSize = g ? (g+'px '+g+'px') : 'auto';

  cv.innerHTML = '<div class="fl-screen">'+esc(FLOOR.settings.screen_label||'SCREEN')+'</div>'+
    FLOOR.tables.map(t=>{
      const sel = t.uid===FL_SEL;
      const style = 'left:'+t.x+'px;top:'+t.y+'px;width:'+t.w+'px;height:'+t.h+'px;'+
        'border-radius:'+(t.shape==='circle'?'50%':'10px')+';'+
        (t.rotation?('transform:rotate('+t.rotation+'deg);'):'');
      return '<div class="fl-t'+(t.zone==='bar'?' bar':'')+(t.active===false?' off':'')+(t.bookable===false?' closed':'')+(sel?' sel':'')+
        '" data-uid="'+esc(t.uid)+'" style="'+style+'">'+
          '<span>'+esc(t.label)+'<small>'+(t.bookable===false?'закрыт':(t.capacity_min+'–'+t.capacity_max))+'</small></span>'+
          (sel?'<div class="fl-h" data-resize="1"></div>':'')+
        '</div>';
    }).join('');

  flBindCanvas();
  flSide();
}

function flBindCanvas(){
  $('fl-canvas').querySelectorAll('.fl-t').forEach(el=>{
    el.addEventListener('pointerdown', ev=>{
      const uid = el.dataset.uid;
      const t = FLOOR.tables.find(x=>x.uid===uid);
      if(!t) return;
      FL_SEL = uid;
      const resizing = ev.target && ev.target.dataset && ev.target.dataset.resize==='1';
      FL_DRAG = {
        uid, resizing,
        sx: ev.clientX, sy: ev.clientY,
        ox: t.x, oy: t.y, ow: t.w, oh: t.h
      };
      // Не захватываем указатель элементом: сразу после этого flRender()
      // пересобирает разметку, элемент исчезает, и в части браузеров
      // перетаскивание обрывается. Движение слушает document.
      ev.preventDefault();
      flRender();
    });
  });
}

document.addEventListener('pointermove', ev=>{
  if(!FL_DRAG) return;
  const t = FLOOR.tables.find(x=>x.uid===FL_DRAG.uid);
  if(!t) return;
  const dx = ev.clientX - FL_DRAG.sx, dy = ev.clientY - FL_DRAG.sy;
  const W = Number($('fl-cw').value)||1000, H = Number($('fl-ch').value)||700;

  if(FL_DRAG.resizing){
    t.w = Math.max(40, Math.min(W, flSnap(FL_DRAG.ow + dx)));
    t.h = Math.max(40, Math.min(H, flSnap(FL_DRAG.oh + dy)));
  } else {
    // Стол не должен уезжать за пределы холста — иначе он пропадёт со схемы.
    t.x = Math.max(0, Math.min(W - t.w, flSnap(FL_DRAG.ox + dx)));
    t.y = Math.max(0, Math.min(H - t.h, flSnap(FL_DRAG.oy + dy)));
  }
  flDirty(); flRender();
});

document.addEventListener('pointerup', ()=>{ FL_DRAG = null; });

// Стрелками — точное смещение, когда мышью попасть трудно.
document.addEventListener('keydown', e=>{
  if(!FL_SEL) return;
  if(!$('panel-floor').classList.contains('active')) return;
  const t = FLOOR.tables.find(x=>x.uid===FL_SEL);
  if(!t) return;
  const step = e.shiftKey ? (flGrid()||10) : 1;
  let used = true;
  if(e.key==='ArrowLeft')  t.x = Math.max(0, t.x-step);
  else if(e.key==='ArrowRight') t.x = t.x+step;
  else if(e.key==='ArrowUp')    t.y = Math.max(0, t.y-step);
  else if(e.key==='ArrowDown')  t.y = t.y+step;
  else if(e.key==='Delete' || e.key==='Backspace'){ flDelete(t.uid); return; }
  else used = false;
  if(used){ e.preventDefault(); flDirty(); flRender(); }
});

function flSide(){
  const box = $('fl-side');
  const t = FLOOR.tables.find(x=>x.uid===FL_SEL);
  if(!t){ box.innerHTML='<div class="hint">Выбери стол на схеме, чтобы изменить его.</div>'; return; }
  const used = FLOOR.inUse[t.label] || 0;

  box.innerHTML =
    (used ? '<div class="fl-warn">На эту метку уже есть брони: '+used+'. Переименование не перепишет их — старые брони останутся со старой меткой.</div>' : '')+
    '<div class="row two"><div><label>Метка *</label><input id="fl-label" value="'+esc(t.label)+'"></div>'+
      '<div><label>Зона</label><select id="fl-zone">'+
        '<option value="hall"'+(t.zone!=='bar'?' selected':'')+'>Зал</option>'+
        '<option value="bar"'+(t.zone==='bar'?' selected':'')+'>Бар</option></select></div></div>'+
    '<div class="row two"><div><label>Форма</label><select id="fl-shape">'+
        '<option value="rect"'+(t.shape!=='circle'?' selected':'')+'>Прямоугольник</option>'+
        '<option value="circle"'+(t.shape==='circle'?' selected':'')+'>Круг</option></select></div>'+
      '<div><label>Поворот, °</label><input id="fl-rot" type="number" min="0" max="345" step="15" value="'+t.rotation+'"></div></div>'+
    '<div class="row two"><div><label>Мин. гостей</label><input id="fl-cmin" type="number" min="1" max="20" value="'+t.capacity_min+'"></div>'+
      '<div><label>Макс. гостей</label><input id="fl-cmax" type="number" min="1" max="20" value="'+t.capacity_max+'"></div></div>'+
    '<div class="row two"><div><label>Ширина</label><input id="fl-w" type="number" min="40" step="5" value="'+t.w+'"></div>'+
      '<div><label>Высота</label><input id="fl-h" type="number" min="40" step="5" value="'+t.h+'"></div></div>'+
    '<div class="row"><label style="display:flex;align-items:center;gap:8px;font-weight:400">'+
      '<input type="checkbox" id="fl-active" style="width:16px;height:16px"'+(t.active!==false?' checked':'')+'> Показывать на схеме</label></div>'+
    '<div class="row"><label style="display:flex;align-items:center;gap:8px;font-weight:400">'+
      '<input type="checkbox" id="fl-bookable" style="width:16px;height:16px"'+(t.bookable!==false?' checked':'')+'> Можно бронировать с сайта</label>'+
      '<div class="hint">Снятая галочка закрывает стол: на схеме он виден серым с подписью «закрыт», но гость его не выберет. Через админку посадить за него по-прежнему можно.</div></div>'+
    '<button class="btn small danger" id="fl-del">Убрать из плана</button>';

  const bind = (id, key, num) => {
    const el = $(id);
    if(!el) return;
    el.addEventListener('change', ()=>{
      const v = num ? (Number(el.value)||0) : el.value;
      if(key==='label'){
        const nv = String(v).trim();
        if(!nv){ el.value = t.label; return; }
        if(FLOOR.tables.some(x=>x!==t && x.label===nv)){ alert('Метка «'+nv+'» уже занята.'); el.value=t.label; return; }
        if(used && !confirm('У метки «'+t.label+'» есть брони ('+used+'). Переименовать? Старые брони останутся со старой меткой.')){ el.value=t.label; return; }
      }
      t[key] = v;
      flDirty(); flRender();
    });
  };
  bind('fl-label','label'); bind('fl-zone','zone'); bind('fl-shape','shape');
  bind('fl-rot','rotation',true); bind('fl-cmin','capacity_min',true); bind('fl-cmax','capacity_max',true);
  bind('fl-w','w',true); bind('fl-h','h',true);
  $('fl-active').addEventListener('change', ()=>{ t.active = $('fl-active').checked; flDirty(); flRender(); });
  $('fl-bookable').addEventListener('change', ()=>{ t.bookable = $('fl-bookable').checked; flDirty(); flRender(); });
  $('fl-del').onclick = ()=>flDelete(t.uid);
}

async function flDelete(uid){
  const t = FLOOR.tables.find(x=>x.uid===uid);
  if(!t) return;
  const label = t.label;

  // Стол, ещё не сохранённый в базе, просто убираем из списка — на сервере
  // его нет, и запрос вернул бы «не найдено».
  if(!FLOOR.tables.some(x=>x!==t && x.label===label) && !(label in FLOOR.inUse)){
    const known = FL_SNAP ? JSON.parse(FL_SNAP).some(x=>x.label===label) : false;
    if(!known){
      FLOOR.tables = FLOOR.tables.filter(x=>x.uid!==uid);
      if(FL_SEL===uid) FL_SEL=null;
      flDirty(); flRender();
      return;
    }
  }

  const used = FLOOR.inUse[label] || 0;
  const msg = used
    ? 'Убрать «'+label+'» из плана?\\n\\nБрони на эту метку ('+used+') сохранятся — они история, но стол исчезнет со схемы брони.'
    : 'Убрать «'+label+'» из плана?';
  if(!confirm(msg)) return;
  try{
    const r=await fetch(api('admin-floor'),{method:'POST',...F,headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ action:'delete', label })});
    if(r.status===401){ handle401(); return; }
    FL_SEL=null; loadFloor();
  }catch(e){ alert('Сетевая ошибка.'); }
}

// Метка обязана быть уникальной: по ней бронь занимает место, а совпадение
// приводило к тому, что редактор находил чужой стол.
function flNextLabel(prefix){
  const taken = new Set(FLOOR.tables.map(t=>t.label));
  let n = 1;
  while(taken.has(prefix+' '+n)) n++;
  return prefix+' '+n;
}

// Ищем свободное место, чтобы новый стол не лёг ровно поверх предыдущего:
// при совпадающих координатах перетаскивается только верхний, а нижний
// выглядит намертво застрявшим.
function flFreeSpot(w, h){
  const W = Number($('fl-cw').value)||1000, H = Number($('fl-ch').value)||700;
  const step = Math.max(20, flGrid() || 20);
  const hits = (x,y) => FLOOR.tables.some(t =>
    x < t.x + t.w && x + w > t.x && y < t.y + t.h && y + h > t.y);
  for(let y=step; y + h < H; y += step){
    for(let x=step; x + w < W; x += step){
      if(!hits(x,y)) return { x: flSnap(x), y: flSnap(y) };
    }
  }
  return { x: flSnap(step), y: flSnap(step) };   // всё занято — кладём в угол
}

function flAdd(zone){
  const prefix = zone==='bar' ? 'Бар' : 'Стол';
  const label = flNextLabel(prefix);
  const w = zone==='bar' ? 70 : 90, h = zone==='bar' ? 60 : 90;
  const spot = flFreeSpot(w, h);
  const uid = 'n'+(++FL_UID);
  FLOOR.tables.push({
    uid, label, zone, shape: zone==='bar' ? 'rect' : 'circle',
    x: spot.x, y: spot.y,
    w, h,
    rotation: 0, capacity_min: 1, capacity_max: zone==='bar' ? 2 : 4,
    sort: (FLOOR.tables.length+1)*10, active: true
  });
  FL_SEL = uid;
  flDirty(); flRender();
}

$('fl-add').addEventListener('click', ()=>flAdd('hall'));
$('fl-add-bar').addEventListener('click', ()=>flAdd('bar'));
$('fl-grid').addEventListener('change', flRender);
$('fl-cw').addEventListener('change', ()=>{ flDirty(); flRender(); });
$('fl-ch').addEventListener('change', ()=>{ flDirty(); flRender(); });
$('fl-reload').addEventListener('click', loadFloor);

$('fl-undo-btn').addEventListener('click', ()=>{
  if(!FL_SNAP) return;
  FLOOR.tables = JSON.parse(FL_SNAP).map((t,i)=>({ ...t, uid:'u'+i }));
  FL_DIRTY=false; FL_SEL=null;
  $('fl-save').classList.remove('show');
  flRender();
});

$('fl-save-btn').addEventListener('click', async ()=>{
  const btn=$('fl-save-btn'); btn.disabled=true; btn.textContent='Сохраняю…';
  try{
    const r=await fetch(api('admin-floor'),{method:'POST',...F,headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        settings:{ canvas_w:Number($('fl-cw').value)||1000, canvas_h:Number($('fl-ch').value)||700, grid:flGrid() },
        tables: FLOOR.tables.map((t,i)=>{
          const { uid, ...rest } = t;   // uid живёт только в редакторе
          return { ...rest, sort:(i+1)*10 };
        })
      })});
    if(r.status===401){ handle401(); return; }
    const d=await r.json().catch(()=>({}));
    if(r.ok&&d.ok) loadFloor();
    else alert('Ошибка: '+(d.detail||d.error||'?'));
  }catch(e){ alert('Сетевая ошибка.'); }
  finally{ btn.disabled=false; btn.textContent='Сохранить'; }
});

// ---------- КАНАЛЫ УВЕДОМЛЕНИЙ ----------

function nchFieldRow(channel, f){
  const placeholder = !f.set ? 'не задано' : (f.source==='db' ? 'сохранено, введите новое чтобы заменить' : 'из переменной окружения');
  return '<div class="nfld">'+
    '<label>'+esc(f.label)+'</label>'+
    '<input type="password" autocomplete="off" data-secret-input data-ch="'+esc(channel)+'" data-name="'+esc(f.name)+'" placeholder="'+esc(placeholder)+'">'+
    '<button class="btn small ghost" data-secret-save data-ch="'+esc(channel)+'" data-name="'+esc(f.name)+'">Сохранить</button>'+
    (f.source==='db' ? '<button class="btn small ghost" data-secret-clear data-ch="'+esc(channel)+'" data-name="'+esc(f.name)+'">Очистить</button>' : '')+
  '</div>';
}

async function loadNotify(){
  const box = $('notify-list');
  try{
    const r = await fetch(api('admin-notify'), F);
    if(r.status===401){ handle401(); return; }
    const d = await r.json();
    const channels = d.channels || [];

    const banner = d.secretsAvailable ? '' :
      '<div class="nsecret-banner">Чтобы вводить токены и ключи прямо здесь, добавьте NOTIFY_SECRET_KEY в переменные окружения (любая случайная строка, используется для шифрования). Пока переменные окружения задаются как обычно.</div>';

    box.innerHTML = banner + channels.map(function(ch){
      const hintClass = !ch.configured ? 'missing' : (!ch.enabled ? 'off' : '');
      const hintText = !ch.configured
        ? 'не настроен — не хватает: ' + ch.missing.join(', ')
        : (!ch.enabled ? 'настроен, но выключен' : 'настроен, уведомления идут');
      const testPart = (ch.configured && ch.enabled)
        ? '<button class="btn small ghost" data-test="'+esc(ch.channel)+'">Проверить</button><span class="nch__test-msg" data-testmsg="'+esc(ch.channel)+'"></span>'
        : '';
      const keysPart = d.secretsAvailable
        ? '<details class="nch__keys"><summary>Ключи</summary>'+(ch.fields||[]).map(function(f){ return nchFieldRow(ch.channel, f); }).join('')+'</details>'
        : '';
      return '<div class="nch">'+
        '<div class="nch__row">'+
          '<label class="tgl"><input type="checkbox" data-ch="'+esc(ch.channel)+'"'+(ch.enabled?' checked':'')+(ch.configured?'':' disabled')+'><span></span></label>'+
          '<div class="nch__main">'+
            '<div class="nch__name">'+esc(ch.title)+'</div>'+
            '<div class="nch__hint '+hintClass+'">'+esc(hintText)+'</div>'+
          '</div>'+
          testPart+
        '</div>'+
        keysPart+
      '</div>';
    }).join('');

    box.querySelectorAll('input[data-ch]').forEach(function(inp){
      inp.addEventListener('change', function(){ setNotifyChannel(inp.dataset.ch, inp.checked); });
    });
    box.querySelectorAll('button[data-test]').forEach(function(btn){
      btn.addEventListener('click', function(){ testNotifyChannel(btn.dataset.test); });
    });
    box.querySelectorAll('button[data-secret-save]').forEach(function(btn){
      btn.addEventListener('click', function(){ saveSecretField(btn.dataset.ch, btn.dataset.name, btn); });
    });
    box.querySelectorAll('button[data-secret-clear]').forEach(function(btn){
      btn.addEventListener('click', function(){ clearSecretField(btn.dataset.ch, btn.dataset.name); });
    });
  }catch(e){
    box.innerHTML = '<div class="hint">Ошибка загрузки.</div>';
  }
}

async function setNotifyChannel(channel, enabled){
  try{
    const r = await fetch(api('admin-notify'), {method:'POST',...F,headers:{'Content-Type':'application/json'},body:JSON.stringify({channel:channel, enabled:enabled})});
    if(r.status===401){ handle401(); return; }
    loadNotify();
  }catch(e){ alert('Сетевая ошибка.'); loadNotify(); }
}

async function testNotifyChannel(channel){
  const msgEl = document.querySelector('[data-testmsg="'+channel+'"]');
  if(msgEl){ msgEl.textContent = 'Проверяем…'; msgEl.style.color = '#888'; }
  try{
    const r = await fetch(api('admin-notify'), {method:'POST',...F,headers:{'Content-Type':'application/json'},body:JSON.stringify({test:channel})});
    if(r.status===401){ handle401(); return; }
    const d = await r.json().catch(()=>({}));
    if(r.ok && d.ok){
      if(msgEl){ msgEl.textContent = 'Дошло ✓'; msgEl.style.color = '#4CAF50'; }
    } else {
      if(msgEl){ msgEl.textContent = 'Ошибка: ' + (d.detail || d.error || '?'); msgEl.style.color = '#F44336'; }
    }
  }catch(e){
    if(msgEl){ msgEl.textContent = 'Сетевая ошибка.'; msgEl.style.color = '#F44336'; }
  }
}

async function saveSecretField(channel, name, btn){
  const box = $('notify-list');
  const input = box.querySelector('input[data-secret-input][data-ch="'+channel+'"][data-name="'+name+'"]');
  const value = input.value.trim();
  if(!value) return;
  btn.disabled = true;
  try{
    const r = await fetch(api('admin-notify'), {method:'POST',...F,headers:{'Content-Type':'application/json'},body:JSON.stringify({channel:channel, secrets:{ [name]: value }})});
    if(r.status===401){ handle401(); return; }
    const d = await r.json().catch(()=>({}));
    if(r.ok && d.ok) loadNotify();
    else { alert('Ошибка: ' + (d.detail || d.error || '?')); btn.disabled = false; }
  }catch(e){ alert('Сетевая ошибка.'); btn.disabled = false; }
}

async function clearSecretField(channel, name){
  if(!confirm('Удалить сохранённое значение? Канал вернётся к переменной окружения (если она задана).')) return;
  try{
    const r = await fetch(api('admin-notify'), {method:'POST',...F,headers:{'Content-Type':'application/json'},body:JSON.stringify({channel:channel, clearSecret:name})});
    if(r.status===401){ handle401(); return; }
    const d = await r.json().catch(()=>({}));
    if(r.ok && d.ok) loadNotify();
    else alert('Ошибка: ' + (d.detail || d.error || '?'));
  }catch(e){ alert('Сетевая ошибка.'); }
}

// ---------- MENU ----------
let MENU = { categories:[], subcategories:[], items:[], placements:[] };
let MC_EDIT = null, MI_EDIT = null;

// Конструктор меню: порядок категорий и позиций правится перетаскиванием или
// стрелками, позиция переносится между категориями выпадающим списком.
// Изменения копятся локально и уходят одним запросом по кнопке «Сохранить» —
// так случайное движение мышью не улетает в базу мгновенно, а отмена ничего
// не стоит.

let MB_DIRTY = false;
let MB_SNAPSHOT = null;   // состояние до правок, для «Отменить»
let MB_DRAG = null;       // id перетаскиваемой позиции

function mbOrderedCats(){
  return MENU.categories.slice().sort((a,b)=>(a.sort-b.sort)||a.title_ru.localeCompare(b.title_ru));
}
function mbItemsOf(catId){
  return MENU.items.filter(i=>i.category_id===catId).sort((a,b)=>(a.sort-b.sort)||a.title_ru.localeCompare(b.title_ru));
}
function mbMarkDirty(){
  MB_DIRTY = true;
  $('mb-save').classList.add('show');
}
function mbResequence(){
  // Пересчитываем sort с шагом 10: в базу уходят ровные значения, между
  // которыми потом легко вставить новое, не трогая соседей.
  mbOrderedCats().forEach((c,i)=>{ c.sort = i*10; });
  MENU.categories.forEach(c=>{
    mbSubsOf(c.id).forEach((sc,i)=>{ sc.sort = i*10; });
    // Нумерация позиций своя внутри каждой группы.
    mbItemsIn(c.id, null).forEach((it,i)=>{ it.sort = i*10; });
    mbSubsOf(c.id).forEach(sc=>{
      mbItemsIn(c.id, sc.id).forEach((it,i)=>{ it.sort = i*10; });
    });
  });
}

async function loadMenu(){
  const box=$('menu-list');
  try{
    const r=await fetch(api('admin-menu'), F);
    if(r.status===401){ handle401(); return; }
    const d=await r.json();
    MENU={ categories:d.categories||[], subcategories:d.subcategories||[], items:d.items||[], placements:d.placements||[] };
    MB_SNAPSHOT = JSON.stringify(MENU);
    MB_DIRTY = false;
    $('mb-save').classList.remove('show');

    $('mi-cat').innerHTML='<option value="">Выбери категорию</option>'+
      MENU.categories.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.title_ru)+'</option>').join('');

    if(!MENU.categories.length){ box.innerHTML='<div class="hint">Категорий нет. Создай первую сверху.</div>'; return; }
    mbRender();
  }catch(e){ box.innerHTML='<div class="hint">Ошибка загрузки меню.</div>'; }
}

function mbSubsOf(catId){
  return (MENU.subcategories||[]).filter(x=>x.category_id===catId)
    .sort((a,b)=>(a.sort-b.sort)||a.title_ru.localeCompare(b.title_ru));
}
function mbItemsIn(catId, subId){
  return MENU.items
    .filter(i=>i.category_id===catId && (subId ? i.subcategory_id===subId : !i.subcategory_id))
    .sort((a,b)=>(a.sort-b.sort)||a.title_ru.localeCompare(b.title_ru));
}

function mbRender(){
  const box=$('menu-list');
  const cats=mbOrderedCats();

  // Один список назначения на все позиции: категория и её подкатегории.
  // Значение — «catId|subId», пустой subId = позиция прямо в категории.
  const moveOpts = (curCat, curSub) => cats.map(c=>{
    const subs=mbSubsOf(c.id);
    const head='<option value="'+esc(c.id)+'|"'+((c.id===curCat&&!curSub)?' selected':'')+'>— вся категория —</option>';
    const rows=subs.map(sc=>'<option value="'+esc(c.id)+'|'+esc(sc.id)+'"'+
      ((sc.id===curSub)?' selected':'')+'>'+esc(sc.title_ru)+'</option>').join('');
    return '<optgroup label="'+esc(c.title_ru)+'">'+head+rows+'</optgroup>';
  }).join('');

  const itemRow = (i, ii, total) =>
    '<div class="mb-it'+(i.available?'':' out')+'" draggable="true" data-item="'+esc(i.id)+'">'+
      '<span class="grab" aria-hidden="true">⠿</span>'+
      (i.photo_url?'<img src="'+esc(i.photo_url)+'" alt="">':'<img alt="">')+
      '<span class="mb-it__t"><b>'+esc(i.title_ru)+'</b>'+
        '<small>'+esc(String(i.price))+' GEL'+
        (i.photo_hover_url?' · 2 фото':'')+
        (i.title_ka?'':' · нет ქარ')+(i.title_en?'':' · нет EN')+'</small></span>'+
      '<button class="mb-eye" data-av="'+esc(i.id)+'" title="'+(i.available?'В наличии':'Снято с продажи')+'">'+
        (i.available?'●':'○')+'</button>'+
      '<button class="mb-star'+(i.in_overview!==false?' on':'')+'" data-io="'+esc(i.id)+'" title="'+
        (i.in_overview!==false?'Показывается в «Всё меню»':'Не показывается в «Всё меню» — только внутри категории')+'">★</button>'+
      '<select class="mb-move" data-mv="'+esc(i.id)+'">'+moveOpts(i.category_id, i.subcategory_id)+'</select>'+
      '<span class="arrows"><button data-iu="'+esc(i.id)+'"'+(ii===0?' disabled':'')+'>▲</button>'+
        '<button data-idn="'+esc(i.id)+'"'+(ii===total-1?' disabled':'')+'>▼</button></span>'+
      '<button class="btn small ghost" data-mi="'+esc(i.id)+'">Изм.</button>'+
      '<button class="btn small danger" data-di="'+esc(i.id)+'" title="Удалить">✕</button>'+
      plcChips(i)+
    '</div>';

  const group = (catId, sub, si, subTotal) => {
    const list = mbItemsIn(catId, sub ? sub.id : null);
    if(!sub && !list.length && mbSubsOf(catId).length) return '';   // пустая «без подкатегории» — не показываем
    const head = sub
      ? '<div class="mb-sub__h">'+
          '<span class="mb-sub__t">'+esc(sub.title_ru)+' <em>'+list.length+'</em></span>'+
          '<span class="arrows"><button data-su="'+esc(sub.id)+'"'+(si===0?' disabled':'')+'>▲</button>'+
            '<button data-sd="'+esc(sub.id)+'"'+(si===subTotal-1?' disabled':'')+'>▼</button></span>'+
          '<button class="mb-star'+(sub.in_overview!==false?' on':'')+'" data-sf="'+esc(sub.id)+'" title="'+
            (sub.in_overview!==false?'Показывается в «Всё меню»':'Не показывается в «Всё меню» — только внутри категории')+'">★</button>'+
          '<button class="btn small ghost" data-ms="'+esc(sub.id)+'">Изм.</button>'+
          '<button class="btn small danger" data-ds="'+esc(sub.id)+'" title="Удалить">✕</button>'+
        '</div>'
      : (mbSubsOf(catId).length ? '<div class="mb-sub__h"><span class="mb-sub__t">Без подкатегории <em>'+list.length+'</em></span></div>' : '');
    const rows = list.map((i,ii)=>itemRow(i,ii,list.length)).join('')
      || '<div class="hint" style="padding:8px 6px">Пусто — перетащи сюда позицию</div>';
    return '<div class="mb-sub"><div class="mb-items" data-drop="'+esc(catId)+'" data-dropsub="'+esc(sub?sub.id:'')+'">'+head+rows+'</div></div>';
  };

  box.innerHTML = cats.map((c,ci)=>{
    const subs = mbSubsOf(c.id);
    const count = MENU.items.filter(i=>i.category_id===c.id).length;
    const groups = group(c.id, null, 0, 0) + subs.map((sc,si)=>group(c.id, sc, si, subs.length)).join('');

    return '<div class="mb-cat" data-cat="'+esc(c.id)+'">'+
      '<div class="mb-cat__h'+(c.visible?'':' hidden-cat')+'">'+
        '<span class="grab" aria-hidden="true">⠿</span>'+
        '<span class="mb-cat__t">'+esc(c.title_ru)+
          '<small>'+count+' поз.'+(subs.length?' · '+subs.length+' подкат.':'')+(c.visible?'':' · скрыта с сайта')+'</small></span>'+
        '<button class="mb-eye" data-cv="'+esc(c.id)+'" title="'+(c.visible?'Видна на сайте':'Скрыта с сайта целиком')+'">'+
          (c.visible?'👁':'🚫')+'</button>'+
        '<button class="mb-star'+(c.in_overview!==false?' on':'')+'" data-co="'+esc(c.id)+'" title="'+
          (c.in_overview!==false?'Показывается в «Всё меню»':'Не показывается в «Всё меню» — только внутри категории')+'">★</button>'+
        '<span class="arrows"><button data-cu="'+esc(c.id)+'"'+(ci===0?' disabled':'')+'>▲</button>'+
          '<button data-cd="'+esc(c.id)+'"'+(ci===cats.length-1?' disabled':'')+'>▼</button></span>'+
        '<button class="btn small ghost" data-mc="'+esc(c.id)+'">Изм.</button>'+
        '<button class="btn small danger" data-dc="'+esc(c.id)+'" title="Удалить">✕</button>'+
      '</div>'+
      groups+
      '<div style="padding:0 8px 8px"><button class="mb-addsub" data-addsub="'+esc(c.id)+'">+ подкатегория</button></div>'+
    '</div>';
  }).join('');

  mbBind();
}

function mbBind(){
  const box=$('menu-list');

  // --- размещение позиции в других категориях ---
  box.querySelectorAll('[data-place]').forEach(b=>b.onclick=e=>{
    e.stopPropagation(); mbPlace(b.dataset.place);
  });
  box.querySelectorAll('[data-unplace]').forEach(b=>b.onclick=e=>{
    e.stopPropagation();
    const parts=b.dataset.unplace.split('|');
    if(confirm('Убрать позицию из этой категории?')) mbUnplace(parts[0], parts[1]);
  });

  // --- перестановка стрелками ---
  const swapIn=(list,id,dir)=>{
    const i=list.findIndex(x=>x.id===id); const j=i+dir;
    if(i<0||j<0||j>=list.length) return false;
    const a=list[i].sort; list[i].sort=list[j].sort; list[j].sort=a;
    return true;
  };

  box.querySelectorAll('[data-cu]').forEach(b=>b.onclick=()=>{
    if(swapIn(mbOrderedCats(), b.dataset.cu, -1)){ mbMarkDirty(); mbRender(); }
  });
  box.querySelectorAll('[data-cd]').forEach(b=>b.onclick=()=>{
    if(swapIn(mbOrderedCats(), b.dataset.cd, 1)){ mbMarkDirty(); mbRender(); }
  });

  box.querySelectorAll('[data-su]').forEach(b=>b.onclick=()=>{
    const sc=MENU.subcategories.find(x=>x.id===b.dataset.su); if(!sc) return;
    if(swapIn(mbSubsOf(sc.category_id), sc.id, -1)){ mbMarkDirty(); mbRender(); }
  });
  box.querySelectorAll('[data-sd]').forEach(b=>b.onclick=()=>{
    const sc=MENU.subcategories.find(x=>x.id===b.dataset.sd); if(!sc) return;
    if(swapIn(mbSubsOf(sc.category_id), sc.id, 1)){ mbMarkDirty(); mbRender(); }
  });

  const moveItem=(id,dir)=>{
    const it=MENU.items.find(x=>x.id===id); if(!it) return;
    const list=mbItemsIn(it.category_id, it.subcategory_id || null);
    if(swapIn(list, id, dir)){ mbMarkDirty(); mbRender(); }
  };
  box.querySelectorAll('[data-iu]').forEach(b=>b.onclick=()=>moveItem(b.dataset.iu,-1));
  box.querySelectorAll('[data-idn]').forEach(b=>b.onclick=()=>moveItem(b.dataset.idn, 1));

  // --- перенос позиции: значение «catId|subId» ---
  box.querySelectorAll('[data-mv]').forEach(sel=>sel.onchange=()=>{
    const it=MENU.items.find(x=>x.id===sel.dataset.mv); if(!it) return;
    const parts=String(sel.value).split('|');
    const cat=parts[0], sub=parts[1]||null;
    if(it.category_id===cat && (it.subcategory_id||null)===sub) return;
    it.category_id=cat; it.subcategory_id=sub;
    it.sort=(mbItemsIn(cat, sub).length+1)*10;
    mbResequence(); mbMarkDirty(); mbRender();
  });

  // --- видимость и наличие: применяются сразу ---
  box.querySelectorAll('[data-cv]').forEach(b=>b.onclick=async()=>{
    const c=MENU.categories.find(x=>x.id===b.dataset.cv); if(!c) return;
    const next=!c.visible; b.disabled=true;
    try{
      const r=await fetch(api('admin-menu'),{method:'POST',...F,headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ kind:'category', id:c.id, visible:next })});
      if(r.status===401){ handle401(); return; }
      c.visible=next; mbRender();
    }catch(e){ alert('Сетевая ошибка.'); b.disabled=false; }
  });

  box.querySelectorAll('[data-av]').forEach(b=>b.onclick=async()=>{
    const it=MENU.items.find(x=>x.id===b.dataset.av); if(!it) return;
    const next=!it.available; b.disabled=true;
    try{
      const r=await fetch(api('admin-menu'),{method:'POST',...F,headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ action:'available', ids:[it.id], available:next })});
      if(r.status===401){ handle401(); return; }
      it.available=next; mbRender();
    }catch(e){ alert('Сетевая ошибка.'); b.disabled=false; }
  });

  // --- подкатегории: создание и переименование ---
  box.querySelectorAll('[data-addsub]').forEach(b=>b.onclick=async()=>{
    const name=prompt('Название подкатегории (по-русски):');
    if(!name || !name.trim()) return;
    await mbSaveSub({ category_id:b.dataset.addsub, title_ru:name.trim(),
                      sort:(mbSubsOf(b.dataset.addsub).length+1)*10 });
  });
  box.querySelectorAll('[data-ms]').forEach(b=>b.onclick=async()=>{
    const sc=MENU.subcategories.find(x=>x.id===b.dataset.ms); if(!sc) return;
    const ru=prompt('Название (RU):', sc.title_ru); if(ru===null) return;
    const ka=prompt('ქართული:', sc.title_ka||''); if(ka===null) return;
    const en=prompt('English:', sc.title_en||''); if(en===null) return;
    await mbSaveSub({ id:sc.id, title_ru:ru.trim(), title_ka:ka.trim(), title_en:en.trim() });
  });

  // --- звезда: показывать подкатегорию в общем списке «Всё меню» ---
  box.querySelectorAll('[data-sf]').forEach(b=>b.onclick=async()=>{
    const sc=MENU.subcategories.find(x=>x.id===b.dataset.sf); if(!sc) return;
    const next = sc.in_overview===false; b.disabled=true;
    try{
      const r=await fetch(api('admin-menu'),{method:'POST',...F,headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ kind:'subcategory', id:sc.id, in_overview:next })});
      if(r.status===401){ handle401(); return; }
      const d=await r.json().catch(()=>({}));
      // Раньше ответ не проверялся: при ошибке сервера звезда всё равно
      // переключалась на экране, а после перезагрузки возвращалась обратно.
      if(!r.ok || !d.ok){
        alert('Не сохранилось: '+(d.detail||d.error||'ошибка сервера')+
              '\\n\\nЕсли это первая попытка — возможно, не выполнен db/menu-overview.sql в Neon.');
        b.disabled=false;
        return;
      }
      sc.in_overview=next; mbRender();
    }catch(e){ alert('Сетевая ошибка.'); b.disabled=false; }
  });

  // Звезда у позиции: убрать конкретное блюдо из «Всё меню».
  box.querySelectorAll('[data-io]').forEach(b=>b.onclick=async()=>{
    const it=MENU.items.find(x=>x.id===b.dataset.io); if(!it) return;
    const next = it.in_overview===false; b.disabled=true;
    try{
      const r=await fetch(api('admin-menu'),{method:'POST',...F,headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ kind:'item', id:it.id, in_overview:next })});
      if(r.status===401){ handle401(); return; }
      const d=await r.json().catch(()=>({}));
      if(!r.ok || !d.ok){ alert('Не сохранилось: '+(d.detail||d.error||'ошибка сервера')); b.disabled=false; return; }
      it.in_overview=next; mbRender();
    }catch(e){ alert('Сетевая ошибка.'); b.disabled=false; }
  });

  // Звезда у категории: убрать её из «Всё меню» целиком, оставив доступной
  // по плитке и в рельсе разделов.
  box.querySelectorAll('[data-co]').forEach(b=>b.onclick=async()=>{
    const c=MENU.categories.find(x=>x.id===b.dataset.co); if(!c) return;
    const next = c.in_overview===false; b.disabled=true;
    try{
      const r=await fetch(api('admin-menu'),{method:'POST',...F,headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ kind:'category', id:c.id, in_overview:next })});
      if(r.status===401){ handle401(); return; }
      const d=await r.json().catch(()=>({}));
      if(!r.ok || !d.ok){ alert('Не сохранилось: '+(d.detail||d.error||'ошибка сервера')); b.disabled=false; return; }
      c.in_overview=next; mbRender();
    }catch(e){ alert('Сетевая ошибка.'); b.disabled=false; }
  });

  // --- удаление ---
  box.querySelectorAll('[data-di]').forEach(b=>b.onclick=async()=>{
    const it=MENU.items.find(x=>x.id===b.dataset.di); if(!it) return;
    if(!confirm('Удалить позицию «'+it.title_ru+'»? Это необратимо.')) return;
    await mbDelete('item',[it.id]);
  });
  box.querySelectorAll('[data-dc]').forEach(b=>b.onclick=async()=>{
    const c=MENU.categories.find(x=>x.id===b.dataset.dc); if(!c) return;
    const n=MENU.items.filter(i=>i.category_id===c.id).length;
    if(!confirm('Удалить категорию «'+c.title_ru+'»?\\n\\nВместе с ней удалятся все позиции внутри ('+n+'). Необратимо.')) return;
    await mbDelete('category',[c.id]);
  });
  box.querySelectorAll('[data-ds]').forEach(b=>b.onclick=async()=>{
    const sc=MENU.subcategories.find(x=>x.id===b.dataset.ds); if(!sc) return;
    const n=mbItemsIn(sc.category_id, sc.id).length;
    if(!confirm('Удалить подкатегорию «'+sc.title_ru+'»?\\n\\nПозиции ('+n+') останутся в категории без подкатегории.')) return;
    await mbDelete('subcategory',[sc.id]);
  });

  // --- редактирование через формы сверху ---
  box.querySelectorAll('[data-mc]').forEach(b=>b.onclick=()=>{
    const c=MENU.categories.find(x=>x.id===b.dataset.mc); if(!c) return;
    MC_EDIT=c.id;
    $('mc-ru').value=c.title_ru||''; $('mc-ka').value=c.title_ka||'';
    $('mc-en').value=c.title_en||''; $('mc-sort').value=c.sort; $('mc-menu').value=c.menu_key||'main';
    $('mc-save').textContent='Сохранить категорию'; $('mc-cancel').style.display='inline-block';
    window.scrollTo({top:0,behavior:'smooth'});
  });
  box.querySelectorAll('[data-mi]').forEach(b=>b.onclick=()=>{
    const i=MENU.items.find(x=>x.id===b.dataset.mi); if(!i) return;
    MI_EDIT=i.id;
    $('mi-cat').value=i.category_id; $('mi-ru').value=i.title_ru||'';
    $('mi-ka').value=i.title_ka||''; $('mi-en').value=i.title_en||'';
    $('mi-dru').value=i.desc_ru||''; $('mi-dka').value=i.desc_ka||''; $('mi-den').value=i.desc_en||'';
    $('mi-price').value=i.price; $('mi-photo').value=i.photo_url||'';
    $('mi-photo2').value=i.photo_hover_url||''; $('mi-sort').value=i.sort;
    $('mi-save').textContent='Сохранить позицию'; $('mi-cancel').style.display='inline-block';
    window.scrollTo({top:0,behavior:'smooth'});
  });

  // --- перетаскивание ---
  box.querySelectorAll('.mb-it').forEach(el=>{
    el.addEventListener('dragstart', e=>{
      MB_DRAG=el.dataset.item; el.classList.add('dragging');
      e.dataTransfer.effectAllowed='move';
      try{ e.dataTransfer.setData('text/plain', MB_DRAG); }catch(_){}
    });
    el.addEventListener('dragend', ()=>{ el.classList.remove('dragging'); MB_DRAG=null; });
    el.addEventListener('dragover', e=>e.preventDefault());
    el.addEventListener('drop', e=>{ e.preventDefault(); e.stopPropagation(); mbDrop(el.dataset.item); });
  });

  box.querySelectorAll('.mb-items').forEach(zone=>{
    zone.addEventListener('dragover', e=>{ e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', ()=>zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e=>{
      e.preventDefault(); zone.classList.remove('drag-over');
      mbDropTo(zone.dataset.drop, zone.dataset.dropsub || null);
    });
  });
}

// Позиция может стоять в нескольких категориях, оставаясь одной записью:
// описание и фото правятся в одном месте. Цена в дополнительной категории
// может отличаться — у бара у бассейна свой прайс.
function plcChips(item){
  const mine=(MENU.placements||[]).filter(p=>p.item_id===item.id);
  const chips=mine.map(p=>{
    const c=MENU.categories.find(x=>x.id===p.category_id);
    const price=(p.price!=null && p.price!=='') ? (' <b>'+esc(String(Number(p.price)))+'</b>') : '';
    return '<span>'+esc(c?c.title_ru:'?')+price+
      '<i data-unplace="'+esc(item.id)+'|'+esc(p.category_id)+'" title="Убрать">✕</i></span>';
  }).join('');
  return '<div class="plc">'+chips+
    '<button type="button" data-place="'+esc(item.id)+'">+ в категорию</button></div>';
}

async function mbPlace(itemId){
  const item=MENU.items.find(x=>x.id===itemId); if(!item) return;
  const opts=MENU.categories.filter(c=>c.id!==item.category_id);
  if(!opts.length){ alert('Других категорий нет.'); return; }

  const text=opts.map((c,i)=>(i+1)+') '+c.title_ru+(c.menu_key==='pool'?' (бассейн)':'')).join('\\n');
  const pick=prompt('В какую категорию добавить «'+item.title_ru+'»?\\n\\n'+text);
  const idx=Number(pick)-1;
  if(!(idx>=0 && idx<opts.length)) return;

  const price=prompt('Цена в этой категории.\\n\\nПусто — та же, что у позиции ('+item.price+' GEL).','');
  if(price===null) return;

  try{
    const r=await fetch(api('admin-menu'),{method:'POST',...F,headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ action:'placement', item_id:itemId, category_id:opts[idx].id, price:price.trim() })});
    if(r.status===401){ handle401(); return; }
    const d=await r.json().catch(()=>({}));
    if(!r.ok || !d.ok){ alert('Ошибка: '+(d.detail||d.error||'?')); return; }
    loadMenu();
  }catch(e){ alert('Сетевая ошибка.'); }
}

async function mbUnplace(itemId, categoryId){
  try{
    const r=await fetch(api('admin-menu'),{method:'POST',...F,headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ action:'unplace', item_id:itemId, category_id:categoryId })});
    if(r.status===401){ handle401(); return; }
    loadMenu();
  }catch(e){ alert('Сетевая ошибка.'); }
}

async function mbSaveSub(payload){
  try{
    const r=await fetch(api('admin-menu'),{method:'POST',...F,headers:{'Content-Type':'application/json'},
      body:JSON.stringify(Object.assign({ kind:'subcategory' }, payload))});
    if(r.status===401){ handle401(); return; }
    const d=await r.json().catch(()=>({}));
    if(r.ok&&d.ok) loadMenu();
    else alert('Ошибка: '+(d.detail||d.error||'?'));
  }catch(e){ alert('Сетевая ошибка.'); }
}

async function mbDelete(kind, ids){
  try{
    const r=await fetch(api('admin-menu'),{method:'POST',...F,headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ action:'delete', kind:kind, ids:ids })});
    if(r.status===401){ handle401(); return; }
    const d=await r.json().catch(()=>({}));
    if(r.ok&&d.ok) loadMenu();
    else alert('Ошибка: '+(d.detail||d.error||'?'));
  }catch(e){ alert('Сетевая ошибка.'); }
}

// Бросили на другую позицию — встаём на её место (в её же группе).
function mbDrop(targetId){
  if(!MB_DRAG || MB_DRAG===targetId) return;
  const src=MENU.items.find(x=>x.id===MB_DRAG);
  const dst=MENU.items.find(x=>x.id===targetId);
  if(!src||!dst) return;
  src.category_id=dst.category_id;
  src.subcategory_id=dst.subcategory_id||null;
  src.sort=dst.sort-1;   // чуть выше цели; ровные значения вернёт mbResequence
  mbResequence(); mbMarkDirty(); mbRender();
}

// Бросили в пустое место группы — уходим в её конец.
function mbDropTo(catId, subId){
  if(!MB_DRAG) return;
  const src=MENU.items.find(x=>x.id===MB_DRAG);
  if(!src) return;
  if(src.category_id===catId && (src.subcategory_id||null)===(subId||null)) return;
  src.category_id=catId; src.subcategory_id=subId||null;
  src.sort=(mbItemsIn(catId, subId||null).length+1)*10;
  mbResequence(); mbMarkDirty(); mbRender();
}

$('mb-save-btn').addEventListener('click', async ()=>{
  if(!MB_DIRTY) return;
  mbResequence();
  const btn=$('mb-save-btn'); btn.disabled=true; btn.textContent='Сохраняю…';
  try{
    const r=await fetch(api('admin-menu'),{method:'POST',...F,headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        action:'reorder',
        categories:MENU.categories.map(c=>({ id:c.id, sort:c.sort })),
        subcategories:(MENU.subcategories||[]).map(sc=>({ id:sc.id, sort:sc.sort })),
        items:MENU.items.map(i=>({ id:i.id, category_id:i.category_id, subcategory_id:i.subcategory_id||null, sort:i.sort }))
      })});
    if(r.status===401){ handle401(); return; }
    const d=await r.json().catch(()=>({}));
    if(r.ok&&d.ok){ loadMenu(); }
    else alert('Ошибка: '+(d.detail||d.error||'?'));
  }catch(e){ alert('Сетевая ошибка.'); }
  finally{ btn.disabled=false; btn.textContent='Сохранить'; }
});

$('mb-undo-btn').addEventListener('click', ()=>{
  if(!MB_SNAPSHOT) return;
  MENU=JSON.parse(MB_SNAPSHOT);
  MB_DIRTY=false;
  $('mb-save').classList.remove('show');
  mbRender();
});

function mcReset(){
  MC_EDIT=null; ['mc-ru','mc-ka','mc-en'].forEach(id=>$(id).value=''); $('mc-sort').value='0'; $('mc-menu').value='main';
  $('mc-save').textContent='Добавить категорию'; $('mc-cancel').style.display='none';
}
function miReset(){
  MI_EDIT=null; ['mi-ru','mi-ka','mi-en','mi-dru','mi-dka','mi-den','mi-price','mi-photo','mi-photo2'].forEach(id=>$(id).value='');
  $('mi-sort').value='0';
  $('mi-save').textContent='Добавить позицию'; $('mi-cancel').style.display='none';
}
$('mc-cancel').addEventListener('click', mcReset);
$('mi-cancel').addEventListener('click', miReset);

$('mc-save').addEventListener('click', async ()=>{
  const m=$('mc-msg'); m.style.display='none';
  const title_ru=$('mc-ru').value.trim();
  if(!title_ru){ msg(m,'Укажи название на русском.',false); return; }
  const body={ kind:'category', title_ru, title_ka:$('mc-ka').value.trim(), title_en:$('mc-en').value.trim(), sort:$('mc-sort').value, menu_key:$('mc-menu').value };
  if(MC_EDIT) body.id=MC_EDIT;
  try{
    const r=await fetch(api('admin-menu'),{method:'POST',...F,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(r.status===401){ handle401(); return; }
    const d=await r.json().catch(()=>({}));
    if(r.ok&&d.ok){ msg(m,MC_EDIT?'Категория обновлена.':'Категория создана.',true); mcReset(); loadMenu(); }
    else msg(m,'Ошибка: '+(d.detail||d.error||'?'),false);
  }catch(e){ msg(m,'Сетевая ошибка.',false); }
});

$('mi-save').addEventListener('click', async ()=>{
  const m=$('mi-msg'); m.style.display='none';
  const title_ru=$('mi-ru').value.trim(), category_id=$('mi-cat').value, price=$('mi-price').value.trim();
  if(!category_id){ msg(m,'Выбери категорию.',false); return; }
  if(!title_ru){ msg(m,'Укажи название на русском.',false); return; }
  if(price===''){ msg(m,'Укажи цену.',false); return; }
  const body={ kind:'item', category_id, title_ru, price,
    title_ka:$('mi-ka').value.trim(), title_en:$('mi-en').value.trim(),
    desc_ru:$('mi-dru').value.trim(), desc_ka:$('mi-dka').value.trim(), desc_en:$('mi-den').value.trim(),
    photo_url:$('mi-photo').value.trim(), photo_hover_url:$('mi-photo2').value.trim(),
    sort:$('mi-sort').value };
  if(MI_EDIT) body.id=MI_EDIT;
  try{
    const r=await fetch(api('admin-menu'),{method:'POST',...F,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(r.status===401){ handle401(); return; }
    const d=await r.json().catch(()=>({}));
    if(r.ok&&d.ok){ msg(m,MI_EDIT?'Позиция обновлена.':'Позиция создана.',true); miReset(); loadMenu(); }
    else msg(m,'Ошибка: '+(d.detail||d.error||'?'),false);
  }catch(e){ msg(m,'Сетевая ошибка.',false); }
});

// ---------- BATCH (events) ----------
function evSelected(){ return Array.from(document.querySelectorAll('#ev-list input.sel:checked')).map(c=>c.dataset.id); }
function evBatchRefresh(){
  const n=evSelected().length;
  $('ev-batch-n').textContent=n;
  $('ev-batch').classList.toggle('show', n>0);
}
$('ev-batch-del').addEventListener('click', async ()=>{
  const ids=evSelected(); if(!ids.length) return;
  if(!confirm('Удалить событий: '+ids.length+'?\\n\\n⚠️ Удалятся также ВСЕ их сеансы и ВСЕ брони этих сеансов. Это необратимо.')) return;
  try{
    const r=await fetch(api('admin-events'),{method:'POST',...F,headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'delete',ids})});
    if(r.status===401){ handle401(); return; }
    const d=await r.json().catch(()=>({}));
    if(r.ok&&d.ok){ await Promise.all([loadEventsList(), loadEventOptions(), loadSessionsList(), loadToday()]); evBatchRefresh(); }
    else alert('Ошибка: '+(d.detail||d.error||'?'));
  }catch(e){ alert('Сетевая ошибка.'); }
});
$('ev-batch-apply').addEventListener('click', async ()=>{
  const ids=evSelected(); if(!ids.length) return;
  const price=$('ev-batch-price').value.trim();
  const format=$('ev-batch-format').value;
  if(!price && !format){ alert('Укажи цену и/или формат.'); return; }
  try{
    const r=await fetch(api('admin-events'),{method:'POST',...F,headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'bulk',ids,price:price||null,format:format||null})});
    if(r.status===401){ handle401(); return; }
    const d=await r.json().catch(()=>({}));
    if(r.ok&&d.ok){ $('ev-batch-price').value=''; $('ev-batch-format').value=''; await Promise.all([loadEventsList(), loadEventOptions(), loadSessionsList()]); evBatchRefresh(); }
    else alert('Ошибка: '+(d.detail||d.error||'?'));
  }catch(e){ alert('Сетевая ошибка.'); }
});

// ---------- BATCH (sessions) ----------
function ssSelected(){ return Array.from(document.querySelectorAll('#ss-list input.sel:checked')).map(c=>c.dataset.id); }
function ssBatchRefresh(){
  const n=ssSelected().length;
  $('ss-batch-n').textContent=n;
  $('ss-batch').classList.toggle('show', n>0);
  if(n>0){
    // mirror the event options into the reassign select
    const opts=$('ss-event').innerHTML.replace('Выбери событие','переназначить на… —');
    if($('ss-batch-event').options.length<=1) $('ss-batch-event').innerHTML=opts;
  }
}
$('ss-batch-del').addEventListener('click', async ()=>{
  const ids=ssSelected(); if(!ids.length) return;
  if(!confirm('Удалить сеансов: '+ids.length+'?\\n\\n⚠️ Удалятся также ВСЕ брони этих сеансов. Это необратимо.')) return;
  try{
    const r=await fetch(api('admin-sessions'),{method:'POST',...F,headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'delete',ids})});
    if(r.status===401){ handle401(); return; }
    const d=await r.json().catch(()=>({}));
    if(r.ok&&d.ok){ await Promise.all([loadSessionsList(), loadToday()]); ssBatchRefresh(); }
    else alert('Ошибка: '+(d.detail||d.error||'?'));
  }catch(e){ alert('Сетевая ошибка.'); }
});
$('ss-batch-apply').addEventListener('click', async ()=>{
  const ids=ssSelected(); if(!ids.length) return;
  const event_id=$('ss-batch-event').value;
  if(!event_id){ alert('Выбери событие для переназначения.'); return; }
  try{
    const r=await fetch(api('admin-sessions'),{method:'POST',...F,headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'reassign',ids,event_id})});
    if(r.status===401){ handle401(); return; }
    const d=await r.json().catch(()=>({}));
    if(r.ok&&d.ok){ await Promise.all([loadSessionsList(), loadToday()]); ssBatchRefresh(); }
    else alert('Ошибка: '+(d.detail||d.error||'?'));
  }catch(e){ alert('Сетевая ошибка.'); }
});

// ---------- ERIK ----------
$('erik-link').addEventListener('click', (e)=>{ e.preventDefault(); switchErik(true); tryErik(); });
$('erik-back').addEventListener('click', ()=>switchErik(false));

function switchErik(on){
  $('erik-area').style.display = on ? 'block' : 'none';
  $('main-tabs').style.display = on ? 'none' : 'flex';
  document.querySelectorAll('.panel').forEach(x=>x.style.display = on ? 'none' : '');
  $('fab').style.display = on ? 'none' : 'block';
  if(!on){ document.querySelectorAll('.panel').forEach(x=>x.style.display=''); }
}

async function tryErik(){
  // if cookie already valid, skip the gate
  try{
    const r=await fetch(api('erik-payments')+'?days=1', F);
    if(r.ok){ $('erik-gate').style.display='none'; $('erik-content').style.display='block'; loadErik(); return; }
  }catch(e){}
  $('erik-gate').style.display='block'; $('erik-content').style.display='none';
}

$('erik-enter').addEventListener('click', async ()=>{
  const m=$('erik-gate-msg'); m.style.display='none';
  const pass=$('erik-pass').value;
  if(!pass){ msg(m,'Введи пароль.',false); return; }
  try{
    const r=await fetch(api('erik-login'),{method:'POST',...F,headers:{'Content-Type':'application/json'},body:JSON.stringify({pass})});
    const d=await r.json().catch(()=>({}));
    if(r.ok&&d.ok){ $('erik-pass').value=''; $('erik-gate').style.display='none'; $('erik-content').style.display='block'; loadErik(); }
    else msg(m,d.error||'Неверный пароль',false);
  }catch(e){ msg(m,'Сетевая ошибка.',false); }
});
$('erik-pass').addEventListener('keydown', e=>{ if(e.key==='Enter') $('erik-enter').click(); });
$('erik-reload').addEventListener('click', loadErik);
$('erik-days').addEventListener('change', loadErik);

async function loadErik(){
  const box=$('erik-list'); box.innerHTML='<div class="hint">Загрузка…</div>';
  try{
    const u=new URL(api('erik-payments'), location.origin);
    u.searchParams.set('days', $('erik-days').value);
    const r=await fetch(u, F);
    if(r.status===401){ $('erik-gate').style.display='block'; $('erik-content').style.display='none'; return; }
    const d=await r.json(); const ps=d.payments||[];
    if(!ps.length){ box.innerHTML='<div class="hint">Платежей за период нет.</div>'; return; }
    box.innerHTML = ps.map(p => {
      const badge = p.refund_status ? 'refunded' : (p.status==='paid' ? 'paid' : (p.status==='failed' ? 'unpaid' : 'deposit'));
      const label = p.refund_status ? p.refund_status : p.status;
      return '<div class="pay" data-bog="'+esc(p.bog_order_id||'')+'">'+
        '<div class="top"><span><b>'+esc(p.guest_name||'—')+'</b> · '+esc(p.event_title||'')+' · '+esc(p.table_label||'')+'</span>'+
        '<span class="badge '+badge+'">'+esc(label)+'</span></div>'+
        '<div class="sub">'+esc(String(p.amount||''))+' GEL · '+esc(new Date(p.created_at).toLocaleString('ru-RU'))+' · '+esc(p.internal_order_id||'')+'</div>'+
        '<div class="detail"><div class="hint">Клик — загрузить детали из BOG…</div></div></div>';
    }).join('');
    box.querySelectorAll('.pay').forEach(el=>{
      el.addEventListener('click', ()=>toggleDetail(el));
    });
  }catch(e){ box.innerHTML='<div class="hint">Ошибка загрузки.</div>'; }
}

async function toggleDetail(el){
  if(el.classList.contains('open')){ el.classList.remove('open'); return; }
  el.classList.add('open');
  const box=el.querySelector('.detail');
  if(el.dataset.loaded==='1') return;
  const bog=el.dataset.bog;
  if(!bog){ box.innerHTML='<div class="hint">Нет BOG order id (оплата не создалась в BOG).</div>'; el.dataset.loaded='1'; return; }
  box.innerHTML='<div class="hint">Запрос в BOG…</div>';
  try{
    const u=new URL(api('erik-payment-detail'), location.origin);
    u.searchParams.set('order_id', bog);
    const r=await fetch(u, F);
    const d=await r.json();
    if(!r.ok||!d.ok){ box.innerHTML='<div class="hint">Ошибка BOG: '+esc(d.detail||d.error||'?')+'</div>'; return; }
    const t=d.detail;
    const vclass = /успешно/i.test(t.verdict) ? 'good' : (/истёк|воронк/i.test(t.verdict) ? 'meh' : 'bad');
    const kv = (k,v) => v ? '<div class="kv"><span class="k">'+k+'</span><span>'+esc(v)+'</span></div>' : '';
    box.innerHTML =
      '<div class="verdict '+vclass+'">'+esc(t.verdict||('Статус: '+t.status))+'</div>'+
      kv('Статус', t.status + (t.status_localized ? ' ('+t.status_localized+')' : '')) +
      kv('Метод оплаты', t.payment_method) +
      kv('Карта', t.payer + (t.card_expiry ? ' · до '+t.card_expiry : '')) +
      kv('Запрошено', t.amount_requested ? t.amount_requested+' '+t.currency : '') +
      kv('Списано', t.amount_transferred ? t.amount_transferred+' '+t.currency : '') +
      kv('Возвращено', t.amount_refunded ? t.amount_refunded+' '+t.currency : '') +
      kv('Код ответа', t.response_code ? t.response_code+' — '+t.response_desc : '') +
      kv('Причина отказа', t.reject_reason) +
      kv('Transaction ID', t.transaction_id) +
      kv('Создан', t.created) +
      kv('Истекает', t.expires) +
      kv('BOG order', t.order_id) +
      kv('Наш order', t.external_order_id);
    el.dataset.loaded='1';
  }catch(e){ box.innerHTML='<div class="hint">Сетевая ошибка.</div>'; }
}
</script>
</body>
</html>`;
}

export default function handler(req, res) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(page());
}
