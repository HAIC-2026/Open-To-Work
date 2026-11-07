"use client"

import * as React from "react"
import { useSidebar } from "@/components/ui/sidebar"

export const SIDEBAR_WIDTH_COOKIE_NAME = "sidebar_width"
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
export const DEFAULT_SIDEBAR_WIDTH_PX = 256

interface SidebarResizeContextType {
  width: number
  setWidth: React.Dispatch<React.SetStateAction<number>>
  isResizing: boolean
  setIsResizing: React.Dispatch<React.SetStateAction<boolean>>
}

const SidebarResizeContext = React.createContext<SidebarResizeContextType | null>(null)

export function useSidebarResize() {
  const context = React.useContext(SidebarResizeContext)
  if (!context) {
    throw new Error("useSidebarResize must be used within a SidebarResizeProvider")
  }
  return context
}

export function SidebarResizeProvider({ children }: { children: React.ReactNode }) {
  const [width, setWidth] = React.useState<number>(DEFAULT_SIDEBAR_WIDTH_PX)
  const [isResizing, setIsResizing] = React.useState(false)

  // Load saved sidebar width from cookie & clamp to max 30vw
  React.useEffect(() => {
    const match = document.cookie.match(
      new RegExp(`(^| )${SIDEBAR_WIDTH_COOKIE_NAME}=([^;]+)`)
    )
    if (match) {
      const val = parseInt(match[2], 10)
      if (!isNaN(val) && val >= DEFAULT_SIDEBAR_WIDTH_PX) {
        const maxWidth = Math.max(DEFAULT_SIDEBAR_WIDTH_PX, Math.floor(window.innerWidth * 0.3))
        setWidth(Math.min(val, maxWidth))
      }
    }

    const handleWindowResize = () => {
      setWidth((prev) => {
        const maxWidth = Math.max(DEFAULT_SIDEBAR_WIDTH_PX, Math.floor(window.innerWidth * 0.3))
        return Math.min(prev, maxWidth)
      })
    }
    window.addEventListener("resize", handleWindowResize)
    return () => window.removeEventListener("resize", handleWindowResize)
  }, [])

  return (
    <SidebarResizeContext.Provider
      value={{
        width,
        setWidth,
        isResizing,
        setIsResizing,
      }}
    >
      {children}
    </SidebarResizeContext.Provider>
  )
}

export function useSidebarResizeRail() {
  const { toggleSidebar, open, setOpen } = useSidebar()
  const { setWidth, setIsResizing } = useSidebarResize()
  const hasMovedRef = React.useRef(false)

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const startX = e.clientX
    hasMovedRef.current = false

    setIsResizing(true)
    document.body.style.userSelect = "none"
    document.body.style.cursor = "col-resize"

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const currentX = moveEvent.clientX
      if (Math.abs(currentX - startX) > 3) {
        hasMovedRef.current = true
      }

      const minWidth = DEFAULT_SIDEBAR_WIDTH_PX
      const maxWidth = Math.max(minWidth, Math.floor(window.innerWidth * 0.3))
      const clampedWidth = Math.min(Math.max(currentX, minWidth), maxWidth)

      if (!open) {
        setOpen(true)
      }
      setWidth(clampedWidth)
    }

    const handlePointerUp = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      document.body.style.userSelect = ""
      document.body.style.cursor = ""
      setIsResizing(false)

      if (hasMovedRef.current) {
        const finalX = upEvent.clientX
        const minWidth = DEFAULT_SIDEBAR_WIDTH_PX
        const maxWidth = Math.max(minWidth, Math.floor(window.innerWidth * 0.3))
        const clampedWidth = Math.min(Math.max(finalX, minWidth), maxWidth)
        document.cookie = `${SIDEBAR_WIDTH_COOKIE_NAME}=${clampedWidth}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
      }
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
  }

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (hasMovedRef.current) {
      e.preventDefault()
      e.stopPropagation()
      hasMovedRef.current = false
      return
    }
    toggleSidebar()
  }

  return { handlePointerDown, handleClick }
}
