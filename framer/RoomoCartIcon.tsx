import * as React from "react"
import { createPortal } from "react-dom"
import { useState, useEffect, useRef } from "react"
import { addPropertyControls, ControlType } from "framer"
import { motion, AnimatePresence } from "framer-motion"

/**
 * Roomo Cart Icon — for nav bar
 * Shopping bag icon with badge count
 * Shares cart state with RoomoAddToCart via window.__roomoCart
 * Contains full 5-step checkout flow (identical to RoomoCart)
 *
 * @framerIntrinsicWidth 40
 * @framerIntrinsicHeight 40
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight any
 */

// ─── Global Cart (shared with RoomoAddToCart) ───────────────────

interface CartItem {
    id: string
    set: "living" | "dining" | "bedding"
    mode: "rent" | "buy-new"
    palette: string
    months: number
    price: number
    accessories: string[]
    excluded: string[]
    image: string
}

function initCart() {
    if (typeof window === "undefined") return
    if (!(window as any).__roomoCart) {
        ;(window as any).__roomoCart = [] as CartItem[]
        ;(window as any).__roomoCartListeners = new Set<() => void>()
        ;(window as any).__roomoCartOpen = false
        ;(window as any).__roomoCartOpenListeners = new Set<() => void>()
    }
}

function getCart(): CartItem[] {
    initCart()
    return (window as any).__roomoCart || []
}
function setCart(items: CartItem[]) {
    initCart()
    ;(window as any).__roomoCart = items
    ;(window as any).__roomoCartListeners.forEach((fn: () => void) => fn())
}
function removeFromCart(id: string) {
    setCart(getCart().filter((i) => i.id !== id))
}
function setCartOpen(open: boolean) {
    initCart()
    ;(window as any).__roomoCartOpen = open
    ;(window as any).__roomoCartOpenListeners.forEach((fn: () => void) => fn())
}
function isCartOpen(): boolean {
    initCart()
    return (window as any).__roomoCartOpen || false
}

function useCart() {
    const [, rerender] = useState(0)
    const ref = useRef<(() => void) | null>(null)
    if (!ref.current) ref.current = () => rerender((n) => n + 1)
    useEffect(() => {
        initCart()
        ;(window as any).__roomoCartListeners.add(ref.current!)
        return () => {
            ;(window as any).__roomoCartListeners.delete(ref.current!)
        }
    }, [])
    return getCart()
}

function useCartOpen() {
    const [, rerender] = useState(0)
    const ref = useRef<(() => void) | null>(null)
    if (!ref.current) ref.current = () => rerender((n) => n + 1)
    useEffect(() => {
        initCart()
        ;(window as any).__roomoCartOpenListeners.add(ref.current!)
        return () => {
            ;(window as any).__roomoCartOpenListeners.delete(ref.current!)
        }
    }, [])
    return isCartOpen()
}

// ─── Colors & Style ─────────────────────────────────────────────

const C = {
    bg: "#FAF6F1",
    brown: "#49372A",
    brownLight: "#5c3d2e",
    brownMuted: "#8B7355",
    cream: "#F0EBE3",
    green: "#4A7C59",
    greenLight: "#E8F0E8",
    border: "#E8E0D6",
    muted: "#A09484",
    overlay: "rgba(73, 55, 42, 0.25)",
    red: "#C44B4B",
}
const font = "'Manrope', 'League Spartan', sans-serif"

function trackEvent(name: string, params?: Record<string, any>) {
    if (typeof window === "undefined") return
    // GA4
    if ((window as any).gtag) {
        ;(window as any).gtag("event", name, params)
    }
    // Meta Pixel — map our events to Meta standard events
    const fbq = (window as any).fbq
    if (fbq) {
        if (name === "add_to_cart") {
            fbq("track", "AddToCart", {
                value: Number(params?.price) || 0,
                currency: "USD",
                content_type: "product",
                content_name: params?.set,
            })
        } else if (name === "check_zipcode") {
            fbq("track", "InitiateCheckout", { currency: "USD" })
        } else if (name === "newsletter_signup") {
            fbq("track", "Lead", { content_name: "newsletter" })
        }
    }
}

const SET_LABELS: Record<string, string> = {
    living: "Living Room Set",
    dining: "Dining Set",
    bedding: "Bedding Set",
}
const PALETTE_LABELS: Record<string, string> = {
    hudson: "Hudson Haze",
    soho: "Soho Merlot",
    moss: "Central Moss",
    carbon: "Carbon Silence",
    colorTheory: "Color Theory",
    almond: "Almond Breeze",
}

function useIsMobile() {
    const [m, setM] = useState(false)
    useEffect(() => {
        const c = () => setM(window.innerWidth < 768)
        c()
        window.addEventListener("resize", c)
        return () => window.removeEventListener("resize", c)
    }, [])
    return m
}

// ─── Cart Panel (shared) ────────────────────────────────────────

function Dots({ step, total = 5 }: { step: number; total?: number }) {
    return (
        <div
            style={{
                display: "flex",
                gap: 6,
                justifyContent: "center",
                marginBottom: 16,
            }}
        >
            {Array.from({ length: total }).map((_, i) => (
                <div
                    key={i}
                    style={{
                        width: i === step ? 20 : 6,
                        height: 4,
                        borderRadius: 999,
                        background: i <= step ? C.brown : C.border,
                        transition: "all 0.3s",
                    }}
                />
            ))}
        </div>
    )
}

// ── Cart Item Row ───────────────────────────────────────────────

function CartItemRow({
    item,
    onRemove,
}: {
    item: CartItem
    onRemove: () => void
}) {
    const paletteName = PALETTE_LABELS[item.palette] || item.palette
    const isBuy = item.mode === "buy-new"
    return (
        <div
            style={{
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
                padding: "12px 0",
                borderBottom: `1px solid ${C.border}`,
            }}
        >
            {item.image ? (
                <div
                    style={{
                        width: 64,
                        height: 64,
                        borderRadius: 10,
                        overflow: "hidden",
                        flexShrink: 0,
                        background: C.cream,
                    }}
                >
                    <img
                        src={item.image}
                        alt={SET_LABELS[item.set]}
                        style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            display: "block",
                        }}
                    />
                </div>
            ) : (
                <div
                    style={{
                        width: 64,
                        height: 64,
                        borderRadius: 10,
                        flexShrink: 0,
                        background: C.cream,
                    }}
                />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div
                    style={{
                        fontFamily: font,
                        fontSize: 14,
                        fontWeight: 700,
                        color: C.brown,
                        marginBottom: 1,
                    }}
                >
                    {SET_LABELS[item.set]}
                </div>
                <div
                    style={{
                        fontFamily: font,
                        fontSize: 11,
                        color: C.brownMuted,
                        marginBottom: 2,
                    }}
                >
                    {paletteName} · {isBuy ? "Brand New" : `${item.months} mo`}
                </div>
                {item.excluded.length > 0 && (
                    <div
                        style={{
                            fontFamily: font,
                            fontSize: 11,
                            color: C.muted,
                        }}
                    >
                        Without {item.excluded.join(", ")}
                    </div>
                )}
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div
                    style={{
                        fontFamily: font,
                        fontSize: 15,
                        fontWeight: 700,
                        color: C.brown,
                    }}
                >
                    ${item.price.toLocaleString()}
                    {!isBuy && (
                        <span
                            style={{
                                fontSize: 11,
                                fontWeight: 500,
                                color: C.brownMuted,
                            }}
                        >
                            /mo
                        </span>
                    )}
                </div>
                <button
                    onClick={onRemove}
                    style={{
                        background: "none",
                        border: "none",
                        fontFamily: font,
                        fontSize: 11,
                        color: C.muted,
                        cursor: "pointer",
                        padding: 0,
                        marginTop: 4,
                        textDecoration: "underline",
                    }}
                >
                    Remove
                </button>
            </div>
        </div>
    )
}

