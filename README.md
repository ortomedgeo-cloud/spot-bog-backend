# spot-bog-backend

Черновой backend под Vercel для схемы:

- страница `reserve` на Tilda уже содержит query-параметры вроде `eid`, `date`, `time`
- кастомный фронт отправляет данные формы в `/api/payment`
- backend сам вытаскивает `eid` из URL страницы `reserve`
- backend читает лист `events` в Google Sheets
- берет цену и название события по `eid`
- создает заказ в Bank of Georgia
- пишет строку в лист `payments`
- BOG шлет callback в `/api/callback`
- backend обновляет статус в `payments` и шлет уведомление в WhatsApp через GreenAPI

## Важное уточнение по `events`

Лист `events` **не меняем**.

У тебя `eid` - это **постоянный идентификатор события**, а не идентификатор конкретного фильма.
Поэтому логика такая:

- фронт передает URL текущей страницы `reserve`, например:
  `https://spot-bar.site/reserve?date=27-02-2026&time=22:30&eid=film10&poster=...&duration=120`
- backend вытаскивает из URL `eid=film10`
- дальше backend находит строку по `eid`
- из этой строки берет **актуальные на эту неделю** `Title`, `Type`, `Price`, `DepositText`

Это значит, что когда в воскресенье вы меняете сам фильм внутри уже существующего события,
ничего в коде менять не нужно - важно только, чтобы `eid` оставался тем же.

Код адаптирован под текущую структуру листа `events`:

```text
eid | Title | Type | Price | DepositText
```

## Лист `payments`

Код ожидает такой header в первой строке листа `payments`:

```text
created_at | internal_order_id | bog_order_id | status | event_code | event_title | type | price | table_no | guests | customer_name | customer_phone | tilda_page | green_notified_at | raw_callback_status
```

Пробелы в конце заголовков не мешают: код их нормализует.

## Нужные env

Заполни `.env.example` и перенеси значения в Vercel.

Минимально:
- `BOG_CLIENT_ID`
- `BOG_CLIENT_SECRET`
- `BOG_CALLBACK_URL`
- `BOG_SUCCESS_URL`
- `BOG_FAIL_URL`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_SHEET_ID`
- `GREEN_API_ID_INSTANCE`
- `GREEN_API_TOKEN`
- `GREEN_API_CHAT_ID`

## Как дергать `/api/payment`

POST JSON:

```json
{
  "table_no": "Стол 4",
  "guests": 2,
  "customer_name": "Erik",
  "customer_phone": "+995555123456",
  "reserve_url": "https://spot-bar.site/reserve?date=27-02-2026&time=22:30&eid=film10&poster=https%3A%2F%2Fstatic.tildacdn.com%2F...jpg&duration=120"
}
```

Допустимо вместо `reserve_url` передавать:
- `tilda_page`
- `page`
- `page_url`
- `current_url`

Если совсем надо, backend также поймет `eid` напрямую из payload/query, но основной сценарий теперь - брать его из URL страницы `reserve`.

Ответ:

```json
{
  "ok": true,
  "payment_url": "https://...",
  "internal_order_id": "spot_...",
  "bog_order_id": "...",
  "total_amount": 198,
  "event_title": "Актуальное название события из листа events",
  "deposit_text": "(актуальный текст из DepositText)",
  "reserve_meta": {
    "eid": "film10",
    "date": "27-02-2026",
    "time": "22:30",
    "poster": "https://static.tildacdn.com/...jpg",
    "duration": "120"
  }
}
```

Потом фронт делает:

```js
window.location.href = data.payment_url;
```

## Что делать на Tilda

На Tilda `/api` не нужен.
`/api/payment` и `/api/callback` живут на домене Vercel-проекта.

С Tilda тебе нужно только:
- взять данные формы
- передать `table_no`, `guests`, `customer_name`, `customer_phone`
- передать `reserve_url: window.location.href`
- после ответа сделать redirect на `payment_url`

## Vercel: что было исправлено

Ошибка `Function Runtimes must have a valid version` обычно возникает из-за старого или кривого `runtime` в `vercel.json`.

В этой версии:
- убран проблемный runtime-конфиг
- версия Node задается через `package.json -> engines.node = 20.x`

То есть проект можно просто импортировать в Vercel без старого `now.json`/битого `runtime`.

## Важно

- `BOG_CALLBACK_URL` - серверный URL на Vercel
- `BOG_SUCCESS_URL` - обычная страница для пользователя
- `BOG_FAIL_URL` - обычная страница для пользователя

Не путай `fail` и `callback`.

## Установка

```bash
npm install
```

## Локально

```bash
vercel dev
```

## Деплой

1. Заливаешь проект в GitHub
2. Импортируешь репу в Vercel
3. Добавляешь env
4. Делаешь redeploy

## Что, скорее всего, придется уточнить после первого живого callback

Формат callback payload от BOG может немного отличаться по именам полей.
Сейчас `api/callback.js` написан с мягким парсингом (`order_id`, `status`, `payment_status` и т.п.).
После первого теста, возможно, захочется подправить `extractBogOrderId()` и `normalizeStatus()`.
