import { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import Head from "next/head";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
);

// ─── Styles ──────────────────────────────────────────────────

const C = {
  bg: "#FAF6F1",
  brown: "#49372A",
  brownMuted: "#8B7355",
  cream: "#F0EBE3",
  border: "#E8E0D6",
  muted: "#A09484",
  green: "#5A8A5E",
};
const font =
  "'Manrope', -apple-system, BlinkMacSystemFont, sans-serif";

// ─── Payment Form ────────────────────────────────────────────

function CheckoutForm({ amount, deliveryFee }) {
  const stripe = useStripe();
  const elements = useElements();
  const [status, setStatus] = useState("idle"); // idle | processing | success | error
  const [errorMsg, setErrorMsg] = useState("");

  // amount from API is always the $25 deposit (delivery fee is charged later, 48h before delivery)
  const depositDollars = (amount / 100).toFixed(0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setStatus("processing");
    setErrorMsg("");

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.origin + "/success",
      },
      redirect: "if_required",
    });

    if (error) {
      setErrorMsg(error.message);
      setStatus("error");
    } else if (paymentIntent && paymentIntent.status === "succeeded") {
      setStatus("success");
      // Notify parent (Framer) via postMessage
      window.parent.postMessage(
        { type: "roomo-payment-success", paymentIntentId: paymentIntent.id },
        "*"
      );
    }
  };

  if (status === "success") {
    return (
      <div style={{ textAlign: "center", padding: "32px 0" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
        <div
          style={{
            fontFamily: font,
            fontSize: 18,
            fontWeight: 700,
            color: C.brown,
            marginBottom: 6,
          }}
        >
          You're all set!
        </div>
        <div
          style={{
            fontFamily: font,
            fontSize: 13,
            color: C.brownMuted,
            lineHeight: 1.5,
          }}
        >
          We'll send a confirmation email shortly.
          <br />
          Welcome to Roomo!
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Summary */}
      <div
        style={{
          background: C.cream,
          borderRadius: 12,
          padding: "16px 18px",
          marginBottom: 20,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: font,
            fontSize: 24,
            fontWeight: 800,
            color: C.brown,
            marginBottom: 2,
          }}
        >
          ${depositDollars}
        </div>
        <div
          style={{
            fontFamily: font,
            fontSize: 13,
            color: C.brownMuted,
            lineHeight: 1.5,
          }}
        >
          Refundable deposit
        </div>
        <div
          style={{
            fontFamily: font,
            fontSize: 11,
            color: C.muted,
            lineHeight: 1.5,
            marginTop: 2,
          }}
        >
          Applied to your first month · Fully refundable before delivery
        </div>
        {deliveryFee > 0 && (
          <div
            style={{
              fontFamily: font,
              fontSize: 11,
              color: C.muted,
              marginTop: 6,
              paddingTop: 6,
              borderTop: `1px solid ${C.border}`,
            }}
          >
            ${deliveryFee} delivery fee charged before delivery
          </div>
        )}
      </div>

      {/* Stripe Elements */}
      <div style={{ marginBottom: 20 }}>
        <PaymentElement
          options={{
            layout: "tabs",
            style: {
              base: {
                fontFamily: font,
                fontSize: "14px",
                color: C.brown,
              },
            },
          }}
        />
      </div>

      {/* Error */}
      {errorMsg && (
        <div
          style={{
            fontFamily: font,
            fontSize: 12,
            color: "#C44B4B",
            marginBottom: 12,
            padding: "8px 12px",
            background: "#FDF0F0",
            borderRadius: 8,
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={!stripe || status === "processing"}
        style={{
          width: "100%",
          padding: "14px 0",
          borderRadius: 999,
          border: "none",
          background: status === "processing" ? C.muted : C.brown,
          color: "#fff",
          fontFamily: font,
          fontSize: 14,
          fontWeight: 700,
          cursor: status === "processing" ? "wait" : "pointer",
          letterSpacing: "0.02em",
          transition: "background 0.2s",
        }}
      >
        {status === "processing" ? "Processing..." : `Pay $${(amount / 100).toFixed(0)} deposit`}
      </button>

      <div
        style={{
          fontFamily: font,
          fontSize: 10,
          color: C.muted,
          textAlign: "center",
          marginTop: 10,
          lineHeight: 1.5,
        }}
      >
        Secured by Stripe · Your card details never touch our servers
      </div>
    </form>
  );
}

// ─── Main Page ───────────────────────────────────────────────

export default function CheckoutPage() {
  const [clientSecret, setClientSecret] = useState(null);
  const [amount, setAmount] = useState(0);
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Read params from URL (passed by Framer iframe)
    const params = new URLSearchParams(window.location.search);
    const items = params.get("items");
    const email = params.get("email");
    const name = params.get("name");
    const phone = params.get("phone");
    const address = params.get("address");
    const unit = params.get("unit");
    const city = params.get("city");
    const state = params.get("state");
    const zip = params.get("zip");
    const fee = parseInt(params.get("deliveryFee") || "0", 10);
    const deliveryDate = params.get("deliveryDate");
    const deliverySlot = params.get("deliverySlot");

    setDeliveryFee(fee);

    // Create payment intent
    fetch("/api/create-payment-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: items ? JSON.parse(items) : [],
        email,
        name,
        phone,
        address,
        unit,
        city,
        state,
        zip,
        deliveryDate,
        deliverySlot,
        deliveryFee: fee,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setClientSecret(data.clientSecret);
          setAmount(data.amount);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <>
      <Head>
        <title>Roomo Checkout</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div
        style={{
          minHeight: "100vh",
          background: C.bg,
          fontFamily: font,
          padding: "20px 16px",
          boxSizing: "border-box",
        }}
      >
        {loading && (
          <div
            style={{
              textAlign: "center",
              padding: "40px 0",
              color: C.brownMuted,
              fontSize: 14,
            }}
          >
            Setting up secure payment...
          </div>
        )}

        {error && (
          <div
            style={{
              textAlign: "center",
              padding: "40px 0",
              color: "#C44B4B",
              fontSize: 14,
            }}
          >
            Something went wrong: {error}
          </div>
        )}

        {clientSecret && (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: {
                theme: "flat",
                variables: {
                  colorPrimary: C.brown,
                  colorBackground: "#ffffff",
                  colorText: C.brown,
                  colorDanger: "#C44B4B",
                  fontFamily: font,
                  borderRadius: "10px",
                  spacingUnit: "4px",
                },
                rules: {
                  ".Input": {
                    border: `1.5px solid ${C.border}`,
                    padding: "11px 13px",
                    transition: "border-color 0.2s",
                  },
                  ".Input:focus": {
                    border: `1.5px solid ${C.brown}`,
                    boxShadow: "none",
                  },
                  ".Label": {
                    fontSize: "12px",
                    fontWeight: "600",
                    color: C.brownMuted,
                    marginBottom: "4px",
                  },
                },
              },
            }}
          >
            <CheckoutForm amount={amount} deliveryFee={deliveryFee} />
          </Elements>
        )}
      </div>
    </>
  );
}
