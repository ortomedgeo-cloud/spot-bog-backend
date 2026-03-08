# spot-bog-backend

Черновой backend под Vercel для схемы:

- Tilda / кастомный фронт отправляет данные формы в `/api/payment`
- backend читает лист `events` в Google Sheets
- берет цену и название события по `eid`
- создает заказ в Bank of Georgia
- пишет строку в лист `payments`
- BOG шлет callback в `/api/callback`
- backend обновляет статус в `payments` и шлет уведомление в WhatsApp через GreenAPI

## Под что адаптирован код

Код адаптирован под текущую структуру листа `events`:

```text
eid | Title | Type | Price | DepositText
```

Пример:
- `film1 | "Возвращение в Сайлент Хилл" | mov | 30`
- `film7 | Киноужин "Чарли и шоколадная фабрика" | din | 99`

То есть менять `events` не нужно.

## Под что адаптирован лист `payments`

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
  "event_title": "Киноужин \"Чарли и шоколадная фабрика\"",
  "deposit_text": "(сет-меню входит в стоимость)"
}
```

Потом фронт делает:

```js
window.location.href = data.payment_url;
```

## Что делать на Tilda

На Tilda `/api` не нужен.
`/api/payment` и `/api/callback` живут на домене Vercel-проекта.

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
