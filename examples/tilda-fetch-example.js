fetch("https://YOUR-VERCEL-DOMAIN/api/payment", {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    table_no: "Стол 2",
    guests: "1",
    customer_name: "Erik",
    customer_phone: "@amstrd_cpc",
    reserve_url: window.location.href
  })
})
  .then(async (r) => ({ ok: r.ok, data: await r.json() }))
  .then(({ ok, data }) => {
    if (!ok || !data.payment_url) throw new Error(data.detail || data.error || "Failed to create payment");
    window.location.href = data.payment_url;
  })
  .catch((err) => {
    console.error("BOG payment error", err);
    alert("Не удалось создать оплату");
  });
