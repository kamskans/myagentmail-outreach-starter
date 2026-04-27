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

/**
 * Poll for the mobile-app approval path. LinkedIn often issues a
 * challenge that the user can satisfy EITHER by typing a PIN that was
 * emailed to them OR by tapping "Yes, it's me" in the LinkedIn mobile
 * app — the same single challenge accepts whichever path arrives first.
 *
 * Returns:
 *   - 200 + sessionId  — user approved on the mobile app
 *   - 202 + pending   — still waiting; poll again
 *   - 401             — challenge expired or rejected
 */
export type LinkedInPollResult =
  | { ok: true; sessionId: string; label: string | null; createdAt: string }
  | { ok: false; pending: true; error?: string }
  | { ok: false; error: string };

export async function linkedInPollMobileApproval(input: {
  challengeId: string;
  label?: string;
}): Promise<LinkedInPollResult> {
  return await request("POST", "/linkedin/sessions/poll", input);
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

// ── LinkedIn Intent Signals (managed) ────────────────────────────────────
// MyAgentMail polls LinkedIn on the chosen cadence, classifies each match
// with an LLM, and POSTs high-intent matches to your webhook. You can also
// pull matches via GET /:id/matches if you'd rather not run a webhook.
//
// Docs: https://myagentmail.com/docs#linkedin-signals

export type SignalCadence = "daily" | "every_12h" | "every_6h" | "manual";
export type SignalIntent = "low" | "medium" | "high";

export type ManagedSignal = {
  id: string;
  name: string;
  query: string;
  sessionId: string;
  cadence: SignalCadence;
  webhookUrl: string | null;
  webhookSecret: string | null;
  filterMinIntent: SignalIntent;
  intentDescription: string | null;
  enabled: boolean;
  lastPolledAt: string | null;
  nextPollAt: string | null;
  lastError: string | null;
  matchesCount: number;
  createdAt: string;
};

export async function listManagedSignals(): Promise<ManagedSignal[]> {
  const r = await request<{ signals: ManagedSignal[] }>("GET", "/linkedin/signals");
  return r.signals || [];
}

export async function createManagedSignal(input: {
  name: string;
  query: string;
  sessionId: string;
  cadence?: SignalCadence;
  webhookUrl?: string;
  filterMinIntent?: SignalIntent;
  /**
   * Optional plain-English firing rule. When set, the classifier treats
   * it as authoritative and the keyword is just a coarse pre-filter.
   * Example: "Flag as ready when the author is a founder/operator
   * complaining about cold email — skip vendors, agencies, and content
   * marketers."
   */
  intentDescription?: string;
}): Promise<ManagedSignal> {
  const r = await request<{ signal: ManagedSignal }>("POST", "/linkedin/signals", input);
  return r.signal;
}

export async function deleteManagedSignal(id: string): Promise<void> {
  await request("DELETE", `/linkedin/signals/${id}`);
}

export async function runManagedSignal(id: string): Promise<{ result: any }> {
  return await request("POST", `/linkedin/signals/${id}/run`);
}

export type SignalMatchPayload = {
  id: string;
  postUrl: string;
  postExcerpt: string | null;
  postPostedAt: string | null;
  author: { name: string | null; profileUrl: string | null; headline: string | null };
  classification: { engage: boolean; intent: SignalIntent; reason: string } | null;
  foundAt: string;
};

export async function listManagedSignalMatches(
  id: string,
  opts: { limit?: number; sinceId?: string } = {},
): Promise<SignalMatchPayload[]> {
  const params = new URLSearchParams();
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.sinceId) params.set("sinceId", opts.sinceId);
  const q = params.toString();
  const r = await request<{ matches: SignalMatchPayload[] }>(
    "GET",
    `/linkedin/signals/${id}/matches${q ? `?${q}` : ""}`,
  );
  return r.matches || [];
}

// ── LinkedIn Historical Search ───────────────────────────────────────────
// One-shot keyword lookup across the past 24h / week / month. Different
// product surface from signals: synchronous, returns the hit list inline,
// no webhook, no recurring schedule, no dedup. Use this when you want to
// know who *has* talked about a keyword — not who *will* talk about it.
//
// Docs: https://myagentmail.com/docs#linkedin-searches

export type SearchLookback = "past-24h" | "past-week" | "past-month";

export type HistoricalSearch = {
  id: string;
  sessionId: string;
  query: string;
  lookback: SearchLookback;
  minIntent: SignalIntent | null;
  intentDescription: string | null;
  resultCount: number;
  tookMs: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
};

export type HistoricalSearchResult = {
  postUrl: string;
  postExcerpt: string;
  postedAt: string | null;
  author: { name: string; profileUrl: string; headline: string | null };
  classification: { engage: boolean; intent: SignalIntent; reason: string };
  rank: number;
};

export async function runHistoricalSearch(input: {
  sessionId: string;
  query: string;
  lookback?: SearchLookback;
  minIntent?: SignalIntent;
  /** See createManagedSignal — same semantics. */
  intentDescription?: string;
  limit?: number;
}): Promise<{ search: HistoricalSearch; results: HistoricalSearchResult[] }> {
  return await request<{ search: HistoricalSearch; results: HistoricalSearchResult[] }>(
    "POST",
    "/linkedin/searches",
    input,
  );
}

export async function listHistoricalSearches(
  opts: { limit?: number } = {},
): Promise<HistoricalSearch[]> {
  const q = opts.limit ? `?limit=${opts.limit}` : "";
  const r = await request<{ searches: HistoricalSearch[] }>("GET", `/linkedin/searches${q}`);
  return r.searches || [];
}

export async function getHistoricalSearch(
  id: string,
): Promise<{ search: HistoricalSearch; results: HistoricalSearchResult[] }> {
  return await request<{ search: HistoricalSearch; results: HistoricalSearchResult[] }>(
    "GET",
    `/linkedin/searches/${id}`,
  );
}
