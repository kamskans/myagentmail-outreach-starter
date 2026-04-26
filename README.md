# MyAgentMail Outreach Starter

> Open-source contextual LinkedIn signal monitoring + email outreach, built on [MyAgentMail](https://myagentmail.com).
>
> Watch LinkedIn for keywords your prospects post about, then have an agent draft a personalized connection request or cold email — sent via your own MyAgentMail inboxes and your own LinkedIn account. Multi-account capable. Approval queue by default. No vendor lock-in.

```
   ┌────────────────┐    ┌────────────────┐    ┌────────────────┐
   │ Intent signals │───▶│   AI agent     │───▶│ Approval queue │
   │ (LinkedIn      │    │ (filter +      │    │ (you click     │
   │  keywords)     │    │  draft)        │    │  Approve)      │
   └────────────────┘    └────────────────┘    └────────────────┘
                                                       │
                                                       ▼
                                              ┌────────────────┐
                                              │ MyAgentMail    │
                                              │ • LinkedIn API │
                                              │ • Email send   │
                                              └────────────────┘
```

## What it does

1. **Multi-account LinkedIn**: connect one or more LinkedIn accounts (login flow handles 2FA, or import `li_at` / `JSESSIONID` cookies). Each signal can pin to a specific account.
2. **Intent signals**: define keywords like `"outbound is broken"` or `"hiring SDR"`. The poller runs on a cron, searches LinkedIn for matching posts, and dedupes against ones it's already seen.
3. **Agent classification**: an LLM filters each new match — generic content, recruiter spam, and off-topic posts get dropped automatically.
4. **Personalized draft**: for high-intent matches, the agent writes a 280-char connection note (or DM, or cold email) tied to the specific post.
5. **Approval queue**: drafts land in a queue. You click Approve (or edit the message first). Switch to autonomous mode with `APPROVAL_MODE=auto` if you trust your prompts.
6. **Sent via your stack**: connection requests go through MyAgentMail's LinkedIn module; emails go through your own MyAgentMail inbox.

This is a starter, not a SaaS. Clone it, plug in your keys, run it locally or deploy to Vercel.

## Prerequisites

| Service | Why | Cost |
|---|---|---|
| **MyAgentMail** account ([sign up](https://myagentmail.com)) | Provides the email API + LinkedIn module | Free trial; from $5/mo |
| **OpenAI** API key | Agent classification + drafting | ~$0.02 per 100 signals on `gpt-4o-mini` |
| **RocketReach** API key (optional) | Lead enrichment | Their pricing |

## Quick start

```bash
git clone https://github.com/kamskans/myagentmail-outreach-starter
cd myagentmail-outreach-starter
cp .env.example .env
# fill in MYAGENTMAIL_API_KEY, OPENAI_API_KEY, CRON_SECRET
npm install
npm run dev
# open http://localhost:3000
```

Walk through `/setup` — it's a 5-step checklist:

1. **Set env vars** (you just did)
2. **Create a default inbox** — one click, provisions `scout@myagentmail.com` (or whatever `MYAGENTMAIL_DEFAULT_INBOX` you set)
3. **Connect a LinkedIn account** at `/accounts` — login or cookie import
4. **Create your first signal** at `/signals` — pick a keyword, action type, and account
5. **Schedule the cron** — Vercel Cron, GitHub Actions, or just hit Run Now from the dashboard

## Architecture

| Layer | What |
|---|---|
| `src/app/page.tsx` | Dashboard (status checklist + counters) |
| `src/app/setup/` | 5-step setup wizard |
| `src/app/accounts/` | LinkedIn account manager (multi-account) |
| `src/app/signals/` | Define and run keyword watchers |
| `src/app/queue/` | Approve/reject/edit draft messages |
| `src/app/leads/` | Manual lead list + RocketReach enrichment |
| `src/app/inboxes/` | View provisioned MyAgentMail inboxes |
| `src/app/api/cron/route.ts` | Cron entry point. Auth via `Bearer ${CRON_SECRET}`. |
| `src/lib/signal-runner.ts` | The poll loop. For each signal: fetch posts → dedupe → classify → draft → queue. |
| `src/lib/action-runner.ts` | Dispatches approved actions. |
| `src/lib/myagentmail.ts` | Thin client over `/v1/inboxes`, `/v1/linkedin/*`. |
| `src/lib/agent.ts` | Vercel AI SDK + OpenAI for classify + draft. |
| `src/lib/db.ts` | SQLite (`better-sqlite3`) — local file at `data/outreach.db`. |

## Deploying

### Vercel (recommended)

Add `vercel.json`:

```json
{
  "crons": [{ "path": "/api/cron", "schedule": "*/15 * * * *" }]
}
```

Set the same env vars in the Vercel project settings. **Important:** SQLite won't persist on serverless. For Vercel deployment, swap to a hosted DB:

```ts
// src/lib/db.ts — swap to libsql / Postgres / Supabase
```

Or run on a VPS where the disk persists.

### Self-hosted (any VPS)

```bash
npm run build && npm run start
# port 3000

# crontab -e
*/15 * * * * curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron
```

### Docker

A minimal Dockerfile is on the roadmap — PRs welcome.

## Configuration

All config goes through env vars. See [`.env.example`](.env.example) for the full list. Key ones:

- `MYAGENTMAIL_API_KEY` — your tenant master key from [/dashboard](https://myagentmail.com/dashboard).
- `MYAGENTMAIL_DEFAULT_INBOX=scout` — the first-time inbox username.
- `OPENAI_MODEL=gpt-4o-mini` — swap to a more capable model if you want.
- `APPROVAL_MODE=manual` (default) | `auto` — autonomous mode skips the queue.
- `CRON_SECRET=…` — protects `/api/cron` from being called by anyone.
- `DATABASE_PATH=./data/outreach.db` — local SQLite path.

## Safety

LinkedIn flags accounts that send too many connection requests, too fast. The defaults here are conservative:

- **Manual approval mode** — nothing sends until you click Approve.
- **Per-session daily limits** are enforced server-side by MyAgentMail's LinkedIn module (your subscription tier sets the cap).
- The classifier prompt is tuned to skip generic posts and only engage with high-intent signals.

You're still responsible for what gets sent. LinkedIn-side actions (account warnings, restrictions, bans) are between you and LinkedIn — see MyAgentMail's [LinkedIn module ToS](https://myagentmail.com/terms-linkedin).

## Why this exists

Goji-style "contextual outreach" tools (watch LinkedIn for buying-intent signals, send a DM as the right moment) are valuable but expensive and locked into a single platform. This shows you can build the same workflow on top of MyAgentMail's primitives — and own every layer of the stack.

Fork it. Customize the prompts. Add your own signals. Add Twitter/X. Add HackerNews. The agent loop is ~150 lines.

## License

MIT — do whatever you want.
