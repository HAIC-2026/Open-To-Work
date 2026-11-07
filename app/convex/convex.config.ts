import { defineApp } from "convex/server";
import { v } from "convex/values";
import agent from "@convex-dev/agent/convex.config";
import e2b from "@e2b/convex/convex.config.js";

const app = defineApp({
  env: {
    E2B_API_KEY: v.string(),
  },
});

app.use(agent);
app.use(e2b, { env: { E2B_API_KEY: app.env.E2B_API_KEY } });

export default app;
