import * as React from "react"
import { useState, useEffect, useRef, useCallback } from "react"
import { addPropertyControls, ControlType } from "framer"
import { motion, AnimatePresence } from "framer-motion"

/**
 * Roomo Cart System
 *
 * Two components exported:
 *  1) RoomoAddToCart — "Add to Cart" button for detail pages
 *  2) RoomoCartIcon  — Cart icon + badge for nav bar
 *
 * Both share window.__roomoCart and open the same floating panel.
 */

// ─── Global Cart ────────────────────────────────────────────────

interface CartItem {
    id: string
    set: "living" | "dining" | "bedding"
    mode: "rent" | "buy-new"
    palette: string
    months: number
    price: number
    accessories: string[] // what's included
    excluded: string[] // what's excluded
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

function addToCart(item: CartItem) {
    const cart = getCart()
    setCart([...cart, item])
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

// ─── Rental State readers (from existing overrides) ─────────────

type SetType = "living" | "dining" | "bedding"

const STATE_KEYS: Record<SetType, { state: string; listeners: string }> = {
    living: { state: "__rentalState", listeners: "__rentalListeners" },
    dining: {
        state: "__rentalState_dining",
        listeners: "__rentalListeners_dining",
    },
    bedding: {
        state: "__rentalState_bedding",
        listeners: "__rentalListeners_bedding",
    },
}

const DEFAULTS: Record<SetType, any> = {
    living: { months: 12, hasLamp: true, hasPlant: true, palette: "hudson" },
    dining: { months: 12, hasPlant: true, palette: "almond" },
    bedding: { months: 12, hasMattress: true, palette: "hudson" },
}

function getRentalState(set: SetType) {
    if (typeof window === "undefined") return DEFAULTS[set]
    const k = STATE_KEYS[set]
    return (window as any)[k.state] ?? DEFAULTS[set]
}

// ─── Price calculators ──────────────────────────────────────────

function calcPriceLiving(m: number, hasLamp: boolean, hasPlant: boolean) {
    const t = [
        { min: 4, max: 6, base: 549, ld: 35 },
        { min: 7, max: 9, base: 449, ld: 30 },
        { min: 10, max: 12, base: 349, ld: 20 },
    ]
    const tier = t.find((x) => m >= x.min && m <= x.max)!
    let p = tier.base
    if (!hasLamp) p -= tier.ld
    if (!hasPlant) p -= 5
    return p
}
function calcPriceDining(m: number, hasPlant: boolean) {
    const t = [
        { min: 4, max: 6, base: 449 },
        { min: 7, max: 9, base: 349 },
        { min: 10, max: 12, base: 249 },
    ]
    return t.find((x) => m >= x.min && m <= x.max)!.base - (hasPlant ? 0 : 5)
}
function calcPriceBedding(m: number, hasMattress: boolean) {
    const t = [
        { min: 4, max: 6, base: 319 },
        { min: 7, max: 9, base: 239 },
        { min: 10, max: 12, base: 199 },
    ]
    return (
        t.find((x) => m >= x.min && m <= x.max)!.base - (hasMattress ? 0 : 70)
    )
}
function getPrice(set: SetType, s: any): number {
    if (set === "living")
        return calcPriceLiving(s.months, s.hasLamp, s.hasPlant)
    if (set === "dining") return calcPriceDining(s.months, s.hasPlant)
    return calcPriceBedding(s.months, s.hasMattress)
}

// ─── Labels ─────────────────────────────────────────────────────

const SET_LABELS: Record<SetType, string> = {
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

function getAccessories(
    set: SetType,
    s: any
): { included: string[]; excluded: string[] } {
    const inc: string[] = [],
        exc: string[] = []
    if (set === "living") {
        s.hasLamp ? inc.push("Lamp") : exc.push("Lamp")
        s.hasPlant ? inc.push("Plant") : exc.push("Plant")
    }
    if (set === "dining") {
        s.hasPlant ? inc.push("Plant") : exc.push("Plant")
    }
    if (set === "bedding") {
        s.hasMattress ? inc.push("Mattress") : exc.push("Mattress")
    }
    return { included: inc, excluded: exc }
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
}: {
    cart: CartItem[]
    onRemove: (id: string) => void
    onContinueShopping: () => void
    onCheckout: () => void
}) {
    const rentItems = cart.filter((i) => i.mode === "rent")
    const buyItems = cart.filter((i) => i.mode === "buy-new")
    const totalMonthly = rentItems.reduce((sum, i) => sum + i.price, 0)
    const totalBuy = buyItems.reduce((sum, i) => sum + i.price, 0)

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

// Pre-compute exactly 9 "booked" slots across all available dates
function computeBookedSlots(): Set<string> {
    const startDate = new Date(2026, 5, 26) // June 26
    const endDate = new Date(2026, 9, 31) // October 31
    const allSlots: { key: string; hash: number }[] = []
    const d = new Date(startDate)
    while (d <= endDate) {
        if (d.getDay() !== 0) {
            // skip sunday
            const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
            allSlots.push({ key: `${ds}-am`, hash: hashDate(ds, "am") })
            allSlots.push({ key: `${ds}-pm`, hash: hashDate(ds, "pm") })
        }
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
    const [viewMonth, setViewMonth] = useState(5)
    const [viewYear, setViewYear] = useState(2026)
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
    const startDate = new Date(2026, 5, 26)

    const isSelectable = (day: number) => {
        const d = new Date(viewYear, viewMonth, day)
        if (d < startDate) return false
        return d.getDay() !== 0
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

    const canPrev = !(viewYear === 2026 && viewMonth === 5)

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
                onClick={() =>
                    selectedDate &&
                    selectedSlot &&
                    onNext(
                        selectedDate,
                        selectedSlot === "am" ? "9 AM – 1 PM" : "2 PM – 6 PM"
                    )
                }
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
        f.firstName && f.email && f.address && f.city && f.zip.length === 5
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
                    placeholder="Apt / Unit / Suite (optional)"
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
    onSuccess,
}: {
    onBack: () => void
    cart: CartItem[]
    address: any
    checkoutBaseUrl: string
    deliveryFee: number
    deliveryDate: string
    deliverySlot: string
    onSuccess: () => void
}) {
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
    })
    const iframeSrc = checkoutBaseUrl
        ? `${checkoutBaseUrl}?${params.toString()}`
        : ""

    const [iframeHeight, setIframeHeight] = useState(620)

    // Listen for payment success + dynamic height from iframe
    useEffect(() => {
        const handler = (e: MessageEvent) => {
            if (e.data?.type === "roomo-payment-success") {
                onSuccess()
            }
            if (
                e.data?.type === "roomo-iframe-height" &&
                typeof e.data.height === "number"
            ) {
                // Min 500 to avoid jumpiness during initial load.
                setIframeHeight(Math.max(500, e.data.height))
            }
        }
        window.addEventListener("message", handler)
        return () => window.removeEventListener("message", handler)
    }, [onSuccess])

    return (
        <div style={{ paddingBottom: 40 }}>
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
                        height: iframeHeight,
                        border: "none",
                        borderRadius: 12,
                        transition: "height 0.25s ease",
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

function CartPanel({ checkoutBaseUrl }: { checkoutBaseUrl: string }) {
    const cart = useCart()
    const open = useCartOpen()
    const isMobile = useIsMobile()
    const [step, setStep] = useState(0)
    const [address, setAddress] = useState<any>(null)
    const [deliveryFee, setDeliveryFee] = useState(0)
    const [deliveryDate, setDeliveryDate] = useState("")
    const [deliverySlot, setDeliverySlot] = useState("")

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
        if (open) setStep(0)
    }, [open])

    if (!isOwner) return null

    return (
        <AnimatePresence>
            {open && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={() => setCartOpen(false)}
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
                            overflowY: "auto",
                            overflowX: "hidden",
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
                            onClick={() => setCartOpen(false)}
                            style={{
                                position: "absolute",
                                top: isMobile ? 16 : 18,
                                right: isMobile ? 16 : 18,
                                background: "none",
                                border: "none",
                                fontSize: 20,
                                color: C.muted,
                                cursor: "pointer",
                                padding: 4,
                                lineHeight: 1,
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
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={step}
                                initial={{ opacity: 0, x: 16 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -16 }}
                                transition={{ duration: 0.2 }}
                            >
                                {step === 0 && (
                                    <StepCart
                                        cart={cart}
                                        onRemove={(id) => removeFromCart(id)}
                                        onContinueShopping={() =>
                                            setCartOpen(false)
                                        }
                                        onCheckout={() => setStep(1)}
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
                                        onSuccess={() => {
                                            setTimeout(() => {
                                                setCart([])
                                                setCartOpen(false)
                                            }, 3000)
                                        }}
                                    />
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}

// ═══════════════════════════════════════════════════════════════
// COMPONENT 1: Add to Cart Button (for detail pages)
// ═══════════════════════════════════════════════════════════════

interface AddToCartProps {
    set: SetType
    mode: "rent" | "buy-new"
    buttonStyle: "compact" | "full"
    buttonLabel: string
    checkoutBaseUrl: string
}

// Grab current hero image directly from the page's gallery
function getGalleryImage(): string {
    try {
        const viewportHeight = window.innerHeight
        const imgs = document.querySelectorAll("img")
        let best = ""
        let bestArea = 0
        imgs.forEach((img) => {
            const rect = img.getBoundingClientRect()
            // Only consider images in the top 60% of viewport (hero area)
            if (rect.top > viewportHeight * 0.6) return
            // Must be reasonably sized
            if (rect.width < 100 || rect.height < 100) return
            const area = rect.width * rect.height
            // Check opacity up the DOM tree (gallery uses opacity for transitions)
            let visible = true
            let el: HTMLElement | null = img as HTMLElement
            let depth = 0
            while (el && depth < 6) {
                const s = window.getComputedStyle(el)
                if (
                    s.opacity === "0" ||
                    s.display === "none" ||
                    s.visibility === "hidden"
                ) {
                    visible = false
                    break
                }
                el = el.parentElement
                depth++
            }
            if (visible && area > bestArea) {
                bestArea = area
                best = img.src
            }
        })
        return best
    } catch {
        return ""
    }
}

// Buy price = 12-month tier price × multiplier
function getBuyPrice(set: SetType, state: any): number {
    // Force 12-month tier for base calculation
    const s12 = { ...state, months: 12 }
    const monthlyAt12 = getPrice(set, s12)
    return monthlyAt12 * 16 // Brand New = 16× the 12-mo monthly
}

// Hook to read buyType from rental state (for disabling button when rehomed)
function useBuyType(set: SetType): string {
    const [, rerender] = useState(0)
    const ref = useRef<(() => void) | null>(null)
    if (!ref.current) ref.current = () => rerender((n) => n + 1)
    const k = STATE_KEYS[set]

    useEffect(() => {
        if (typeof window === "undefined") return
        if (!(window as any)[k.state]) return
        const listeners = (window as any)[k.listeners] as Set<() => void>
        listeners.add(ref.current!)
        return () => {
            listeners.delete(ref.current!)
        }
    }, [set])

    if (typeof window === "undefined") return "new"
    return (window as any)[k.state]?.buyType || "new"
}

export default function RoomoAddToCart(props: AddToCartProps) {
    const {
        set = "living",
        mode = "rent",
        buttonStyle = "compact",
        buttonLabel = "Add to Cart",
        checkoutBaseUrl = "",
    } = props

    const buyType = useBuyType(set)
    const isBuy = mode === "buy-new"
    const isDisabled = isBuy && buyType === "rehomed"

    const handleAdd = () => {
        if (isDisabled) return
        const state = getRentalState(set)
        const { included, excluded } = getAccessories(set, state)
        const image = getGalleryImage()

        const price = isBuy ? getBuyPrice(set, state) : getPrice(set, state)

        addToCart({
            id: `${set}-${mode}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            set,
            mode: isBuy ? "buy-new" : "rent",
            palette: state.palette || "",
            months: isBuy ? 0 : state.months,
            price,
            accessories: included,
            excluded,
            image,
        })
        setCartOpen(true)
    }

    const isFull = buttonStyle === "full"

    return (
        <>
            <motion.button
                onClick={handleAdd}
                whileHover={isDisabled ? {} : { scale: isFull ? 1.01 : 1.02 }}
                whileTap={isDisabled ? {} : { scale: 0.98 }}
                style={{
                    width: isFull ? "100%" : "auto",
                    padding: isFull ? "0" : "12px 28px",
                    height: isFull ? 32 : "auto",
                    borderRadius: 999,
                    border: "none",
                    background: isDisabled ? C.muted : C.brown,
                    color: "#fff",
                    fontFamily: font,
                    fontSize: isFull ? 13 : 14,
                    fontWeight: 700,
                    cursor: isDisabled ? "not-allowed" : "pointer",
                    letterSpacing: "0.05em",
                    textTransform: isFull ? "uppercase" : "none",
                    whiteSpace: "nowrap",
                    opacity: isDisabled ? 0.5 : 1,
                    transition: "all 0.2s",
                }}
            >
                {isDisabled ? "Not Available" : buttonLabel}
            </motion.button>
            <CartPanel checkoutBaseUrl={checkoutBaseUrl} />
        </>
    )
}

addPropertyControls(RoomoAddToCart, {
    set: {
        type: ControlType.Enum,
        title: "Set",
        options: ["living", "dining", "bedding"],
        optionTitles: ["Living", "Dining", "Bedding"],
        defaultValue: "living",
    },
    mode: {
        type: ControlType.Enum,
        title: "Mode",
        options: ["rent", "buy-new"],
        optionTitles: ["Rent", "Buy · Brand New"],
        defaultValue: "rent",
    },
    buttonStyle: {
        type: ControlType.Enum,
        title: "Style",
        options: ["compact", "full"],
        optionTitles: ["Compact (pill)", "Full width"],
        defaultValue: "compact",
    },
    buttonLabel: {
        type: ControlType.String,
        title: "Button Text",
        defaultValue: "Add to Cart",
    },
    checkoutBaseUrl: {
        type: ControlType.String,
        title: "Checkout URL",
        description: "Stripe payment iframe URL (empty = placeholder)",
        defaultValue: "",
    },
})

// ═══════════════════════════════════════════════════════════════
// COMPONENT 2: Cart Icon (for nav bar)
// ═══════════════════════════════════════════════════════════════
