// Serves the staff admin panel at /admin (rewrite in vercel.json).
// Stage 4: fully DB-backed. Tabs: Сегодня / События / Сеансы. Manual booking
// is a floating action button (modal). "Для Эрика" is a separate area behind
// a second password (ERIK_PANEL_PASS) showing live-parsed BOG payment logs.

const SEATS = [
  "Стол 1", "Стол 2", "Стол 3", "Стол 4", "Стол 5", "Стол 6",
  "Стол 7", "Стол 8", "Стол 9", "Стол 10",
  "Бар 1", "Бар 2", "Бар 3", "Бар 4"
];

const DEPOSIT_MOV =
  "(вычитается из общей суммы счёта) ❗️Бронь столика на фильм нельзя отменить. Если у Вас не получается посетить этот показ, мы можем перенести Ваше бронирование на другой день! По всем вопросам обращайтесь к нам в директ Instagram.";

const DEPOSIT_DIN =
  "(сет-меню входит в стоимость) ❗️Условия отмены: отмена за 3 дня до мероприятия и ранее - возвращается 100% суммы\n- отмена за 2 дня - взвращается 50%\n- отмена за день и в день мероприятия - сумма за билет сгорает.";

function page() {
  const cfg = JSON.stringify({ seats: SEATS, depositMov: DEPOSIT_MOV, depositDin: DEPOSIT_DIN });
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
    <div class="tab active" data-tab="today">Сегодня</div>
    <div class="tab" data-tab="events">События</div>
    <div class="tab" data-tab="sessions">Сеансы</div>
    <div class="tab" data-tab="menu">Меню</div>
    <div class="tab" data-tab="floor">Зал</div>
    <div class="tab" data-tab="svc">Обслуживание<span id="svc-badge"></span></div>
  </div>

  <!-- ===== TODAY ===== -->
  <div class="panel active" id="panel-today">
    <div class="card" style="display:flex;align-items:center;gap:10px;padding:12px 16px">
      <label style="font-size:13px;font-weight:600">Дата:</label>
      <input id="today-date" readonly style="flex:1;max-width:160px;padding:9px 12px;font-size:14px;border:1px solid #ccc;border-radius:8px;background:#fff;cursor:pointer" placeholder="сегодня">
      <button class="btn small ghost" id="today-reset">Сегодня</button>
    </div>
    <div id="today-list"><div class="hint">Загрузка…</div></div>
  </div>

  <!-- ===== EVENTS ===== -->
  <div class="panel" id="panel-events">
    <div class="card">
      <div class="row"><label>Фильм (поиск TMDB) *</label>
        <div class="search"><input id="ev-query" placeholder="например Рататуй"><button class="btn small" id="ev-searchbtn">Искать</button></div>
        <div class="cards" id="ev-results"></div>
        <div class="hint" id="ev-picked"></div>
      </div>
      <div class="row two">
        <div><label>Формат *</label><select id="ev-format"><option value="mov">mov — фильм</option><option value="din">din — киноужин</option></select></div>
        <div><label>Цена (GEL, с человека) *</label><input id="ev-price" type="number" min="0" step="0.01" placeholder="30"></div>
      </div>
      <div class="row"><label>Постер (URL)</label><input id="ev-poster" placeholder="оставь пустым — возьмётся из TMDB">
        <div class="hint">Своя картинка вместо найденной в TMDB. Нужна для того, чего в TMDB нет: футбол, концерты, вечеринки.</div></div>
      <div class="row"><label>DepositText (шаблон по формату, можно править)</label><textarea id="ev-deposit"></textarea></div>
      <button class="btn" id="ev-create">Создать событие</button>
      <button class="btn ghost" id="ev-cancel" style="display:none;margin-left:8px">Отмена</button>
      <div class="msg" id="ev-msg"></div>
    </div>
    <div class="card">
      <label style="font-size:13px;font-weight:600">Существующие события</label>
      <div class="batchbar" id="ev-batch">
        <span><b id="ev-batch-n">0</b> выбрано</span>
        <input id="ev-batch-price" type="number" min="0" step="0.01" placeholder="Цена" style="width:80px">
        <select id="ev-batch-format"><option value="">формат —</option><option value="mov">mov</option><option value="din">din</option></select>
        <button class="btn small" id="ev-batch-apply">Применить</button>
        <button class="btn small danger" id="ev-batch-del">Удалить</button>
      </div>
      <div id="ev-list" style="margin-top:8px"><div class="hint">Загрузка…</div></div>
    </div>
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
      <div class="hint" style="margin:6px 0 10px">Перетаскивай за ⠿ или двигай стрелками. Позицию можно перенести в другую категорию выпадающим списком. Глаз скрывает категорию с сайта, кружок снимает позицию с продажи. Звезда у подкатегории — показывать её на главной («Всё меню»); если в категории не отмечено ни одной, показываются все.</div><div id="menu-list" style="margin-top:8px"><div class="hint">Загрузка…</div></div><div class="mb-save" id="mb-save"><span id="mb-save-t">Порядок изменён</span><button class="btn small" id="mb-save-btn">Сохранить</button><button class="btn small ghost" id="mb-undo-btn">Отменить</button></div>
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
  if(t.dataset.tab==='sessions') { loadEventOptions(); loadSessionsList(); }
  if(t.dataset.tab==='menu') loadMenu();
  if(t.dataset.tab==='floor') loadFloor();
  if(t.dataset.tab==='svc') { loadSvc(); loadNotify(); }
}));

