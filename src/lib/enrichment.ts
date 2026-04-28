/**
 * Lead enrichment — given a LinkedIn profile URL, return the
 * person's likely work email.
 *
 * Provider-agnostic interface. Default implementation uses
 * RocketReach (the simplest pay-per-lookup API in this space and
 * the one the v0 starter used). Swap to Apollo / Hunter / Clay /
 * FullContact / Contact Out by replacing rocketReachLookup with
 * a function of the same signature.
 *
 * Failure modes are first-class:
 *   - 'no_email_found' — profile is real but provider has no email
 *   - 'profile_not_found' — provider doesn't recognize the URL
 *   - 'rate_limited'  — back off, retry later
 *   - 'unauthorized'  — bad / missing API key
 *   - 'unknown'       — anything else
 */

export type EnrichmentResult =
  | { status: "ok"; email: string; confidence: "verified" | "likely" | "guess" }
  | {
      status: "no_email_found" | "profile_not_found" | "rate_limited" | "unauthorized" | "unknown";
      detail?: string;
    };

export async function enrichEmail(input: {
  profileUrl: string;
  name?: string | null;
  company?: string | null;
}): Promise<EnrichmentResult> {
  const apiKey = (process.env.ROCKETREACH_API_KEY || "").trim();
  if (!apiKey) {
    return {
      status: "unauthorized",
      detail:
        "ROCKETREACH_API_KEY is not set. Get one at rocketreach.co/api or wire a different provider in src/lib/enrichment.ts.",
    };
  }
  return rocketReachLookup({ apiKey, ...input });
}

async function rocketReachLookup(input: {
  apiKey: string;
  profileUrl: string;
  name?: string | null;
  company?: string | null;
}): Promise<EnrichmentResult> {
  const params = new URLSearchParams();
  params.set("li_url", input.profileUrl);
  if (input.name) params.set("name", input.name);
  if (input.company) params.set("current_employer", input.company);

  let res: Response;
  try {
    res = await fetch(
      `https://api.rocketreach.co/api/v2/person/lookup?${params.toString()}`,
      {
        headers: { "Api-Key": input.apiKey, Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch (err: any) {
    return { status: "unknown", detail: err?.message ?? "network error" };
  }

  if (res.status === 401 || res.status === 403) {
    return { status: "unauthorized", detail: `RocketReach ${res.status}` };
  }
  if (res.status === 404) {
    return { status: "profile_not_found" };
  }
  if (res.status === 429) {
    return { status: "rate_limited" };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { status: "unknown", detail: `${res.status}: ${body.slice(0, 200)}` };
  }

  const data: any = await res.json().catch(() => null);
  if (!data) return { status: "unknown", detail: "non-JSON response" };

  // RocketReach returns the most likely current professional email
  // first in `emails`. Each entry has type: 'professional'|'personal'
  // and grade: 'A'|'B'|'C' indicating confidence.
  const emails: Array<{ email: string; type?: string; grade?: string }> =
    Array.isArray(data.emails) ? data.emails : [];
  const pro = emails.find((e) => (e.type ?? "professional") === "professional") ?? emails[0];
  if (!pro?.email) return { status: "no_email_found" };

  const confidence: "verified" | "likely" | "guess" =
    pro.grade === "A" ? "verified" : pro.grade === "B" ? "likely" : "guess";
  return { status: "ok", email: pro.email, confidence };
}
