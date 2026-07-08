import * as React from "react"
import { useState, useRef } from "react"
import { addPropertyControls, ControlType } from "framer"
import { motion, AnimatePresence } from "framer-motion"

const BROWN = "#49372A"
const CREAM = "#FAF6F1"
const BORDER = "#49372A"
const MUTED = "#A09484"
const FONT = "'Manrope', 'League Spartan', sans-serif"

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
 * RoomoNewsletter — Footer email capture bar
 *
 * Pill-shaped input: "The Newsletter  →"
 * On click → active input, type email, press arrow/Enter
 * On success → bar turns brown, white text "You're in!"
 */
export default function RoomoNewsletter(props: {
    placeholder?: string
    successText?: string
}) {
    const {
        placeholder = "The Newsletter",
        successText = "You're in! Welcome to Roomo.",
    } = props

    const [status, setStatus] = useState<Status>("idle")
    const [focused, setFocused] = useState(false)
    const [email, setEmail] = useState("")
    const inputRef = useRef<HTMLInputElement>(null)

    const isActive = focused || email.length > 0
    const isSuccess = status === "success"

    const handleSubmit = async () => {
        const trimmed = email.trim()
        if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return
        setStatus("sending")

        try {
            const res = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: trimmed }),
            })
            if (!res.ok) throw new Error("fail")
            setStatus("success")
            trackEvent("newsletter_signup", { source: "footer" })
            try { localStorage.setItem("roomo-nl-subscribed", "1") } catch (e) {}
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

    return (
        <motion.div
            animate={{
                backgroundColor: isSuccess ? BROWN : "transparent",
                borderColor: isSuccess ? BROWN : BORDER,
            }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            style={{
                width: "100%",
                maxWidth: 380,
                minWidth: 0,
                height: 48,
                borderRadius: 999,
                border: `1.5px solid ${BORDER}`,
                display: "flex",
                alignItems: "center",
                padding: "0 6px 0 16px",
                cursor: isSuccess ? "default" : "text",
                overflow: "hidden",
                position: "relative",
                boxSizing: "border-box",
            }}
            onClick={() => {
                if (!isSuccess && inputRef.current) {
                    inputRef.current.focus()
                }
            }}
        >
            <AnimatePresence mode="wait">
                {isSuccess ? (
                    <motion.span
                        key="success"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.35 }}
                        style={{
                            fontFamily: FONT,
                            fontSize: 13,
                            fontWeight: 600,
                            color: "#fff",
                            letterSpacing: "0.02em",
                            width: "100%",
                            textAlign: "center",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                        }}
                    >
                        {successText}
                    </motion.span>
                ) : (
                    <motion.div
                        key="input"
                        initial={false}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            width: "100%",
                            height: "100%",
                        }}
                    >
                        {/* Placeholder text — fades out when active */}
                        <AnimatePresence>
                            {!isActive && (
                                <motion.span
                                    initial={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    style={{
                                        position: "absolute",
                                        left: 16,
                                        fontFamily: FONT,
                                        fontSize: 13,
                                        fontWeight: 500,
                                        color: BROWN,
                                        letterSpacing: "0.03em",
                                        pointerEvents: "none",
                                        userSelect: "none",
                                    }}
                                >
                                    {placeholder}
                                </motion.span>
                            )}
                        </AnimatePresence>

                        <input
                            ref={inputRef}
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            onFocus={() => setFocused(true)}
                            onBlur={() => setFocused(false)}
                            onKeyDown={handleKeyDown}
                            disabled={status === "sending"}
                            style={{
                                flex: 1,
                                height: "100%",
                                border: "none",
                                outline: "none",
                                background: "transparent",
                                fontFamily: FONT,
                                fontSize: 13,
                                fontWeight: 500,
                                color: BROWN,
                                letterSpacing: "0.02em",
                                padding: 0,
                                margin: 0,
                                caretColor: BROWN,
                            }}
                        />

                        {/* Arrow button */}
                        <motion.button
                            onClick={(e) => {
                                e.stopPropagation()
                                handleSubmit()
                            }}
                            whileHover={{ scale: 1.08 }}
                            whileTap={{ scale: 0.94 }}
                            animate={{
                                backgroundColor:
                                    isActive && email.trim() ? BROWN : "transparent",
                                color:
                                    isActive && email.trim() ? "#fff" : BROWN,
                            }}
                            transition={{ duration: 0.25 }}
                            style={{
                                width: 36,
                                height: 36,
                                borderRadius: 999,
                                border: "none",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: "pointer",
                                flexShrink: 0,
                                fontSize: 18,
                                fontWeight: 400,
                                lineHeight: 1,
                                padding: 0,
                            }}
                        >
                            →
                        </motion.button>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    )
}

addPropertyControls(RoomoNewsletter, {
    placeholder: {
        type: ControlType.String,
        title: "Placeholder",
        defaultValue: "The Newsletter",
    },
    successText: {
        type: ControlType.String,
        title: "Success Text",
        defaultValue: "You're in! Welcome to Roomo.",
    },
})