let BOOTED=false;
function boot(){
  if(BOOTED) return; BOOTED=true;
  loadToday();
  loadEventsList();
  loadEventOptions();
  loadSessionsList();
  $('ev-deposit').value = CFG.depositMov;
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
$('today-date').addEventListener('click', ()=>{
  calOpen($('today-date'), parseDdMm($('today-date').value), (d)=>{
    $('today-date').value = fmtDdMm(d);
    TODAY_ISO = d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
    loadToday();
  });
});
$('today-reset').addEventListener('click', ()=>{
  TODAY_ISO=null; $('today-date').value='';
  loadToday();
});

// ---------- TODAY ----------
let TODAY_ISO = null; // null = today

async function loadToday(){
  const box=$('today-list'); box.innerHTML='<div class="hint">Загрузка…</div>';
  try{
    const u=new URL(api('admin-today'), location.origin);
    if(TODAY_ISO) u.searchParams.set('date', TODAY_ISO);
    const r=await fetch(u, F);
    if(r.status===401){ handle401(); return; }
    const d=await r.json();
    const ss=d.sessions||[];
    if(!ss.length){ box.innerHTML='<div class="hint">На '+esc(d.date)+' сеансов нет.</div>'; return; }
    box.innerHTML = ss.map(s => {
      const bks=(s.bookings||[]).map(b =>
        '<div class="bk"><span class="st">'+esc(b.table_label)+'</span>'+
        '<span>'+esc(b.guest_name||'—')+' · '+esc(String(b.guests||'?'))+' чел</span>'+
        '<span><span class="badge '+esc(b.payment_status)+'">'+esc(b.payment_status)+'</span> '+
        '<span class="badge '+esc(b.source)+'">'+esc(b.source)+'</span></span></div>'
      ).join('') || '<div class="hint" style="padding:5px 0">Броней нет</div>';
      return '<div class="sess"><h3>'+esc(s.title)+'</h3><div class="meta">'+esc(s.time)+' · '+esc(s.format)+' · '+esc(String(s.price))+' GEL · занято '+(s.bookings||[]).length+'</div>'+bks+'</div>';
    }).join('');
  }catch(e){ box.innerHTML='<div class="hint">Ошибка загрузки.</div>'; }
}

// ---------- EVENTS ----------
let EV_PICK = { title:'', poster:'', tmdb_id:null };
let EV_EDIT = null; // event being edited: {id,title,poster_url}

function evResetForm(){
  EV_EDIT=null; EV_PICK={ title:'', poster:'', tmdb_id:null };
  $('ev-picked').textContent=''; $('ev-price').value=''; $('ev-poster').value='';
  $('ev-results').innerHTML='';
  $('ev-deposit').value = $('ev-format').value==='din' ? CFG.depositDin : CFG.depositMov;
  $('ev-create').textContent='Создать событие';
  $('ev-cancel').style.display='none';
}


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
        $('ev-poster').value=m.poster||'';   // подставили, но можно заменить своей
        $('ev-picked').textContent='Выбрано: '+m.title+yr;
      };
      box.appendChild(c);
    });
  }catch(e){ box.innerHTML='<div class="hint">Ошибка поиска.</div>'; }
}

