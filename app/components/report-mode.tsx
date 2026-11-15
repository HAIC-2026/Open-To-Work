"use client"

import * as React from "react"

/**
 * True inside a printable report (/report/[key]). Components rendered in an
 * answer use it to drop interactive parts (map controls, invite buttons) and
 * show a static, print-friendly version instead.
 */
export const ReportModeContext = React.createContext(false)

export function useReportMode() {
  return React.useContext(ReportModeContext)
}
