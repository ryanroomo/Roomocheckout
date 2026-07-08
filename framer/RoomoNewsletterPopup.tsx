import * as React from "react"
import { useState, useEffect, useRef } from "react"
import { addPropertyControls, ControlType } from "framer"
import { motion, AnimatePresence } from "framer-motion"

const BROWN = "#49372A"
const CREAM = "#FAF6F1"
const MUTED = "#A09484"
const BORDER = "#E8E0D6"
const FONT = "'Manrope', 'League Spartan', sans-serif"
const POPUP_CLOSED_KEY = "roomo-nl-popup-closed"
const SUBSCRIBED_KEY = "roomo-nl-subscribed"

const API_URL = "https://roomocheckout.vercel.app/api/newsletter-subscribe"

type Status = "idle" | "sending" | "success" | "error"

function trackEvent(name: string, params?: Record<string, any>) {
    if (typeof window === "undefined") return
    if ((window as any).gtag) {
        ;(window as any).gtag("event", name, params)
    }
    // Meta Pixel — newsletter signup = Lead
    const fbq = (window as any).fbq
    if (fbq && name === "newsletter_signup") {
        fbq("track", "Lead", { content_name: "newsletter" })
    }
}

/**
 * RoomoNewsletterPopup — Full-screen overlay popup
 *
 * Shows 5s after page load (once per visitor).
 * Left: image slot (via Framer prop). Right: form.
 * Collects first name + email → /api/newsletter-subscribe
 */