// ── Step: Cart List ─────────────────────────────────────────────

function StepCart({
    cart,
    onRemove,
    onContinueShopping,
    onCheckout,
    checkoutBaseUrl,
    couponState,
    onCouponChange,
}: {
    cart: CartItem[]
    onRemove: (id: string) => void
    onContinueShopping: () => void
    onCheckout: () => void
    checkoutBaseUrl: string
    couponState: { code: string; status: string; discountType: string; discountValue: number; discountAmount: number; appliesTo: string; description: string }
    onCouponChange: (state: any) => void
}) {
    const rentItems = cart.filter((i) => i.mode === "rent")
    const buyItems = cart.filter((i) => i.mode === "buy-new")
    const totalMonthly = rentItems.reduce((sum, i) => sum + i.price, 0)
    const totalBuy = buyItems.reduce((sum, i) => sum + i.price, 0)
    const [couponInput, setCouponInput] = useState(couponState.code || "")

    const handleApplyCoupon = async () => {
        const trimmed = couponInput.trim()
        if (!trimmed) return
        onCouponChange({ ...couponState, status: "checking" })
        try {
            const base = (checkoutBaseUrl || "https://roomocheckout.vercel.app").replace(/\/$/, "")
            const maxMonths = rentItems.reduce((m, i) => Math.max(m, i.months || 0), 0)
            const res = await fetch(`${base}/api/validate-coupon`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: trimmed, cartTotal: totalMonthly, months: maxMonths }),
            })
            const data = await res.json()
            if (data.valid) {
                onCouponChange({
                    code: data.code,
                    status: "valid",
                    discountType: data.discountType,
                    discountValue: data.discountValue,
                    discountAmount: data.discountAmount,
                    appliesTo: data.appliesTo,
                    description: data.description,
                })
                trackEvent("coupon_applied", { code: data.code, discount: data.discountAmount })
            } else {
                onCouponChange({ code: trimmed, status: "invalid", discountType: "", discountValue: 0, discountAmount: 0, appliesTo: "", description: data.reason || "Invalid code" })
            }
        } catch (e) {
            onCouponChange({ code: trimmed, status: "error", discountType: "", discountValue: 0, discountAmount: 0, appliesTo: "", description: "Something went wrong" })
        }
    }

    const handleRemoveCoupon = () => {
        setCouponInput("")
        onCouponChange({ code: "", status: "idle", discountType: "", discountValue: 0, discountAmount: 0, appliesTo: "", description: "" })
    }

    if (cart.length === 0) {
        return (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
                <div
                    style={{
                        fontFamily: font,
                        fontSize: 16,
                        fontWeight: 700,
                        color: C.brown,
                        marginBottom: 6,
                    }}
                >
                    Your cart is empty
                </div>
                <div
                    style={{
                        fontFamily: font,
                        fontSize: 13,
                        color: C.brownMuted,
                        marginBottom: 20,
                    }}
                >
                    Add a set to get started
                </div>
                <button
                    onClick={onContinueShopping}
                    style={{
                        padding: "12px 28px",
                        borderRadius: 999,
                        border: `1.5px solid ${C.border}`,
                        background: "transparent",
                        color: C.brown,
                        fontFamily: font,
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: "pointer",
                    }}
                >
                    Continue Shopping
                </button>
            </div>
        )
    }

    return (
        <div>
            <Dots step={0} total={5} />
            <div
                style={{
                    fontFamily: font,
                    fontSize: 16,
                    fontWeight: 700,
                    color: C.brown,
                    marginBottom: 4,
                }}
            >
                Your Cart
            </div>
            <div
                style={{
                    fontFamily: font,
                    fontSize: 12,
                    color: C.muted,
                    marginBottom: 12,
                }}
            >
                {cart.length} {cart.length === 1 ? "item" : "items"}
            </div>

            {/* Item list */}
            <div style={{ marginBottom: 16 }}>
                {cart.map((item) => (
                    <CartItemRow
                        key={item.id}
                        item={item}
                        onRemove={() => onRemove(item.id)}
                    />
                ))}
            </div>

            {/* Cart totals (small, above cream box) */}
            {(totalMonthly > 0 || totalBuy > 0) && (
                <div
                    style={{
                        fontFamily: font,
                        fontSize: 11,
                        color: C.muted,
                        textAlign: "center",
                        marginBottom: 8,
                    }}
                >
                    {totalMonthly > 0 && (
                        <span>Monthly ${totalMonthly}/mo</span>
                    )}
                    {totalMonthly > 0 && totalBuy > 0 && (
                        <span> · </span>
                    )}
                    {totalBuy > 0 && (
                        <span>One-time ${totalBuy.toLocaleString()}</span>
                    )}
                </div>
            )}

            {/* Coupon Code */}
            <div style={{ marginBottom: 12 }}>
                {couponState.status === "valid" ? (
                    <div style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "10px 14px", background: C.greenLight, borderRadius: 10,
                    }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 14 }}>✓</span>
                            <span style={{ fontFamily: font, fontSize: 12, fontWeight: 600, color: C.green }}>
                                {couponState.code}
                            </span>
                            <span style={{ fontFamily: font, fontSize: 11, color: C.brownMuted }}>
                                {couponState.description
                                    ? couponState.description
                                    : `${
                                          couponState.discountType === "percentage"
                                              ? `${couponState.discountValue}% off`
                                              : `$${couponState.discountValue} off`
                                      }${couponState.appliesTo === "first_month" ? " first month" : ""}`}
                            </span>
                        </div>
                        <button onClick={handleRemoveCoupon} style={{
                            background: "none", border: "none", fontFamily: font, fontSize: 11,
                            color: C.muted, cursor: "pointer", textDecoration: "underline", padding: 0,
                        }}>Remove</button>
                    </div>
                ) : (
                    <div>
                        <div style={{ display: "flex", gap: 8 }}>
                            <input
                                value={couponInput}
                                onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); if (couponState.status === "invalid" || couponState.status === "error") onCouponChange({ ...couponState, status: "idle" }) }}
                                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleApplyCoupon() } }}
                                placeholder="Coupon code"
                                style={{
                                    flex: 1, padding: "9px 12px", borderRadius: 10,
                                    border: `1.5px solid ${couponState.status === "invalid" ? C.red : C.border}`,
                                    fontFamily: font, fontSize: 13, color: C.brown, outline: "none",
                                    background: "#fff", boxSizing: "border-box" as const,
                                    letterSpacing: "0.05em", fontWeight: 600,
                                }}
                            />
                            <button
                                onClick={handleApplyCoupon}
                                disabled={!couponInput.trim() || couponState.status === "checking"}
                                style={{
                                    padding: "9px 16px", borderRadius: 10, border: "none",
                                    background: couponInput.trim() ? C.brown : C.muted, color: "#fff",
                                    fontFamily: font, fontSize: 12, fontWeight: 600,
                                    cursor: couponInput.trim() ? "pointer" : "not-allowed",
                                    whiteSpace: "nowrap" as const, flexShrink: 0,
                                    opacity: couponState.status === "checking" ? 0.7 : 1,
                                }}
                            >
                                {couponState.status === "checking" ? "..." : "Apply"}
                            </button>
                        </div>
                        {couponState.status === "invalid" && (
                            <div style={{ fontFamily: font, fontSize: 11, color: C.red, marginTop: 4, paddingLeft: 2 }}>
                                {couponState.description || "Invalid coupon code"}
                            </div>
                        )}
                        {couponState.status === "error" && (
                            <div style={{ fontFamily: font, fontSize: 11, color: C.red, marginTop: 4, paddingLeft: 2 }}>
                                Something went wrong, try again
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Discount line */}
            {couponState.status === "valid" && couponState.discountAmount > 0 && totalMonthly > 0 && (
                <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    fontFamily: font, fontSize: 12, color: C.green, fontWeight: 600,
                    marginBottom: 8, padding: "0 4px",
                }}>
                    <span>Discount ({couponState.code})</span>
                    <span>-${couponState.discountAmount}/mo</span>
                </div>
            )}

            {/* Due today */}
            <div
                style={{
                    background: C.cream,
                    borderRadius: 12,
                    padding: "20px 16px",
                    marginBottom: 10,
                    textAlign: "center",
                }}
            >
                <div
                    style={{
                        fontFamily: font,
                        fontSize: 32,
                        fontWeight: 800,
                        color: C.brown,
                        lineHeight: 1.1,
                        marginBottom: 4,
                    }}
                >
                    $25
                </div>
                <div
                    style={{
                        fontFamily: font,
                        fontSize: 12,
                        fontWeight: 600,
                        color: C.brownMuted,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                    }}
                >
                    Due today
                </div>
            </div>

            <div
                style={{
                    fontFamily: font,
                    fontSize: 11,
                    color: C.muted,
                    textAlign: "center",
                    marginBottom: 14,
                    lineHeight: 1.5,
                }}
            >
                Fully refundable. Monthly plan starts at delivery.
            </div>

            <button
                onClick={onCheckout}
                style={{
                    width: "100%",
                    padding: "13px 0",
                    borderRadius: 999,
                    border: "none",
                    background: C.brown,
                    color: "#fff",
                    fontFamily: font,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: "pointer",
                    letterSpacing: "0.02em",
                    marginBottom: 8,
                }}
            >
                Reserve Now →
            </button>
            <button
                onClick={onContinueShopping}
                style={{
                    width: "100%",
                    padding: "11px 0",
                    borderRadius: 999,
                    border: `1.5px solid ${C.border}`,
                    background: "transparent",
                    color: C.brownLight,
                    fontFamily: font,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                }}
            >
                Continue Shopping
            </button>
        </div>
    )
}

