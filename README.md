# myagentmail-outreach-starter

> Open-source AI lead agent for LinkedIn intent monitoring and cold-email outreach. Built on [MyAgentMail](https://myagentmail.com).

```
   ┌──────────────┐    ┌──────────────────────┐    ┌──────────────────┐
   │   Website    │───▶│   AI infers ICP +    │───▶│  Auto-creates    │
   │     URL      │    │   intent signals     │    │  signals on MAM  │
   └──────────────┘    └──────────────────────┘    └────────┬─────────┘
                                                            │
                                                            ▼
   ┌──────────────────┐    ┌────────────────────┐   ┌───────────────────┐
   │  /leads queue    │◀───│  Webhook fires     │◀──│  MAM polls daily  │
   │  AI drafts copy  │    │  per match         │   │  classifies leads │
   └────────┬─────────┘    └────────────────────┘   └───────────────────┘
            │
            ▼
   ┌──────────────────────────────────────┐
   │  One click: send LinkedIn / email    │
   └──────────────────────────────────────┘
```

## What you get when you're done

A working AI lead agent that:

- ✅ **Reads your website** and AI-infers your ICP (job titles, industries, company size, exclusion list, suggested keywords, suggested competitor pages, suggested influencer profiles)
- ✅ **Auto-creates** keyword signals + engagement signals + a job-change watchlist on MyAgentMail
- ✅ **Surfaces leads** to a unified `/leads` queue as the agent fires (one row per matched person, regardless of which signal kind triggered it)
- ✅ **Drafts a personalized LinkedIn note** and a **cold email** for each lead, on demand, using the agent's voice config (pain points + tone + campaign goal)
- ✅ **Sends with one click** — LinkedIn connection request via your real account, cold email via your provisioned MyAgentMail inbox
- ✅ Survives in the same shape as v0.1 of the starter: ~3,500 lines of TypeScript you can fork

## Setup — 10 minutes

| # | Step | Where |
|---|------|-------|
| 1 | Sign up at MyAgentMail | https://myagentmail.com |
| 2 | Subscribe to the LinkedIn add-on | Dashboard → Billing |
| 3 | Grab your master API key | Dashboard → API Keys |
| 4 | Get an OpenAI key | platform.openai.com |
| 5 | Clone + `npm install` | this repo |
| 6 | Configure `.env` | (see below) |
| 7 | `npm run dev` and visit `localhost:3000/onboarding` | the wizard takes over |

`.env`:

```bash
MYAGENTMAIL_API_KEY=tk_...
OPENAI_API_KEY=sk-...
# Optional: explicit webhook URL. If unset and you're behind ngrok / cloudflared,
# the agent will use the inbound request's origin for /api/webhook.
MYAGENTMAIL_WEBHOOK_URL=https://your-ngrok.io/api/webhook
# Optional: set this AFTER first signal creation to verify webhook signatures
MYAGENTMAIL_WEBHOOK_SECRET=whsec_...
# Optional: tweak the model
OPENAI_MODEL=gpt-4.1-mini-2025-04-14
```

## The flow

### 1. Onboarding (`/onboarding`)

Six-step wizard:

1. **Website URL** — paste your company site, AI reads it and infers everything.
2. **Connect LinkedIn** — drop in the `LinkedInConnect` widget (cookies AES-256-GCM encrypted at rest by MyAgentMail; never logged).
3. **Ideal Customer** — review/edit AI-inferred ICP: job titles, industries, locations, company sizes, types, exclusion list.
4. **Detect** — review/edit AI-suggested keywords + competitor company pages + influencer profiles + a job-change watchlist (paste profile URLs you want to monitor for role changes).
5. **Objectives** — pain points, campaign goal (start conversations / book demo), message tone (professional / conversational / direct), precision (high / discovery).
6. **Launch** — one click creates the actual signals on MyAgentMail and kicks the first poll. Land on `/leads` with results streaming in.

### 2. Leads queue (`/leads`)

One row per matched person. Each row has independent LinkedIn outreach state and email outreach state. The trigger context (post excerpt, verbatim engager comment, or job-change diff) is shown inline with the lead. Two CTAs:

- **Draft LinkedIn** — calls `/api/leads/[id]/draft?channel=linkedin`. Generates a 280-char personalized note via the agent's voice config + the trigger context. Editable inline; click **Send** to fire a connection request from your real LinkedIn account.
- **Draft email** — calls `/api/leads/[id]/draft?channel=email`. Generates subject + body. Editable inline; click **Send** to dispatch via your provisioned MyAgentMail inbox.

The queue auto-refreshes every 5 seconds, so a freshly launched agent shows leads as they arrive.

## Architecture

| Layer | What |
|---|---|
| `src/app/onboarding/page.tsx` | Six-step wizard. Single file, ~600 lines. |
| `src/app/leads/page.tsx` | Unified leads queue with inline drafters + senders. |
| `src/app/page.tsx` | Overview / setup-status home page. |
| `src/app/accounts/`, `src/app/inboxes/` | LinkedIn account manager + inbox provisioning. |
| `src/app/api/agent/infer/` | POSTs the user's website URL → calls the LLM → returns inferred ICP. |
| `src/app/api/agent/config/` | GET/POST the singleton `agent_config` row. |
| `src/app/api/agent/launch/` | Reads agent_config, creates one signal per detection source on MyAgentMail, kicks first polls. |
| `src/app/api/leads/[id]/draft/` | Generates LinkedIn or email draft on demand. |
| `src/app/api/leads/[id]/send/` | Fires the saved draft via MAM (LinkedIn connection or inbox send). |
| `src/app/api/webhook/route.ts` | Receives signal.match / signal.engagement / signal.job_change webhooks. HMAC-verifies, upserts into `new_leads`. |
| `src/lib/agent.ts` | All LLM prompts: ICP inference, firing-rule generator, LinkedIn drafter, cold-email drafter. |
| `src/lib/db.ts` | SQLite schema: `agent_config` (singleton config) + `new_leads` (unified queue). |
| `src/lib/myagentmail.ts` | Thin SDK helpers over `/v1/inboxes`, `/v1/linkedin/*`, `/v1/linkedin/signals`. Now includes `createEngagementSignal`, `createWatchlistSignal`, `sendLinkedInConnect`. |

## What's deliberately NOT in v1

- **Reply-thread handling** — replies land in your provisioned inbox; we don't surface them in `/leads` yet.
- **Multi-step sequencing** — *"Day 0: connect, Day 3: email, Day 7: follow-up"*. Email enrichment is wired (RocketReach by default; provider-agnostic — see `src/lib/enrichment.ts`) but the sequencer / cadence / reply-detection layer is v2.
- **Multi-tenant** — single agent config (singleton row at `id=1`). Forking for multi-tenant is a half-day's work.

## Customizing

- **Different LLM**: swap the default `gpt-4.1-mini-2025-04-14` via `OPENAI_MODEL=gpt-4.1` (or `gpt-5`, etc.). Or replace the `@ai-sdk/openai` import in `lib/agent.ts` with `@ai-sdk/anthropic` etc — Vercel AI SDK keeps the call signature identical.
- **Different voice**: edit the system prompts in `lib/agent.ts`. Specifically `draftLinkedInMessage` and `draftColdEmail`.
- **Different ICP fields**: extend `IcpInference` schema in `lib/agent.ts` and the matching `agent_config` columns in `lib/db.ts`.
- **More signal kinds**: each "track keywords / track companies / track profiles / watchlist" surface in onboarding maps to one signal-creation call in `/api/agent/launch`. Add a fifth list, add a fifth call.

## See also

- [MyAgentMail LinkedIn skill reference](https://myagentmail.com/skills/myagentmail/references/linkedin.md) — full schemas for all three signal kinds + webhook payload shapes.
- [Building an Intent-Based Outreach System](https://myagentmail.com/blog/intent-based-outreach-tutorial) — long-form tutorial that walks through this same starter.
- [`myagentmail` SDK on npm](https://www.npmjs.com/package/myagentmail).
- [`myagentmail-mcp` for Claude / Cursor / Windsurf](https://www.npmjs.com/package/myagentmail-mcp).
