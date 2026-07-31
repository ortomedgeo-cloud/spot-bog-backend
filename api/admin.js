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
  .nch { display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid #eee; }
  .nch:last-child { border-bottom:none; }
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
        <div><label>Порядок</label><input id="mi-sort" type="number" value="0"></div>
      </div>
      <button class="btn" id="mi-save">Добавить позицию</button>
      <button class="btn ghost" id="mi-cancel" style="display:none;margin-left:8px">Отмена</button>
      <div class="msg" id="mi-msg"></div>
    </div>

    <div class="card">
      <label style="font-size:13px;font-weight:600">Меню</label>
      <div class="batchbar" id="mi-batch">
        <span><b id="mi-batch-n">0</b> выбрано</span>
        <button class="btn small" id="mi-batch-on">В наличии</button>
        <button class="btn small" id="mi-batch-off">Нет в наличии</button>
        <button class="btn small danger" id="mi-batch-del">Удалить</button>
      </div>
      <div id="menu-list" style="margin-top:8px"><div class="hint">Загрузка…</div></div>
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
    <div class="row two"><div><label>Имя</label><input id="mb-name"></div><div><label>Телефон</label><input id="mb-phone"></div></div>
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
  $('ev-picked').textContent=''; $('ev-price').value='';
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
  const poster = EV_PICK.title ? EV_PICK.poster : (EV_EDIT ? (EV_EDIT.poster_url||'') : '');
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
  $('ss-event').value=''; $('ss-date').value=''; $('ss-time').value='';
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
    const body={event_id,date,time};
    if(SS_EDIT) body.id = SS_EDIT;
    const r=await fetch(api('admin-sessions'),{method:'POST',...F,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(r.status===401){ handle401(); return; }
    const d=await r.json().catch(()=>({}));
    if(r.ok&&d.ok){
      if(SS_EDIT){ msg(m,'Сеанс обновлён.',true); ssResetForm(); }
      else {
        const link='https://spot-bar.site/reserve?session_id='+d.session.id;
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
      const link='https://spot-bar.site/reserve?session_id='+s.id;
      return '<div class="srow'+(s.is_archived?' arch':'')+'" data-i="'+i+'">'+
        '<input type="checkbox" class="sel" data-id="'+esc(s.id)+'">'+
        (s.poster_url?'<img src="'+esc(s.poster_url)+'">':'<img>')+
        '<div class="info"><div class="t">'+esc(s.title)+'</div><div class="d">'+esc(s.date)+' · '+esc(s.time)+' · '+esc(String(s.price))+' GEL</div></div>'+
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
      $('mb-name').value=''; $('mb-phone').value=''; $('mb-amount').value=''; $('mb-table').value='';
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

// ---------- КАНАЛЫ УВЕДОМЛЕНИЙ ----------

async function loadNotify(){
  const box = $('notify-list');
  try{
    const r = await fetch(api('admin-notify'), F);
    if(r.status===401){ handle401(); return; }
    const d = await r.json();
    const channels = d.channels || [];

    box.innerHTML = channels.map(function(ch){
      const hintClass = !ch.configured ? 'missing' : (!ch.enabled ? 'off' : '');
      const hintText = !ch.configured
        ? 'не настроен — не хватает: ' + ch.missing.join(', ')
        : (!ch.enabled ? 'настроен, но выключен' : 'настроен, уведомления идут');
      const testPart = (ch.configured && ch.enabled)
        ? '<button class="btn small ghost" data-test="'+esc(ch.channel)+'">Проверить</button><span class="nch__test-msg" data-testmsg="'+esc(ch.channel)+'"></span>'
        : '';
      return '<div class="nch">'+
        '<label class="tgl"><input type="checkbox" data-ch="'+esc(ch.channel)+'"'+(ch.enabled?' checked':'')+(ch.configured?'':' disabled')+'><span></span></label>'+
        '<div class="nch__main">'+
          '<div class="nch__name">'+esc(ch.title)+'</div>'+
          '<div class="nch__hint '+hintClass+'">'+esc(hintText)+'</div>'+
        '</div>'+
        testPart+
      '</div>';
    }).join('');

    box.querySelectorAll('input[data-ch]').forEach(function(inp){
      inp.addEventListener('change', function(){ setNotifyChannel(inp.dataset.ch, inp.checked); });
    });
    box.querySelectorAll('button[data-test]').forEach(function(btn){
      btn.addEventListener('click', function(){ testNotifyChannel(btn.dataset.test); });
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

// ---------- MENU ----------
let MENU = { categories:[], items:[] };
let MC_EDIT = null, MI_EDIT = null;

async function loadMenu(){
  const box=$('menu-list');
  try{
    const r=await fetch(api('admin-menu'), F);
    if(r.status===401){ handle401(); return; }
    const d=await r.json();
    MENU={ categories:d.categories||[], items:d.items||[] };

    // category select for the item form
    $('mi-cat').innerHTML='<option value="">Выбери категорию</option>'+
      MENU.categories.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.title_ru)+'</option>').join('');

    if(!MENU.categories.length){ box.innerHTML='<div class="hint">Категорий нет. Создай первую сверху.</div>'; return; }

    box.innerHTML = MENU.categories.map(c=>{
      const items = MENU.items.filter(i=>i.category_id===c.id);
      const rows = items.map(i=>
        '<div class="srow"'+(i.available?'':' style="opacity:.45"')+'>'+
          '<input type="checkbox" class="sel" data-id="'+esc(i.id)+'">'+
          (i.photo_url?'<img src="'+esc(i.photo_url)+'">':'<img>')+
          '<div class="info"><div class="t">'+esc(i.title_ru)+'</div>'+
          '<div class="d">'+esc(String(i.price))+' GEL'+(i.available?'':' · нет в наличии')+
          (i.title_ka?'':' · нет ქარ')+(i.title_en?'':' · нет EN')+'</div></div>'+
          '<button class="btn small ghost" data-mi="'+esc(i.id)+'">Изм.</button>'+
        '</div>'
      ).join('') || '<div class="hint" style="padding:6px 0">Пусто</div>';

      return '<div style="margin-bottom:16px">'+
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'+
          '<input type="checkbox" class="selcat" data-id="'+esc(c.id)+'" style="width:18px;height:18px">'+
          '<b style="font-size:15px"'+(c.visible?'':' style="opacity:.5"')+'>'+esc(c.title_ru)+'</b>'+
          '<span class="hint">'+(c.visible?'':'скрыта · ')+items.length+' поз.</span>'+
          '<button class="btn small ghost" data-mc="'+esc(c.id)+'" style="margin-left:auto">Изм.</button>'+
        '</div>'+rows+'</div>';
    }).join('');

    box.querySelectorAll('input.sel').forEach(cb=>cb.addEventListener('change', miBatchRefresh));
    box.querySelectorAll('button[data-mi]').forEach(b=>{
      b.onclick=()=>{
        const i=MENU.items.find(x=>x.id===b.dataset.mi); if(!i) return;
        MI_EDIT=i.id;
        $('mi-cat').value=i.category_id; $('mi-ru').value=i.title_ru||'';
        $('mi-ka').value=i.title_ka||''; $('mi-en').value=i.title_en||'';
        $('mi-dru').value=i.desc_ru||''; $('mi-dka').value=i.desc_ka||''; $('mi-den').value=i.desc_en||'';
        $('mi-price').value=i.price; $('mi-photo').value=i.photo_url||''; $('mi-sort').value=i.sort;
        $('mi-save').textContent='Сохранить позицию'; $('mi-cancel').style.display='inline-block';
        window.scrollTo({top:0,behavior:'smooth'});
      };
    });
    box.querySelectorAll('button[data-mc]').forEach(b=>{
      b.onclick=()=>{
        const c=MENU.categories.find(x=>x.id===b.dataset.mc); if(!c) return;
        MC_EDIT=c.id;
        $('mc-ru').value=c.title_ru||''; $('mc-ka').value=c.title_ka||'';
        $('mc-en').value=c.title_en||''; $('mc-sort').value=c.sort;
        $('mc-save').textContent='Сохранить категорию'; $('mc-cancel').style.display='inline-block';
        window.scrollTo({top:0,behavior:'smooth'});
      };
    });
  }catch(e){ box.innerHTML='<div class="hint">Ошибка загрузки меню.</div>'; }
}

function mcReset(){
  MC_EDIT=null; ['mc-ru','mc-ka','mc-en'].forEach(id=>$(id).value=''); $('mc-sort').value='0';
  $('mc-save').textContent='Добавить категорию'; $('mc-cancel').style.display='none';
}
function miReset(){
  MI_EDIT=null; ['mi-ru','mi-ka','mi-en','mi-dru','mi-dka','mi-den','mi-price','mi-photo'].forEach(id=>$(id).value='');
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
    photo_url:$('mi-photo').value.trim(), sort:$('mi-sort').value };
  if(MI_EDIT) body.id=MI_EDIT;
  try{
    const r=await fetch(api('admin-menu'),{method:'POST',...F,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(r.status===401){ handle401(); return; }
    const d=await r.json().catch(()=>({}));
    if(r.ok&&d.ok){ msg(m,MI_EDIT?'Позиция обновлена.':'Позиция создана.',true); miReset(); loadMenu(); }
    else msg(m,'Ошибка: '+(d.detail||d.error||'?'),false);
  }catch(e){ msg(m,'Сетевая ошибка.',false); }
});

function miSelected(){ return Array.from(document.querySelectorAll('#menu-list input.sel:checked')).map(c=>c.dataset.id); }
function mcSelected(){ return Array.from(document.querySelectorAll('#menu-list input.selcat:checked')).map(c=>c.dataset.id); }
function miBatchRefresh(){
  const n=miSelected().length;
  $('mi-batch-n').textContent=n;
  $('mi-batch').classList.toggle('show', n>0);
}
async function menuBatch(body){
  try{
    const r=await fetch(api('admin-menu'),{method:'POST',...F,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(r.status===401){ handle401(); return; }
    const d=await r.json().catch(()=>({}));
    if(r.ok&&d.ok){ loadMenu(); miBatchRefresh(); }
    else alert('Ошибка: '+(d.detail||d.error||'?'));
  }catch(e){ alert('Сетевая ошибка.'); }
}
$('mi-batch-on').addEventListener('click', ()=>{ const ids=miSelected(); if(ids.length) menuBatch({action:'available',ids,available:true}); });
$('mi-batch-off').addEventListener('click', ()=>{ const ids=miSelected(); if(ids.length) menuBatch({action:'available',ids,available:false}); });
$('mi-batch-del').addEventListener('click', ()=>{
  const ids=miSelected(); if(!ids.length) return;
  if(!confirm('Удалить позиций: '+ids.length+'? Это необратимо.')) return;
  menuBatch({action:'delete',kind:'item',ids});
});
document.addEventListener('change', (e)=>{
  if(e.target && e.target.classList && e.target.classList.contains('selcat')){
    const ids=mcSelected();
    if(ids.length && confirm('Удалить категорий: '+ids.length+'?\\n\\nВместе с ними удалятся ВСЕ позиции внутри. Необратимо.')){
      menuBatch({action:'delete',kind:'category',ids});
    } else { document.querySelectorAll('#menu-list input.selcat').forEach(c=>c.checked=false); }
  }
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
