import * as React from "react"
import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { addPropertyControls, ControlType } from "framer"

/**
 * Roomo PriceCard
 *
 * Price card with built-in "Start Subscription" button.
 * Talks to the SAME global cart as RoomoAddToCart / RoomoCartIcon
 * (window.__roomoCart). The floating cart panel is rendered by the
 * nav cart icon component — keep that mounted on the page.
 *
 * Pricing here is the SINGLE two-tier scheme (must match the ring
 * components and the cart system file):
 *   Living  4-8: $449 (lamp -35) | 9-12: $349 (lamp -30), plant -5
 *   Dining  4-8: $279            | 9-12: $199,            plant -5
 *   Bedding 4-8: $239            | 9-12: $199,         mattress -70
 *
 * Button label: shows `buttonText` ("Reserve My Set") while the cart is
 * empty, then switches to `buttonTextInCart` ("Add to Cart") once the cart
 * already has an item — so adding extra sets reads naturally.
 */

// ─── Rental state readers (same keys as cart system) ────────────

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
    living: { months: 12, hasLamp: true, hasPlant: true, palette: "soho" },
    dining: { months: 12, hasPlant: true, palette: "almond" },
    bedding: { months: 12, hasMattress: true, palette: "hudson" },
}

function getRentalState(set: SetType) {
    if (typeof window === "undefined") return DEFAULTS[set]
    const k = STATE_KEYS[set]
    return (window as any)[k.state] ?? DEFAULTS[set]
}

function useRentalState(set: SetType) {
    const [, rerender] = useState(0)
    const ref = useRef<(() => void) | null>(null)
    if (!ref.current) ref.current = () => rerender((n) => n + 1)

    useEffect(() => {
        if (typeof window === "undefined") return
        const k = STATE_KEYS[set]
        if (!(window as any)[k.state]) {
            ;(window as any)[k.state] = { ...DEFAULTS[set] }
            ;(window as any)[k.listeners] = new Set()
        }
        const listeners = (window as any)[k.listeners] as Set<() => void>
        listeners.add(ref.current!)
        return () => {
            listeners.delete(ref.current!)
        }
    }, [set])

    return getRentalState(set)
}

// ─── Pricing (two tiers — the canonical scheme) ─────────────────

function calcPriceLiving(m: number, hasLamp: boolean, hasPlant: boolean) {
    const t = [
        { min: 4, max: 8, base: 345, ld: 35 }, // leasing-season promo (was 449)
        { min: 9, max: 12, base: 269, ld: 30 }, // leasing-season promo (was 349)
    ]
    const tier = t.find((x) => m >= x.min && m <= x.max)!
    let p = tier.base
    if (!hasLamp) p -= tier.ld
    if (!hasPlant) p -= 5
    return p
}
// Pre-promo reference price for the strikethrough. Returns null when the
// current tier has no active promo.
function calcCompareLiving(
    m: number,
    hasLamp: boolean,
    hasPlant: boolean
): number | null {
    let p = m >= 9 ? 349 : 449
    const ld = m >= 9 ? 30 : 35
    if (!hasLamp) p -= ld
    if (!hasPlant) p -= 5
    return p
}
function calcPriceDining(m: number, hasPlant: boolean) {
    const t = [
        { min: 4, max: 8, base: 279 },
        { min: 9, max: 12, base: 199 },
    ]
    return t.find((x) => m >= x.min && m <= x.max)!.base - (hasPlant ? 0 : 5)
}
function calcPriceBedding(m: number, hasMattress: boolean) {
    // Leasing-season promo (were 239 / 199, mattress premium was 70)
    const t = [
        { min: 4, max: 8, base: 179 },
        { min: 9, max: 12, base: 149 },
    ]
    return (
        t.find((x) => m >= x.min && m <= x.max)!.base - (hasMattress ? 0 : 50)
    )
}
function calcCompareBedding(m: number, hasMattress: boolean): number | null {
    let p = m >= 9 ? 199 : 239
    if (!hasMattress) p -= 70
    return p
}
function getPrice(set: SetType, s: any): number {
    if (set === "living")
        return calcPriceLiving(s.months, s.hasLamp, s.hasPlant)
    if (set === "dining") return calcPriceDining(s.months, s.hasPlant)
    return calcPriceBedding(s.months, s.hasMattress)
}

