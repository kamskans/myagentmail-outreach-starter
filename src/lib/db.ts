import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = process.env.DATABASE_PATH || "./data/outreach.db";

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  migrate(_db);
  return _db;
}

/**
 * Schema is intentionally redesigned around the new product shape:
 *
 *   - agent_config: a singleton row holding the user-defined ICP +
 *     campaign objectives. Built up during onboarding from a website
 *     URL via an LLM inference pass, then editable in /settings.
 *
 *   - leads: a unified queue replacing the old (signal_matches +
 *     actions) split. One row per matched person regardless of which
 *     signal kind fired (keyword / engagement / job_change). Each row
 *     can independently track LinkedIn outreach state and email
 *     outreach state — both channels live on the same lead.
 *
 * The legacy `signals`, `signal_matches`, and `actions` tables stay
 * defined here for back-compat with anyone running an older fork —
 * the new code paths don't write to them, but dropping them would
 * break in-place upgrades.
 */
function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS linkedin_accounts (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      session_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_used_at TEXT
    );

    CREATE TABLE IF NOT EXISTS inboxes (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    /*
     * Singleton agent config. Always one row at id=1. Created during
     * onboarding, edited from /settings. Drives signal creation and
     * the cold-email + LinkedIn drafters.
     */
    CREATE TABLE IF NOT EXISTS agent_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      website_url TEXT,
      company_name TEXT,
      product_pitch TEXT,
      -- ICP fields
      target_job_titles TEXT,        -- JSON array
      target_industries TEXT,        -- JSON array
      target_locations TEXT,         -- JSON array
      target_company_sizes TEXT,     -- JSON array
      target_company_types TEXT,     -- JSON array
      exclude_companies TEXT,        -- JSON array (e.g. competitors, junk vendors)
      -- Detection sources (these become signals)
      track_keywords TEXT,           -- JSON array of search phrases
      track_profiles TEXT,           -- JSON array of LinkedIn profile URLs
      track_companies TEXT,          -- JSON array of LinkedIn company URLs
      watchlist_profiles TEXT,       -- JSON array (job-change watchlist)
      -- Objectives
      pain_points TEXT,
      campaign_goal TEXT,            -- 'connect' | 'book_demo' | custom
      message_tone TEXT,             -- 'professional' | 'conversational' | 'direct'
      precision TEXT,                -- 'discovery' | 'high'
      -- Channel auto-actions (v2 sequencer hooks; off in v1)
      auto_send_linkedin INTEGER NOT NULL DEFAULT 0,
      auto_send_email INTEGER NOT NULL DEFAULT 0,
      -- Linkages back to MyAgentMail-side IDs (one signal per detection source)
      created_signal_ids TEXT,       -- JSON array of MAM signal ids
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      launched_at TEXT
    );

    /*
     * Unified leads queue. Webhook handler upserts here. Each row is
     * one matched person regardless of the originating signal kind.
     */
    CREATE TABLE IF NOT EXISTS new_leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      -- Identity
      profile_url TEXT,              -- LinkedIn /in/{slug} URL
      name TEXT,
      role TEXT,
      company TEXT,
      headline TEXT,
      email TEXT,                    -- nullable until enrichment
      -- Source / context
      source_kind TEXT NOT NULL,     -- 'keyword' | 'engagement' | 'job_change' | 'manual'
      source_signal_name TEXT,
      source_signal_id TEXT,
      source_match_id TEXT,          -- MyAgentMail match id (for dedup)
      trigger_post_url TEXT,
      trigger_post_excerpt TEXT,
      trigger_engager_action TEXT,   -- 'commented' | 'reacted' (engagement)
      trigger_engager_comment TEXT,  -- verbatim comment text (when SDUI is on)
      trigger_job_change TEXT,       -- JSON {oldRole, oldCompany, newRole, newCompany}
      classification_intent TEXT,    -- 'low' | 'medium' | 'high'
      classification_reason TEXT,
      -- Channel state: LinkedIn
      linkedin_draft TEXT,
      linkedin_status TEXT NOT NULL DEFAULT 'new',  -- 'new' | 'drafted' | 'sent' | 'declined'
      linkedin_sent_at TEXT,
      -- Channel state: Email
      email_draft_subject TEXT,
      email_draft_body TEXT,
      email_status TEXT NOT NULL DEFAULT 'new',     -- 'new' | 'drafted' | 'sent' | 'replied'
      email_sent_at TEXT,
      email_thread_id TEXT,                          -- our inbox's thread id when sent
      -- Lead lifecycle
      status TEXT NOT NULL DEFAULT 'new',  -- 'new' | 'reviewing' | 'engaged' | 'archived'
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_match_id)
    );

    CREATE INDEX IF NOT EXISTS idx_new_leads_status ON new_leads(status);
    CREATE INDEX IF NOT EXISTS idx_new_leads_created ON new_leads(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_new_leads_kind ON new_leads(source_kind);

    /* ── Legacy tables kept for in-place upgrades, NOT used by new code. */
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT, email TEXT, linkedin_url TEXT, company TEXT, title TEXT,
      enriched_at TEXT, source TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(email)
    );
    CREATE TABLE IF NOT EXISTS signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, query TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      interval_minutes INTEGER NOT NULL DEFAULT 30,
      account_id TEXT, action_type TEXT NOT NULL DEFAULT 'linkedin_connect',
      message_template TEXT, last_polled_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS signal_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signal_id INTEGER NOT NULL, post_url TEXT, post_excerpt TEXT,
      author_name TEXT, author_profile_url TEXT, author_headline TEXT,
      found_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(signal_id, post_url),
      FOREIGN KEY (signal_id) REFERENCES signals(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL, payload TEXT NOT NULL, reasoning TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      result TEXT, signal_match_id INTEGER, lead_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      decided_at TEXT, sent_at TEXT
    );
  `);
}

/* ── agent_config helpers ─────────────────────────────────────────── */

export type AgentConfig = {
  websiteUrl: string;
  companyName: string;
  productPitch: string;
  targetJobTitles: string[];
  targetIndustries: string[];
  targetLocations: string[];
  targetCompanySizes: string[];
  targetCompanyTypes: string[];
  excludeCompanies: string[];
  trackKeywords: string[];
  trackProfiles: string[];
  trackCompanies: string[];
  watchlistProfiles: string[];
  painPoints: string;
  campaignGoal: string;
  messageTone: "professional" | "conversational" | "direct";
  precision: "discovery" | "high";
  autoSendLinkedIn: boolean;
  autoSendEmail: boolean;
  createdSignalIds: string[];
  launchedAt: string | null;
};

const EMPTY: AgentConfig = {
  websiteUrl: "",
  companyName: "",
  productPitch: "",
  targetJobTitles: [],
  targetIndustries: [],
  targetLocations: [],
  targetCompanySizes: [],
  targetCompanyTypes: [],
  excludeCompanies: [],
  trackKeywords: [],
  trackProfiles: [],
  trackCompanies: [],
  watchlistProfiles: [],
  painPoints: "",
  campaignGoal: "connect",
  messageTone: "professional",
  precision: "high",
  autoSendLinkedIn: false,
  autoSendEmail: false,
  createdSignalIds: [],
  launchedAt: null,
};

export function getAgentConfig(): AgentConfig {
  const row = getDb()
    .prepare(`SELECT * FROM agent_config WHERE id = 1`)
    .get() as any;
  if (!row) return { ...EMPTY };
  const parseArr = (s: string | null): string[] => {
    if (!s) return [];
    try {
      const v = JSON.parse(s);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };
  return {
    websiteUrl: row.website_url ?? "",
    companyName: row.company_name ?? "",
    productPitch: row.product_pitch ?? "",
    targetJobTitles: parseArr(row.target_job_titles),
    targetIndustries: parseArr(row.target_industries),
    targetLocations: parseArr(row.target_locations),
    targetCompanySizes: parseArr(row.target_company_sizes),
    targetCompanyTypes: parseArr(row.target_company_types),
    excludeCompanies: parseArr(row.exclude_companies),
    trackKeywords: parseArr(row.track_keywords),
    trackProfiles: parseArr(row.track_profiles),
    trackCompanies: parseArr(row.track_companies),
    watchlistProfiles: parseArr(row.watchlist_profiles),
    painPoints: row.pain_points ?? "",
    campaignGoal: row.campaign_goal ?? "connect",
    messageTone: (row.message_tone ?? "professional") as AgentConfig["messageTone"],
    precision: (row.precision ?? "high") as AgentConfig["precision"],
    autoSendLinkedIn: !!row.auto_send_linkedin,
    autoSendEmail: !!row.auto_send_email,
    createdSignalIds: parseArr(row.created_signal_ids),
    launchedAt: row.launched_at,
  };
}

export function saveAgentConfig(cfg: Partial<AgentConfig>): AgentConfig {
  const current = getAgentConfig();
  const merged: AgentConfig = { ...current, ...cfg };
  const arr = (a: string[]) => JSON.stringify(a ?? []);
  getDb()
    .prepare(
      `INSERT INTO agent_config (
        id, website_url, company_name, product_pitch,
        target_job_titles, target_industries, target_locations,
        target_company_sizes, target_company_types, exclude_companies,
        track_keywords, track_profiles, track_companies, watchlist_profiles,
        pain_points, campaign_goal, message_tone, precision,
        auto_send_linkedin, auto_send_email, created_signal_ids,
        launched_at, updated_at
      ) VALUES (
        1, @website_url, @company_name, @product_pitch,
        @target_job_titles, @target_industries, @target_locations,
        @target_company_sizes, @target_company_types, @exclude_companies,
        @track_keywords, @track_profiles, @track_companies, @watchlist_profiles,
        @pain_points, @campaign_goal, @message_tone, @precision,
        @auto_send_linkedin, @auto_send_email, @created_signal_ids,
        @launched_at, CURRENT_TIMESTAMP
      )
      ON CONFLICT (id) DO UPDATE SET
        website_url=excluded.website_url,
        company_name=excluded.company_name,
        product_pitch=excluded.product_pitch,
        target_job_titles=excluded.target_job_titles,
        target_industries=excluded.target_industries,
        target_locations=excluded.target_locations,
        target_company_sizes=excluded.target_company_sizes,
        target_company_types=excluded.target_company_types,
        exclude_companies=excluded.exclude_companies,
        track_keywords=excluded.track_keywords,
        track_profiles=excluded.track_profiles,
        track_companies=excluded.track_companies,
        watchlist_profiles=excluded.watchlist_profiles,
        pain_points=excluded.pain_points,
        campaign_goal=excluded.campaign_goal,
        message_tone=excluded.message_tone,
        precision=excluded.precision,
        auto_send_linkedin=excluded.auto_send_linkedin,
        auto_send_email=excluded.auto_send_email,
        created_signal_ids=excluded.created_signal_ids,
        launched_at=excluded.launched_at,
        updated_at=CURRENT_TIMESTAMP`,
    )
    .run({
      website_url: merged.websiteUrl,
      company_name: merged.companyName,
      product_pitch: merged.productPitch,
      target_job_titles: arr(merged.targetJobTitles),
      target_industries: arr(merged.targetIndustries),
      target_locations: arr(merged.targetLocations),
      target_company_sizes: arr(merged.targetCompanySizes),
      target_company_types: arr(merged.targetCompanyTypes),
      exclude_companies: arr(merged.excludeCompanies),
      track_keywords: arr(merged.trackKeywords),
      track_profiles: arr(merged.trackProfiles),
      track_companies: arr(merged.trackCompanies),
      watchlist_profiles: arr(merged.watchlistProfiles),
      pain_points: merged.painPoints,
      campaign_goal: merged.campaignGoal,
      message_tone: merged.messageTone,
      precision: merged.precision,
      auto_send_linkedin: merged.autoSendLinkedIn ? 1 : 0,
      auto_send_email: merged.autoSendEmail ? 1 : 0,
      created_signal_ids: arr(merged.createdSignalIds),
      launched_at: merged.launchedAt,
    });
  return merged;
}

/* ── leads helpers ─────────────────────────────────────────────────── */

export type Lead = {
  id: number;
  profileUrl: string | null;
  name: string | null;
  role: string | null;
  company: string | null;
  headline: string | null;
  email: string | null;
  sourceKind: "keyword" | "engagement" | "job_change" | "manual";
  sourceSignalName: string | null;
  sourceSignalId: string | null;
  sourceMatchId: string | null;
  triggerPostUrl: string | null;
  triggerPostExcerpt: string | null;
  triggerEngagerAction: "commented" | "reacted" | null;
  triggerEngagerComment: string | null;
  triggerJobChange: {
    oldRole: string | null;
    oldCompany: string | null;
    newRole: string | null;
    newCompany: string | null;
  } | null;
  classificationIntent: "low" | "medium" | "high" | null;
  classificationReason: string | null;
  linkedinDraft: string | null;
  linkedinStatus: "new" | "drafted" | "sent" | "declined";
  linkedinSentAt: string | null;
  emailDraftSubject: string | null;
  emailDraftBody: string | null;
  emailStatus: "new" | "drafted" | "sent" | "replied";
  emailSentAt: string | null;
  emailThreadId: string | null;
  status: "new" | "reviewing" | "engaged" | "archived";
  notes: string | null;
  createdAt: string;
};

function rowToLead(row: any): Lead {
  return {
    id: row.id,
    profileUrl: row.profile_url,
    name: row.name,
    role: row.role,
    company: row.company,
    headline: row.headline,
    email: row.email,
    sourceKind: row.source_kind,
    sourceSignalName: row.source_signal_name,
    sourceSignalId: row.source_signal_id,
    sourceMatchId: row.source_match_id,
    triggerPostUrl: row.trigger_post_url,
    triggerPostExcerpt: row.trigger_post_excerpt,
    triggerEngagerAction: row.trigger_engager_action,
    triggerEngagerComment: row.trigger_engager_comment,
    triggerJobChange: row.trigger_job_change ? JSON.parse(row.trigger_job_change) : null,
    classificationIntent: row.classification_intent,
    classificationReason: row.classification_reason,
    linkedinDraft: row.linkedin_draft,
    linkedinStatus: row.linkedin_status,
    linkedinSentAt: row.linkedin_sent_at,
    emailDraftSubject: row.email_draft_subject,
    emailDraftBody: row.email_draft_body,
    emailStatus: row.email_status,
    emailSentAt: row.email_sent_at,
    emailThreadId: row.email_thread_id,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export function listLeads(opts: { limit?: number; status?: string } = {}): Lead[] {
  const limit = Math.min(500, Math.max(1, opts.limit ?? 200));
  const where = opts.status ? `WHERE status = ?` : "";
  const stmt = getDb().prepare(
    `SELECT * FROM new_leads ${where} ORDER BY created_at DESC LIMIT ?`,
  );
  const rows = (opts.status ? stmt.all(opts.status, limit) : stmt.all(limit)) as any[];
  return rows.map(rowToLead);
}

export function getLead(id: number): Lead | null {
  const row = getDb().prepare(`SELECT * FROM new_leads WHERE id = ?`).get(id) as any;
  return row ? rowToLead(row) : null;
}

export function upsertLeadFromMatch(input: {
  sourceKind: Lead["sourceKind"];
  sourceMatchId: string;
  sourceSignalId: string | null;
  sourceSignalName: string | null;
  profileUrl: string | null;
  name: string | null;
  role: string | null;
  company: string | null;
  headline: string | null;
  triggerPostUrl?: string | null;
  triggerPostExcerpt?: string | null;
  triggerEngagerAction?: Lead["triggerEngagerAction"];
  triggerEngagerComment?: string | null;
  triggerJobChange?: Lead["triggerJobChange"];
  classificationIntent?: Lead["classificationIntent"];
  classificationReason?: string | null;
}): Lead | null {
  getDb()
    .prepare(
      `INSERT INTO new_leads (
        source_kind, source_match_id, source_signal_id, source_signal_name,
        profile_url, name, role, company, headline,
        trigger_post_url, trigger_post_excerpt, trigger_engager_action,
        trigger_engager_comment, trigger_job_change,
        classification_intent, classification_reason
      ) VALUES (
        @sourceKind, @sourceMatchId, @sourceSignalId, @sourceSignalName,
        @profileUrl, @name, @role, @company, @headline,
        @triggerPostUrl, @triggerPostExcerpt, @triggerEngagerAction,
        @triggerEngagerComment, @triggerJobChange,
        @classificationIntent, @classificationReason
      )
      ON CONFLICT (source_match_id) DO NOTHING`,
    )
    .run({
      sourceKind: input.sourceKind,
      sourceMatchId: input.sourceMatchId,
      sourceSignalId: input.sourceSignalId,
      sourceSignalName: input.sourceSignalName,
      profileUrl: input.profileUrl,
      name: input.name,
      role: input.role,
      company: input.company,
      headline: input.headline,
      triggerPostUrl: input.triggerPostUrl ?? null,
      triggerPostExcerpt: input.triggerPostExcerpt ?? null,
      triggerEngagerAction: input.triggerEngagerAction ?? null,
      triggerEngagerComment: input.triggerEngagerComment ?? null,
      triggerJobChange: input.triggerJobChange ? JSON.stringify(input.triggerJobChange) : null,
      classificationIntent: input.classificationIntent ?? null,
      classificationReason: input.classificationReason ?? null,
    });
  const row = getDb()
    .prepare(`SELECT * FROM new_leads WHERE source_match_id = ?`)
    .get(input.sourceMatchId) as any;
  return row ? rowToLead(row) : null;
}

export function updateLeadDraft(
  id: number,
  patch: Partial<{
    linkedinDraft: string;
    linkedinStatus: Lead["linkedinStatus"];
    linkedinSentAt: string;
    emailDraftSubject: string;
    emailDraftBody: string;
    emailStatus: Lead["emailStatus"];
    emailSentAt: string;
    emailThreadId: string;
    status: Lead["status"];
    notes: string;
  }>,
): void {
  const sets: string[] = [];
  const params: Record<string, unknown> = { id };
  const map: Record<string, string> = {
    linkedinDraft: "linkedin_draft",
    linkedinStatus: "linkedin_status",
    linkedinSentAt: "linkedin_sent_at",
    emailDraftSubject: "email_draft_subject",
    emailDraftBody: "email_draft_body",
    emailStatus: "email_status",
    emailSentAt: "email_sent_at",
    emailThreadId: "email_thread_id",
    status: "status",
    notes: "notes",
  };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const col = map[k];
    if (!col) continue;
    sets.push(`${col} = @${k}`);
    params[k] = v as unknown;
  }
  if (sets.length === 0) return;
  sets.push(`updated_at = CURRENT_TIMESTAMP`);
  getDb()
    .prepare(`UPDATE new_leads SET ${sets.join(", ")} WHERE id = @id`)
    .run(params);
}
