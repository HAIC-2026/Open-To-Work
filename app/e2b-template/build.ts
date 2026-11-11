import { Template, defaultBuildLogger } from "e2b"
import { template } from "./template"

/**
 * Builds the sandbox template on E2B.
 *
 *   npm run template:build:dev   → code-interpreter-v1-plus-geo-dev
 *   npm run template:build:prod  → code-interpreter-v1-plus-geo
 *
 * Reads E2B_API_KEY from the environment (loaded from .env.local if present).
 * After building, point Convex at it:
 *   npx convex env set E2B_TEMPLATE_ID <name>
 */
const NAMES = {
  dev: "code-interpreter-v1-plus-geo-dev",
  prod: "code-interpreter-v1-plus-geo",
} as const

async function main() {
  const target = process.argv[2]
  if (target !== "dev" && target !== "prod") {
    throw new Error('Usage: tsx e2b-template/build.ts <dev|prod>')
  }

  try {
    process.loadEnvFile(".env.local")
  } catch {
    // Fall back to variables already in the environment.
  }
  if (!process.env.E2B_API_KEY) {
    throw new Error("E2B_API_KEY is not set (expected in .env.local or the environment).")
  }

  const name = NAMES[target]
  const info = await Template.build(template, name, {
    cpuCount: 2,
    memoryMB: 2048,
    onBuildLogs: defaultBuildLogger(),
  })
  console.log(`\nBuilt template "${info.name}" (templateId: ${info.templateId}, buildId: ${info.buildId})`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
