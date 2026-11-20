import { createHmac, timingSafeEqual } from "node:crypto";

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

    const orderId = body.razorpay_order_id;
    const paymentId = body.razorpay_payment_id;
    const signature = body.razorpay_signature;

    if (
      typeof orderId !== "string" ||
      !/^order_[A-Za-z0-9]+$/.test(orderId) ||
      typeof paymentId !== "string" ||
      !/^pay_[A-Za-z0-9]+$/.test(paymentId) ||
      typeof signature !== "string" ||
      !/^[a-f0-9]{64}$/i.test(signature)
    ) {
      return json({ error: "Invalid payment details." }, 400);
    }

    // Verify Razorpay signature
    const expectedSignature = createHmac("sha256", keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    const expected = Buffer.from(expectedSignature, "hex");
    const received = Buffer.from(signature, "hex");

    if (
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    ) {
      return json({ error: "Payment signature verification failed." }, 400);
    }

    // Fetch payment and order directly from Razorpay
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

    const headers = {
      Authorization: `Basic ${auth}`
    };

    const [paymentResponse, orderResponse] = await Promise.all([
      fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
        headers
      }),
      fetch(`https://api.razorpay.com/v1/orders/${orderId}`, {
        headers
      })
    ]);

    if (!paymentResponse.ok || !orderResponse.ok) {
      return json({ error: "Unable to verify Razorpay transaction." }, 502);
    }

    const payment = await paymentResponse.json();
    const order = await orderResponse.json();

    // Confirm payment belongs to this order
    if (
      payment.order_id !== orderId ||
      payment.amount !== order.amount ||
      payment.currency !== order.currency
    ) {
      return json({ error: "Payment details do not match." }, 400);
    }

    // Only captured payments are accepted
    if (payment.status !== "captured") {
      return json({
        verified: false,
        status: payment.status,
        message: "Payment is not captured yet."
      }, 400);
    }

    return json({
      verified: true,
      status: "captured",
      orderId,
      paymentId,
      amount: payment.amount,
      currency: payment.currency,
      message: "Payment verified successfully."
    });

  } catch (error) {
    console.error("Payment verification error:", error);

    return json({
      error: "Unable to verify payment."
    }, 500);
  }
};
