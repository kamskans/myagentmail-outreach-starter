/**
 * POST /api/agent/launch
 *
 * Final step of onboarding. Reads agent_config and creates the actual
 * MyAgentMail signals from it:
 *   - One keyword signal per track_keywords entry
 *   - One engagement signal per track_companies entry (kind=company)
 *   - One engagement signal per track_profiles entry (kind=profile)
 *   - One watchlist signal if watchlist_profiles is populated
 *
 * All signals get the same generated firing rule, the same webhook
 * URL pointing back at this starter, and filterMinIntent derived from
 * agent_config.precision.
 *
 * Stores the created signal ids on the agent_config so we can show
 * them on the settings page + delete them on agent reset.
 *
 * Optionally runs each signal once immediately so the user lands on
 * /leads with a real first batch instead of an empty state.
 */

import { NextResponse } from "next/server";
import { getAgentConfig, saveAgentConfig } from "@/lib/db";
import { draftFiringRule } from "@/lib/agent";
import {
  createManagedSignal,
  createEngagementSignal,
  createWatchlistSignal,
  runManagedSignal,
} from "@/lib/myagentmail";

export const dynamic = "force-dynamic";

function webhookUrlFromHost(req: Request): string | undefined {
  const env = process.env.MYAGENTMAIL_WEBHOOK_URL;
  if (env) return env;
  // Fall back to the inbound request's origin — works for ngrok /
  // cloudflared tunnels in dev. Customers running on localhost without
  // a tunnel will get an unreachable URL; we still create the signal
  // (no webhook is technically valid), but matches surface only via
  // the dashboard pull.
  try {
    const url = new URL(req.url);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return undefined;
    }
    return `${url.protocol}//${url.host}/api/webhook`;
  } catch {
    return undefined;
  }
}

export async function POST(req: Request) {
  const cfg = getAgentConfig();
  if (!cfg.websiteUrl || !cfg.productPitch) {
    return NextResponse.json(
      { error: "Agent config incomplete — finish onboarding first." },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => ({} as any));
  const runImmediately = body?.runImmediately !== false;

  const firingRule = draftFiringRule({
    productPitch: cfg.productPitch,
    targetJobTitles: cfg.targetJobTitles,
    targetIndustries: cfg.targetIndustries,
    targetCompanySizes: cfg.targetCompanySizes,
    excludeCompanies: cfg.excludeCompanies,
    painPoints: cfg.painPoints,
    precision: cfg.precision,
  });

  const filterMinIntent = cfg.precision === "high" ? "high" : "low";
  const webhookUrl = webhookUrlFromHost(req);

  const createdIds: string[] = [];
  const errors: string[] = [];

  // Keyword signals
  for (const kw of cfg.trackKeywords) {
    const phrase = kw.replace(/^"|"$/g, "").trim();
    if (!phrase) continue;
    try {
      const sig = await createManagedSignal({
        name: `Keyword: ${phrase.slice(0, 40)}`,
        query: phrase,
        sessionId: null as unknown as string, // null = auto-distribute
        cadence: "daily",
        filterMinIntent,
        intentDescription: firingRule,
        webhookUrl,
      });
      createdIds.push(sig.id);
    } catch (err: any) {
      errors.push(`keyword "${phrase}": ${err?.message ?? err}`);
    }
  }

  // Engagement signals — companies
  for (const url of cfg.trackCompanies) {
    if (!/linkedin\.com\/company\//.test(url)) continue;
    try {
      const sig = await createEngagementSignal({
        name: `Engagers on ${url.replace(/^https?:\/\/(www\.)?linkedin\.com\/company\//, "").replace(/\/$/, "")}`,
        target: { kind: "company", url },
        intentDescription: firingRule,
        webhookUrl,
        filterMinIntent,
        cadence: "daily",
      });
      createdIds.push(sig.id);
    } catch (err: any) {
      errors.push(`company "${url}": ${err?.message ?? err}`);
    }
  }

  // Engagement signals — profiles
  for (const url of cfg.trackProfiles) {
    if (!/linkedin\.com\/in\//.test(url)) continue;
    try {
      const sig = await createEngagementSignal({
        name: `Engagers of ${url.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, "").replace(/\/$/, "")}`,
        target: { kind: "profile", url },
        intentDescription: firingRule,
        webhookUrl,
        filterMinIntent,
        cadence: "daily",
      });
      createdIds.push(sig.id);
    } catch (err: any) {
      errors.push(`profile "${url}": ${err?.message ?? err}`);
    }
  }

  // Watchlist signal — single signal containing all profiles
  if (cfg.watchlistProfiles.length > 0) {
    try {
      const sig = await createWatchlistSignal({
        name: "Job-change watchlist",
        profileUrls: cfg.watchlistProfiles.filter((u) => /linkedin\.com\/in\//.test(u)),
        intentDescription: firingRule,
        webhookUrl,
        filterMinIntent,
      });
      createdIds.push(sig.id);
    } catch (err: any) {
      errors.push(`watchlist: ${err?.message ?? err}`);
    }
  }

  // Persist created ids + mark launched.
  saveAgentConfig({
    createdSignalIds: [...cfg.createdSignalIds, ...createdIds],
    launchedAt: new Date().toISOString(),
  });

  // Optionally fire-and-forget the first poll on each new signal so
  // the user sees real leads on /leads within seconds. Don't await —
  // the runs can take 5-30s each and we want the wizard to finish
  // immediately. /leads page polls for new rows.
  if (runImmediately) {
    for (const id of createdIds) {
      runManagedSignal(id).catch(() => {
        /* best-effort — surface results via /leads polling */
      });
    }
  }

  return NextResponse.json({
    created: createdIds.length,
    signalIds: createdIds,
    errors,
    runs: runImmediately ? "kicked off in background" : "skipped",
  });
}