// ── Step: Zip Code Verification ─────────────────────────────────

const NYC_ZIPS = new Set([
    "10001",
    "10002",
    "10003",
    "10004",
    "10005",
    "10006",
    "10007",
    "10009",
    "10010",
    "10011",
    "10012",
    "10013",
    "10014",
    "10016",
    "10017",
    "10018",
    "10019",
    "10020",
    "10021",
    "10022",
    "10023",
    "10024",
    "10025",
    "10026",
    "10027",
    "10028",
    "10029",
    "10030",
    "10031",
    "10032",
    "10033",
    "10034",
    "10035",
    "10036",
    "10037",
    "10038",
    "10039",
    "10040",
    "10044",
    "10065",
    "10069",
    "10075",
    "10128",
    "10280",
    "10282",
    "11201",
    "11203",
    "11204",
    "11205",
    "11206",
    "11207",
    "11208",
    "11209",
    "11210",
    "11211",
    "11212",
    "11213",
    "11214",
    "11215",
    "11216",
    "11217",
    "11218",
    "11219",
    "11220",
    "11221",
    "11222",
    "11223",
    "11224",
    "11225",
    "11226",
    "11228",
    "11229",
    "11230",
    "11231",
    "11232",
    "11233",
    "11234",
    "11235",
    "11236",
    "11237",
    "11238",
    "11239",
    "11101",
    "11102",
    "11103",
    "11104",
    "11105",
    "11106",
    "11109",
    "10301",
    "10302",
    "10303",
    "10304",
    "10305",
    "10306",
    "10307",
    "10308",
    "10309",
    "10310",
    "10312",
    "10314",
    "10451",
    "10452",
    "10453",
    "10454",
    "10455",
    "10456",
    "10457",
    "10458",
    "10459",
    "10460",
    "10461",
    "10462",
    "10463",
    "10464",
    "10465",
    "10466",
    "10467",
    "10468",
    "10469",
    "10470",
    "10471",
    "10472",
    "10473",
    "10474",
    "10475",
])

const JC_ZIPS = new Set([
    "07030", // Hoboken
    "07302",
    "07304",
    "07305",
    "07306",
    "07307",
    "07310",
    "07311",
])

