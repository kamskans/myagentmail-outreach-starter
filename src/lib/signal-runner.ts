/**
 * The cron loop. For each enabled signal:
 *   1. Pick the configured LinkedIn account (or first active one).
 *   2. Search LinkedIn content for the keyword.
 *   3. Dedupe against signal_matches.
 *   4. For each new match, ask the agent whether to engage.
 *   5. If yes, draft the message + queue an action (status=pending unless
 *      APPROVAL_MODE=auto, in which case it dispatches immediately).
 */

import { getDb } from "./db";
import {
  searchLinkedInContent,
  type LinkedInPost,
} from "./myagentmail";
import { classifySignal, draftConnectMessage } from "./agent";
import { dispatchAction } from "./action-runner";

const APPROVAL_MODE = (process.env.APPROVAL_MODE || "manual").toLowerCase();

type Signal = {
  id: number;
  name: string;
  query: string;
  enabled: number;
  interval_minutes: number;
  account_id: string | null;
  action_type: "linkedin_connect" | "linkedin_dm" | "email";
  message_template: string | null;
  last_polled_at: string | null;
};

export type RunSummary = {
  signalId: number;
  signalName: string;
  fetched: number;
  newMatches: number;
  queued: number;
  errors: string[];
};

export async function runAllSignals(): Promise<RunSummary[]> {
  const db = getDb();
  const signals = db
    .prepare<[], Signal>(`SELECT * FROM signals WHERE enabled = 1`)
    .all();
  const results: RunSummary[] = [];
  for (const s of signals) {
    if (!isDue(s)) continue;
    results.push(await runSignal(s));
  }
  return results;
}

function isDue(s: Signal): boolean {
  if (!s.last_polled_at) return true;
  const last = new Date(s.last_polled_at).getTime();
  return Date.now() - last >= s.interval_minutes * 60_000;
}

async function runSignal(s: Signal): Promise<RunSummary> {
  const db = getDb();
  const summary: RunSummary = {
    signalId: s.id,
    signalName: s.name,
    fetched: 0,
    newMatches: 0,
    queued: 0,
    errors: [],
  };

  const account = pickAccount(s.account_id);
  if (!account) {
    summary.errors.push("No active LinkedIn account configured.");
    db.prepare(`UPDATE signals SET last_polled_at = CURRENT_TIMESTAMP WHERE id = ?`).run(s.id);
    return summary;
  }

  let posts: LinkedInPost[] = [];
  try {
    posts = await searchLinkedInContent({
      sessionId: account.session_id,
      query: s.query,
      limit: 25,
    });
  } catch (err: any) {
    summary.errors.push(`LinkedIn search failed: ${err.message}`);
    db.prepare(`UPDATE signals SET last_polled_at = CURRENT_TIMESTAMP WHERE id = ?`).run(s.id);
    return summary;
  }
  summary.fetched = posts.length;

  const insertMatch = db.prepare(`
    INSERT OR IGNORE INTO signal_matches
      (signal_id, post_url, post_excerpt, author_name, author_profile_url, author_headline)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const findMatchId = db.prepare<[number, string], { id: number }>(
    `SELECT id FROM signal_matches WHERE signal_id = ? AND post_url = ?`,
  );

  for (const p of posts) {
    const info = insertMatch.run(
      s.id,
      p.postUrl,
      p.excerpt.slice(0, 1200),
      p.authorName,
      p.authorProfileUrl,
      p.authorHeadline ?? null,
    );
    if (info.changes === 0) continue; // duplicate
    summary.newMatches += 1;

    let decision: Awaited<ReturnType<typeof classifySignal>>;
    try {
      decision = await classifySignal({
        signalName: s.name,
        query: s.query,
        postExcerpt: p.excerpt,
        authorName: p.authorName,
        authorHeadline: p.authorHeadline,
      });
    } catch (err: any) {
      summary.errors.push(`Agent classify failed: ${err.message}`);
      continue;
    }
    if (!decision.engage) continue;

    let message = s.message_template;
    if (!message) {
      try {
        message = await draftConnectMessage({
          authorName: p.authorName,
          authorHeadline: p.authorHeadline,
          postExcerpt: p.excerpt,
          signalName: s.name,
        });
      } catch (err: any) {
        summary.errors.push(`Agent draft failed: ${err.message}`);
        continue;
      }
    }

    const matchRow = findMatchId.get(s.id, p.postUrl);
    const matchId = matchRow?.id ?? null;

    const insertAction = db.prepare(`
      INSERT INTO actions (type, payload, reasoning, status, signal_match_id)
      VALUES (?, ?, ?, ?, ?)
    `);
    const payload = {
      accountId: account.id,
      sessionId: account.session_id,
      profileUrl: p.authorProfileUrl,
      authorName: p.authorName,
      message,
      signalName: s.name,
    };
    const initialStatus = APPROVAL_MODE === "auto" ? "approved" : "pending";
    const result = insertAction.run(
      s.action_type,
      JSON.stringify(payload),
      `${decision.reason} (intent: ${decision.intent})`,
      initialStatus,
      matchId,
    );
    summary.queued += 1;

    if (APPROVAL_MODE === "auto") {
      try {
        await dispatchAction(Number(result.lastInsertRowid));
      } catch (err: any) {
        summary.errors.push(`Auto-dispatch failed: ${err.message}`);
      }
    }
  }

  db.prepare(`UPDATE signals SET last_polled_at = CURRENT_TIMESTAMP WHERE id = ?`).run(s.id);
  return summary;
}

function pickAccount(preferredId: string | null): {
  id: string;
  session_id: string;
} | null {
  const db = getDb();
  if (preferredId) {
    const row = db
      .prepare<[string], { id: string; session_id: string }>(
        `SELECT id, session_id FROM linkedin_accounts WHERE id = ? AND status = 'active'`,
      )
      .get(preferredId);
    if (row) return row;
  }
  return (
    db
      .prepare<[], { id: string; session_id: string }>(
        `SELECT id, session_id FROM linkedin_accounts WHERE status = 'active' ORDER BY created_at LIMIT 1`,
      )
      .get() ?? null
  );
}