$('ev-format').addEventListener('change', ()=>{
  const cur=$('ev-deposit').value.trim();
  if(!cur || cur===CFG.depositMov || cur===CFG.depositDin){
    $('ev-deposit').value = $('ev-format').value==='din' ? CFG.depositDin : CFG.depositMov;
  }
});

$('ev-cancel').addEventListener('click', evResetForm);

$('ev-create').addEventListener('click', async ()=>{
  const m=$('ev-msg'); m.style.display='none';
  // In edit mode a new TMDB pick is optional: keep the existing title/poster
  // unless a new film was picked.
  const title = EV_PICK.title || (EV_EDIT && EV_EDIT.title) || '';
  // Приоритет у поля: если туда вписали свой URL — используем его,
  // иначе постер выбранного в TMDB фильма, иначе прежний у события.
  const poster = $('ev-poster').value.trim()
    || (EV_PICK.title ? EV_PICK.poster : '')
    || (EV_EDIT ? (EV_EDIT.poster_url||'') : '');
  if(!title){ msg(m,'Найди и выбери фильм.',false); return; }
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
    const d=await r.json(); const evs=d.events||[];
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
        $('ev-format').value=e.format||'mov';
        $('ev-price').value=e.price;
        $('ev-poster').value=e.poster_url||'';
        $('ev-deposit').value=e.deposit_text||($('ev-format').value==='din'?CFG.depositDin:CFG.depositMov);
        $('ev-picked').textContent='Редактирование: '+e.title+(e.poster_url?'':' — постера нет, найди фильм в TMDB чтобы добавить');
        $('ev-create').textContent='Сохранить изменения';
        $('ev-cancel').style.display='inline-block';
        window.scrollTo({top:0,behavior:'smooth'});
      };
    });
  }catch(e){ box.innerHTML='<div class="hint">Ошибка.</div>'; }
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
    payment_status:$('mb-payment').value };
  if(!p.session_id||!p.table){ msg(m,'Выбери сеанс и стол.',false); return; }
  const btn=$('mb-submit'); btn.disabled=true; btn.textContent='Сохранение…';
  try{
    const r=await fetch(api('manual-booking'),{method:'POST',...F,headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});
    if(r.status===401){ handle401(); return; }
    const d=await r.json().catch(()=>({}));
    if(r.ok&&d.ok){
      msg(m,'Бронь создана: '+d.table+', '+d.title+' '+d.date+' '+d.time,true);
      $('mb-name').value=''; $('mb-phone').value=''; $('mb-instagram').value=''; $('mb-amount').value=''; $('mb-table').value='';
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

// ---------- КОНСТРУКТОР ЗАЛА ----------
// Метка стола («Стол 5») — ключ, по которому бронь занимает место. Поэтому
// геометрию можно менять свободно, а переименование и удаление показывают
// предупреждение: у метки может быть история броней.
//
// Правки копятся локально и уходят одним запросом по кнопке — случайное
// движение мышью не должно менять схему на боевом сайте мгновенно.

let FLOOR = { settings:{}, tables:[], inUse:{} };
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
    FLOOR = { settings:d.settings||{}, tables:d.tables||[], inUse:d.inUse||{} };
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
      const sel = t.label===FL_SEL;
      const style = 'left:'+t.x+'px;top:'+t.y+'px;width:'+t.w+'px;height:'+t.h+'px;'+
        'border-radius:'+(t.shape==='circle'?'50%':'10px')+';'+
        (t.rotation?('transform:rotate('+t.rotation+'deg);'):'');
      return '<div class="fl-t'+(t.zone==='bar'?' bar':'')+(t.active===false?' off':'')+(sel?' sel':'')+
        '" data-label="'+esc(t.label)+'" style="'+style+'">'+
          '<span>'+esc(t.label)+'<small>'+t.capacity_min+'–'+t.capacity_max+'</small></span>'+
          (sel?'<div class="fl-h" data-resize="1"></div>':'')+
        '</div>';
    }).join('');

  flBindCanvas();
  flSide();
}

