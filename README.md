# Mohala

**District research for Hawaiʻi legislators.** Mohala is a research workspace for members of the Hawaiʻi State Legislature and their staff. You ask a question about your district in plain language, and Pua, the research assistant, finds the public data, runs the numbers and writes a cited answer. It works with maps, tables and margins of error, and every figure links back to its source.

Built for HAIC 2026.

---

## What it does

### Two ways to start a conversation (`/new`)

- **Research** answers questions about one district, for example poverty rates, housing costs, population or state programs. Preset prompts cover common requests such as a full **District Profile**, which compares the district with its county and the state.
- **Collaborate** looks for legislators whose districts share an issue with yours. It explains the overlap and can suggest a **project invite**: one click creates a shared project, invites those legislators and moves the conversation into it.

### Answers you can check

- **Inline citations.** `[n]` markers in the text point to numbered sources, and a "Used N sources" list shows everything the assistant looked at.
- **Margins of error.** Census figures carry their margins of error, and comparisons between areas say whether a difference is statistically significant.
- **District maps.** Answers can include interactive Leaflet maps of House and Senate districts.
- **Agent trace.** You can open each tool call the assistant made, including searches, Census queries and the Python code it ran.

### Data sources the assistant can use

| Tool | What it reaches |
| --- | --- |
| `search_datasets`, `get_dataset_details`, `explore_data_sources` | The Datatrove public catalog of State of Hawaiʻi and county datasets (DBEDT, Honolulu DPP, UHERO, DOH, DLIR, and more) |
| `get_census_table` | U.S. Census Bureau ACS tables by district, county and state |
| `get_state_tax_collections` | Census Annual Survey of State Government Tax Collections (statewide) |
| `search_programs` | A curated inventory of state assistance programs, with eligibility limits summarized from the agencies' official pages |
| `execute_python` | A Python sandbox on E2B with pandas, geopandas, shapely and PDF readers, for calculations, spatial overlays and reading agency PDFs |
| `cite_sources` | Records the sources behind the final answer |

### Working with colleagues

- **Projects** are shared folders of conversations, with a member list you can change at any time.
- **Workspace discussion** is a group chat for each project. You can **@mention a conversation** to link it, and **pin** important messages to a side panel.
- **Pinned conversations** stay at the top of the sidebar and project lists.

### Quality of life

- **Automatic titles.** A background job names each conversation with a short title once the first question is asked.
- **Follow-up suggestions.** After each answer, the app suggests three next questions you can send with one click.
- **Regenerate.** Reruns the latest answer and cleans up the old one.
- **Download PDF.** Exports an answer as a print-ready report, with the question, answer, maps and the full source list.
- **Light and dark themes.**

