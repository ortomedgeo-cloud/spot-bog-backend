# spot-bog-backend

Backend под Vercel для схемы:

- Tilda / кастомный фронт отправляет данные формы в `/api/payment`
- backend читает лист `events` в Google Sheets
- берет цену и название события по `eid`
- создает заказ в Bank of Georgia
- пишет строку в лист `payments`
- BOG шлет callback в `/api/callback`
- backend обновляет статус в `payments` и шлет уведомление в WhatsApp через GreenAPI

## Переменные окружения для BOG

| Переменная | По умолчанию | Что делает |
| --- | --- | --- |
| `BOG_ORDER_TTL_MINUTES` | `30` | Сколько минут живет заказ. BOG принимает 2–1440, значения вне диапазона обрезаются. Если не задать `ttl` вообще, BOG ставит 15 минут. |
| `BOG_PAYMENT_METHODS` | не задана | Список методов через запятую (`card`, `google_pay`, `apple_pay`, `bog_p2p`, `bog_loyalty`, `bnpl`, `bog_loan`, `gift_card`). Пусто — страница оплаты показывает все методы, включенные у мерчанта. Неизвестные значения отбрасываются. |
| `BOG_LANGUAGE` | `en` | Заголовок `Accept-Language` для страницы оплаты: `ka` или `en`. |
| `BOG_CURRENCY` | `GEL` | Валюта заказа. |

## Диагностика неудачных оплат

```bash
node --env-file=.env scripts/audit-orders.js
node --env-file=.env scripts/audit-orders.js --since=2026-07-01
node --env-file=.env scripts/audit-orders.js --since=2026-07-01 --csv > audit.csv
```

Скрипт берет все `bog_order_id` из листа `payments`, запрашивает по каждому
`GET /payments/v1/receipt/:order_id` и группирует результат по причинам отказа.

Что означают коды в отчете:

- `code 122` — отказ **эквайера**, то есть самого BOG. Это сторона мерчанта:
  лимиты, антифрод, конфигурация e-commerce POS. Такие `pg_trx_id` скрипт
  выводит отдельным списком — их и отправлять в банк.
- `code 101/103/105/106/107` — отказ банка-эмитента клиента (лимиты по карте,
  недостаточно средств, истекшая карта). Это нормальный фон.
- `expiration (no attempt)` — клиент вообще не дошел до ввода карты, заказ
  протух. Это воронка и UX, а не платежи.