function flBindCanvas(){
  $('fl-canvas').querySelectorAll('.fl-t').forEach(el=>{
    el.addEventListener('pointerdown', ev=>{
      const label = el.dataset.label;
      const t = FLOOR.tables.find(x=>x.label===label);
      if(!t) return;
      FL_SEL = label;
      const resizing = ev.target && ev.target.dataset && ev.target.dataset.resize==='1';
      FL_DRAG = {
        label, resizing,
        sx: ev.clientX, sy: ev.clientY,
        ox: t.x, oy: t.y, ow: t.w, oh: t.h
      };
      el.setPointerCapture && el.setPointerCapture(ev.pointerId);
      ev.preventDefault();
      flRender();
    });
  });
}

document.addEventListener('pointermove', ev=>{
  if(!FL_DRAG) return;
  const t = FLOOR.tables.find(x=>x.label===FL_DRAG.label);
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
  const t = FLOOR.tables.find(x=>x.label===FL_SEL);
  if(!t) return;
  const step = e.shiftKey ? (flGrid()||10) : 1;
  let used = true;
  if(e.key==='ArrowLeft')  t.x = Math.max(0, t.x-step);
  else if(e.key==='ArrowRight') t.x = t.x+step;
  else if(e.key==='ArrowUp')    t.y = Math.max(0, t.y-step);
  else if(e.key==='ArrowDown')  t.y = t.y+step;
  else if(e.key==='Delete' || e.key==='Backspace'){ flDelete(FL_SEL); return; }
  else used = false;
  if(used){ e.preventDefault(); flDirty(); flRender(); }
});

function flSide(){
  const box = $('fl-side');
  const t = FLOOR.tables.find(x=>x.label===FL_SEL);
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
      '<input type="checkbox" id="fl-active" style="width:16px;height:16px"'+(t.active!==false?' checked':'')+'> Показывать на сайте</label></div>'+
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
        FL_SEL = nv;
      }
      t[key] = v;
      flDirty(); flRender();
    });
  };
  bind('fl-label','label'); bind('fl-zone','zone'); bind('fl-shape','shape');
  bind('fl-rot','rotation',true); bind('fl-cmin','capacity_min',true); bind('fl-cmax','capacity_max',true);
  bind('fl-w','w',true); bind('fl-h','h',true);
  $('fl-active').addEventListener('change', ()=>{ t.active = $('fl-active').checked; flDirty(); flRender(); });
  $('fl-del').onclick = ()=>flDelete(t.label);
}