function StepZip({
    onBack,
    onNext,
}: {
    onBack: () => void
    onNext: (zip: string, deliveryFee: number) => void
}) {
    const [zip, setZip] = useState("")
    const [status, setStatus] = useState<"idle" | "nyc" | "jc" | "no">("idle")

    const handleCheck = () => {
        const z = zip.trim()
        trackEvent("check_zipcode", { zip: z })
        if (NYC_ZIPS.has(z)) setStatus("nyc")
        else if (JC_ZIPS.has(z)) setStatus("jc")
        else setStatus("no")
    }

    return (
        <div>
            <Dots step={1} total={5} />
            <button
                onClick={onBack}
                style={{
                    background: "none",
                    border: "none",
                    color: C.muted,
                    fontFamily: font,
                    fontSize: 13,
                    cursor: "pointer",
                    padding: 0,
                    marginBottom: 10,
                }}
            >
                ← Back
            </button>
            <div
                style={{
                    fontFamily: font,
                    fontSize: 16,
                    fontWeight: 700,
                    color: C.brown,
                    marginBottom: 4,
                }}
            >
                Where are we delivering?
            </div>
            <div
                style={{
                    fontFamily: font,
                    fontSize: 13,
                    color: C.brownMuted,
                    marginBottom: 16,
                    lineHeight: 1.5,
                }}
            >
                Enter your zip code to make sure we can reach you.
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <input
                    value={zip}
                    onChange={(e) => {
                        setZip(e.target.value.replace(/\D/g, "").slice(0, 5))
                        setStatus("idle")
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && zip.length === 5) handleCheck()
                    }}
                    placeholder="Zip code"
                    inputMode="numeric"
                    style={{
                        flex: 1,
                        padding: "12px 14px",
                        borderRadius: 10,
                        border: `1.5px solid ${status === "nyc" || status === "jc" ? C.green : status === "no" ? "#C44B4B" : C.border}`,
                        fontFamily: font,
                        fontSize: 16,
                        color: C.brown,
                        outline: "none",
                        background: "#fff",
                        boxSizing: "border-box" as const,
                        transition: "border-color 0.2s",
                    }}
                />
                <button
                    onClick={handleCheck}
                    style={{
                        padding: "12px 18px",
                        borderRadius: 10,
                        border: "none",
                        background: zip.length === 5 ? C.brown : C.muted,
                        color: "#fff",
                        fontFamily: font,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: zip.length === 5 ? "pointer" : "not-allowed",
                        lineHeight: 1,
                        whiteSpace: "nowrap" as const,
                        flexShrink: 0,
                    }}
                >
                    Check
                </button>
            </div>

            {status === "nyc" && (
                <div
                    style={{
                        padding: "12px 14px",
                        background: "#E8F0E8",
                        borderRadius: 10,
                        marginBottom: 16,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                    }}
                >
                    <span style={{ fontSize: 16 }}>✓</span>
                    <span
                        style={{
                            fontFamily: font,
                            fontSize: 13,
                            fontWeight: 600,
                            color: C.green,
                        }}
                    >
                        Great news — we deliver to your area, on us!
                    </span>
                </div>
            )}
            {status === "jc" && (
                <div
                    style={{
                        padding: "12px 14px",
                        background: "#E8F0E8",
                        borderRadius: 10,
                        marginBottom: 16,
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            marginBottom: 4,
                        }}
                    >
                        <span style={{ fontSize: 16 }}>✓</span>
                        <span
                            style={{
                                fontFamily: font,
                                fontSize: 13,
                                fontWeight: 600,
                                color: C.green,
                            }}
                        >
                            Yes, we can reach you!
                        </span>
                    </div>
                    <span
                        style={{
                            fontFamily: font,
                            fontSize: 12,
                            color: C.brownMuted,
                        }}
                    >
                        A $50 delivery fee applies for your area — added at
                        checkout.
                    </span>
                </div>
            )}
            {status === "no" && (
                <div
                    style={{
                        padding: "12px 14px",
                        background: "#FDF0F0",
                        borderRadius: 10,
                        marginBottom: 16,
                    }}
                >
                    <span
                        style={{
                            fontFamily: font,
                            fontSize: 13,
                            color: "#C44B4B",
                        }}
                    >
                        Sorry, we don't deliver to this area yet. We're
                        expanding soon — stay tuned!
                    </span>
                </div>
            )}

            {(status === "nyc" || status === "jc") && (
                <button
                    onClick={() => onNext(zip, status === "jc" ? 50 : 0)}
                    style={{
                        width: "100%",
                        padding: "13px 0",
                        borderRadius: 999,
                        border: "none",
                        background: C.brown,
                        color: "#fff",
                        fontFamily: font,
                        fontSize: 14,
                        fontWeight: 700,
                        cursor: "pointer",
                        letterSpacing: "0.02em",
                    }}
                >
                    Choose your delivery date →
                </button>
            )}
        </div>
    )
}

// ── Step: Delivery Date Picker ──────────────────────────────────

function hashDate(dateStr: string, period: string): number {
    let h = 0
    const s = dateStr + period + "roomo"
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) - h + s.charCodeAt(i)) | 0
    }
    return Math.abs(h)
}

// Compute the earliest selectable date: today + 3 days, skipping Sundays in the count
function getEarliestDeliveryDate(): Date {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    let count = 0
    while (count < 3) {
        d.setDate(d.getDate() + 1)
        if (d.getDay() !== 0) count++ // Sundays don't count toward the 3 days
    }
    return d
}

// Pre-compute exactly 9 "booked" slots across all available dates
function computeBookedSlots(): Set<string> {
    const startDate = getEarliestDeliveryDate()
    const endDate = new Date(startDate)
    endDate.setMonth(endDate.getMonth() + 4) // ~4 months out
    const allSlots: { key: string; hash: number }[] = []
    const d = new Date(startDate)
    while (d <= endDate) {
        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
        allSlots.push({ key: `${ds}-am`, hash: hashDate(ds, "am") })
        allSlots.push({ key: `${ds}-pm`, hash: hashDate(ds, "pm") })
        d.setDate(d.getDate() + 1)
    }
    // Sort by hash deterministically, pick exactly 9
    allSlots.sort((a, b) => a.hash - b.hash)
    return new Set(allSlots.slice(0, 9).map((s) => s.key))
}

const BOOKED_SLOTS = computeBookedSlots()

