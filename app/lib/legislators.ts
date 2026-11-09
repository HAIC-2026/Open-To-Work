import * as React from "react"
import type { Id } from "@/convex/_generated/dataModel"

export interface LegislatorUser {
  _id?: Id<"users">
  name: string
  district: string // e.g. "house-district-1" or "senate-district-5"
  photoUrl?: string
}

export function formatDistrictTitle(district: string): string {
  const isHouse = district.toLowerCase().startsWith("house")
  const num = district.replace(/\D/g, "")
  return isHouse ? `House District ${num}` : `Senate District ${num}`
}

export function getChamber(district: string): "House" | "Senate" {
  return district.toLowerCase().startsWith("senate") ? "Senate" : "House"
}

export const INITIAL_LEGISLATORS: LegislatorUser[] = [
  ...Array.from({ length: 51 }, (_, i) => {
    const num = i + 1
    return {
      name: `Representative District ${num}`,
      district: `house-district-${num}`,
      photoUrl: "",
    }
  }),
  ...Array.from({ length: 25 }, (_, i) => {
    const num = i + 1
    return {
      name: `Senator District ${num}`,
      district: `senate-district-${num}`,
      photoUrl: "",
    }
  }),
]

export const DEFAULT_LEGISLATOR: LegislatorUser = INITIAL_LEGISLATORS[0]

export const ACTIVE_LEGISLATOR_STORAGE_KEY = "active_legislator_user"

export function getActiveLegislator(): LegislatorUser {
  if (typeof window === "undefined") return DEFAULT_LEGISLATOR
  try {
    const saved = localStorage.getItem(ACTIVE_LEGISLATOR_STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (parsed?.district) {
        return parsed
      }
    }
    // Backward compatibility with legacy storage key
    const legacy = localStorage.getItem("active_legislator")
    if (legacy) {
      const parsed = JSON.parse(legacy)
      if (parsed?.district) {
        const num = parsed.district.replace(/\D/g, "")
        const isHouse = parsed.district.toLowerCase().includes("house")
        const normalizedDistrict = isHouse ? `house-district-${num}` : `senate-district-${num}`
        const match = INITIAL_LEGISLATORS.find((l) => l.district === normalizedDistrict)
        if (match) return match
      }
    }
  } catch (e) {
    // fallback
  }
  return DEFAULT_LEGISLATOR
}

export function setActiveLegislator(legislator: LegislatorUser) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(ACTIVE_LEGISLATOR_STORAGE_KEY, JSON.stringify(legislator))
    window.dispatchEvent(new CustomEvent("active-legislator-changed", { detail: legislator }))
  } catch (e) {
    // fallback
  }
}

export function useActiveLegislator(dbUsers?: LegislatorUser[]): [LegislatorUser, (legislator: LegislatorUser) => void] {
  const [current, setCurrent] = React.useState<LegislatorUser>(() => getActiveLegislator())

  // If dbUsers are provided, sync current with the matching database user to guarantee _id is attached
  React.useEffect(() => {
    if (!dbUsers || dbUsers.length === 0) return
    setCurrent((prev) => {
      const matched = dbUsers.find((u) => u.district === prev.district)
      if (matched && matched._id !== prev._id) {
        const updated = { ...prev, ...matched }
        try {
          localStorage.setItem(ACTIVE_LEGISLATOR_STORAGE_KEY, JSON.stringify(updated))
        } catch {}
        return updated
      }
      return prev
    })
  }, [dbUsers])

  React.useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === ACTIVE_LEGISLATOR_STORAGE_KEY) {
        setCurrent(getActiveLegislator())
      }
    }
    const handleCustom = (e: Event) => {
      const custom = e as CustomEvent<LegislatorUser>
      if (custom.detail) {
        setCurrent(custom.detail)
      }
    }

    window.addEventListener("storage", handleStorage)
    window.addEventListener("active-legislator-changed", handleCustom)
    return () => {
      window.removeEventListener("storage", handleStorage)
      window.removeEventListener("active-legislator-changed", handleCustom)
    }
  }, [])

  const setLegislator = React.useCallback((legislator: LegislatorUser) => {
    setActiveLegislator(legislator)
    setCurrent(legislator)
  }, [])

  return [current, setLegislator]
}
