import type { ComponentType } from "react"

export const TrackOrderNow = (Component: ComponentType): ComponentType => {
    return (props: any) => {
        return (
            <Component
                {...props}
                onClick={(e: any) => {
                    if (props.onClick) props.onClick(e)
                    if (typeof window !== "undefined" && (window as any).gtag) {
                        ;(window as any).gtag("event", "click_order_now")
                    }
                }}
            />
        )
    }
}

export const TrackReserveNow = (Component: ComponentType): ComponentType => {
    return (props: any) => {
        return (
            <Component
                {...props}
                onClick={(e: any) => {
                    if (props.onClick) props.onClick(e)
                    if (typeof window !== "undefined" && (window as any).gtag) {
                        ;(window as any).gtag("event", "click_reserve_now")
                    }
                }}
            />
        )
    }
}
