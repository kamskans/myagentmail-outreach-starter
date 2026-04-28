"use client";

/**
 * Onboarding wizard — Gojiberry-style flow.
 *
 *   1. Website          — paste URL, run AI inference
 *   2. Connect LinkedIn — widget or pick existing session
 *   3. Ideal Customer   — review/edit the inferred ICP
 *   4. Detect           — review/edit keywords + companies + profiles
 *   5. Objectives       — pain points + goal + tone + precision
 *   6. Launch           — creates MAM signals, kicks first poll, lands on /leads
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, ArrowLeft, Loader2, Sparkles, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LinkedInConnect } from "@myagentmail/react";

type Step = "website" | "linkedin" | "icp" | "detect" | "objectives" | "launch";

type Inferred = {
  companyName: string;
  productPitch: string;
  targetJobTitles: string[];
  targetIndustries: string[];
  targetLocations: string[];
  targetCompanySizes: string[];
  targetCompanyTypes: string[];
  excludeCompanies: string[];
  trackKeywords: string[];
  trackCompanies: string[];
  trackProfiles: string[];
  painPoints: string;
};

const COMPANY_SIZE_OPTIONS = [
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "501-1000",
  "1001-5000",
  "5000+",
];
const COMPANY_TYPE_OPTIONS = ["Startup", "Private Company", "Public Company", "Agency", "Nonprofit"];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>("website");
  const [websiteUrl, setWebsiteUrl] = React.useState("");
  const [inferring, setInferring] = React.useState(false);
  const [inferred, setInferred] = React.useState<Inferred | null>(null);
  const [linkedinAccount, setLinkedinAccount] = React.useState<string | null>(null);
  const [campaignGoal, setCampaignGoal] = React.useState("connect");
  const [messageTone, setMessageTone] = React.useState<"professional" | "conversational" | "direct">(
    "professional",
  );
  const [precision, setPrecision] = React.useState<"discovery" | "high">("high");
  const [watchlistText, setWatchlistText] = React.useState("");
  const [launching, setLaunching] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/agent/config")
      .then((r) => r.json())
      .then((data) => {
        const cfg = data?.config;
        if (cfg?.websiteUrl) {
          setWebsiteUrl(cfg.websiteUrl);
          setInferred({
            companyName: cfg.companyName,
            productPitch: cfg.productPitch,
            targetJobTitles: cfg.targetJobTitles ?? [],
            targetIndustries: cfg.targetIndustries ?? [],
            targetLocations: cfg.targetLocations ?? [],
            targetCompanySizes: cfg.targetCompanySizes ?? [],
            targetCompanyTypes: cfg.targetCompanyTypes ?? [],
            excludeCompanies: cfg.excludeCompanies ?? [],
            trackKeywords: cfg.trackKeywords ?? [],
            trackCompanies: cfg.trackCompanies ?? [],
            trackProfiles: cfg.trackProfiles ?? [],
            painPoints: cfg.painPoints ?? "",
          });
          setCampaignGoal(cfg.campaignGoal ?? "connect");
          setMessageTone(cfg.messageTone ?? "professional");
          setPrecision(cfg.precision ?? "high");
          setWatchlistText((cfg.watchlistProfiles ?? []).join("\n"));
        }
      })
      .catch(() => {});
  }, []);

  async function runInference() {
    const url = websiteUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      toast.error("Enter a full URL starting with https://");
      return;
    }
    setInferring(true);
    try {
      const r = await fetch("/api/agent/infer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteUrl: url }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error ?? "inference failed");
      setInferred(data.icp);
      await fetch("/api/agent/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteUrl: url, ...data.icp }),
      });
      setStep("linkedin");
    } catch (err: any) {
      toast.error(err?.message ?? "AI inference failed");
    } finally {
      setInferring(false);
    }
  }

  async function persist(patch: Partial<Inferred> & Record<string, unknown> = {}) {
    if (!inferred) return;
    await fetch("/api/agent/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...inferred, ...patch }),
    });
  }

  async function launch() {
    if (!inferred) return;
    setLaunching(true);
    try {
      const watchlistProfiles = watchlistText
        .split(/\n+/)
        .map((s) => s.trim())
        .filter((s) => /linkedin\.com\/in\//.test(s));
      await fetch("/api/agent/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...inferred,
          watchlistProfiles,
          campaignGoal,
          messageTone,
          precision,
        }),
      });
      const r = await fetch("/api/agent/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runImmediately: true }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error ?? "launch failed");
      toast.success(
        `Agent launched — ${data.created} signal(s) created. First leads arriving in seconds.`,
      );
      router.push("/leads");
    } catch (err: any) {
      toast.error(err?.message ?? "Launch failed");
      setLaunching(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Set up your AI lead agent</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Five minutes. Your agent watches LinkedIn for buying intent and surfaces leads to your
          queue.
        </p>
      </div>

      <ProgressDots step={step} />

      {step === "website" && (
        <Card className="space-y-4 p-6">
          <div>
            <h2 className="text-xl font-semibold">Start with your website</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              We&apos;ll use AI to infer your ideal customer profile and the LinkedIn signals worth
              monitoring. You&apos;ll review and edit before anything launches.
            </p>
          </div>
          <div>
            <Label htmlFor="website">Company website</Label>
            <Input
              id="website"
              placeholder="https://yourcompany.com"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") runInference();
              }}
            />
          </div>
          <Button onClick={runInference} disabled={inferring || !websiteUrl}>
            {inferring ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Reading your site...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Generate ICP with AI
              </>
            )}
          </Button>
        </Card>
      )}

      {step === "linkedin" && (
        <Card className="space-y-4 p-6">
          <div>
            <h2 className="text-xl font-semibold">Connect your LinkedIn account</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Polling runs against your real account. Cookies are AES-256 encrypted at rest and
              never leave MyAgentMail.
            </p>
          </div>
          <LinkedInConnect
            proxyUrl="/api/myagentmail/linkedin"
            onConnected={(s) => {
              setLinkedinAccount(s.sessionId);
              toast.success("LinkedIn connected");
            }}
          />
          <NavRow
            onBack={() => setStep("website")}
            onNext={() => setStep("icp")}
            nextLabel="Continue"
            nextDisabled={false}
            nextHint={!linkedinAccount ? "(skip if you'll connect later)" : ""}
          />
        </Card>
      )}

      {step === "icp" && inferred && (
        <Card className="space-y-5 p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold">Define your ideal customer</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                AI-generated from your website. Edit anything that&apos;s off.
              </p>
            </div>
            <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs text-orange-800">
              <Sparkles className="mr-1 inline h-3 w-3" />
              AI-generated
            </span>
          </div>
          <ChipList
            label="Target job titles"
            values={inferred.targetJobTitles}
            onChange={(v) => setInferred({ ...inferred, targetJobTitles: v })}
            placeholder="e.g. VP Sales"
          />
          <ChipList
            label="Target industries"
            values={inferred.targetIndustries}
            onChange={(v) => setInferred({ ...inferred, targetIndustries: v })}
            placeholder="e.g. SaaS"
          />
          <ChipList
            label="Target locations"
            values={inferred.targetLocations}
            onChange={(v) => setInferred({ ...inferred, targetLocations: v })}
            placeholder="e.g. United States"
          />
          <MultiSelect
            label="Company sizes"
            values={inferred.targetCompanySizes}
            options={COMPANY_SIZE_OPTIONS}
            onChange={(v) => setInferred({ ...inferred, targetCompanySizes: v })}
          />
          <MultiSelect
            label="Company types"
            values={inferred.targetCompanyTypes}
            options={COMPANY_TYPE_OPTIONS}
            onChange={(v) => setInferred({ ...inferred, targetCompanyTypes: v })}
          />
          <ChipList
            label="Companies & keywords to exclude"
            values={inferred.excludeCompanies}
            onChange={(v) => setInferred({ ...inferred, excludeCompanies: v })}
            placeholder="e.g. Upwork"
          />
          <NavRow
            onBack={() => setStep("linkedin")}
            onNext={async () => {
              await persist();
              setStep("detect");
            }}
            nextLabel="Continue"
            nextDisabled={false}
          />
        </Card>
      )}

      {step === "detect" && inferred && (
        <Card className="space-y-5 p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold">What we&apos;ll detect</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Pre-selected the most relevant intent signals for your business. Edit any.
              </p>
            </div>
            <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs text-orange-800">
              <Sparkles className="mr-1 inline h-3 w-3" />
              AI-generated
            </span>
          </div>
          <ChipList
            label="Track keywords"
            sublabel="People posting these phrases — quoted phrases work best."
            values={inferred.trackKeywords}
            onChange={(v) => setInferred({ ...inferred, trackKeywords: v })}
            placeholder='e.g. "outbound is broken"'
          />
          <ChipList
            label="Track competitor company pages"
            sublabel="LinkedIn /company/ URLs — we'll surface engagers on their posts."
            values={inferred.trackCompanies}
            onChange={(v) => setInferred({ ...inferred, trackCompanies: v })}
            placeholder="https://linkedin.com/company/competitor"
          />
          <ChipList
            label="Track influencer profiles"
            sublabel="LinkedIn /in/ URLs — we'll surface engagers on their posts."
            values={inferred.trackProfiles}
            onChange={(v) => setInferred({ ...inferred, trackProfiles: v })}
            placeholder="https://linkedin.com/in/creator"
          />
          <div>
            <Label>Watchlist (job changes)</Label>
            <p className="mb-1 text-[11px] text-muted-foreground">
              Past customers, ex-coworkers, champions. We notify you when their role/company
              changes. One LinkedIn /in/ URL per line.
            </p>
            <textarea
              rows={4}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono"
              placeholder={"https://linkedin.com/in/jane-doe/\nhttps://linkedin.com/in/john-smith/"}
              value={watchlistText}
              onChange={(e) => setWatchlistText(e.target.value)}
            />
          </div>
          <NavRow
            onBack={() => setStep("icp")}
            onNext={async () => {
              await persist();
              setStep("objectives");
            }}
            nextLabel="Continue"
            nextDisabled={false}
          />
        </Card>
      )}

      {step === "objectives" && inferred && (
        <Card className="space-y-5 p-6">
          <div>
            <h2 className="text-xl font-semibold">Define your objectives</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              We&apos;ll use these to draft your outreach messages.
            </p>
          </div>
          <div>
            <Label>Pain points</Label>
            <p className="mb-1 text-[11px] text-muted-foreground">
              What pain does your product solve for your ICP?
            </p>
            <textarea
              rows={4}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={inferred.painPoints}
              onChange={(e) => setInferred({ ...inferred, painPoints: e.target.value })}
            />
          </div>
          <div>
            <Label>Campaign goal</Label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <Choice
                active={campaignGoal === "connect"}
                onClick={() => setCampaignGoal("connect")}
                title="Start conversations"
                sub="Build relationships, low friction"
              />
              <Choice
                active={campaignGoal === "book_demo"}
                onClick={() => setCampaignGoal("book_demo")}
                title="Book a demo"
                sub="Direct, schedule a call"
              />
            </div>
          </div>
          <div>
            <Label>Message tone</Label>
            <div className="mt-1 grid grid-cols-3 gap-2">
              <Choice
                active={messageTone === "professional"}
                onClick={() => setMessageTone("professional")}
                title="Professional"
                sub="Formal, polished"
              />
              <Choice
                active={messageTone === "conversational"}
                onClick={() => setMessageTone("conversational")}
                title="Conversational"
                sub="Friendly, casual"
              />
              <Choice
                active={messageTone === "direct"}
                onClick={() => setMessageTone("direct")}
                title="Direct"
                sub="Bold, confident"
              />
            </div>
          </div>
          <div>
            <Label>Precision</Label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <Choice
                active={precision === "high"}
                onClick={() => setPrecision("high")}
                title="High precision"
                sub="Fewer, better leads"
              />
              <Choice
                active={precision === "discovery"}
                onClick={() => setPrecision("discovery")}
                title="Discovery mode"
                sub="More leads, broader"
              />
            </div>
          </div>
          <NavRow
            onBack={() => setStep("detect")}
            onNext={() => setStep("launch")}
            nextLabel="Review"
            nextDisabled={false}
          />
        </Card>
      )}

      {step === "launch" && inferred && (
        <Card className="space-y-5 p-6">
          <div>
            <h2 className="text-xl font-semibold">Launch your agent</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              We&apos;ll create your intent signals and run the first poll immediately. First leads
              arrive in seconds.
            </p>
          </div>
          <Summary
            title="Will create"
            items={[
              `${inferred.trackKeywords.filter(Boolean).length} keyword signal(s)`,
              `${inferred.trackCompanies.filter(Boolean).length} company-engagement signal(s)`,
              `${inferred.trackProfiles.filter(Boolean).length} profile-engagement signal(s)`,
              `${watchlistText.split(/\n+/).filter((s) => /linkedin\.com\/in\//.test(s)).length} watchlist entries`,
            ]}
          />
          <NavRow
            onBack={() => setStep("objectives")}
            onNext={launch}
            nextLabel={launching ? "Launching…" : "Launch agent"}
            nextDisabled={launching}
            nextLoading={launching}
          />
        </Card>
      )}
    </div>
  );
}

function ProgressDots({ step }: { step: Step }) {
  const order: Step[] = ["website", "linkedin", "icp", "detect", "objectives", "launch"];
  const idx = order.indexOf(step);
  return (
    <div className="flex justify-center gap-1.5">
      {order.map((s, i) => (
        <div key={s} className={`h-1.5 w-8 rounded-full ${i <= idx ? "bg-primary" : "bg-muted"}`} />
      ))}
    </div>
  );
}

function ChipList({
  label,
  sublabel,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  sublabel?: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = React.useState("");
  function add() {
    const v = draft.trim();
    if (!v) return;
    onChange([...values, v]);
    setDraft("");
  }
  return (
    <div>
      <Label>{label}</Label>
      {sublabel ? <p className="mb-1 text-[11px] text-muted-foreground">{sublabel}</p> : null}
      <div className="flex gap-2">
        <Input
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button variant="outline" onClick={add}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {values.map((v, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-900"
          >
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((_, j) => j !== i))}
              className="hover:text-orange-700"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

function MultiSelect({
  label,
  options,
  values,
  onChange,
}: {
  label: string;
  options: string[];
  values: string[];
  onChange: (v: string[]) => void;
}) {
  function toggle(v: string) {
    if (values.includes(v)) onChange(values.filter((x) => x !== v));
    else onChange([...values, v]);
  }
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={`rounded-full border px-3 py-1 text-xs ${
              values.includes(opt)
                ? "border-primary bg-primary/10 text-primary"
                : "border-input bg-background text-muted-foreground"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function Choice({
  active,
  onClick,
  title,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border p-3 text-left ${
        active ? "border-primary bg-primary/5" : "border-input bg-background"
      }`}
    >
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </button>
  );
}

function Summary({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border bg-muted/40 p-3 text-sm">
      <div className="mb-1 font-medium">{title}</div>
      <ul className="space-y-0.5 text-xs text-muted-foreground">
        {items.map((it, i) => (
          <li key={i}>• {it}</li>
        ))}
      </ul>
    </div>
  );
}

function NavRow({
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
  nextLoading,
  nextHint,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
  nextDisabled: boolean;
  nextLoading?: boolean;
  nextHint?: string;
}) {
  return (
    <div className="flex items-center justify-between border-t pt-4">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>
      <div className="flex items-center gap-2">
        {nextHint ? <span className="text-xs text-muted-foreground">{nextHint}</span> : null}
        <Button onClick={onNext} disabled={nextDisabled}>
          {nextLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {nextLabel} <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
