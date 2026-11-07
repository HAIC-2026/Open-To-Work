import { createTool, type ToolCtx } from "@convex-dev/agent";
import { z } from "zod";
import { E2B } from "@e2b/convex";
import { components } from "./_generated/api";

export const sandboxes = new E2B(components.e2b, {
  template: process.env.E2B_TEMPLATE_ID!,
  timeoutMs: 120_000, // 2-minute strict idle auto-kill to prevent orphaned sandboxes
});

async function runScriptInSandbox(
  ctx: ToolCtx,
  identity: { scope: string; key: string },
  code: string
) {
  // Get or create the sandbox for this thread
  const { sandboxId } = await sandboxes.getOrCreate(ctx, identity);

  const b64 = Buffer.from(code, "utf8").toString("base64");
  // Execute clean script (pandas, numpy, requests, scipy are pre-installed in code-interpreter-v1)
  const command = `echo "${b64}" | base64 -d > /tmp/script.py && python3 /tmp/script.py`;

  // Execute with a 35s execution cap to prevent infinite loops
  const result = await sandboxes.runCommand(ctx, {
    ...identity,
    sandboxId,
    command,
    timeoutMs: 35_000,
  });

  return {
    exitCode: result.exitCode,
    stdout: result.stdout || "(no output)",
    stderr: result.stderr || null,
    success: result.exitCode === 0,
  };
}

/**
 * E2B Python Sandbox Execution Tool
 * Executes Python code inside an isolated cloud sandbox with outbound internet access.
 * Pre-loaded with pandas, numpy, scipy, matplotlib, requests, and data analysis packages.
 * Scoped by threadId with auto-purge on failure and a 2-minute auto-destruction timeout.
 */
export const executePython = createTool({
  description:
    "Execute Python code in an isolated E2B Linux sandbox environment. " +
    "Pre-installed data science packages include: pandas, numpy, scipy, scikit-learn, requests, openpyxl, xlrd, beautifulsoup4, lxml, matplotlib, seaborn, plotly, sympy, and pydantic. " +
    "Has outbound internet access to download datasets directly from Hawaii open data and Census URLs using requests.get(url). " +
    "You cannot do any pip install in the sandbox environment.",
  inputSchema: z.object({
    code: z
      .string()
      .describe(
        "CRITICAL: Variables from previous tool calls (such as res, df, data, url) do NOT exist in memory. " +
        "Each script runs in a fresh process. You must download/load and analyze within the SAME script (or load from a file saved to /tmp). " +
        "You cannot do any pip install in the sandbox environment. Pre-installed libraries (pandas, numpy, scipy, scikit-learn, requests, openpyxl, xlrd, etc.) are available to import directly. Print all results using print()."
      ),
  }),
  execute: async (ctx: ToolCtx, args) => {
    const identity = { scope: "hawaii", key: ctx.threadId || "default" };

    try {
      return await runScriptInSandbox(ctx, identity, args.code);
    } catch (firstErr: any) {
      console.warn(
        "E2B execution failed on first attempt; auto-purging sandbox and retrying:",
        firstErr?.message || firstErr
      );

      // Auto-purge the broken container from the session
      try {
        await sandboxes.kill(ctx, identity);
      } catch (killErr) {
        console.warn("Notice: kill on broken sandbox failed:", killErr);
      }

      // Retry once with a clean sandbox
      try {
        return await runScriptInSandbox(ctx, identity, args.code);
      } catch (secondErr: any) {
        // Direct error out - no graceful fallback
        const errorDetail = secondErr?.message || String(secondErr);
        return {
          exitCode: 1,
          stdout: "",
          stderr: `Failed to execute in E2B sandbox after retry: ${errorDetail}`,
          success: false,
        };
      }
    }
  },
});