> **Demo note:** there is no sign-in. The account menu at the bottom of the sidebar has **Switch Account**, which lists all 76 legislators (51 House, 25 Senate), so you can act as any of them. Do not deploy this publicly with real data until authentication has been added.

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | [Next.js 16](https://nextjs.org) (App Router), React 19, Tailwind CSS v4, [shadcn/ui](https://ui.shadcn.com) on Base UI |
| Backend | [Convex](https://convex.dev): database, server functions, scheduler, crons, and triggers through `convex-helpers` |
| AI agent | [`@convex-dev/agent`](https://www.convex.dev/components/agent) with the [AI SDK](https://ai-sdk.dev) and Google Gemini |
| Code sandbox | [E2B](https://e2b.dev) through `@e2b/convex`, using a custom template with geospatial and PDF libraries |
| Maps | Leaflet / react-leaflet |
| Hosting | Vercel (frontend) and Convex Cloud (backend) |

---

## Repository layout

```
.
├── README.md                 ← you are here
├── LICENSE
└── app/                      ← the Next.js + Convex application
    ├── app/                  ← routes
    │   ├── new/              ← start page (Research / Collaborate tabs)
    │   ├── conversations/[id]/   ← a conversation
    │   ├── workspaces/[id]/      ← a project (conversations + members)
    │   │   └── discussion/       ← the project's group discussion
    │   └── report/[key]/         ← printable PDF report
    ├── components/           ← app components (components/ui is shadcn, do not edit)
    ├── convex/               ← backend
    │   ├── schema.ts         ← database tables
    │   ├── chatActions.ts    ← the assistant: instructions, tools, streaming
    │   ├── census.ts, datatrove.ts, programs.ts, e2bTools.ts  ← agent tools
    │   ├── functions.ts      ← triggers (auto titles, follow-up suggestions)
    │   ├── titles.ts, suggestions.ts  ← background LLM jobs
    │   ├── workspaces.ts     ← projects, discussion, pins, members
    │   ├── programSources.ts, programRefresh.ts, crons.ts  ← program inventory
    │   └── seed.ts           ← reset and seed the database
    ├── e2b-template/         ← sandbox image definition and build script
    ├── lib/                  ← shared client helpers
    └── .env.example          ← every environment variable, documented
```

---

## Getting started

### Prerequisites

- **Node.js 20.9 or newer** (required by Next.js 16) and npm
- Accounts and API keys for:
  - **Convex** (free tier is fine): <https://dashboard.convex.dev>
  - **Google Gemini API key**: <https://aistudio.google.com/apikey>
  - **U.S. Census API key** (free): <https://api.census.gov/data/key_signup.html>
  - **E2B API key**: <https://e2b.dev/dashboard>

Datatrove does not need a key.

### 1. Install dependencies

Everything runs from the `app/` folder.

```bash
cd app
```

```bash
npm install
```

### 2. Create your local env file

```bash
cp .env.example .env.local
```

Put your **E2B API key** in `.env.local` now, because the sandbox build in step 5 reads it from there. The Convex lines get filled in automatically in the next step.

### 3. Create a Convex dev deployment

```bash
npx convex dev
```

Log in and create a new project when prompted. Convex writes `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CONVEX_SITE_URL` into `.env.local`.

The first code push may stop with an error about a missing `E2B_API_KEY`. That is expected: the E2B component requires the key on the Convex deployment. Stop the command (Ctrl+C) and continue with step 4.

### 4. Give the Convex deployment its keys

Convex functions run on Convex's servers, so they read **the deployment's environment, not `.env.local`**. Set each variable there. If you leave out the value, the CLI asks for it, which keeps keys out of your shell history:

```bash
npx convex env set GEMINI_API_KEY
```

```bash
npx convex env set GEMINI_MODEL gemini-flash-lite-latest
```

```bash
npx convex env set DATATROVE_API_URL https://api.datatrove.ai
```

```bash
npx convex env set CENSUS_API_KEY
```

```bash
npx convex env set E2B_API_KEY
```

```bash
npx convex env set E2B_TEMPLATE_ID code-interpreter-v1-plus-geo-dev
```

You can review them in the Convex dashboard under **Settings → Environment Variables**, or with `npx convex env list`.

### 5. Build the Python sandbox template

The assistant's `execute_python` tool runs in a custom E2B image. It is based on E2B's Code Interpreter and adds geopandas, shapely, pyproj, pyogrio, pypdf and pdfplumber.

```bash
npm run template:build:dev
```

This builds `code-interpreter-v1-plus-geo-dev`, the name you set as `E2B_TEMPLATE_ID` above. It takes a few minutes the first time.

### 6. Start the backend

```bash
npx convex dev
```

Leave this running. It pushes the backend and redeploys on every change in `convex/`.

### 7. Seed the database

In a second terminal, also in `app/`:

```bash
npx convex run seed:seed
```

This **wipes app data** (conversations, projects, agent threads and running sandboxes) and seeds:

- all 76 legislators;
- starter projects and sample conversations for **House District 1**, the demo account (every other legislator starts empty);
- a forced refresh of the state program inventory, which runs in the background for a few minutes and calls Gemini.

You can run it again any time to reset to a clean demo.

### 8. Start the app

```bash
npm run dev
```

Open <http://localhost:3000>. The app opens on `/new`. Pick a legislator in the sidebar and ask a question.

---

## Environment variables

[`app/.env.example`](app/.env.example) lists them all. **Where** a variable is set matters:

| Variable | `.env.local` | Convex deployment | Purpose |
| --- | :---: | :---: | --- |
| `CONVEX_DEPLOYMENT` | ✓ |  | Which dev deployment the CLI targets (written by `npx convex dev`) |
| `NEXT_PUBLIC_CONVEX_URL` | ✓ |  | Convex URL the browser connects to |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | ✓ |  | Convex HTTP actions URL (written by `npx convex dev`) |
| `GEMINI_API_KEY` |  | ✓ | Google Gemini key for answers, titles and suggestions |
| `GEMINI_MODEL` |  | ✓ | Gemini model id (`gemini-flash-lite-latest`) |
| `DATATROVE_API_URL` |  | ✓ | Datatrove API base URL (`https://api.datatrove.ai`) |
| `CENSUS_API_KEY` |  | ✓ | Census Data API key. Without it, the Census tools return an error |
| `E2B_API_KEY` | ✓ | ✓ | E2B key: on Convex for the sandbox, in `.env.local` for template builds |
| `E2B_TEMPLATE_ID` |  | ✓ | Sandbox template name (`-dev` suffix for development) |
| `CONVEX_DEPLOY_KEY` |  |  | Production only: set in Vercel so its build can deploy Convex |

`.env.local` and other `.env*` files are git-ignored. Only `.env.example` is committed.

---

## Useful commands

Run these from `app/`:

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server on port 3000 |
| `npx convex dev` | Push the backend and watch for changes |
| `npm run build` / `npm start` | Production build and serve |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check (`tsc --noEmit`) |
| `npm run format` | Prettier on all `.ts` / `.tsx` files |
| `npx convex run seed:seed` | Reset and seed the database |
| `npx convex run programRefresh:refresh` | Refresh the program inventory now (it also runs yearly on Jan 15) |
| `npm run template:build:dev` / `:prod` | Build the E2B sandbox template |

---

## Deploying

Production runs the frontend on **Vercel** and the backend on a **Convex production deployment**.

1. **Set up Convex production.** In the Convex dashboard, open your project's production deployment and set the same environment variables as in step 4. Use `E2B_TEMPLATE_ID=code-interpreter-v1-plus-geo` for production. From the CLI, add `--prod`:

   ```bash
   npx convex env set GEMINI_API_KEY --prod
   ```

2. **Build the production sandbox template:**

   ```bash
   npm run template:build:prod
   ```

3. **Create a deploy key.** In the Convex dashboard, open the production deployment's **Deployment Settings → General**, click **Generate Production Deploy Key**, and copy it.

4. **Set up the Vercel project:**
   - **Root Directory:** `app`
   - **Environment variables:** `CONVEX_DEPLOY_KEY` (from step 3, Production environment) and `NEXT_PUBLIC_CONVEX_URL` (your production `https://….convex.cloud` URL)
   - **Build command:**

     ```
     convex codegen && npx convex deploy && npx convex run migrations:runBackfill && npm run build
     ```

     This pushes the backend to production, runs any pending data backfill, and then builds Next.js. Because `npm run build` runs as its own step rather than through `npx convex deploy --cmd`, the Convex CLI does not pass the URL to the build, which is why `NEXT_PUBLIC_CONVEX_URL` has to be set in Vercel.

5. **Seed production once** (this deletes production app data):

   ```bash
   npx convex run seed:seed --prod
   ```

If a deploy fails with a **schema validation** error, existing production documents no longer match `convex/schema.ts`. Either migrate those documents, or (for a demo) clear the affected table, then redeploy.

---

## License

[MIT](LICENSE) © 2026 HAIC-2026
