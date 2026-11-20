
export default async (request) => {
  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return json({ error: "Payment gateway is not configured." }, 500);
    }

    const body = await request.json();

    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) {
      return json({ error: "Invalid cart." }, 400);
    }

    const catalogue = {
      mini: { name: "Mini Gift Hamper", price: 99 },
      sweet: { name: "Sweet Surprise Hamper", price: 199 },
      classic: { name: "Classic Gift Hamper", price: 299 },
      premium: { name: "Premium Gift Hamper", price: 599 },
      birthday: { name: "Birthday Special", price: 799 },
      love: { name: "Love Forever Hamper", price: 1199 },
      selfcare: { name: "Self-Care Box", price: 999 },
      bestie: { name: "Bestie Box", price: 699 },
      corporate: { name: "Corporate Hamper", price: 1499 }
    };

    let subtotal = 0;
    const receiptLines = [];

    for (const item of body.items) {
      const product = catalogue[item?.id];
      const qty = Number(item?.qty);

      if (!product || !Number.isSafeInteger(qty) || qty < 1 || qty > 10) {
        return json({ error: "Invalid product or quantity." }, 400);
      }

      subtotal += product.price * qty;
      receiptLines.push(`${product.name} x ${qty}`);
    }

    if (!Number.isSafeInteger(subtotal) || subtotal < 1 || subtotal > 100000) {
      return json({ error: "Invalid order amount." }, 400);
    }

    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount: subtotal * 100,
        currency: "INR",
        receipt: `FW${Date.now()}`.slice(0, 40),
        notes: {
          store: "Forever Wrapped",
          items: receiptLines.join("; ").slice(0, 250)
        }
      })
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.id) {
      console.error("Razorpay order creation failed:", result);
      return json({ error: "Razorpay could not create order." }, 502);
    }

    return json({
      keyId,
      orderId: result.id,
      amount: result.amount,
      currency: result.currency
    });

  } catch (error) {
    console.error("create-order error:", error);
    return json({ error: "Unable to start payment." }, 500);
  }
};
