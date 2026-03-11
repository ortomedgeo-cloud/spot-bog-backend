# spot-bog-backend

Backend под Vercel для схемы:

- Tilda / кастомный фронт отправляет данные формы в `/api/payment`
- backend читает лист `events` в Google Sheets
- берет цену и название события по `eid`
- создает заказ в Bank of Georgia
- пишет строку в лист `payments`
- BOG шлет callback в `/api/callback`
- backend обновляет статус в `payments` и шлет уведомление в WhatsApp через GreenAPI


