/*
Example frontend snippet for Tilda custom HTML/JS block.

Important:
- reserve page URL already contains eid, for example:
  https://spot-bar.site/reserve?date=27-02-2026&time=22:30&eid=film10&poster=...&duration=120
- frontend does NOT need to send event_code separately
- backend extracts eid from reserve_url / current page URL
*/

async function createSpotPayment(payload) {
  const resp = await fetch("https://your-vercel-project.vercel.app/api/payment", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
      // "x-form-token": "same value as INCOMING_FORM_TOKEN"
    },
    body: JSON.stringify(payload)
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error || "Payment creation failed");
  }

  window.location.href = data.payment_url;
}

// Example:
// createSpotPayment({
//   table_no: "Стол 4",
//   guests: 2,
//   customer_name: "Erik",
//   customer_phone: "+995555123456",
//   reserve_url: window.location.href
// });
