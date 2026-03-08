# spot-bog-backend

Черновой backend под Vercel для схемы:

- Tilda / кастомный фронт отправляет данные формы в `/api/payment`
- backend читает лист `events` в Google Sheets
- берет цену и название события по `eid`
- создает заказ в Bank of Georgia
- пишет строку в лист `payments`
- BOG шлет callback в `/api/callback`
- backend обновляет статус в `payments` и шлет уведомление в WhatsApp через GreenAPI

## Важное уточнение по `events`

Лист `events` **не меняем**.

У тебя `eid` — это **постоянный идентификатор события**, а не идентификатор конкретного фильма.
Поэтому логика такая:

- фронт передает постоянный `eid`, например `film7`
- backend находит строку по `eid`
- из этой строки берет **актуальные на эту неделю** `Title`, `Type`, `Price`, `DepositText`

Это значит, что когда в воскресенье вы меняете сам фильм внутри уже существующего события,
ничего в коде менять не нужно — важно только, чтобы `eid` оставался тем же.

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
  "event_code": "film7",
  "table_no": "Стол 4",
  "guests": 2,
  "customer_name": "Erik",
  "customer_phone": "+995555123456",
  "tilda_page": "https://spot-bar.site/main"
}
```

Ответ:

```json
{
  "ok": true,
  "payment_url": "https://...",
  "internal_order_id": "spot_...",
  "bog_order_id": "...",
  "total_amount": 198,
  "event_title": "Актуальное название события из листа events",
  "deposit_text": "(актуальный текст из DepositText)"
}
```

Потом фронт делает:

```js
window.location.href = data.payment_url;
```

## Что делать на Tilda

На Tilda `/api` не нужен.
`/api/payment` и `/api/callback` живут на домене Vercel-проекта.

## Vercel: что было исправлено

Ошибка `Function Runtimes must have a valid version` обычно возникает из-за старого или кривого `runtime` в `vercel.json`.

В этой версии:
- убран проблемный runtime-конфиг
- версия Node задается через `package.json -> engines.node = 20.x`

То есть проект можно просто импортировать в Vercel без старого `now.json`/битого `runtime`.

## Важно

- `BOG_CALLBACK_URL` — серверный URL на Vercel
- `BOG_SUCCESS_URL` — обычная страница для пользователя
- `BOG_FAIL_URL` — обычная страница для пользователя

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


## Дополнительно: запись в лист `Bookings`

После успешного callback от BOG backend теперь:
- обновляет строку в `payments`
- пишет новую строку в лист `Bookings`

Формат подогнан под текущий `Bookings.xlsx`:

```text
Date | Time | table | Name | Phone | persons | amount | Event | WA Status | eid | Type | Price | DepositText | Payment | booking_id | status
```

Что именно пишется:
- `Date` и `Time` берутся из query-параметров URL страницы `reserve`
- `table`, `Name`, `Phone`, `persons` берутся из данных формы / `payments`
- `amount` = общая сумма платежа
- `Event`, `eid`, `Type`, `Price`, `DepositText` берутся из `events` / `payments`
- `WA Status` = `OK YYYY-MM-DD HH:mm:ss`, если GreenAPI отправил уведомление
- `Payment` = `TRUE`
- `booking_id` = `internal_order_id` (нужно, чтобы callback не создавал дубликаты)
- `status` = `list`

Если callback прилетит повторно, строка в `Bookings` второй раз не создастся.