export default function RoomoNewsletterPopup(props: {
    delaySeconds?: number
    image?: string
    headline?: string
    offer?: string
    description?: string
    buttonLabel?: string
    successText?: string
}) {
    const {
        delaySeconds = 5,
        image = "",
        headline = "First time with Roomo?",
        offer = "10% OFF",
        description = "Join our newsletter and enjoy 10% off your first month. Be the first to know about new drops, styling tips, and exclusive offers.",
        buttonLabel = "SIGN ME UP",
        successText = "You're in! Check your inbox.",
    } = props

    const [visible, setVisible] = useState(false)
    const [firstName, setFirstName] = useState("")
    const [email, setEmail] = useState("")
    const [status, setStatus] = useState<Status>("idle")
    const timerRef = useRef<any>(null)

    useEffect(() => {
        // Don't show if already dismissed / subscribed
        try {
            if (localStorage.getItem(SUBSCRIBED_KEY) || localStorage.getItem(POPUP_CLOSED_KEY)) return
        } catch {}

        timerRef.current = setTimeout(() => {
            setVisible(true)
            trackEvent("newsletter_popup_shown")
        }, delaySeconds * 1000)

        return () => clearTimeout(timerRef.current)
    }, [delaySeconds])

    const dismiss = () => {
        setVisible(false)
        try {
            localStorage.setItem(POPUP_CLOSED_KEY, "1")
        } catch {}
    }

    const handleSubmit = async () => {
        const trimmedEmail = email.trim()
        if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail))
            return
        setStatus("sending")

        try {
            const res = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: trimmedEmail,
                    first_name: firstName.trim(),
                }),
            })
            if (!res.ok) throw new Error("fail")
            setStatus("success")
            trackEvent("newsletter_signup", { source: "popup" })
            try {
                localStorage.setItem(SUBSCRIBED_KEY, "1")
            } catch {}
            // Auto-close after 2.5s
            setTimeout(() => setVisible(false), 2500)
        } catch {
            setStatus("error")
            setTimeout(() => setStatus("idle"), 2500)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.preventDefault()
            handleSubmit()
        }
    }

    // Detect mobile
    const [isMobile, setIsMobile] = useState(false)
    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768)
        check()
        window.addEventListener("resize", check)
        return () => window.removeEventListener("resize", check)
    }, [])

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    style={{
                        position: "fixed",
                        inset: 0,
                        zIndex: 10000,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "rgba(73, 55, 42, 0.4)",
                        padding: isMobile ? 16 : 24,
                    }}
                    onClick={dismiss}
                >
                    <motion.div
                        initial={
                            isMobile
                                ? { y: 60, opacity: 0 }
                                : { scale: 0.92, opacity: 0 }
                        }
                        animate={
                            isMobile
                                ? { y: 0, opacity: 1 }
                                : { scale: 1, opacity: 1 }
                        }
                        exit={
                            isMobile
                                ? { y: 60, opacity: 0 }
                                : { scale: 0.92, opacity: 0 }
                        }
                        transition={{
                            type: "spring",
                            damping: 30,
                            stiffness: 300,
                        }}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            display: "flex",
                            flexDirection: isMobile ? "column" : "row",
                            width: isMobile ? "100%" : "auto",
                            maxWidth: 720,
                            maxHeight: isMobile ? "90vh" : "auto",
                            borderRadius: 16,
                            overflow: "hidden",
                            background: CREAM,
                            boxShadow: "0 20px 60px rgba(73,55,42,0.2)",
                            position: "relative",
                        }}
                    >
                        {/* Close button */}
                        <button
                            onClick={dismiss}
                            style={{
                                position: "absolute",
                                top: 12,
                                right: 12,
                                zIndex: 10,
                                width: 36,
                                height: 36,
                                borderRadius: 999,
                                border: "none",
                                background: "rgba(255,255,255,0.8)",
                                color: BROWN,
                                fontSize: 18,
                                fontWeight: 400,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                lineHeight: 1,
                                backdropFilter: "blur(4px)",
                            }}
                        >
                            ✕
                        </button>

                        {/* Left: Image */}
                        <div
                            style={{
                                width: isMobile ? "100%" : 300,
                                height: isMobile ? 200 : "auto",
                                minHeight: isMobile ? 200 : 420,
                                background: image
                                    ? `url(${image}) center/cover no-repeat`
                                    : `linear-gradient(135deg, ${BROWN} 0%, #6B5344 100%)`,
                                flexShrink: 0,
                            }}
                        />

                        {/* Right: Form */}
                        <div
                            style={{
                                flex: 1,
                                padding: isMobile ? "28px 24px 32px" : "48px 40px",
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "center",
                                gap: 16,
                            }}
                        >
                            <AnimatePresence mode="wait">
                                {status === "success" ? (
                                    <motion.div
                                        key="success"
                                        initial={{ opacity: 0, y: 12 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        style={{
                                            textAlign: "center",
                                            display: "flex",
                                            flexDirection: "column",
                                            alignItems: "center",
                                            gap: 12,
                                        }}
                                    >
                                        <div
                                            style={{
                                                fontSize: 40,
                                                lineHeight: 1,
                                            }}
                                        >
                                            ✓
                                        </div>
                                        <span
                                            style={{
                                                fontFamily: FONT,
                                                fontSize: 18,
                                                fontWeight: 700,
                                                color: BROWN,
                                            }}
                                        >
                                            {successText}
                                        </span>
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="form"
                                        initial={false}
                                        style={{
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: 16,
                                        }}
                                    >
                                        <h2
                                            style={{
                                                fontFamily: FONT,
                                                fontSize: isMobile ? 18 : 20,
                                                fontWeight: 500,
                                                color: BROWN,
                                                margin: 0,
                                                lineHeight: 1.3,
                                            }}
                                        >
                                            {headline}
                                        </h2>

                                        <span
                                            style={{
                                                fontFamily: FONT,
                                                fontSize: isMobile ? 40 : 48,
                                                fontWeight: 800,
                                                color: BROWN,
                                                letterSpacing: "-0.02em",
                                                lineHeight: 1,
                                            }}
                                        >
                                            {offer}
                                        </span>

                                        <p
                                            style={{
                                                fontFamily: FONT,
                                                fontSize: 13,
                                                color: MUTED,
                                                lineHeight: 1.5,
                                                margin: 0,
                                            }}
                                        >
                                            {description}
                                        </p>

                                        {/* First Name */}
                                        <input
                                            type="text"
                                            placeholder="First Name"
                                            value={firstName}
                                            onChange={(e) =>
                                                setFirstName(e.target.value)
                                            }
                                            onKeyDown={handleKeyDown}
                                            style={{
                                                width: "100%",
                                                height: 48,
                                                borderRadius: 8,
                                                border: `1.5px solid ${BORDER}`,
                                                background: "#fff",
                                                padding: "0 16px",
                                                fontFamily: FONT,
                                                fontSize: 14,
                                                color: BROWN,
                                                outline: "none",
                                                boxSizing: "border-box",
                                            }}
                                        />

                                        {/* Email */}
                                        <input
                                            type="email"
                                            placeholder="Email Address"
                                            value={email}
                                            onChange={(e) =>
                                                setEmail(e.target.value)
                                            }
                                            onKeyDown={handleKeyDown}
                                            style={{
                                                width: "100%",
                                                height: 48,
                                                borderRadius: 8,
                                                border: `1.5px solid ${BORDER}`,
                                                background: "#fff",
                                                padding: "0 16px",
                                                fontFamily: FONT,
                                                fontSize: 14,
                                                color: BROWN,
                                                outline: "none",
                                                boxSizing: "border-box",
                                            }}
                                        />

                                        {/* Submit */}
                                        <motion.button
                                            onClick={handleSubmit}
                                            whileHover={{ scale: 1.01 }}
                                            whileTap={{ scale: 0.98 }}
                                            style={{
                                                width: "100%",
                                                height: 52,
                                                borderRadius: 12,
                                                border: "none",
                                                background:
                                                    status === "error"
                                                        ? "#C44B4B"
                                                        : "#D4C4B0",
                                                color:
                                                    status === "error"
                                                        ? "#fff"
                                                        : BROWN,
                                                fontFamily: FONT,
                                                fontSize: 15,
                                                fontWeight: 700,
                                                letterSpacing: "0.08em",
                                                cursor:
                                                    status === "sending"
                                                        ? "wait"
                                                        : "pointer",
                                                opacity:
                                                    status === "sending"
                                                        ? 0.7
                                                        : 1,
                                                transition: "all 0.2s",
                                            }}
                                        >
                                            {status === "sending"
                                                ? "..."
                                                : status === "error"
                                                  ? "Oops, try again"
                                                  : buttonLabel}
                                        </motion.button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}

addPropertyControls(RoomoNewsletterPopup, {
    delaySeconds: {
        type: ControlType.Number,
        title: "Delay (sec)",
        defaultValue: 5,
        min: 1,
        max: 60,
        step: 1,
    },
    image: {
        type: ControlType.Image,
        title: "Image",
    },
    headline: {
        type: ControlType.String,
        title: "Headline",
        defaultValue: "First time with Roomo?",
    },
    offer: {
        type: ControlType.String,
        title: "Offer",
        defaultValue: "10% OFF",
    },
    description: {
        type: ControlType.String,
        title: "Description",
        defaultValue:
            "Join our newsletter and enjoy 10% off your first month. Be the first to know about new drops, styling tips, and exclusive offers.",
    },
    buttonLabel: {
        type: ControlType.String,
        title: "Button Label",
        defaultValue: "SIGN ME UP",
    },
    successText: {
        type: ControlType.String,
        title: "Success Text",
        defaultValue: "You're in! Check your inbox.",
    },
})
