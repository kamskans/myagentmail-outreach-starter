/**
 * Server proxy for the <LinkedInConnect /> widget. Forwards every
 * sub-path (/sessions, /sessions/verify, /sessions/poll, /sessions/import)
 * to MyAgentMail with our master API key attached. Master key never
 * reaches the browser.
 */

import { linkedInProxyHandler } from "@myagentmail/react/server";

export const dynamic = "force-dynamic";

const handler = linkedInProxyHandler({
  apiKey: process.env.MYAGENTMAIL_API_KEY!,
  baseUrl: process.env.MYAGENTMAIL_BASE_URL || "https://myagentmail.com",
});

export const POST = handler.POST;