// Pre-promo reference price (strikethrough); null = no promo on this config
function getComparePrice(set: SetType, s: any): number | null {
    if (set === "living")
        return calcCompareLiving(s.months, s.hasLamp, s.hasPlant)
    if (set === "bedding") return calcCompareBedding(s.months, s.hasMattress)
    return null
}

// ─── Per-set copy defaults (used when the control is left empty) ─

const AUTO_ITEMS_BASE: Record<SetType, string> = {
    living: "Sofa · rug · coffee table",
    dining: "Dining table · 3 chairs",
    bedding: "Queen-size bed frame",
}

const AUTO_TAGLINE: Record<SetType, string> = {
    living: "toward owning the complete set",
    dining: "toward owning the complete set",
    bedding: "toward owning the complete set",
}

// ─── Cart interop (same globals as cart system file) ────────────

function initCart() {
    if (typeof window === "undefined") return
    if (!(window as any).__roomoCart) {
        ;(window as any).__roomoCart = []
        ;(window as any).__roomoCartListeners = new Set()
        ;(window as any).__roomoCartOpen = false
        ;(window as any).__roomoCartOpenListeners = new Set()
    }
}

function addToCart(item: any) {
    initCart()
    ;(window as any).__roomoCart = [...(window as any).__roomoCart, item]
    ;(window as any).__roomoCartListeners.forEach((fn: () => void) => fn())
}

function setCartOpen(open: boolean) {
    initCart()
    ;(window as any).__roomoCartOpen = open
    ;(window as any).__roomoCartOpenListeners.forEach((fn: () => void) => fn())
}

// Subscribe to the global cart so the button label can react to how many
// items are in it (empty → "Reserve My Set", non-empty → "Add to Cart").
function getCartCount(): number {
    if (typeof window === "undefined") return 0
    return ((window as any).__roomoCart || []).length
}

