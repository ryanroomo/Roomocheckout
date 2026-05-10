import type { ComponentType } from "react"
import { useState, useRef, useEffect } from "react"
import { motion } from "framer-motion"

function initState() {
    if (typeof window === "undefined") return
    if (!(window as any).__rentalState_dining) {
        ;(window as any).__rentalState_dining = { months: 12, hasPlant: true }
        ;(window as any).__rentalListeners_dining = new Set()
    }
}

function setRentalState(patch: any) {
    if (typeof window === "undefined") return
    initState()
    ;(window as any).__rentalState_dining = {
        ...(window as any).__rentalState_dining,
        ...patch,
    }
    ;(window as any).__rentalListeners_dining.forEach((fn: () => void) => fn())
    // Mark user as having interacted with a slider — used by SliderThumb to skip the wiggle hint.
    try {
        localStorage.setItem("roomo-slider-touched", "1")
    } catch {}
}

function useRentalState() {
    const [, rerender] = useState(0)
    const ref = useRef<(() => void) | null>(null)
    if (!ref.current) ref.current = () => rerender((n) => n + 1)
    if (typeof window === "undefined") return { months: 12 }
    initState()
    const listeners = (window as any).__rentalListeners_dining as Set<
        () => void
    >
    if (!listeners.has(ref.current)) listeners.add(ref.current)
    return (window as any).__rentalState_dining ?? { months: 12 }
}

export const SliderTrack = (Component: ComponentType): ComponentType => {
    return (props: any) => {
        const trackRef = useRef<HTMLDivElement>(null)
        const isDownRef = useRef(false)

        const calc = (clientX: number) => {
            if (!trackRef.current) return
            const rect = trackRef.current.getBoundingClientRect()
            const pct = Math.max(
                0,
                Math.min(1, (clientX - rect.left) / rect.width)
            )
            const months = Math.round(pct * (12 - 4) + 4)
            setRentalState({ months })
        }

        return (
            <div
                ref={trackRef}
                {...props}
                style={{
                    ...props.style,
                    cursor: "pointer",
                    touchAction: "none",
                    userSelect: "none",
                    WebkitUserSelect: "none",
                    WebkitTapHighlightColor: "transparent",
                }}
                onPointerDown={(e: any) => {
                    isDownRef.current = true
                    try {
                        e.currentTarget.setPointerCapture(e.pointerId)
                    } catch {}
                    calc(e.clientX)
                }}
                onPointerMove={(e: any) => {
                    if (isDownRef.current) calc(e.clientX)
                }}
                onPointerUp={(e: any) => {
                    isDownRef.current = false
                    try {
                        e.currentTarget.releasePointerCapture(e.pointerId)
                    } catch {}
                }}
                onPointerCancel={() => {
                    isDownRef.current = false
                }}
            />
        )
    }
}

export const SliderThumb = (Component: ComponentType): ComponentType => {
    return (props: any) => {
        const state = useRentalState()
        const thumbRef = useRef<HTMLDivElement>(null)
        const [intro, setIntro] = useState(false)

        // Play the "drag me" wiggle only after the slider has been visible
        // on screen for ~2s — handles cases where the slider is below the fold.
        // Skips entirely if the user has touched any slider before.
        useEffect(() => {
            try {
                if (localStorage.getItem("roomo-slider-touched") === "1") return
            } catch {}

            let cancelled = false
            let visibilityTimer: any = null
            let observer: IntersectionObserver | null = null

            const trySetup = () => {
                if (cancelled) return
                if (!thumbRef.current) {
                    setTimeout(trySetup, 50)
                    return
                }
                observer = new IntersectionObserver(
                    (entries) => {
                        entries.forEach((entry) => {
                            if (entry.isIntersecting) {
                                if (!visibilityTimer) {
                                    visibilityTimer = setTimeout(() => {
                                        setIntro(true)
                                        setTimeout(() => setIntro(false), 1500)
                                        observer?.disconnect()
                                    }, 2000)
                                }
                            } else if (visibilityTimer) {
                                clearTimeout(visibilityTimer)
                                visibilityTimer = null
                            }
                        })
                    },
                    { threshold: 0.5 }
                )
                observer.observe(thumbRef.current)
            }

            trySetup()

            return () => {
                cancelled = true
                observer?.disconnect()
                if (visibilityTimer) clearTimeout(visibilityTimer)
            }
        }, [])

        const pct = ((state.months - 4) / (12 - 4)) * 100
        const thumbWidth = props.style?.width ?? 16

        return (
            <motion.div
                {...props}
                ref={thumbRef}
                animate={{
                    left: `calc(${pct}% - ${(pct / 100) * thumbWidth}px)`,
                    x: intro ? [0, 8, -8, 6, -4, 0] : 0,
                }}
                transition={{
                    left: {
                        type: "spring",
                        stiffness: 280,
                        damping: 28,
                        mass: 0.8,
                    },
                    x: {
                        duration: 0.8,
                        times: [0, 0.15, 0.4, 0.65, 0.85, 1],
                        ease: "easeInOut",
                    },
                }}
                style={{
                    ...props.style,
                    position: "absolute",
                    touchAction: "none",
                    userSelect: "none",
                }}
            />
        )
    }
}
