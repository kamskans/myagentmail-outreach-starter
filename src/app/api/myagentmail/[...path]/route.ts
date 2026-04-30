/**
 * General MyAgentMail proxy — covers cadence CRUD + read-mostly LinkedIn
 * surfaces (signals, sessions, connections, conversations). Used by the
 * <CadenceBuilder /> widget and any other client widget that needs to
 * read tenant data without holding the master key in the browser.
 *
 * NOTE: This sits at /api/myagentmail/* and is matched LAST — the more
 * specific /api/myagentmail/linkedin/[...path]/route.ts above (the
 * session-creation proxy) wins for /linkedin/sessions* paths because
 * Next.js prefers the more specific route. mamProxyHandler's whitelist
 * intentionally excludes session WRITE endpoints anyway, so even if
 * routing collided this proxy could not be used to create a session.
 *
 * Whitelist (see @myagentmail/react/server source for the exact regex set):
 *   GET/POST /v1/cadences            list, create
 *   GET/PATCH/DELETE /v1/cadences/:id
 *   PATCH /v1/cadences/:id/steps     replace step list
 *   GET/POST /v1/cadences/:id/enrollments
 *   POST /v1/cadences/:id/run-now
 *   GET/PATCH /v1/enrollments/:id
 *   GET /v1/linkedin/signals*        read
 *   GET /v1/linkedin/sessions*       read (no creates — that's the linkedin/* proxy)
 *   GET /v1/linkedin/connections, /linkedin/invitations/sent, /linkedin/conversations*
 *
 * LinkedIn write endpoints (send invite/DM/post) are intentionally NOT
 * proxied. Those require an explicit server-side gate in your app.
 */

import { mamProxyHandler } from "@myagentmail/react/server";

export const dynamic = "force-dynamic";

const handler = mamProxyHandler({
  apiKey: process.env.MYAGENTMAIL_API_KEY!,
  baseUrl: process.env.MYAGENTMAIL_BASE_URL || "https://myagentmail.com",
});

export const GET = handler.GET;
export const POST = handler.POST;
export const PATCH = handler.PATCH;
export const DELETE = handler.DELETE;
