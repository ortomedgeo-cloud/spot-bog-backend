// Serves the unified staff admin page at /api/admin?key=SECRET (or, with the
// rewrite in vercel.json, at /admin?key=SECRET).
//
// One page, three tabs: manual booking, session generator (TMDB), new event.
// All three call the sibling /api/* endpoints on the SAME origin, so there's
// no CORS config and no backend-URL to fill in on the frontend. The secret is
// injected into the page from the query param, so staff only ever paste the
// key once (in the URL) instead of it living in page source on Tilda.
//
// Access is gated here: without the correct ?key=... the page is not served.

const SEATS = [
  "Стол 1", "Стол 2", "Стол 3", "Стол 4", "Стол 5", "Стол 6",
  "Стол 7", "Стол 8", "Стол 9", "Стол 10",
  "Бар 1", "Бар 2", "Бар 3", "Бар 4"
];

const DEPOSIT_MOV =
  "(вычитается из общей суммы счёта) ❗️Бронь столика на фильм нельзя отменить. Если у Вас не получается посетить этот показ, мы можем перенести Ваше бронирование на другой день! По всем вопросам обращайтесь к нам в директ Instagram.";

const DEPOSIT_DIN =
  "(сет-меню входит в стоимость) ❗️Условия отмены: отмена за 3 дня до мероприятия и ранее - возвращается 100% суммы\n- отмена за 2 дня - взвращается 50%\n- отмена за день и в день мероприятия - сумма за билет сгорает.";

