import { cronJobs } from "convex/server"
import { internal } from "./_generated/api"

const crons = cronJobs()

// Refresh the program inventory from the agencies' official pages once a year:
// January 15 at 14:00 UTC (4:00 a.m. in Hawaiʻi), after most agencies publish
// new tax-year forms and limits. Changes made mid-year (e.g. SNAP limits each
// October) are picked up at the next run or with a manual
// `npx convex run programRefresh:refresh`. Safe to re-run: a program is
// re-summarized only when its source text changed (or its last summary failed
// review). Pages kept as saved copies (programCaptures.ts) are not re-fetched
// here and still need updating by hand.
crons.cron(
  "refresh program summaries",
  "0 14 15 1 *", // minute hour day-of-month month day-of-week (UTC)
  internal.programRefresh.refresh,
  {}
)

export default crons
