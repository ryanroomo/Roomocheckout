import type { ComponentType } from "react"
import { useState, useRef, useEffect } from "react"
import { motion } from "framer-motion"

// ─── Shared state ───────────────────────────────────────────────

function initState() {
    if (typeof window === "undefined") return
    if (!(window as any).__rentalState_bedding) {
        ;(window as any).__rentalState_bedding = {
            months: 12,
            hasMattress: true,
            palette: "hudson",
            buyType: "new",
        }
        ;(window as any).__rentalListeners_bedding = new Set()
    }
    if (!(window as any).__rentalState_bedding.buyType) {
        ;(window as any).__rentalState_bedding.buyType = "new"
    }
}

function setRentalState(patch: any) {
    if (typeof window === "undefined") return
    initState()
    ;(window as any).__rentalState_bedding = {
        ...(window as any).__rentalState_bedding,
        ...patch,
    }
    ;(window as any).__rentalListeners_bedding.forEach((fn: () => void) => fn())
}

function useRentalState() {
    const [, rerender] = useState(0)
    const [ready, setReady] = useState(false)
    const ref = useRef<(() => void) | null>(null)
    if (!ref.current) ref.current = () => rerender((n: number) => n + 1)

    useEffect(() => {
        initState()
        const listeners = (window as any).__rentalListeners_bedding as Set<
            () => void
        >
        listeners.add(ref.current!)
        setReady(true)
        return () => {
            listeners.delete(ref.current!)
        }
    }, [])

    if (!ready) return null
    return (window as any).__rentalState_bedding
}

// ─── 12-month base price for Bedding ────────────────────────────

function getBase12(hasMattress: boolean) {
    let price = 199
    if (!hasMattress) price -= 70
    return price
}

// ─── Brand New price ────────────────────────────────────────────
// Mattress is not recouped (hygiene) so its buy multiplier is 10×,
// while the bed frame portion stays at 16×.

export const BuyNewPrice = (Component: ComponentType): ComponentType => {
    return (props: any) => {
        const state = useRentalState()
        if (!state) return <Component {...props} text="$2,764" />

        let price: number
        if (state.hasMattress) {
            const frameOnly = getBase12(false)                  // $129
            const mattressPremium = getBase12(true) - frameOnly // $70
            price = frameOnly * 16 + mattressPremium * 10       // $2,064 + $700 = $2,764
        } else {
            price = getBase12(false) * 16                       // $2,064
        }

        return (
            <motion.div
                key={price}
                initial={{ opacity: 0, y: 6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
            >
                <Component {...props} text={`$${price.toLocaleString()}`} />
            </motion.div>
        )
    }
}

// ─── Rehomed price ──────────────────────────────────────────────

export const BuyRehomedPrice = (Component: ComponentType): ComponentType => {
    return (props: any) => {
        return <Component {...props} text={"Coming with\nour next drop"} />
    }
}

// ─── Card click overrides ───────────────────────────────────────

export const RehomedCard = (Component: ComponentType): ComponentType => {
    return (props: any) => {
        return (
            <div
                onPointerDown={() => setRentalState({ buyType: "rehomed" })}
                style={{ display: "contents" }}
            >
                <Component {...props} />
            </div>
        )
    }
}

export const BrandNewCard = (Component: ComponentType): ComponentType => {
    return (props: any) => {
        return (
            <div
                onPointerDown={() => setRentalState({ buyType: "new" })}
                style={{ display: "contents" }}
            >
                <Component {...props} />
            </div>
        )
    }
}