function page(secretKey) {
  const cfg = JSON.stringify({
    key: secretKey,
    seats: SEATS,
    depositMov: DEPOSIT_MOV,
    depositDin: DEPOSIT_DIN
  });

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
  .wrap { max-width:640px; margin:0 auto; padding:20px 16px 60px; }
  h1 { font-size:22px; margin:6px 0 18px; }
  .tabs { display:flex; gap:6px; margin-bottom:20px; background:#e6e6ea; padding:5px; border-radius:12px; }
  .tab { flex:1; text-align:center; padding:10px 6px; font-size:14px; font-weight:600; border-radius:8px; cursor:pointer; color:#555; }
  .tab.active { background:#fff; color:#111; box-shadow:0 1px 3px rgba(0,0,0,.1); }
  .panel { display:none; background:#fff; border-radius:14px; padding:20px; }
  .panel.active { display:block; }
  .row { margin-bottom:14px; }
  .row label { display:block; font-size:13px; font-weight:600; margin-bottom:5px; }
  .row input, .row select, .row textarea {
    width:100%; padding:10px 12px; font-size:15px; border:1px solid #ccc; border-radius:8px; background:#fff; font-family:inherit;
  }
  .row select:disabled { background:#f2f2f2; color:#999; }
  .row textarea { min-height:90px; resize:vertical; }
  .two { display:flex; gap:12px; } .two > div { flex:1; }
  .hint { font-size:12px; color:#666; margin-top:4px; }
  .warn { font-size:12px; color:#b45309; margin-top:5px; display:none; } .warn.show { display:block; }

  .seats { display:flex; flex-wrap:wrap; gap:8px; margin:6px 0 4px; }
  .seat { min-width:54px; padding:8px 6px; text-align:center; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; user-select:none; border:2px solid transparent; background:#BDBDBD; color:#fff; }
  .seat.free { background:#4CAF50; } .seat.booked { background:#F44336; cursor:not-allowed; opacity:.85; } .seat.picked { box-shadow:0 0 0 3px #111 inset; }

  .cards { display:flex; flex-wrap:wrap; gap:10px; margin-top:10px; }
  .card { width:96px; cursor:pointer; border:2px solid transparent; border-radius:8px; overflow:hidden; background:#f4f4f4; }
  .card.picked { border-color:#111; }
  .card img { width:100%; height:140px; object-fit:cover; display:block; background:#ddd; }
  .card .cap { font-size:11px; padding:4px 5px; line-height:1.25; }
  .noposter { display:flex; align-items:center; justify-content:center; height:140px; font-size:11px; color:#888; text-align:center; padding:4px; }

  .search { display:flex; gap:8px; } .search input { flex:1; }
  button.go { padding:10px 16px; font-size:14px; font-weight:600; color:#fff; background:#111; border:none; border-radius:8px; cursor:pointer; white-space:nowrap; }
  .preview { margin-top:8px; padding:10px 12px; background:#f6f6f6; border:1px solid #e2e2e2; border-radius:8px; font-size:12px; word-break:break-all; display:none; } .preview.show { display:block; }
  .submit { width:100%; padding:13px; font-size:16px; font-weight:700; color:#fff; background:#111; border:none; border-radius:10px; cursor:pointer; margin-top:8px; }
  .submit:disabled { opacity:.5; cursor:default; }
  .msg { margin-top:14px; padding:11px 13px; border-radius:8px; font-size:14px; display:none; }
  .msg.ok { background:#eefaf0; border:1px solid #c6efd2; color:#166534; display:block; }
  .msg.err { background:#fdecec; border:1px solid #f5c2c2; color:#991b1b; display:block; }
</style>
</head>
<body>
<div class="wrap">
  <h1>SPOT. — админ-панель</h1>
  <div class="tabs">
    <div class="tab active" data-tab="book">Ручная бронь</div>
    <div class="tab" data-tab="gen">Генератор сеансов</div>
    <div class="tab" data-tab="event">Новое событие</div>
  </div>

  <!-- ===== TAB 1: MANUAL BOOKING ===== -->
  <div class="panel active" id="panel-book">
    <div class="row"><label>Фильм *</label><select id="b-film"><option value="">Загрузка…</option></select></div>
    <div class="row two">
      <div><label>Дата *</label><select id="b-date" disabled><option value="">Выбери фильм</option></select></div>
      <div><label>Время *</label><select id="b-time" disabled><option value="">Выбери дату</option></select></div>
    </div>
    <div class="row"><label>Стол / Бар *</label><div class="seats" id="b-seats"></div><input id="b-table" type="hidden"><div class="hint" id="b-seatshint">Выбери сеанс, чтобы увидеть занятые (красные).</div></div>
    <div class="row two"><div><label>Имя гостя</label><input id="b-name"></div><div><label>Телефон</label><input id="b-phone"></div></div>
    <div class="row two"><div><label>Персон</label><input id="b-guests" type="number" min="1" value="2"></div><div><label>Сумма (GEL)</label><input id="b-amount" type="number" min="0" step="0.01" placeholder="0"></div></div>
    <div class="row"><label>Статус оплаты *</label><select id="b-payment"><option value="paid">Оплачено</option><option value="deposit">Депозит внесён</option><option value="unpaid">Не оплачено</option></select></div>
    <button class="submit" id="b-submit">Создать бронь</button>
    <div class="msg" id="b-msg"></div>
  </div>

  <!-- ===== TAB 2: SESSION GENERATOR ===== -->
  <div class="panel" id="panel-gen">
    <div class="row"><label>Название фильма *</label><div class="search"><input id="g-query" placeholder="например Майкл"><button class="go" id="g-searchbtn">Искать</button></div><div class="cards" id="g-results"></div><input id="g-title" type="hidden"><input id="g-poster" type="hidden"><div class="hint" id="g-pickedhint"></div></div>
    <div class="row"><label>Event ID (eid) *</label><input id="g-eid" placeholder="например film16"><div class="warn" id="g-eidwarn"></div><div class="hint">Не переиспользуй eid, занятый под другой фильм.</div></div>
    <div class="row two"><div><label>Дата * (ДД-ММ-ГГГГ)</label><input id="g-date" placeholder="10-07-2026"></div><div><label>Время * (ЧЧ:ММ)</label><input id="g-time" placeholder="23:30"></div></div>
    <div class="preview" id="g-preview"></div>
    <button class="submit" id="g-submit">Создать сеанс</button>
    <div class="msg" id="g-msg"></div>
  </div>

  <!-- ===== TAB 3: NEW EVENT ===== -->
  <div class="panel" id="panel-event">
    <div class="row"><label>Event ID (eid) *</label><input id="e-eid" placeholder="например film16"></div>
    <div class="row"><label>Название *</label><input id="e-title" placeholder='"Майкл" или Киноужин "Рататуй"'></div>
    <div class="row two">
      <div><label>Тип *</label><select id="e-type"><option value="mov">mov — фильм</option><option value="din">din — киноужин</option></select></div>
      <div><label>Цена (GEL) *</label><input id="e-price" type="number" min="0" step="0.01" placeholder="30"></div>
    </div>
    <div class="row"><label>DepositText (подставлен шаблон по типу, можно править)</label><textarea id="e-deposit"></textarea></div>
    <button class="submit" id="e-submit">Добавить событие</button>
    <div class="msg" id="e-msg"></div>
  </div>
</div>

<script>
const CFG = ${cfg};
const KEY = CFG.key, SEATS = CFG.seats;
const $ = (id) => document.getElementById(id);
const api = (path) => '/api/' + path;

// ---- tabs ----
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  $('panel-' + t.dataset.tab).classList.add('active');
}));

function msg(el, text, ok){ el.textContent = text; el.className = 'msg ' + (ok ? 'ok' : 'err'); }

// ================= TAB 1: MANUAL BOOKING =================
(() => {
  const film=$('b-film'),date=$('b-date'),time=$('b-time'),table=$('b-table'),seatsBox=$('b-seats'),hint=$('b-seatshint'),m=$('b-msg'),btn=$('b-submit');
  let FILMS=[], BOOKED=new Set();
  function cur(){ return FILMS.find(f=>f.eid===film.value)||null; }
  function seats(){ seatsBox.innerHTML=''; const ready=film.value&&date.value&&time.value;
    SEATS.forEach(label=>{ const el=document.createElement('div'); el.className='seat'; el.textContent=label;
      const bk=BOOKED.has(label.toLowerCase()); if(ready) el.classList.add(bk?'booked':'free');
      if(table.value===label&&!bk) el.classList.add('picked');
      el.onclick=()=>{ if(bk||!ready) return; table.value=label; seats(); }; seatsBox.appendChild(el); }); }
  async function avail(){ if(!film.value||!date.value||!time.value){BOOKED=new Set();seats();return;}
    hint.textContent='Загрузка занятости…';
    try{ const u=new URL(api('availability'),location.origin); u.searchParams.set('eid',film.value); u.searchParams.set('date',date.value);
      const r=await fetch(u); const d=await r.json(); const bk=d.booked||[]; BOOKED=new Set(bk.map(t=>String(t).trim().toLowerCase()));
      if(table.value&&BOOKED.has(table.value.toLowerCase())) table.value='';
      hint.textContent=bk.length?('Занято: '+bk.join(', ')):'Все столы свободны.'; seats();
    }catch(e){ hint.textContent='Не удалось загрузить занятость.'; BOOKED=new Set(); seats(); } }
  function fillDates(){ const f=cur(); time.innerHTML='<option value="">Выбери дату</option>'; time.disabled=true; table.value='';
    if(!f||!f.sessions.length){ date.innerHTML='<option value="">Нет сеансов</option>'; date.disabled=true; BOOKED=new Set();seats();return; }
    const ds=[...new Set(f.sessions.map(s=>s.date))]; date.disabled=false;
    date.innerHTML='<option value="">Выбери дату</option>'+ds.map(d=>'<option>'+d+'</option>').join(''); BOOKED=new Set();seats(); }
  function fillTimes(){ const f=cur(); table.value='';
    if(!f||!date.value){ time.innerHTML='<option value="">Выбери дату</option>'; time.disabled=true; BOOKED=new Set();seats();return; }
    const ts=[...new Set(f.sessions.filter(s=>s.date===date.value).map(s=>s.time))]; time.disabled=false;
    time.innerHTML='<option value="">Выбери время</option>'+ts.map(t=>'<option>'+t+'</option>').join(''); BOOKED=new Set();seats(); }
  film.onchange=fillDates; date.onchange=fillTimes; time.onchange=avail;
  async function load(){ try{ const r=await fetch(api('sessions')); const d=await r.json(); FILMS=d.films||[];
    film.innerHTML=FILMS.length?('<option value="">Выбери фильм</option>'+FILMS.map(f=>'<option value="'+f.eid+'">'+f.title+' ('+f.sessions.length+')</option>').join('')):'<option value="">Нет сеансов</option>';
  }catch(e){ film.innerHTML='<option value="">Ошибка</option>'; } }
  btn.onclick=async()=>{ m.style.display='none';
    const p={eid:film.value,date:date.value,time:time.value,table:table.value.trim(),name:$('b-name').value.trim(),phone:$('b-phone').value.trim(),guests:$('b-guests').value.trim(),amount:$('b-amount').value.trim(),payment_status:$('b-payment').value};
    if(!p.eid||!p.date||!p.time||!p.table){ msg(m,'Выбери фильм, дату, время и стол.',false); return; }
    btn.disabled=true; btn.textContent='Сохранение…';
    try{ const u=new URL(api('manual-booking'),location.origin); u.searchParams.set('key',KEY);
      const r=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)}); const d=await r.json().catch(()=>({}));
      if(r.ok&&d.ok){ msg(m,'Бронь создана: '+d.table+', '+d.date+' '+d.time,true); $('b-name').value='';$('b-phone').value='';$('b-amount').value='';table.value=''; avail(); }
      else if(r.status===409){ msg(m,'Стол уже занят на этот сеанс.',false); avail(); }
      else if(r.status===401){ msg(m,'Неверный ключ доступа.',false); }
      else msg(m,'Ошибка: '+(d.detail||d.error||'?'),false);
    }catch(e){ msg(m,'Сетевая ошибка.',false); } finally{ btn.disabled=false; btn.textContent='Создать бронь'; } };
  load(); seats();
})();

// ================= TAB 2: SESSION GENERATOR =================
(() => {
  const q=$('g-query'),res=$('g-results'),title=$('g-title'),poster=$('g-poster'),ph=$('g-pickedhint'),eid=$('g-eid'),warn=$('g-eidwarn'),date=$('g-date'),time=$('g-time'),prev=$('g-preview'),m=$('g-msg'),btn=$('g-submit');
  let KNOWN={};
  (async()=>{ try{ const r=await fetch(api('sessions')); const d=await r.json(); (d.films||[]).forEach(f=>KNOWN[f.eid]=f.title);}catch(e){} })();
  async function search(){ const s=q.value.trim(); if(!s)return; res.innerHTML='<div class="hint">Поиск…</div>';
    try{ const u=new URL(api('tmdb-search'),location.origin); u.searchParams.set('q',s); const r=await fetch(u); const d=await r.json(); const mv=d.movies||[];
      if(!mv.length){ res.innerHTML='<div class="hint">Ничего не найдено.</div>'; return; } cards(mv);
    }catch(e){ res.innerHTML='<div class="hint">Ошибка поиска.</div>'; } }
  function cards(mv){ res.innerHTML=''; mv.forEach(x=>{ const c=document.createElement('div'); c.className='card';
    const yr=x.year?' ('+x.year+')':''; c.innerHTML=(x.poster?'<img src="'+x.poster+'">':'<div class="noposter">нет постера</div>')+'<div class="cap">'+x.title+yr+'</div>';
    c.onclick=()=>{ document.querySelectorAll('#g-results .card').forEach(k=>k.classList.remove('picked')); c.classList.add('picked'); title.value=x.title; poster.value=x.poster||''; ph.textContent='Выбрано: '+x.title+yr+(x.poster?'':' — без постера'); prevw(); };
    res.appendChild(c); }); }
  q.addEventListener('keydown',e=>{ if(e.key==='Enter'){e.preventDefault();search();} }); $('g-searchbtn').onclick=search;
  eid.oninput=()=>{ const v=eid.value.trim(); if(v&&KNOWN[v]){ warn.textContent='⚠️ eid «'+v+'» уже используется для «'+KNOWN[v]+'».'; warn.classList.add('show'); } else warn.classList.remove('show'); prevw(); };
  function link(){ const e=eid.value.trim(),d=date.value.trim(),t=time.value.trim(),p=poster.value.trim(); if(!e||!d||!t)return'';
    const s=new URLSearchParams(); s.set('date',d); s.set('time',t); s.set('eid',e); if(p)s.set('poster',p); s.set('duration','120'); return 'spot-bar.site/reserve?'+s.toString(); }
  function prevw(){ const l=link(); if(l){prev.textContent=l;prev.classList.add('show');}else prev.classList.remove('show'); }
  date.oninput=prevw; time.oninput=prevw;
  btn.onclick=async()=>{ m.style.display='none';
    const p={eid:eid.value.trim(),date:date.value.trim(),time:time.value.trim(),title:title.value.trim(),poster:poster.value.trim(),duration:120};
    if(!p.title){ msg(m,'Найди и выбери фильм.',false); return; }
    if(!p.eid||!p.date||!p.time){ msg(m,'Заполни eid, дату и время.',false); return; }
    btn.disabled=true; btn.textContent='Создание…';
    try{ const u=new URL(api('create-session'),location.origin); u.searchParams.set('key',KEY);
      const r=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)}); const d=await r.json().catch(()=>({}));
      if(r.ok&&d.ok){ msg(m,'Сеанс создан: '+d.link,true); KNOWN[p.eid]=p.title; eid.value='';date.value='';time.value=''; warn.classList.remove('show'); prevw(); }
      else if(r.status===401){ msg(m,'Неверный ключ доступа.',false); }
      else msg(m,'Ошибка: '+(d.detail||d.error||'?'),false);
    }catch(e){ msg(m,'Сетевая ошибка.',false); } finally{ btn.disabled=false; btn.textContent='Создать сеанс'; } };
})();

// ================= TAB 3: NEW EVENT =================
(() => {
  const type=$('e-type'),dep=$('e-deposit'),m=$('e-msg'),btn=$('e-submit');
  const TPL={mov:CFG.depositMov,din:CFG.depositDin};
  let touched=false;
  function applyTpl(){ if(!touched||dep.value.trim()===''){ dep.value=TPL[type.value]||''; } }
  dep.addEventListener('input',()=>{ touched=true; });
  type.addEventListener('change',()=>{ // при смене типа, если не правил вручную — подставить новый шаблон
    if(!touched||dep.value===TPL.mov||dep.value===TPL.din||dep.value.trim()===''){ dep.value=TPL[type.value]||''; touched=false; } });
  dep.value=TPL[type.value]; // начальная подстановка
  btn.onclick=async()=>{ m.style.display='none';
    const p={eid:$('e-eid').value.trim(),title:$('e-title').value.trim(),type:type.value,price:$('e-price').value.trim(),deposit_text:dep.value};
    if(!p.eid||!p.title||!p.price){ msg(m,'Заполни eid, название и цену.',false); return; }
    btn.disabled=true; btn.textContent='Добавление…';
    try{ const u=new URL(api('create-event'),location.origin); u.searchParams.set('key',KEY);
      const r=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)}); const d=await r.json().catch(()=>({}));
      if(r.ok&&d.ok){ msg(m,'Событие добавлено: '+d.eid+' — '+d.title,true); $('e-eid').value='';$('e-title').value='';$('e-price').value=''; touched=false; dep.value=TPL[type.value]; }
      else if(r.status===409){ msg(m,'Событие с таким eid уже существует.',false); }
      else if(r.status===401){ msg(m,'Неверный ключ доступа.',false); }
      else msg(m,'Ошибка: '+(d.detail||d.error||'?'),false);
    }catch(e){ msg(m,'Сетевая ошибка.',false); } finally{ btn.disabled=false; btn.textContent='Добавить событие'; } };
})();
</script>
</body>
</html>`;
}

export default function handler(req, res) {
  const expected = process.env.MANUAL_BOOKING_SECRET;
  const provided = String(req.query?.key || "");

  if (!expected || provided !== expected) {
    res.statusCode = 401;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end("<!doctype html><meta charset='utf-8'><body style='font-family:sans-serif;padding:40px'>401 — нужен правильный ?key=</body>");
    return;
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(page(provided));
}
