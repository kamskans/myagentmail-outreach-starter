/**
 * Optional RocketReach integration for lead enrichment.
 * Enabled only when ROCKETREACH_API_KEY is set.
 */

const BASE = "https://api.rocketreach.co/api/v2";

export function isEnabled(): boolean {
  return !!process.env.ROCKETREACH_API_KEY;
}

function key(): string {
  const k = process.env.ROCKETREACH_API_KEY;
  if (!k) throw new Error("ROCKETREACH_API_KEY is not set");
  return k;
}

export type RRPerson = {
  id: number;
  name: string;
  current_employer?: string;
  current_title?: string;
  linkedin_url?: string;
  emails?: { email: string; type: string }[];
};

export async function searchPeople(input: {
  query: string;
  company?: string;
  title?: string;
  limit?: number;
}): Promise<RRPerson[]> {
  const res = await fetch(`${BASE}/searchPerson`, {
    method: "POST",
    headers: { "Api-Key": key(), "Content-Type": "application/json" },
    body: JSON.stringify({
      query: { keyword_skills: [input.query], current_employer: input.company, current_title: input.title },
      page_size: input.limit ?? 10,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`RocketReach search → ${res.status}: ${body}`);
  }
  const data: any = await res.json();
  return data?.profiles || [];
}

export async function lookupPerson(input: {
  linkedinUrl?: string;
  email?: string;
  name?: string;
  currentEmployer?: string;
}): Promise<RRPerson | null> {
  const params = new URLSearchParams();
  if (input.linkedinUrl) params.set("linkedin_url", input.linkedinUrl);
  if (input.email) params.set("email", input.email);
  if (input.name) params.set("name", input.name);
  if (input.currentEmployer) params.set("current_employer", input.currentEmployer);
  const res = await fetch(`${BASE}/person/lookup?${params}`, {
    headers: { "Api-Key": key() },
  });
  if (!res.ok) {
    if (res.status === 404) return null;
    const body = await res.text();
    throw new Error(`RocketReach lookup → ${res.status}: ${body}`);
  }
  return await res.json();
}