function StepDate({
    checkoutBaseUrl,
    onBack,
    onNext,
}: {
    checkoutBaseUrl: string
    onBack: () => void
    onNext: (date: string, slot: string) => void
}) {
    const [selectedDate, setSelectedDate] = useState<string | null>(null)
    const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
    const [showSlotPicker, setShowSlotPicker] = useState(false)
    const earliest = getEarliestDeliveryDate()
    const [viewMonth, setViewMonth] = useState(earliest.getMonth())
    const [viewYear, setViewYear] = useState(earliest.getFullYear())
    const [realBooked, setRealBooked] = useState<Set<string>>(new Set())

    // Fetch real booked slots from Supabase via the Next.js API
    useEffect(() => {
        if (!checkoutBaseUrl) return
        const base = checkoutBaseUrl.replace(/\/$/, "")
        fetch(`${base}/api/booked-slots`)
            .then((r) => r.json())
            .then((d) => setRealBooked(new Set(d.slots || [])))
            .catch(() => {})
    }, [checkoutBaseUrl])

    const monthNames = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ]
    const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
    const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay()
    const startDate = getEarliestDeliveryDate()

    const isSelectable = (day: number) => {
        const d = new Date(viewYear, viewMonth, day)
        return d >= startDate
    }

    const isBooked = (dateStr: string, period: string) => {
        const key = `${dateStr}-${period}`
        return BOOKED_SLOTS.has(key) || realBooked.has(key)
    }

    const fmt = (day: number) =>
        `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`

    const fmtDisplay = (ds: string) => {
        const d = new Date(ds + "T12:00:00")
        return d.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
        })
    }

    const handleDateClick = (day: number) => {
        if (!isSelectable(day)) return
        const ds = fmt(day)
        const amB = isBooked(ds, "am"),
            pmB = isBooked(ds, "pm")
        if (amB && pmB) return
        setSelectedDate(ds)
        setSelectedSlot(null)
        setShowSlotPicker(true)
    }

    const canPrev = !(viewYear === earliest.getFullYear() && viewMonth === earliest.getMonth())

    return (
        <div>
            <Dots step={2} total={5} />
            <button
                onClick={onBack}
                style={{
                    background: "none",
                    border: "none",
                    color: C.muted,
                    fontFamily: font,
                    fontSize: 13,
                    cursor: "pointer",
                    padding: 0,
                    marginBottom: 10,
                }}
            >
                ← Back
            </button>
            <div
                style={{
                    fontFamily: font,
                    fontSize: 16,
                    fontWeight: 700,
                    color: C.brown,
                    marginBottom: 4,
                }}
            >
                Pick your delivery day
            </div>
            <div
                style={{
                    fontFamily: font,
                    fontSize: 13,
                    color: C.brownMuted,
                    marginBottom: 16,
                    lineHeight: 1.5,
                }}
            >
                Choose a date that works for your move-in. Slots go fast!
            </div>

            {/* Month nav */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 12,
                }}
            >
                <button
                    onClick={() => {
                        if (viewMonth === 0) {
                            setViewMonth(11)
                            setViewYear(viewYear - 1)
                        } else setViewMonth(viewMonth - 1)
                    }}
                    disabled={!canPrev}
                    style={{
                        background: "none",
                        border: "none",
                        fontSize: 18,
                        color: canPrev ? C.brown : C.border,
                        cursor: canPrev ? "pointer" : "default",
                        padding: "4px 8px",
                    }}
                >
                    ‹
                </button>
                <div
                    style={{
                        fontFamily: font,
                        fontSize: 15,
                        fontWeight: 700,
                        color: C.brown,
                    }}
                >
                    {monthNames[viewMonth]} {viewYear}
                </div>
                <button
                    onClick={() => {
                        if (viewMonth === 11) {
                            setViewMonth(0)
                            setViewYear(viewYear + 1)
                        } else setViewMonth(viewMonth + 1)
                    }}
                    style={{
                        background: "none",
                        border: "none",
                        fontSize: 18,
                        color: C.brown,
                        cursor: "pointer",
                        padding: "4px 8px",
                    }}
                >
                    ›
                </button>
            </div>

            {/* Day headers */}
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(7, 1fr)",
                    gap: 2,
                    marginBottom: 4,
                }}
            >
                {dayNames.map((d) => (
                    <div
                        key={d}
                        style={{
                            fontFamily: font,
                            fontSize: 10,
                            fontWeight: 600,
                            color: C.muted,
                            textAlign: "center",
                            padding: "4px 0",
                        }}
                    >
                        {d}
                    </div>
                ))}
            </div>

            {/* Calendar */}
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(7, 1fr)",
                    gap: 2,
                    marginBottom: 12,
                }}
            >
                {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                    <div key={`e${i}`} />
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1,
                        ds = fmt(day)
                    const sel = isSelectable(day)
                    const isSel = selectedDate === ds
                    const amB = isBooked(ds, "am"),
                        pmB = isBooked(ds, "pm")
                    const full = amB && pmB
                    return (
                        <div
                            key={day}
                            onClick={() => handleDateClick(day)}
                            style={{
                                aspectRatio: "1",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                borderRadius: 10,
                                cursor: sel && !full ? "pointer" : "default",
                                background: isSel ? C.brown : "transparent",
                                color: isSel
                                    ? "#fff"
                                    : !sel || full
                                      ? C.border
                                      : C.brown,
                                fontFamily: font,
                                fontSize: 13,
                                fontWeight: isSel ? 700 : 500,
                                transition: "all 0.15s",
                            }}
                        >
                            {day}
                            {sel && (
                                <div
                                    style={{
                                        width: 4,
                                        height: 4,
                                        borderRadius: 999,
                                        marginTop: 2,
                                        background: full
                                            ? "#C44B4B"
                                            : amB || pmB
                                              ? "#E8A838"
                                              : C.green,
                                    }}
                                />
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Slot picker */}
            {showSlotPicker && selectedDate && (
                <div
                    style={{
                        background: C.cream,
                        borderRadius: 14,
                        padding: "14px 16px",
                        marginBottom: 12,
                    }}
                >
                    <div
                        style={{
                            fontFamily: font,
                            fontSize: 14,
                            fontWeight: 700,
                            color: C.brown,
                            marginBottom: 4,
                        }}
                    >
                        {fmtDisplay(selectedDate)}
                    </div>
                    <div
                        style={{
                            fontFamily: font,
                            fontSize: 12,
                            color: C.brownMuted,
                            marginBottom: 10,
                        }}
                    >
                        Choose a time slot
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        {(["am", "pm"] as const).map((p) => {
                            const booked = isBooked(selectedDate, p)
                            const active = selectedSlot === p
                            return (
                                <button
                                    key={p}
                                    onClick={() =>
                                        !booked && setSelectedSlot(p)
                                    }
                                    style={{
                                        flex: 1,
                                        padding: "10px 0",
                                        borderRadius: 10,
                                        border: `1.5px solid ${booked ? C.border : active ? C.brown : C.border}`,
                                        background: booked
                                            ? "#F5F2EE"
                                            : active
                                              ? C.brown
                                              : "#fff",
                                        color: booked
                                            ? C.border
                                            : active
                                              ? "#fff"
                                              : C.brown,
                                        fontFamily: font,
                                        fontSize: 12,
                                        fontWeight: 600,
                                        cursor: booked
                                            ? "not-allowed"
                                            : "pointer",
                                        textDecoration: booked
                                            ? "line-through"
                                            : "none",
                                    }}
                                >
                                    {booked
                                        ? "Booked"
                                        : p === "am"
                                          ? "9 AM – 1 PM"
                                          : "2 PM – 6 PM"}
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* Legend */}
            <div
                style={{
                    display: "flex",
                    gap: 12,
                    justifyContent: "center",
                    marginBottom: 14,
                }}
            >
                {[
                    { c: C.green, t: "Available" },
                    { c: "#E8A838", t: "Limited" },
                    { c: "#C44B4B", t: "Full" },
                ].map(({ c, t }) => (
                    <div
                        key={t}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                        }}
                    >
                        <div
                            style={{
                                width: 6,
                                height: 6,
                                borderRadius: 999,
                                background: c,
                            }}
                        />
                        <span
                            style={{
                                fontFamily: font,
                                fontSize: 10,
                                color: C.muted,
                            }}
                        >
                            {t}
                        </span>
                    </div>
                ))}
            </div>

            <button
                onClick={() => {
                    if (selectedDate && selectedSlot) {
                        trackEvent("select_delivery_date", { date: selectedDate, slot: selectedSlot })
                        onNext(
                            selectedDate,
                            selectedSlot === "am" ? "9 AM – 1 PM" : "2 PM – 6 PM"
                        )
                    }
                }}
                disabled={!selectedDate || !selectedSlot}
                style={{
                    width: "100%",
                    padding: "13px 0",
                    borderRadius: 999,
                    border: "none",
                    background:
                        selectedDate && selectedSlot ? C.brown : C.muted,
                    color: "#fff",
                    fontFamily: font,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor:
                        selectedDate && selectedSlot
                            ? "pointer"
                            : "not-allowed",
                    letterSpacing: "0.02em",
                }}
            >
                {selectedDate && selectedSlot
                    ? `Continue with ${fmtDisplay(selectedDate)} →`
                    : "Select a date and time"}
            </button>
        </div>
    )
}

// ── Step: Address ───────────────────────────────────────────────

function StepAddress({
    onBack,
    onNext,
    deliveryDate,
    deliverySlot,
}: {
    onBack: () => void
    onNext: (a: any) => void
    deliveryDate: string
    deliverySlot: string
}) {
    const [f, setF] = useState({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        address: "",
        unit: "",
        city: "",
        state: "NY",
        zip: "",
    })
    const s = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
    const ok =
        f.firstName && f.email && f.address && f.unit && f.city && f.zip.length === 5
    const inp: React.CSSProperties = {
        width: "100%",
        padding: "11px 13px",
        borderRadius: 10,
        border: `1.5px solid ${C.border}`,
        fontFamily: font,
        fontSize: 14,
        color: C.brown,
        outline: "none",
        background: "#fff",
        boxSizing: "border-box" as const,
    }
    const fmtDate = (ds: string) => {
        const d = new Date(ds + "T12:00:00")
        return d.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
        })
    }

    return (
        <div>
            <Dots step={3} total={5} />
            <button
                onClick={onBack}
                style={{
                    background: "none",
                    border: "none",
                    color: C.muted,
                    fontFamily: font,
                    fontSize: 13,
                    cursor: "pointer",
                    padding: 0,
                    marginBottom: 10,
                }}
            >
                ← Back
            </button>
            <div
                style={{
                    fontFamily: font,
                    fontSize: 15,
                    fontWeight: 700,
                    color: C.brown,
                    marginBottom: 4,
                }}
            >
                Shipping details
            </div>
            <div
                style={{
                    fontFamily: font,
                    fontSize: 12,
                    color: C.brownMuted,
                    marginBottom: 14,
                }}
            >
                Delivery: {fmtDate(deliveryDate)} · {deliverySlot}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                <div style={{ display: "flex", gap: 8 }}>
                    <input
                        style={inp}
                        placeholder="First name"
                        value={f.firstName}
                        onChange={(e) => s("firstName", e.target.value)}
                    />
                    <input
                        style={inp}
                        placeholder="Last name"
                        value={f.lastName}
                        onChange={(e) => s("lastName", e.target.value)}
                    />
                </div>
                <input
                    style={inp}
                    placeholder="Email"
                    type="email"
                    value={f.email}
                    onChange={(e) => s("email", e.target.value)}
                />
                <input
                    style={inp}
                    placeholder="Phone"
                    type="tel"
                    value={f.phone}
                    onChange={(e) => s("phone", e.target.value)}
                />
                <input
                    style={inp}
                    placeholder="Street address"
                    value={f.address}
                    onChange={(e) => s("address", e.target.value)}
                />
                <input
                    style={inp}
                    placeholder="Apt / Unit / Suite"
                    value={f.unit}
                    onChange={(e) => s("unit", e.target.value)}
                />
                <div style={{ display: "flex", gap: 8 }}>
                    <input
                        style={{ ...inp, flex: 2 }}
                        placeholder="City"
                        value={f.city}
                        onChange={(e) => s("city", e.target.value)}
                    />
                    <select
                        style={{ ...inp, flex: 1 }}
                        value={f.state}
                        onChange={(e) => s("state", e.target.value)}
                    >
                        <option value="NY">NY</option>
                        <option value="NJ">NJ</option>
                    </select>
                    <input
                        style={{ ...inp, flex: 1 }}
                        placeholder="Zip"
                        value={f.zip}
                        onChange={(e) =>
                            s(
                                "zip",
                                e.target.value.replace(/\D/g, "").slice(0, 5)
                            )
                        }
                    />
                </div>
            </div>
            <button
                onClick={() => ok && onNext(f)}
                style={{
                    width: "100%",
                    padding: "13px 0",
                    borderRadius: 999,
                    border: "none",
                    background: ok ? C.brown : C.muted,
                    color: "#fff",
                    fontFamily: font,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: ok ? "pointer" : "not-allowed",
                    letterSpacing: "0.02em",
                    marginTop: 14,
                }}
            >
                Continue to payment →
            </button>
        </div>
    )
}

// ── Step: Payment ───────────────────────────────────────────────

function StepPayment({
    onBack,
    cart,
    address,
    checkoutBaseUrl,
    deliveryFee,
    deliveryDate,
    deliverySlot,
    couponCode,
    onSuccess,
}: {
    onBack: () => void
    cart: CartItem[]
    address: any
    checkoutBaseUrl: string
    deliveryFee: number
    deliveryDate: string
    deliverySlot: string
    couponCode: string
    onSuccess: () => void
}) {
    // Build the checkout iframe URL ONCE, when the payment step first mounts.
    // If we recomputed it from `cart` on every render, clearing the cart on
    // success (setCart([])) would change the src → reload the iframe → wipe the
    // "You're all set!" screen and spin up a second PaymentIntent. Freezing it
    // with a lazy useState initializer prevents that.
    const [iframeSrc] = useState(() => {
        if (!checkoutBaseUrl) return ""
        const total = cart.reduce((s, i) => s + i.price, 0)
        const params = new URLSearchParams({
            items: JSON.stringify(
                cart.map((i) => ({
                    set: i.set,
                    palette: i.palette,
                    months: i.months,
                    price: i.price,
                    excluded: i.excluded,
                }))
            ),
            email: address?.email || "",
            name: `${address?.firstName || ""} ${address?.lastName || ""}`.trim(),
            phone: address?.phone || "",
            address: address?.address || "",
            unit: address?.unit || "",
            city: address?.city || "",
            state: address?.state || "",
            zip: address?.zip || "",
            total: String(total),
            deliveryFee: String(deliveryFee),
            deliveryDate: deliveryDate || "",
            deliverySlot: deliverySlot || "",
            couponCode: couponCode || "",
        })
        return `${checkoutBaseUrl}?${params.toString()}`
    })

    // Listen for payment success from iframe
    useEffect(() => {
        const handler = (e: MessageEvent) => {
            if (e.data?.type === "roomo-payment-success") {
                const fbq = (window as any).fbq
                if (fbq) {
                    const val = cart.reduce(
                        (s, i) => s + (Number(i.price) || 0),
                        0
                    )
                    fbq("track", "Purchase", { value: val, currency: "USD" })
                }
                onSuccess()
            }
        }
        window.addEventListener("message", handler)
        return () => window.removeEventListener("message", handler)
    }, [onSuccess, cart])

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                minHeight: 0,
                paddingBottom: 40,
            }}
        >
            <Dots step={4} total={5} />
            <button
                onClick={onBack}
                style={{
                    background: "none",
                    border: "none",
                    color: C.muted,
                    fontFamily: font,
                    fontSize: 13,
                    cursor: "pointer",
                    padding: 0,
                    marginBottom: 10,
                }}
            >
                ← Back
            </button>
            <div
                style={{
                    fontFamily: font,
                    fontSize: 15,
                    fontWeight: 700,
                    color: C.brown,
                    marginBottom: 14,
                }}
            >
                Payment
            </div>
            {deliveryFee > 0 && (
                <div
                    style={{
                        padding: "10px 14px",
                        background: C.cream,
                        borderRadius: 10,
                        marginBottom: 14,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                    }}
                >
                    <span
                        style={{
                            fontFamily: font,
                            fontSize: 12,
                            color: C.brownMuted,
                        }}
                    >
                        Delivery fee
                    </span>
                    <span
                        style={{
                            fontFamily: font,
                            fontSize: 13,
                            fontWeight: 700,
                            color: C.brown,
                        }}
                    >
                        ${deliveryFee}
                    </span>
                </div>
            )}
            {iframeSrc ? (
                <iframe
                    src={iframeSrc}
                    style={{
                        width: "100%",
                        flex: 1,
                        minHeight: 0,
                        border: "none",
                        borderRadius: 12,
                        display: "block",
                    }}
                    allow="payment"
                />
            ) : (
                <div
                    style={{
                        background: C.cream,
                        borderRadius: 12,
                        padding: "28px 20px",
                        textAlign: "center",
                    }}
                >
                    <div
                        style={{
                            fontFamily: font,
                            fontSize: 22,
                            fontWeight: 800,
                            color: C.brown,
                            marginBottom: 4,
                        }}
                    >
                        $25
                    </div>
                    <div
                        style={{
                            fontFamily: font,
                            fontSize: 13,
                            color: C.brownMuted,
                            lineHeight: 1.5,
                            marginBottom: 4,
                        }}
                    >
                        Refundable deposit due today
                    </div>
                    <div
                        style={{
                            fontFamily: font,
                            fontSize: 12,
                            color: C.muted,
                            lineHeight: 1.5,
                            marginBottom: 20,
                        }}
                    >
                        Applied to your first month · Fully refundable before
                        delivery
                    </div>
                    <div
                        style={{
                            padding: "36px 0",
                            border: `2px dashed ${C.border}`,
                            borderRadius: 12,
                            fontFamily: font,
                            fontSize: 13,
                            color: C.muted,
                        }}
                    >
                        Stripe payment form will appear here
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── Shared Floating Panel ──────────────────────────────────────

function _nlSubscribed(): boolean {
    try {
        return localStorage.getItem("roomo-nl-subscribed") === "1"
    } catch (e) {
        return false
    }
}

function _nlCartSkipped(): boolean {
    try {
        return localStorage.getItem("roomo-nl-cart-closed") === "1"
    } catch (e) {
        return false
    }
}

function _nlMarkSubscribed(): void {
    try {
        localStorage.setItem("roomo-nl-subscribed", "1")
    } catch (e) {
        /* noop */
    }
}

function _nlMarkCartSkipped(): void {
    try {
        localStorage.setItem("roomo-nl-cart-closed", "1")
    } catch (e) {
        /* noop */
    }
}

function ExitNewsletter(props: { onClose: () => void; isMobile: boolean }) {
    const [email, setEmail] = useState("")
    const [nlStatus, setNlStatus] = useState("idle")

    const doSubmit = () => {
        const trimmed = email.trim()
        if (!trimmed || trimmed.indexOf("@") < 1) return
        setNlStatus("sending")
        fetch("https://roomocheckout.vercel.app/api/newsletter-subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: trimmed }),
        })
            .then((res) => {
                if (!res.ok) throw new Error("fail")
                setNlStatus("success")
                _nlMarkSubscribed()
                trackEvent("newsletter_signup", { source: "cart_exit" })
                setTimeout(props.onClose, 2000)
            })
            .catch(() => {
                setNlStatus("error")
                setTimeout(() => setNlStatus("idle"), 2500)
            })
    }

    const doSkip = () => {
        _nlMarkCartSkipped()
        props.onClose()
    }

    if (nlStatus === "success") {
        return (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, padding: "20px 0", textAlign: "center", gap: 12 }}>
                <div style={{ fontSize: 40, lineHeight: 1 }}>{"✓"}</div>
                <span style={{ fontFamily: font, fontSize: 18, fontWeight: 700, color: C.brown }}>{"You're in! Check your inbox."}</span>
            </div>
        )
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, padding: "20px 0", textAlign: "center", gap: 20 }}>
            <div style={{ fontFamily: font, fontSize: props.isMobile ? 20 : 22, fontWeight: 700, color: C.brown, lineHeight: 1.3 }}>
                {"Not ready yet?"}
            </div>
            <div style={{ fontFamily: font, fontSize: 32, fontWeight: 800, color: C.brown, letterSpacing: "-0.02em", lineHeight: 1 }}>
                {"10% OFF"}
            </div>
            <div style={{ fontFamily: font, fontSize: 13, color: C.muted, lineHeight: 1.5, maxWidth: 280 }}>
                {"Join our newsletter and enjoy 10% off your first month. You can always come back later."}
            </div>
            <input
                type="email"
                placeholder="Email Address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); doSubmit() } }}
                style={{
                    width: "100%", maxWidth: 300, height: 48, borderRadius: 8,
                    border: "1.5px solid " + C.border, background: "#fff",
                    padding: "0 16px", fontFamily: font, fontSize: 14, color: C.brown,
                    outline: "none", boxSizing: "border-box" as const,
                }}
            />
            <button
                onClick={doSubmit}
                style={{
                    width: "100%", maxWidth: 300, height: 48, borderRadius: 999,
                    border: "none", background: nlStatus === "error" ? "#C44B4B" : C.brown,
                    color: "#fff", fontFamily: font, fontSize: 14, fontWeight: 700,
                    letterSpacing: "0.05em", cursor: nlStatus === "sending" ? "wait" : "pointer",
                    opacity: nlStatus === "sending" ? 0.7 : 1,
                }}
            >
                {nlStatus === "sending" ? "..." : nlStatus === "error" ? "Oops, try again" : "GET 10% OFF"}
            </button>
            <button
                onClick={doSkip}
                style={{
                    background: "none", border: "none", fontFamily: font, fontSize: 13,
                    color: C.muted, cursor: "pointer", textDecoration: "underline",
                    padding: 4,
                }}
            >
                {"No thanks"}
            </button>
        </div>
    )
}

