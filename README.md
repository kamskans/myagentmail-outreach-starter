# MyAgentMail Outreach Starter

> Open-source contextual LinkedIn signal monitoring + email outreach, built on [MyAgentMail](https://myagentmail.com).
>
> Define keywords your prospects post about. MyAgentMail watches LinkedIn for you, classifies each new match with an LLM, and webhooks high-intent posts to this app. The local agent drafts a personalized connection request, you click Approve, the message sends through your own MyAgentMail account.

```
   ┌──────────────────┐         ┌──────────────────────┐
   │ Define keyword   │ ──────▶ │ MyAgentMail polls    │
   │ at /managed-     │         │ LinkedIn server-side │
   │ signals          │         │ + classifies w/ LLM  │
   └──────────────────┘         └──────────┬───────────┘
                                           │ webhook (HMAC-signed)
                                           ▼
   ┌──────────────────┐         ┌──────────────────────┐
   │ Approval queue   │ ◀────── │ Local agent drafts   │
   │ (you click       │         │ a personal note from │
   │  Approve)        │         │ the post excerpt     │
   └────────┬─────────┘         └──────────────────────┘
            │
            ▼
   ┌──────────────────┐
   │ Send via your    │
   │ MyAgentMail      │
   │ account          │
   └──────────────────┘
```

Polling, deduping, intent classification — all server-side on MyAgentMail. **You don't run cron. You don't pay an LLM bill for filtering. You don't manage LinkedIn rate limits.** You only handle the high-intent matches that actually deserve a personal note.

---

## What you'll have when you're done

Running locally on `http://localhost:3000`, you'll be able to:

- ✅ Search LinkedIn for keywords you care about (e.g. *"outbound is broken"*, *"hiring SDR"*)
- ✅ Get only **high-intent** matches in your queue — generic posts, recruiter spam, and content marketers are filtered out automatically
- ✅ See a personalized connection note pre-drafted for each match
- ✅ Approve / edit / reject before anything sends
- ✅ Send via your own MyAgentMail-connected LinkedIn account
- ✅ Add a second LinkedIn account, a second signal, swap out the prompts — all in your fork

This whole repo is **~3,000 lines of TypeScript**. Read it. Fork it. Customize the prompts. Add Twitter or HackerNews as additional signal sources.

---

## Setup — 10 minutes, three accounts

| # | Step | Where | Cost |
|---|---|---|---|
| 1 | **Sign up to MyAgentMail** | https://myagentmail.com/signup | 7-day free trial, no card |
| 2 | **Subscribe to the LinkedIn add-on** | Dashboard → Billing | $29/mo (Solo) — required for signals |
| 3 | **Get an OpenAI API key** | https://platform.openai.com/api-keys | ~$0.01–0.05/day on `gpt-4o-mini` |
| 4 | **Clone + configure this repo** | (commands below) | Free |
| 5 | **Connect a LinkedIn account** | The starter app at `localhost:3000` | Free |
| 6 | **Create your first signal** | Same app | Free |

The classification LLM call happens on MyAgentMail's servers (we use OpenRouter + Gemini Flash Lite — covered by your subscription). The OpenAI key here is only for **drafting** the personalized connection note locally.

### Step 1 — Sign up to MyAgentMail

Go to https://myagentmail.com/signup. 7-day free trial, no credit card required. After verifying your email you'll land at https://myagentmail.com/dashboard.

### Step 2 — Subscribe to the LinkedIn add-on

The intent-signal feature is part of MyAgentMail's LinkedIn add-on. Without it, the `/v1/linkedin/*` endpoints return `402 LINKEDIN_NOT_SUBSCRIBED`.

In the dashboard: **Billing → LinkedIn Outreach Add-on → Subscribe** (`$29/mo Solo` for one connected LinkedIn account is plenty for testing).

What each tier gets you ([full pricing](https://myagentmail.com/linkedin#pricing)):

| Tier | Connected accounts | Actions/day per account | Signals |
|---|---|---|---|
| Solo — $29/mo | 1 | 100 | 3 |
| Team — $99/mo | 5 | 500 | 25 |
| Agency — $299/mo | 25 | 2,000 | 100 |

One **action** = one LinkedIn API call (a connection request, profile lookup, post search, or signal poll). Quota is enforced per LinkedIn account in a 24h sliding window — matching LinkedIn's own per-account rate limits.

### Step 3 — Grab your MyAgentMail API key

Dashboard → **API Keys**. Copy the `tk_…` master key. (You only need one — the same key authorizes inbox sends, LinkedIn endpoints, and signal management.)

While you're there, bookmark:
- **API reference** → https://myagentmail.com/docs (live OpenAPI spec)
- **Knowledge base** → https://myagentmail.com/kb (concepts, deliverability guides, recipes)
- **Blog** → https://myagentmail.com/blog (deeper context)

### Step 4 — Get an OpenAI key

[Create one](https://platform.openai.com/api-keys) if you don't have one. The starter uses `gpt-4o-mini` by default for drafting connection notes — at typical signal volume you'll spend pennies a day. Override the model with `OPENAI_MODEL=gpt-4o` if you want longer/better drafts.

### Step 5 — Clone and configure

```bash
git clone https://github.com/kamskans/myagentmail-outreach-starter
cd myagentmail-outreach-starter
cp .env.example .env
```

Open `.env` and fill in:

```bash
MYAGENTMAIL_API_KEY=tk_...    # from step 3
OPENAI_API_KEY=sk-proj-...    # from step 4
CRON_SECRET=$(openssl rand -hex 32)   # any random string

# Leave blank for now; you'll get this in step 7 when you create the signal
MYAGENTMAIL_WEBHOOK_SECRET=
```

Install + run:

```bash
npm install
npm run dev
# → http://localhost:3000
```

Open http://localhost:3000. You'll see the setup checklist on the homepage — most boxes should already be ticked.

### Step 6 — Connect a LinkedIn account

In the starter app: **LinkedIn accounts → Connect account**.

Two ways:
- **Email + password** — handles LinkedIn's PIN / mobile-app verification flow.
- **Import cookies** — if you'd rather paste an `li_at` and `JSESSIONID` from your existing browser session.

Either way, the credentials are sent to MyAgentMail and AES-256-GCM encrypted at rest. You can revoke any account from the same screen — the cookies are wiped.

> ⚠️ **Use a real LinkedIn account that has activity history.** Brand-new or empty accounts are flagged faster. The default polling cadence is conservative (daily) for exactly this reason.

### Step 7 — Create your first signal

In the starter app: **Intent signals → New signal**. Fill in:

- **Name** → e.g. *"Founders complaining about cold email"*
- **LinkedIn search keyword** → e.g. *"outbound is broken"* (the exact phrase MyAgentMail will search for in posts from the last 24h on each poll)
- **Connected LinkedIn account** → the one you just connected
- **Cadence** → start with **Daily** (recommended for a real account)
- **Webhook URL** → `http://localhost:3000/api/webhook` (already prefilled to your local app)
- **Filter — minimum intent** → **Medium and above** (recommended)

When you click **Create signal**, MyAgentMail returns a **webhook secret** (`whsec_…`) — copy it, paste it into your `.env`:

```bash
MYAGENTMAIL_WEBHOOK_SECRET=whsec_paste_it_here
```

Restart `npm run dev` so the new env loads. Now incoming webhooks will be HMAC-verified before the queue accepts them.

### Step 8 — Test it end-to-end

Two options:

**A. Use the "Run now" button** on the signal row to trigger an immediate poll. Within a minute the matches show up in **Approval queue**. (Note: you can also expose your local app to MyAgentMail's webhooks via [ngrok](https://ngrok.com) or [cloudflared](https://github.com/cloudflare/cloudflared) — set `MYAGENTMAIL_WEBHOOK_URL=https://<your-ngrok>.ngrok.io/api/webhook` when creating the signal so it reaches your laptop.)

**B. Use the test-webhook endpoint** to fire a synthetic match without polling LinkedIn:

```bash
curl -X POST https://myagentmail.com/v1/linkedin/signals/<signal-id>/test-webhook \
  -H "X-API-Key: $MYAGENTMAIL_API_KEY"
```

Either way, the queue at `localhost:3000/queue` will show:
- The author + LinkedIn post excerpt
- The agent's intent score and reason
- A pre-drafted connection note (editable)
- **Approve** / **Reject** buttons

Click **Approve** on a high-intent match. The starter calls MyAgentMail's `/v1/linkedin/connections` and the request goes out via your connected account.

That's the loop. Add more signals, tune the prompts in `src/lib/agent.ts`, swap the queue UI — the whole thing is 3K lines.

---

## Architecture

| Layer | What |
|---|---|
| `src/app/page.tsx` | Dashboard (setup status + counters) |
| `src/app/managed-signals/` | UI over MyAgentMail's signal API |
| `src/app/accounts/` | LinkedIn account manager |
| `src/app/queue/` | Review/approve drafts |
| `src/app/leads/` | Manual lead list + optional RocketReach enrichment |
| `src/app/inboxes/` | View provisioned MyAgentMail inboxes |
| `src/app/api/webhook/route.ts` | Receives `signal.match` webhooks. HMAC-verifies, drafts via OpenAI, queues for approval. |
| `src/app/api/managed-signals/` | Thin proxy to MyAgentMail's `/v1/linkedin/signals` |
| `src/lib/myagentmail.ts` | SDK helpers over `/v1/inboxes`, `/v1/linkedin/*`, `/v1/linkedin/signals` |
| `src/lib/agent.ts` | Vercel AI SDK + OpenAI for drafting connection notes |
| `src/lib/action-runner.ts` | Dispatches approved actions back to MyAgentMail |
| `src/lib/db.ts` | SQLite (`better-sqlite3`) at `data/outreach.db` |

---

## Configuration reference

All settings live in `.env`. Full list with defaults in [`.env.example`](.env.example).

| Variable | Required? | What it does |
|---|---|---|
| `MYAGENTMAIL_API_KEY` | Yes | Tenant master key from https://myagentmail.com/dashboard/api-keys |
| `MYAGENTMAIL_WEBHOOK_SECRET` | Recommended | Returned when you create a signal. Used for HMAC verification on `/api/webhook`. Without it, the webhook accepts unsigned payloads (dev only). |
| `OPENAI_API_KEY` | Yes | For drafting connection notes locally |
| `OPENAI_MODEL` | No | Default `gpt-4o-mini`. Swap to `gpt-4o` for higher-quality drafts. |
| `CRON_SECRET` | Yes | Any random string. Only used by the legacy `/api/cron` route — kept for backwards compat with the self-hosted polling mode. |
| `ROCKETREACH_API_KEY` | No | Enables lead enrichment on `/leads`. Skip if you don't need it. |
| `MYAGENTMAIL_BASE_URL` | No | Defaults to `https://myagentmail.com`. Override only for self-hosted MyAgentMail. |
| `MYAGENTMAIL_DEFAULT_INBOX` | No | Username for the auto-provisioned inbox (defaults to `scout`). |
| `DATABASE_PATH` | No | SQLite location. Defaults to `./data/outreach.db`. |
| `APPROVAL_MODE` | No | `manual` (default) or `auto`. Autonomous mode skips the queue — only enable once you trust the prompts. |

---

## Deploying

### Local laptop

What the steps above produce. Use [ngrok](https://ngrok.com) to expose `/api/webhook` to MyAgentMail if you want real-time webhook delivery.

### Vercel

```bash
vercel
```

Set the same env vars in the project's Settings → Environment Variables. **Caveat:** the SQLite file at `./data/outreach.db` won't persist across serverless invocations on Vercel. Either deploy on a VPS where the disk persists, or swap `src/lib/db.ts` to a hosted DB (Postgres / Turso / Supabase — ~30 lines).

### Self-hosted (any VPS)

```bash
npm run build && npm run start
# → port 3000
```

No cron job to schedule — webhooks are pushed by MyAgentMail.

### Docker

PRs welcome. Roughly: standard Next.js multi-stage Dockerfile + a volume mount for `/app/data`.

---

## Safety

LinkedIn flags accounts that send too many connection requests, too fast. Defaults here are conservative:

- **Manual approval mode** — nothing sends until you click Approve.
- **Per-account daily action limits** are enforced server-side by MyAgentMail (your tier sets the cap).
- **Conservative cadences** — daily / 12h / 6h / manual are the only options for signal polling. No hourly or sub-hourly cadence is exposed.
- **The classifier prompt** is tuned to skip generic posts, recruiter spam, content marketers, and vendor pitches. Only authors who are plausibly the source of the signal get engaged with.

You're still responsible for what gets sent. LinkedIn-side actions (account warnings, restrictions, bans) are between you and LinkedIn — see MyAgentMail's [LinkedIn module ToS](https://myagentmail.com/terms-linkedin).

---

## Troubleshooting

**`/api/probe` shows the api unreachable from web.** That's a MyAgentMail-side issue — confirm `https://myagentmail.com/health` returns 200 and check status at https://myagentmail.com.

**Webhook verifies fail (`bad signature`).** The secret in `.env` must match the one returned when you created the signal. If you've lost it, create a new signal — the secret is shown only at creation time.

**Signal polls return 0 matches.** Try a more popular keyword. LinkedIn search returns *recent* posts (last 24h on each poll), so niche keywords may take days to surface anything. Test with something like `"AI agents"` first.

**`LINKEDIN_RATE_LIMITED` error on the signal.** The connected LinkedIn account hit LinkedIn's per-account rate limit. The signal pauses for 24h automatically. Reduce cadence to `daily`, or use a different LinkedIn account.

**`SESSION_LIMIT_REACHED` when connecting an account.** Your tier caps how many LinkedIn accounts you can connect (Solo: 1, Team: 5, Agency: 25). Upgrade or disconnect an unused account.

---

## Why this exists

Goji-style "contextual outreach" tools are valuable but expensive and locked into a single platform. This shows you can build the same workflow on top of MyAgentMail's API — and **own every layer of the stack**. Your data, your prompts, your queue, your customizations.

Fork it. Wire it into your CRM. Add Twitter/X. Add HackerNews. Replace the queue UI with Slack approvals. The agent loop is ~150 lines.

---

## License

MIT — do whatever you want.

## Resources

- [MyAgentMail homepage](https://myagentmail.com)
- [API reference](https://myagentmail.com/docs)
- [Knowledge base](https://myagentmail.com/kb)
- [LinkedIn module pricing](https://myagentmail.com/linkedin#pricing)
- [LinkedIn module ToS](https://myagentmail.com/terms-linkedin)
- [Privacy policy](https://myagentmail.com/privacy)