function useCartCount(): number {
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
    return getCartCount()
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

function getGalleryImage(): string {
    try {
        const viewportHeight = window.innerHeight
        const imgs = document.querySelectorAll("img")
        let best = ""
        let bestArea = 0
        imgs.forEach((img) => {
            const rect = img.getBoundingClientRect()
            if (rect.top > viewportHeight * 0.6) return
            if (rect.width < 100 || rect.height < 100) return
            const area = rect.width * rect.height
            let visible = true
            let el: HTMLElement | null = img as HTMLElement
            let depth = 0
            while (el && depth < 6) {
                const st = window.getComputedStyle(el)
                if (
                    st.opacity === "0" ||
                    st.display === "none" ||
                    st.visibility === "hidden"
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
    } catch (e) {
        return ""
    }
}

function trackEvent(name: string, params?: Record<string, any>) {
    if (typeof window === "undefined") return
    if ((window as any).gtag) {
        ;(window as any).gtag("event", name, params)
    }
    const fbq = (window as any).fbq
    if (fbq && name === "add_to_cart") {
        fbq("track", "AddToCart", {
            value: Number(params?.price) || 0,
            currency: "USD",
            content_type: "product",
            content_name: params?.set,
        })
    }
}

// ─── Component ──────────────────────────────────────────────────

export default function RoomoPriceCard(props: any) {
    const {
        set,

        // Card
        padding,
        backgroundColor,
        borderRadius,
        sectionGap,

        // Eyebrow
        eyebrowTemplate,
        eyebrowFont,
        eyebrowFontSize,
        eyebrowColor,
        eyebrowSpacing,

        // Price
        priceFont,
        priceFontSize,
        priceColor,
        perMoText,
        perMoFont,
        perMoFontSize,
        perMoColor,

        // Promo
        promoBadgeText,
        promoBadgeColor,
        promoBadgeTextColor,
        compareColor,

        // Tagline
        taglineText,
        taglineFont,
        taglineFontSize,
        taglineColor,

        // Items
        itemsBase,
        lampItem,
        plantItem,
        mattressItem,
        mattressNote,
        mattressSubtext,
        deliveryText,
        itemsFont,
        itemsFontSize,
        itemsLineHeight,
        itemsColor,

        // Button
        buttonText,
        buttonTextInCart,
        buttonFont,
        buttonFontSize,
        buttonTextColor,
        buttonColor,
        buttonHeight,
        buttonRadius,
        buttonSpacing,

        // Items popover
        popoverTitle,
        popoverBg,
        popoverTextColor,
        popoverIconColor,
        popoverRadius,

        // Trust line
        trustText,
        trustFont,
        trustFontSize,
        trustColor,
        trustIconColor,
        trustSpacing,
    } = props

    const [showItems, setShowItems] = useState(false)

    const state = useRentalState(set as SetType)

    // Cart-aware button label: empty → buttonText, non-empty → buttonTextInCart
    const cartCount = useCartCount()
    const activeButtonText = cartCount > 0 ? buttonTextInCart : buttonText

    const months = state?.months ?? 12
    const price = getPrice(set as SetType, state ?? DEFAULTS[set as SetType])
    const compareAt = getComparePrice(
        set as SetType,
        state ?? DEFAULTS[set as SetType]
    )
    const hasPromo = compareAt !== null && compareAt > price
    const pctOff = hasPromo
        ? Math.round((1 - price / (compareAt as number)) * 100)
        : 0
    const badgeLabel =
        promoBadgeText && promoBadgeText.trim()
            ? (promoBadgeText as string).replace("{pct}", String(pctOff))
            : `${pctOff}% OFF`

    const eyebrow = (eyebrowTemplate as string).replace(
        "{months}",
        String(months)
    )

    // Base copy: per-set auto default unless overridden in the panel
    const baseItems =
        itemsBase && itemsBase.trim()
            ? itemsBase
            : AUTO_ITEMS_BASE[set as SetType]
    const tagline =
        taglineText && taglineText.trim()
            ? taglineText
            : AUTO_TAGLINE[set as SetType]

    // Build item lines per set, dropping excluded accessories live.
    // Removable accessories: living = lamp + plant, dining = plant,
    // bedding = mattress. The mattress line carries a note — it's a
    // purchase-to-keep item, never rented.
    const baseLines = baseItems
        .split("·")
        .map((s: string) => s.trim())
        .filter(Boolean)
        .map((t: string) => ({ text: t, note: "", sub: "" }))
    const extraLines: { text: string; note: string; sub: string }[] = []
    if (set === "living") {
        if (state?.hasLamp)
            extraLines.push({ text: lampItem, note: "", sub: "" })
        if (state?.hasPlant)
            extraLines.push({ text: plantItem, note: "", sub: "" })
    } else if (set === "dining") {
        if (state?.hasPlant)
            extraLines.push({ text: plantItem, note: "", sub: "" })
    } else if (set === "bedding") {
        if (state?.hasMattress)
            extraLines.push({
                text: mattressItem,
                note: mattressNote || "",
                sub: mattressSubtext || "",
            })
    }
    const itemLines = [...baseLines, ...extraLines]

    const handleStart = () => {
        const s = getRentalState(set as SetType)
        // Fallback so an order can never be saved with a missing/wrong colour:
        // if no palette was picked, use this set's default (Living → Soho Merlot,
        // Bedding → Hudson Haze, Dining → Almond Breeze).
        const palette = (s && s.palette) || DEFAULTS[set as SetType].palette
        const { included, excluded } = getAccessories(set as SetType, s)
        const image = getGalleryImage()
        const p = getPrice(set as SetType, s)

        addToCart({
            id: `${set}-rent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            set,
            mode: "rent",
            palette,
            months: s.months,
            price: p,
            accessories: included,
            excluded,
            image,
        })
        trackEvent("add_to_cart", { set, mode: "rent", price: p })
        setCartOpen(true)
    }

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                width: "100%",
                padding,
                background: backgroundColor,
                borderRadius,
                boxSizing: "border-box",
            }}
        >
            {/* Eyebrow */}
            <div
                style={{
                    ...eyebrowFont,
                    fontSize: eyebrowFontSize,
                    color: eyebrowColor,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    marginBottom: eyebrowSpacing,
                }}
            >
                {eyebrow}
            </div>

            {/* Price */}
            <div
                style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 10,
                    flexWrap: "wrap",
                }}
            >
                {hasPromo && (
                    <span
                        style={{
                            ...perMoFont,
                            fontSize: Math.round(priceFontSize * 0.42),
                            color: compareColor,
                            textDecoration: "line-through",
                            textDecorationThickness: 2,
                        }}
                    >
                        {`$${(compareAt as number).toLocaleString()}`}
                    </span>
                )}
                <motion.span
                    key={price}
                    initial={false}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 30,
                    }}
                    style={{
                        ...priceFont,
                        fontSize: priceFontSize,
                        color: priceColor,
                        lineHeight: 1,
                    }}
                >
                    {`$${price.toLocaleString()}`}
                </motion.span>
                <span
                    style={{
                        ...perMoFont,
                        fontSize: perMoFontSize,
                        color: perMoColor,
                    }}
                >
                    {perMoText}
                </span>
                {hasPromo && (
                    <span
                        style={{
                            ...eyebrowFont,
                            fontSize: 12,
                            fontWeight: 600,
                            color: promoBadgeTextColor,
                            background: promoBadgeColor,
                            borderRadius: 999,
                            padding: "5px 12px 4px",
                            letterSpacing: "0.05em",
                            textTransform: "uppercase",
                            alignSelf: "center",
                        }}
                    >
                        {badgeLabel}
                    </span>
                )}
            </div>

            {/* Tagline — click to see what's included */}
            <div style={{ position: "relative", marginTop: sectionGap }}>
                <div
                    onClick={() => setShowItems(!showItems)}
                    style={{
                        ...taglineFont,
                        fontSize: taglineFontSize,
                        color: taglineColor,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        userSelect: "none",
                    }}
                >
                    <span
                        style={{
                            textDecoration: "underline",
                            textDecorationStyle: "dotted",
                            textDecorationThickness: 1.5,
                            textUnderlineOffset: 4,
                        }}
                    >
                        {tagline}
                    </span>
                    <motion.svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                        animate={{ rotate: showItems ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                        style={{ flexShrink: 0 }}
                    >
                        <path
                            d="M3 5.5 L7 9.5 L11 5.5"
                            stroke={taglineColor}
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </motion.svg>
                </div>

                {/* Items popover */}
                <AnimatePresence>
                    {showItems && (
                        <>
                            {/* click-outside backdrop */}
                            <div
                                onClick={() => setShowItems(false)}
                                style={{
                                    position: "fixed",
                                    inset: 0,
                                    zIndex: 40,
                                }}
                            />
                            <motion.div
                                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                                transition={{
                                    type: "spring",
                                    stiffness: 400,
                                    damping: 30,
                                }}
                                style={{
                                    position: "absolute",
                                    top: "calc(100% + 10px)",
                                    left: 0,
                                    zIndex: 50,
                                    background: popoverBg,
                                    borderRadius: popoverRadius,
                                    padding: "18px 22px",
                                    boxShadow:
                                        "0 8px 30px rgba(73, 55, 42, 0.16)",
                                    minWidth: 220,
                                }}
                            >
                                <div
                                    style={{
                                        ...taglineFont,
                                        fontSize: itemsFontSize + 1,
                                        color: popoverTextColor,
                                        marginBottom: 10,
                                    }}
                                >
                                    {popoverTitle}
                                </div>
                                <div
                                    style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: 7,
                                    }}
                                >
                                    {itemLines.map((line) => (
                                        <div
                                            key={line.text}
                                            style={{
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: 3,
                                            }}
                                        >
                                            <div
                                                style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 8,
                                                    ...itemsFont,
                                                    fontSize: itemsFontSize,
                                                    color: popoverTextColor,
                                                }}
                                            >
                                                <svg
                                                    width="13"
                                                    height="13"
                                                    viewBox="0 0 16 16"
                                                    fill="none"
                                                    style={{ flexShrink: 0 }}
                                                >
                                                    <path
                                                        d="M3 8.5 L6.5 12 L13 4.5"
                                                        stroke={
                                                            popoverIconColor
                                                        }
                                                        strokeWidth="1.8"
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                    />
                                                </svg>
                                                <span>{line.text}</span>
                                                {line.note && (
                                                    <span
                                                        style={{
                                                            fontSize:
                                                                itemsFontSize -
                                                                2,
                                                            fontWeight: 600,
                                                            color: popoverIconColor,
                                                            whiteSpace:
                                                                "nowrap",
                                                        }}
                                                    >
                                                        · {line.note}
                                                    </span>
                                                )}
                                            </div>
                                            {line.sub && (
                                                <div
                                                    style={{
                                                        ...itemsFont,
                                                        fontSize:
                                                            itemsFontSize - 3,
                                                        lineHeight: 1.45,
                                                        color: popoverTextColor,
                                                        opacity: 0.65,
                                                        paddingLeft: 21,
                                                        maxWidth: 240,
                                                    }}
                                                >
                                                    {line.sub}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>
            </div>

            {/* Delivery line stays visible */}
            <div
                style={{
                    ...itemsFont,
                    fontSize: itemsFontSize,
                    lineHeight: itemsLineHeight,
                    color: itemsColor,
                    marginTop: 6,
                }}
            >
                {deliveryText}
            </div>

            {/* Start Subscription — wired to the global cart */}
            <motion.button
                onClick={handleStart}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "100%",
                    height: buttonHeight,
                    marginTop: buttonSpacing,
                    background: buttonColor,
                    border: "none",
                    borderRadius: buttonRadius,
                    cursor: "pointer",
                    ...buttonFont,
                    fontSize: buttonFontSize,
                    color: buttonTextColor,
                    letterSpacing: "0.02em",
                    userSelect: "none",
                }}
            >
                {activeButtonText}
            </motion.button>

            {/* Trust line */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginTop: trustSpacing,
                    ...trustFont,
                    fontSize: trustFontSize,
                    color: trustColor,
                }}
            >
                <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    style={{ flexShrink: 0 }}
                >
                    <circle
                        cx="8"
                        cy="8"
                        r="7"
                        stroke={trustIconColor}
                        strokeWidth="1.5"
                    />
                    <path
                        d="M5 8.2 L7.2 10.3 L11 5.8"
                        stroke={trustIconColor}
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                    />
                </svg>
                <span>{trustText}</span>
            </div>
        </div>
    )
}

RoomoPriceCard.defaultProps = {
    set: "living",

    // Card
    padding: "28px 32px",
    backgroundColor: "#F4F0EA",
    borderRadius: 24,
    sectionGap: 14,

    // Eyebrow
    eyebrowTemplate: "{months}-Month Subscribe-to-Own Plan",
    eyebrowFontSize: 13,
    eyebrowColor: "#5A4A3A",
    eyebrowSpacing: 16,

    // Price
    priceFontSize: 56,
    priceColor: "#351804",
    perMoText: "/ mo",
    perMoFontSize: 16,
    perMoColor: "#5A4A3A",

    // Promo
    promoBadgeText: "{pct}% OFF",
    promoBadgeColor: "#4E5D46",
    promoBadgeTextColor: "#F4F0EA",
    compareColor: "#A99696",

    // Tagline
    taglineText: "",
    taglineFontSize: 15,
    taglineColor: "#351804",

    // Items
    itemsBase: "",
    lampItem: "floor lamp",
    plantItem: "faux plant",
    mattressItem: "mattress",
    mattressNote: "yours to keep — $700 value",
    mattressSubtext:
        "Never rented. Its cost is split into your plan — any unpaid balance settles if you end early.",
    deliveryText: "Delivery and setup included",
    itemsFontSize: 14,
    itemsLineHeight: 1.5,
    itemsColor: "#5A4A3A",

    // Items popover
    popoverTitle: "What's included",
    popoverBg: "#FFFDF9",
    popoverTextColor: "#49372A",
    popoverIconColor: "#4E5D46",
    popoverRadius: 16,

    // Button
    buttonText: "Start Subscription",
    buttonTextInCart: "Add to Cart",
    buttonFontSize: 17,
    buttonTextColor: "#F4F0EA",
    buttonColor: "#3E2E20",
    buttonHeight: 56,
    buttonRadius: 999,
    buttonSpacing: 20,

    // Trust line
    trustText: "Brand new. Never rented.",
    trustFontSize: 13,
    trustColor: "#351804",
    trustIconColor: "#351804",
    trustSpacing: 16,
}

addPropertyControls(RoomoPriceCard, {
    set: {
        type: ControlType.Enum,
        title: "Set",
        options: ["living", "dining", "bedding"],
        optionTitles: ["Living", "Dining", "Bedding"],
        defaultValue: "living",
    },

    // ── Card ───────────────────────────────────────
    padding: {
        type: ControlType.Padding,
        title: "Padding",
        defaultValue: "28px 32px",
    },
    backgroundColor: {
        type: ControlType.Color,
        title: "Background",
        defaultValue: "#F4F0EA",
    },
    borderRadius: {
        type: ControlType.Number,
        title: "Corner Radius",
        defaultValue: 24,
        min: 0,
        max: 48,
    },
    sectionGap: {
        type: ControlType.Number,
        title: "Section Gap",
        defaultValue: 14,
        min: 0,
        max: 40,
    },

    // ── Eyebrow ────────────────────────────────────
    eyebrowTemplate: {
        type: ControlType.String,
        title: "Eyebrow ({months})",
        defaultValue: "{months}-Month Subscribe-to-Own Plan",
    },
    eyebrowFont: {
        type: ControlType.Font,
        title: "Eyebrow Font",
        controls: "basic",
        defaultValue: { fontFamily: "League Spartan", fontWeight: 500 },
    },
    eyebrowFontSize: {
        type: ControlType.Number,
        title: "Eyebrow Size",
        defaultValue: 13,
        min: 8,
        max: 24,
    },
    eyebrowColor: {
        type: ControlType.Color,
        title: "Eyebrow Color",
        defaultValue: "#5A4A3A",
    },
    eyebrowSpacing: {
        type: ControlType.Number,
        title: "Eyebrow Spacing",
        defaultValue: 16,
        min: 0,
        max: 48,
    },

    // ── Price ──────────────────────────────────────
    priceFont: {
        type: ControlType.Font,
        title: "Price Font",
        controls: "basic",
        defaultValue: { fontFamily: "League Spartan", fontWeight: 600 },
    },
    priceFontSize: {
        type: ControlType.Number,
        title: "Price Size",
        defaultValue: 56,
        min: 24,
        max: 96,
    },
    priceColor: {
        type: ControlType.Color,
        title: "Price Color",
        defaultValue: "#351804",
    },
    perMoText: {
        type: ControlType.String,
        title: "Per-Month Text",
        defaultValue: "/ mo",
    },
    perMoFont: {
        type: ControlType.Font,
        title: "Per-Month Font",
        controls: "basic",
        defaultValue: { fontFamily: "League Spartan", fontWeight: 400 },
    },
    perMoFontSize: {
        type: ControlType.Number,
        title: "Per-Month Size",
        defaultValue: 16,
        min: 8,
        max: 32,
    },
    perMoColor: {
        type: ControlType.Color,
        title: "Per-Month Color",
        defaultValue: "#5A4A3A",
    },

    // ── Promo ──────────────────────────────────────
    promoBadgeText: {
        type: ControlType.String,
        title: "Promo Badge ({pct})",
        description:
            "{pct} = computed % off. Only shows when a promo is active.",
        defaultValue: "{pct}% OFF",
    },
    promoBadgeColor: {
        type: ControlType.Color,
        title: "Badge Color",
        defaultValue: "#4E5D46",
    },
    promoBadgeTextColor: {
        type: ControlType.Color,
        title: "Badge Text Color",
        defaultValue: "#F4F0EA",
    },
    compareColor: {
        type: ControlType.Color,
        title: "Strikethrough Color",
        defaultValue: "#A99696",
    },

    // ── Tagline ────────────────────────────────────
    taglineText: {
        type: ControlType.String,
        title: "Tagline",
        description: "Leave empty to auto-fill per set",
        defaultValue: "",
    },
    taglineFont: {
        type: ControlType.Font,
        title: "Tagline Font",
        controls: "basic",
        defaultValue: { fontFamily: "League Spartan", fontWeight: 600 },
    },
    taglineFontSize: {
        type: ControlType.Number,
        title: "Tagline Size",
        defaultValue: 15,
        min: 10,
        max: 28,
    },
    taglineColor: {
        type: ControlType.Color,
        title: "Tagline Color",
        defaultValue: "#351804",
    },

    // ── Items ──────────────────────────────────────
    itemsBase: {
        type: ControlType.String,
        title: "Items (Base)",
        description: "Leave empty to auto-fill per set",
        defaultValue: "",
    },
    lampItem: {
        type: ControlType.String,
        title: "Lamp Item",
        defaultValue: "floor lamp",
    },
    plantItem: {
        type: ControlType.String,
        title: "Plant Item",
        defaultValue: "faux plant",
    },
    mattressItem: {
        type: ControlType.String,
        title: "Mattress Item",
        defaultValue: "mattress",
    },
    mattressNote: {
        type: ControlType.String,
        title: "Mattress Note",
        description: "Small accent text after the mattress line in the popover",
        defaultValue: "yours to keep — $700 value",
    },
    mattressSubtext: {
        type: ControlType.String,
        title: "Mattress Subtext",
        description: "Fine-print line under the mattress item (empty = hidden)",
        defaultValue:
            "Never rented. Its cost is split into your plan — any unpaid balance settles if you end early.",
    },
    deliveryText: {
        type: ControlType.String,
        title: "Delivery Text",
        defaultValue: "Delivery and setup included",
    },
    itemsFont: {
        type: ControlType.Font,
        title: "Items Font",
        controls: "basic",
        defaultValue: { fontFamily: "League Spartan", fontWeight: 400 },
    },
    itemsFontSize: {
        type: ControlType.Number,
        title: "Items Size",
        defaultValue: 14,
        min: 8,
        max: 24,
    },
    itemsLineHeight: {
        type: ControlType.Number,
        title: "Items Line Height",
        defaultValue: 1.5,
        min: 1,
        max: 2.2,
        step: 0.05,
    },
    itemsColor: {
        type: ControlType.Color,
        title: "Items Color",
        defaultValue: "#5A4A3A",
    },

    // ── Items popover ──────────────────────────────
    popoverTitle: {
        type: ControlType.String,
        title: "Popover Title",
        defaultValue: "What's included",
    },
    popoverBg: {
        type: ControlType.Color,
        title: "Popover Background",
        defaultValue: "#FFFDF9",
    },
    popoverTextColor: {
        type: ControlType.Color,
        title: "Popover Text Color",
        defaultValue: "#49372A",
    },
    popoverIconColor: {
        type: ControlType.Color,
        title: "Popover Check Color",
        defaultValue: "#4E5D46",
    },
    popoverRadius: {
        type: ControlType.Number,
        title: "Popover Radius",
        defaultValue: 16,
        min: 0,
        max: 32,
    },

    // ── Button ─────────────────────────────────────
    buttonText: {
        type: ControlType.String,
        title: "Button Text",
        defaultValue: "Start Subscription",
    },
    buttonTextInCart: {
        type: ControlType.String,
        title: "Button Text (cart not empty)",
        description: "Shown once the cart already has an item",
        defaultValue: "Add to Cart",
    },
    buttonFont: {
        type: ControlType.Font,
        title: "Button Font",
        controls: "basic",
        defaultValue: { fontFamily: "League Spartan", fontWeight: 600 },
    },
    buttonFontSize: {
        type: ControlType.Number,
        title: "Button Text Size",
        defaultValue: 17,
        min: 10,
        max: 28,
    },
    buttonTextColor: {
        type: ControlType.Color,
        title: "Button Text Color",
        defaultValue: "#F4F0EA",
    },
    buttonColor: {
        type: ControlType.Color,
        title: "Button Color",
        defaultValue: "#3E2E20",
    },
    buttonHeight: {
        type: ControlType.Number,
        title: "Button Height",
        defaultValue: 56,
        min: 32,
        max: 88,
    },
    buttonRadius: {
        type: ControlType.Number,
        title: "Button Radius",
        defaultValue: 999,
        min: 0,
        max: 999,
    },
    buttonSpacing: {
        type: ControlType.Number,
        title: "Button Spacing",
        defaultValue: 20,
        min: 0,
        max: 48,
    },

    // ── Trust line ─────────────────────────────────
    trustText: {
        type: ControlType.String,
        title: "Trust Text",
        defaultValue: "Brand new. Never rented.",
    },
    trustFont: {
        type: ControlType.Font,
        title: "Trust Font",
        controls: "basic",
        defaultValue: { fontFamily: "League Spartan", fontWeight: 500 },
    },
    trustFontSize: {
        type: ControlType.Number,
        title: "Trust Text Size",
        defaultValue: 13,
        min: 8,
        max: 24,
    },
    trustColor: {
        type: ControlType.Color,
        title: "Trust Text Color",
        defaultValue: "#351804",
    },
    trustIconColor: {
        type: ControlType.Color,
        title: "Trust Icon Color",
        defaultValue: "#351804",
    },
    trustSpacing: {
        type: ControlType.Number,
        title: "Trust Spacing",
        defaultValue: 16,
        min: 0,
        max: 48,
    },
})