function CartPanel({ checkoutBaseUrl }: { checkoutBaseUrl: string }) {
    const cart = useCart()
    const open = useCartOpen()
    const isMobile = useIsMobile()
    const [step, setStep] = useState(0)
    const [address, setAddress] = useState<any>(null)
    const [deliveryFee, setDeliveryFee] = useState(0)
    const [deliveryDate, setDeliveryDate] = useState("")
    const [deliverySlot, setDeliverySlot] = useState("")
    const [showExitNL, setShowExitNL] = useState(false)
    const checkoutDoneRef = useRef(false)
    const emptyCoupon = { code: "", status: "idle", discountType: "", discountValue: 0, discountAmount: 0, appliesTo: "", description: "" }
    const [couponState, setCouponState] = useState(emptyCoupon)

    // Prevent duplicate panels — only the first mounted instance renders
    const idRef = useRef(Math.random())
    useEffect(() => {
        if (!(window as any).__roomoCartPanelId) {
            ;(window as any).__roomoCartPanelId = idRef.current
        }
        return () => {
            if ((window as any).__roomoCartPanelId === idRef.current) {
                ;(window as any).__roomoCartPanelId = null
            }
        }
    }, [])
    const isOwner = (window as any).__roomoCartPanelId === idRef.current

    useEffect(() => {
        if (open) {
            setStep(0)
            setShowExitNL(false)
            checkoutDoneRef.current = false
            setCouponState(emptyCoupon)
        }
    }, [open])

    const handleClose = () => {
        if (!checkoutDoneRef.current && !_nlSubscribed() && !_nlCartSkipped() && !showExitNL) {
            setShowExitNL(true)
            trackEvent("cart_exit_newsletter_shown")
            return
        }
        setCartOpen(false)
    }

    if (!isOwner) return null
    if (typeof document === "undefined") return null

    // Render at document.body via a portal so the overlay escapes Framer's
    // per-frame stacking contexts (transforms on ancestor frames otherwise trap
    // our position:fixed panel, letting page elements like "WHAT'S INCLUDE"
    // paint on top of it).
    return createPortal(
        <AnimatePresence>
            {open && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={handleClose}
                        style={{
                            position: "fixed",
                            inset: 0,
                            background: C.overlay,
                            zIndex: 9998,
                        }}
                    />
                    <motion.div
                        initial={
                            isMobile ? { y: "100%" } : { x: "100%", opacity: 0 }
                        }
                        animate={isMobile ? { y: 0 } : { x: 0, opacity: 1 }}
                        exit={
                            isMobile ? { y: "100%" } : { x: "100%", opacity: 0 }
                        }
                        transition={{
                            type: "spring",
                            damping: 32,
                            stiffness: 300,
                        }}
                        style={{
                            position: "fixed",
                            zIndex: 9999,
                            background: C.bg,
                            boxShadow: "0 8px 40px rgba(73,55,42,0.15)",
                            display: "flex",
                            flexDirection: "column",
                            overflow: "hidden",
                            ...(isMobile
                                ? {
                                      bottom: 0,
                                      left: 0,
                                      right: 0,
                                      top: 0,
                                      borderTopLeftRadius: 0,
                                      borderTopRightRadius: 0,
                                      padding:
                                          "24px 20px calc(32px + env(safe-area-inset-bottom, 0px))",
                                  }
                                : {
                                      top: 24,
                                      right: 24,
                                      bottom: 24,
                                      width: 380,
                                      borderRadius: 24,
                                      padding: "28px 24px",
                                  }),
                        }}
                    >
                        <button
                            onClick={showExitNL ? () => setCartOpen(false) : handleClose}
                            style={{
                                position: "absolute",
                                top: isMobile ? 8 : 10,
                                right: isMobile ? 8 : 10,
                                background: "none",
                                border: "none",
                                fontSize: 20,
                                color: C.muted,
                                cursor: "pointer",
                                padding: 12,
                                lineHeight: 1,
                                zIndex: 10,
                            }}
                        >
                            ✕
                        </button>
                        {isMobile && (
                            <div
                                style={{
                                    width: 36,
                                    height: 4,
                                    borderRadius: 999,
                                    background: C.border,
                                    margin: "0 auto 16px",
                                }}
                            />
                        )}
                        {showExitNL ? (
                            <ExitNewsletter onClose={() => setCartOpen(false)} isMobile={isMobile} />
                        ) : (
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={step}
                                initial={{ opacity: 0, x: 16 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -16 }}
                                transition={{ duration: 0.2 }}
                                style={{
                                    flex: 1,
                                    minHeight: 0,
                                    display: "flex",
                                    flexDirection: "column",
                                    overflowY: "auto",
                                    overflowX: "hidden",
                                }}
                            >
                                {step === 0 && (
                                    <StepCart
                                        cart={cart}
                                        onRemove={(id) => removeFromCart(id)}
                                        onContinueShopping={handleClose}
                                        onCheckout={() => setStep(1)}
                                        checkoutBaseUrl={checkoutBaseUrl}
                                        couponState={couponState}
                                        onCouponChange={setCouponState}
                                    />
                                )}
                                {step === 1 && (
                                    <StepZip
                                        onBack={() => setStep(0)}
                                        onNext={(z, fee) => {
                                            setDeliveryFee(fee)
                                            setStep(2)
                                        }}
                                    />
                                )}
                                {step === 2 && (
                                    <StepDate
                                        checkoutBaseUrl={checkoutBaseUrl}
                                        onBack={() => setStep(1)}
                                        onNext={(d, s) => {
                                            setDeliveryDate(d)
                                            setDeliverySlot(s)
                                            setStep(3)
                                        }}
                                    />
                                )}
                                {step === 3 && (
                                    <StepAddress
                                        onBack={() => setStep(2)}
                                        deliveryDate={deliveryDate}
                                        deliverySlot={deliverySlot}
                                        onNext={(a) => {
                                            setAddress(a)
                                            setStep(4)
                                        }}
                                    />
                                )}
                                {step === 4 && (
                                    <StepPayment
                                        onBack={() => setStep(3)}
                                        cart={cart}
                                        address={address}
                                        checkoutBaseUrl={checkoutBaseUrl}
                                        deliveryFee={deliveryFee}
                                        deliveryDate={deliveryDate}
                                        deliverySlot={deliverySlot}
                                        couponCode={couponState.status === "valid" ? couponState.code : ""}
                                        onSuccess={() => {
                                            checkoutDoneRef.current = true
                                            setCart([])
                                        }}
                                    />
                                )}
                            </motion.div>
                        </AnimatePresence>
                        )}
                    </motion.div>
                </>
            )}
        </AnimatePresence>,
        document.body
    )
}

