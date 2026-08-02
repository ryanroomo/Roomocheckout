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

// ─── Success-screen helpers ──────────────────────────────────

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function formatItemLine(it) {
  const name = cap(it.setType) + " Set";
  const price = "$" + Math.round((it.priceCents || 0) / 100);
  return it.mode === "rent"
    ? `${name} · ${it.months}-mo rental · ${price}/mo`
    : `${name} · Purchase · ${price}`;
}

function fmtDeliveryDate(iso) {
  if (!iso) return null;
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

const svgProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: C.brown,
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};
const IconCalendar = (
  <svg {...svgProps}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M8 3v4M16 3v4M3 10h18" />
  </svg>
);
const IconLock = (
  <svg {...svgProps}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);
const IconBox = (
  <svg {...svgProps}>
    <path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8" />
  </svg>
);

function StepRow({ icon, title, body, divider }) {
  return (
    <>
      {divider && <div style={{ borderTop: `1px solid ${C.border}` }} />}
      <div
        style={{
          display: "flex",
          gap: 13,
          alignItems: "flex-start",
          padding: "13px 0",
        }}
      >
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: "50%",
            background: C.cream,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </div>
        <div>
          <div
            style={{
              fontFamily: font,
              fontSize: 15,
              fontWeight: 700,
              color: C.brown,
              marginBottom: 2,
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontFamily: font,
              fontSize: 12,
              color: C.brownMuted,
              lineHeight: 1.55,
            }}
          >
            {body}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Payment Form ────────────────────────────────────────────

function CheckoutForm({ amount, deliveryFee, portalLink, summary }) {
  const stripe = useStripe();
  const elements = useElements();
  const [status, setStatus] = useState("idle"); // idle | processing | success | error
  const [errorMsg, setErrorMsg] = useState("");
  const [showHold, setShowHold] = useState(false);

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
    const deliveryDate = fmtDeliveryDate(summary?.deliveryDate);
    const deliverySlot = summary?.deliverySlot || "";
    const items = (summary?.items || []).filter(Boolean);
    return (
      <div style={{ padding: "4px 16px 10px" }}>
        {/* Success header */}
        <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
          <div style={{ fontSize: 38, color: C.brown, lineHeight: 1 }}>✓</div>
          <div
            style={{
              fontFamily: font,
              fontSize: 21,
              fontWeight: 800,
              color: C.brown,
              margin: "8px 0 6px",
            }}
          >
            You're all set!
          </div>
          <div
            style={{
              fontFamily: font,
              fontSize: 12.5,
              color: C.brownMuted,
              lineHeight: 1.5,
            }}
          >
            We'll send a confirmation email shortly.
            <br />
            Welcome to Roomo.
          </div>
        </div>

        {/* What happens next */}
        <div
          style={{
            fontFamily: font,
            fontSize: 11,
            fontWeight: 600,
            color: C.brownMuted,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            margin: "22px 0 0",
          }}
        >
          What happens next
        </div>
        <StepRow
          icon={IconCalendar}
          title="Today"
          body="Your $25 reservation deposit is confirmed"
        />
        <StepRow
          divider
          icon={IconLock}
          title="48h before delivery"
          body="We'll authorize your remaining first-month balance and a refundable deposit equal to one month of your total subscription"
        />
        <StepRow
          divider
          icon={IconBox}
          title="After delivery"
          body="Monthly billing begins"
        />
        <div
          style={{
            fontFamily: font,
            fontSize: 11.5,
            color: C.muted,
            lineHeight: 1.5,
            margin: "10px 2px 0",
          }}
        >
          No charge is captured until delivery is confirmed.
        </div>

        {/* Order card */}
        {(deliveryDate || items.length > 0) && (
          <div
            style={{
              background: C.cream,
              borderRadius: 12,
              padding: "16px 18px",
              margin: "18px 0 12px",
              display: "flex",
              justifyContent: "space-between",
              gap: 14,
            }}
          >
            {deliveryDate && (
              <div>
                <div
                  style={{
                    fontFamily: font,
                    fontSize: 11,
                    fontWeight: 600,
                    color: C.brownMuted,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    marginBottom: 4,
                  }}
                >
                  Delivery
                </div>
                <div
                  style={{
                    fontFamily: font,
                    fontSize: 14,
                    fontWeight: 700,
                    color: C.brown,
                  }}
                >
                  {deliveryDate}
                </div>
                {deliverySlot && (
                  <div
                    style={{
                      fontFamily: font,
                      fontSize: 12,
                      color: C.brownMuted,
                    }}
                  >
                    {deliverySlot}
                  </div>
                )}
              </div>
            )}
            {items.length > 0 && (
              <div style={{ textAlign: "right", flex: 1 }}>
                <div
                  style={{
                    fontFamily: font,
                    fontSize: 11,
                    fontWeight: 600,
                    color: C.brownMuted,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    marginBottom: 4,
                  }}
                >
                  Items
                </div>
                {items.map((it, idx) => (
                  <div
                    key={idx}
                    style={{
                      fontFamily: font,
                      fontSize: 13,
                      color: C.brown,
                      lineHeight: 1.5,
                    }}
                  >
                    {formatItemLine(it)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* View / manage order */}
        {portalLink && (
          <a
            href={portalLink}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "block",
              width: "100%",
              padding: "14px 0",
              borderRadius: 999,
              background: C.brown,
              color: "#fff",
              fontFamily: font,
              fontSize: 14,
              fontWeight: 700,
              textAlign: "center",
              textDecoration: "none",
              letterSpacing: "0.02em",
              boxSizing: "border-box",
            }}
          >
            View / manage your order
          </a>
        )}
        <div
          style={{
            fontFamily: font,
            fontSize: 10.5,
            color: C.muted,
            textAlign: "center",
            marginTop: 12,
            lineHeight: 1.5,
          }}
        >
          Bookmark this link — you can use it anytime to view and manage your
          order.
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

      {/* Authorization-hold hint — quiet one-liner, tap to expand */}
      <div style={{ marginBottom: 18 }}>
        <div
          onClick={() => setShowHold((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            fontFamily: font,
            fontSize: 11.5,
            color: C.brownMuted,
            lineHeight: 1.5,
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 15,
              height: 15,
              borderRadius: "50%",
              border: `1.3px solid ${C.muted}`,
              color: C.muted,
              fontSize: 9,
              fontWeight: 800,
            }}
          >
            i
          </span>
          Before delivery, we'll place an authorization hold.
        </div>
        {showHold && (
          <ul
            style={{
              margin: "8px 0 0",
              padding: "11px 13px 11px 30px",
              background: "#fff",
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              fontFamily: font,
              fontSize: 11.5,
              color: C.brownMuted,
              lineHeight: 1.6,
            }}
          >
            <li>Your remaining first-month balance</li>
            <li>
              A refundable deposit equal to one month of your total subscription
            </li>
            <li>No charge is captured until delivery is confirmed</li>
          </ul>
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
  const [portalLink, setPortalLink] = useState(null);
  const [summary, setSummary] = useState(null);
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
    const couponCode = params.get("couponCode");

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
        couponCode: couponCode || null,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setClientSecret(data.clientSecret);
          setAmount(data.amount);
          setPortalLink(data.portalLink || null);
          setSummary(data.summary || null);
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
        {/* Make sure body fills the iframe with cream so any unused space looks intentional. */}
        <style>{`html, body { margin: 0; background: ${C.bg}; }`}</style>
      </Head>

      <div
        style={{
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
            <CheckoutForm
              amount={amount}
              deliveryFee={deliveryFee}
              portalLink={portalLink}
              summary={summary}
            />
          </Elements>
        )}
      </div>
    </>
  );
}
