/**
 * Thin client over the MyAgentMail REST API.
 * Auth via X-API-Key header, key from MYAGENTMAIL_API_KEY env var.
 *
 * Endpoint reference: https://myagentmail.com/docs
 */

const BASE = process.env.MYAGENTMAIL_BASE_URL || "https://myagentmail.com";

function key(): string {
  const k = process.env.MYAGENTMAIL_API_KEY;
  if (!k) {
    throw new Error(
      "MYAGENTMAIL_API_KEY is not set. Copy .env.example to .env and paste your key from /dashboard.",
    );
  }
  return k;
}

async function request<T>(
  method: "GET" | "POST" | "DELETE" | "PATCH",
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE}/v1${path}`, {
    method,
    headers: {
      "X-API-Key": key(),
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!res.ok) {
    throw new Error(
      `MyAgentMail ${method} ${path} → ${res.status}: ${data?.error || text || "unknown error"}`,
    );
  }
  return data as T;
}

// ── Inboxes ────────────────────────────────────────────────────────────

export type Inbox = {
  id: string;
  email: string;
  username: string;
  domain: string;
  displayName?: string;
  createdAt: string;
};

export async function listInboxes(): Promise<Inbox[]> {
  const r = await request<{ inboxes: Inbox[] }>("GET", "/inboxes");
  return r.inboxes || [];
}

export async function createInbox(input: {
  username?: string;
  displayName?: string;
}): Promise<Inbox> {
  return await request<Inbox>("POST", "/inboxes", input);
}

export async function ensureInbox(username: string): Promise<Inbox> {
  const inboxes = await listInboxes();
  const existing = inboxes.find((i) => i.username === username);
  if (existing) return existing;
  return await createInbox({ username });
}

export async function sendEmail(input: {
  inboxId: string;
  to: string;
  subject: string;
  plainBody?: string;
  htmlBody?: string;
  verified?: boolean;
}): Promise<{ id: string; messageId: string }> {
  const { inboxId, ...rest } = input;
  return await request("POST", `/inboxes/${inboxId}/send`, {
    verified: true,
    ...rest,
  });
}

// ── LinkedIn module ─────────────────────────────────────────────────────

export type LinkedInSession = {
  id: string;
  label: string | null;
  status: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export async function listLinkedInSessions(): Promise<LinkedInSession[]> {
  const r = await request<{ sessions: LinkedInSession[] }>("GET", "/linkedin/sessions");
  return r.sessions || [];
}

export type LinkedInLoginResult =
  | { ok: true; sessionId: string; label: string | null; createdAt: string }
  | {
      ok: false;
      challenge: true;
      challengeId: string;
      challengeType: string;
      verifyEndpoint: string;
      pollEndpoint: string;
      expiresAt: string;
    }
  | { ok: false; error: string };

export async function linkedInLogin(input: {
  email: string;
  password: string;
  label?: string;
}): Promise<LinkedInLoginResult> {
  return await request("POST", "/linkedin/sessions", input);
}

export async function linkedInVerifyChallenge(input: {
  challengeId: string;
  pin: string;
  label?: string;
}): Promise<LinkedInLoginResult> {
  return await request("POST", "/linkedin/sessions/verify", input);
}

export async function linkedInImportCookies(input: {
  liAt: string;
  jsessionId: string;
  label?: string;
}): Promise<{ ok: boolean; sessionId?: string; error?: string }> {
  return await request("POST", "/linkedin/sessions/import", input);
}

export async function linkedInRevokeSession(sessionId: string): Promise<void> {
  await request("DELETE", `/linkedin/sessions/${sessionId}`);
}

export type LinkedInPost = {
  postUrl: string;
  authorName: string;
  authorProfileUrl: string;
  authorHeadline?: string;
  excerpt: string;
  postedAt?: string;
};

export async function searchLinkedInContent(input: {
  sessionId: string;
  query: string;
  limit?: number;
}): Promise<LinkedInPost[]> {
  const r = await request<{ posts: LinkedInPost[] }>("POST", "/linkedin/search/content", {
    limit: 25,
    ...input,
  });
  return r.posts || [];
}

export async function linkedInLookupProfile(input: {
  sessionId: string;
  profileUrl: string;
}): Promise<{ name?: string; headline?: string; company?: string; publicId?: string }> {
  return await request("POST", "/linkedin/profiles/lookup", input);
}

export async function linkedInSendConnection(input: {
  sessionId: string;
  profileUrl: string;
  message?: string;
}): Promise<{ ok: boolean; error?: string }> {
  return await request("POST", "/linkedin/connections", input);
}
