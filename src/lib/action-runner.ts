/**
 * Dispatches an approved action — sends the LinkedIn connection / DM /
 * email and records the result. Idempotent on `actions.status`: only
 * runs once per id.
 */

import { getDb } from "./db";
import {
  linkedInSendConnection,
  sendEmail,
  ensureInbox,
  type Inbox,
} from "./myagentmail";

type ActionRow = {
  id: number;
  type: string;
  payload: string;
  status: string;
};

export async function dispatchAction(actionId: number): Promise<void> {
  const db = getDb();
  const row = db
    .prepare<[number], ActionRow>(`SELECT * FROM actions WHERE id = ?`)
    .get(actionId);
  if (!row) throw new Error(`Action ${actionId} not found`);
  if (row.status === "sent") return;
  if (row.status !== "approved") {
    throw new Error(`Action ${actionId} is in status ${row.status}, expected 'approved'`);
  }
  const payload = JSON.parse(row.payload);

  let result: any;
  try {
    if (row.type === "linkedin_connect" || row.type === "linkedin_dm") {
      result = await linkedInSendConnection({
        sessionId: payload.sessionId,
        profileUrl: payload.profileUrl,
        message: payload.message,
      });
    } else if (row.type === "email") {
      const inbox = await getDefaultInbox();
      result = await sendEmail({
        inboxId: inbox.id,
        to: payload.to,
        subject: payload.subject,
        plainBody: payload.body,
      });
    } else {
      throw new Error(`Unsupported action type: ${row.type}`);
    }
  } catch (err: any) {
    db.prepare(
      `UPDATE actions SET status = 'failed', result = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ?`,
    ).run(JSON.stringify({ error: err.message }), actionId);
    throw err;
  }

  db.prepare(
    `UPDATE actions SET status = 'sent', result = ?, sent_at = CURRENT_TIMESTAMP WHERE id = ?`,
  ).run(JSON.stringify(result), actionId);
}

let _cachedInbox: Inbox | null = null;
async function getDefaultInbox(): Promise<Inbox> {
  if (_cachedInbox) return _cachedInbox;
  const db = getDb();
  const row = db
    .prepare<[], { id: string; email: string; display_name: string | null }>(
      `SELECT id, email, display_name FROM inboxes ORDER BY created_at LIMIT 1`,
    )
    .get();
  if (row) {
    _cachedInbox = {
      id: row.id,
      email: row.email,
      username: row.email.split("@")[0],
      domain: row.email.split("@")[1],
      displayName: row.display_name ?? undefined,
      createdAt: "",
    };
    return _cachedInbox;
  }
  const username = process.env.MYAGENTMAIL_DEFAULT_INBOX || "scout";
  const inbox = await ensureInbox(username);
  db.prepare(
    `INSERT OR REPLACE INTO inboxes (id, email, display_name) VALUES (?, ?, ?)`,
  ).run(inbox.id, inbox.email, inbox.displayName ?? null);
  _cachedInbox = inbox;
  return inbox;
}