// ─── Main Component ─────────────────────────────────────────────

interface Props {
    iconColor: string
    badgeColor: string
    badgeTextColor: string
    iconSize: number
    checkoutBaseUrl: string
}

export default function RoomoCartIcon(props: Props) {
    const {
        iconColor = C.brown,
        badgeColor = C.brown,
        badgeTextColor = "#fff",
        iconSize = 24,
        checkoutBaseUrl = "",
    } = props

    const cart = useCart()
    const count = cart.length

    return (
        <>
            <motion.button
                onClick={() => setCartOpen(true)}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                style={{
                    position: "relative",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 4,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                <svg
                    width={iconSize}
                    height={iconSize}
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"
                        stroke={iconColor}
                        strokeWidth={1.8}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                    <line
                        x1="3"
                        y1="6"
                        x2="21"
                        y2="6"
                        stroke={iconColor}
                        strokeWidth={1.8}
                    />
                    <path
                        d="M16 10a4 4 0 01-8 0"
                        stroke={iconColor}
                        strokeWidth={1.8}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
                <AnimatePresence>
                    {count > 0 && (
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                            transition={{
                                type: "spring",
                                stiffness: 500,
                                damping: 25,
                            }}
                            style={{
                                position: "absolute",
                                top: -2,
                                right: -4,
                                width: 18,
                                height: 18,
                                borderRadius: 999,
                                background: badgeColor,
                                color: badgeTextColor,
                                fontFamily: font,
                                fontSize: 10,
                                fontWeight: 700,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                        >
                            {count}
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.button>
            <CartPanel checkoutBaseUrl={checkoutBaseUrl} />
        </>
    )
}

addPropertyControls(RoomoCartIcon, {
    iconColor: {
        type: ControlType.Color,
        title: "Icon Color",
        defaultValue: "#49372A",
    },
    badgeColor: {
        type: ControlType.Color,
        title: "Badge Color",
        defaultValue: "#49372A",
    },
    badgeTextColor: {
        type: ControlType.Color,
        title: "Badge Text",
        defaultValue: "#ffffff",
    },
    iconSize: {
        type: ControlType.Number,
        title: "Size",
        defaultValue: 24,
        min: 16,
        max: 40,
        step: 1,
    },
    checkoutBaseUrl: {
        type: ControlType.String,
        title: "Checkout URL",
        description: "Stripe payment iframe URL",
        defaultValue: "",
    },
})