async function flDelete(label){
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

function flNextLabel(prefix){
  const nums = FLOOR.tables
    .filter(t=>t.label.indexOf(prefix)===0)
    .map(t=>Number((t.label.match(/\d+/)||[])[0])||0);
  return prefix+' '+((nums.length?Math.max.apply(null,nums):0)+1);
}

function flAdd(zone){
  const prefix = zone==='bar' ? 'Бар' : 'Стол';
  const label = flNextLabel(prefix);
  // Новый стол кладём в свободное место сверху слева, а не под курсор:
  // так он всегда виден, даже если холст прокручен.
  FLOOR.tables.push({
    label, zone, shape: zone==='bar' ? 'rect' : 'circle',
    x: flSnap(40), y: flSnap(40),
    w: zone==='bar' ? 70 : 90, h: zone==='bar' ? 60 : 90,
    rotation: 0, capacity_min: 1, capacity_max: zone==='bar' ? 2 : 4,
    sort: (FLOOR.tables.length+1)*10, active: true
  });
  FL_SEL = label;
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
  FLOOR.tables = JSON.parse(FL_SNAP);
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
        tables: FLOOR.tables.map((t,i)=>({ ...t, sort:(i+1)*10 }))
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
let MENU = { categories:[], subcategories:[], items:[] };
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
    MENU={ categories:d.categories||[], subcategories:d.subcategories||[], items:d.items||[] };
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
      '<select class="mb-move" data-mv="'+esc(i.id)+'">'+moveOpts(i.category_id, i.subcategory_id)+'</select>'+
      '<span class="arrows"><button data-iu="'+esc(i.id)+'"'+(ii===0?' disabled':'')+'>▲</button>'+
        '<button data-idn="'+esc(i.id)+'"'+(ii===total-1?' disabled':'')+'>▼</button></span>'+
      '<button class="btn small ghost" data-mi="'+esc(i.id)+'">Изм.</button>'+
      '<button class="btn small danger" data-di="'+esc(i.id)+'" title="Удалить">✕</button>'+
    '</div>';

  const group = (catId, sub, si, subTotal) => {
    const list = mbItemsIn(catId, sub ? sub.id : null);
    if(!sub && !list.length && mbSubsOf(catId).length) return '';   // пустая «без подкатегории» — не показываем
    const head = sub
      ? '<div class="mb-sub__h">'+
          '<span class="mb-sub__t">'+esc(sub.title_ru)+' <em>'+list.length+'</em></span>'+
          '<span class="arrows"><button data-su="'+esc(sub.id)+'"'+(si===0?' disabled':'')+'>▲</button>'+
            '<button data-sd="'+esc(sub.id)+'"'+(si===subTotal-1?' disabled':'')+'>▼</button></span>'+
          '<button class="mb-star'+(sub.featured?' on':'')+'" data-sf="'+esc(sub.id)+'" title="'+
            (sub.featured?'Показывается в «Всё меню»':'Скрыта из «Всё меню»')+'">★</button>'+
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
        '<button class="mb-eye" data-cv="'+esc(c.id)+'" title="'+(c.visible?'Видна на сайте':'Скрыта')+'">'+
          (c.visible?'👁':'🚫')+'</button>'+
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
    const next=!sc.featured; b.disabled=true;
    try{
      const r=await fetch(api('admin-menu'),{method:'POST',...F,headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ kind:'subcategory', id:sc.id, featured:next })});
      if(r.status===401){ handle401(); return; }
      sc.featured=next; mbRender();
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
    $('mc-en').value=c.title_en||''; $('mc-sort').value=c.sort;
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
  MC_EDIT=null; ['mc-ru','mc-ka','mc-en'].forEach(id=>$(id).value=''); $('mc-sort').value='0';
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
  const body={ kind:'category', title_ru, title_ka:$('mc-ka').value.trim(), title_en:$('mc-en').value.trim(), sort:$('mc-sort').value };
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
    if(r.ok&&d.ok){ loadEventsList(); loadEventOptions(); loadSessionsList(); loadToday(); evBatchRefresh(); }
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
    if(r.ok&&d.ok){ $('ev-batch-price').value=''; $('ev-batch-format').value=''; loadEventsList(); loadEventOptions(); loadSessionsList(); }
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
    if(r.ok&&d.ok){ loadSessionsList(); loadToday(); ssBatchRefresh(); }
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
    if(r.ok&&d.ok){ loadSessionsList(); loadToday(); ssBatchRefresh(); }
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
      const badge = p.status==='paid' ? 'paid' : (p.status==='failed' ? 'unpaid' : 'deposit');
      return '<div class="pay" data-bog="'+esc(p.bog_order_id||'')+'">'+
        '<div class="top"><span><b>'+esc(p.guest_name||'—')+'</b> · '+esc(p.event_title||'')+' · '+esc(p.table_label||'')+'</span>'+
        '<span class="badge '+badge+'">'+esc(p.status)+'</span></div>'+
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
