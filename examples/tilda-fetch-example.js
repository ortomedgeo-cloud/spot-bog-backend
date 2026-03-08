/*
Example frontend snippet for Tilda custom HTML/JS block.

Send:
- event_code (eid from sheet `events`)
- table_no
- guests
- customer_name
- customer_phone

Then redirect the user to payment_url.
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
//   event_code: "film7",
//   table_no: "Стол 4",
//   guests: 2,
//   customer_name: "Erik",
//   customer_phone: "+995555123456",
//   tilda_page: window.location.href
// });
