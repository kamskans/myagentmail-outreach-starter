"use client";

import * as React from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus } from "lucide-react";
import { fmtDate } from "@/lib/utils";

type Account = {
  id: string;
  label: string;
  sessionId: string;
  status: string;
  remoteStatus: string;
  createdAt: string;
};

export default function AccountsPage() {
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [showForm, setShowForm] = React.useState(false);
  const reload = React.useCallback(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((d) => setAccounts(d.accounts || []));
  }, []);
  React.useEffect(() => reload(), [reload]);

  async function remove(id: string) {
    if (!confirm("Revoke this LinkedIn session?")) return;
    await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    toast.success("Revoked");
    reload();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">LinkedIn accounts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Each account is a stored MyAgentMail LinkedIn session. Add one or more — signals can pin
            to a specific account, or fall back to the first active one.
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> Add account
        </Button>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Label
              </th>
              <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Status
              </th>
              <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Created
              </th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-10 text-center text-xs text-muted-foreground">
                  No accounts yet. Add one to start watching LinkedIn for signals.
                </td>
              </tr>
            ) : (
              accounts.map((a) => (
                <tr key={a.id} className="border-b last:border-b-0">
                  <td className="px-4 py-3 font-medium">{a.label}</td>
                  <td className="px-4 py-3">
                    <Badge variant={a.remoteStatus === "active" ? "success" : "warning"}>
                      {a.remoteStatus}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {fmtDate(a.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-destructive"
                      onClick={() => remove(a.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {showForm ? (
        <AddAccountForm
          onDone={() => {
            setShowForm(false);
            reload();
          }}
          onCancel={() => setShowForm(false)}
        />
      ) : null}
    </div>
  );
}

function AddAccountForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [mode, setMode] = React.useState<"login" | "import">("login");
  const [step, setStep] = React.useState<"form" | "challenge">("form");
  const [busy, setBusy] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [pin, setPin] = React.useState("");
  const [liAt, setLiAt] = React.useState("");
  const [jsess, setJsess] = React.useState("");
  const [challengeId, setChallengeId] = React.useState("");
  // Mobile-app polling state. LinkedIn issues challenges that can be
  // satisfied EITHER by the emailed PIN or by tapping the LinkedIn
  // mobile-app push notification. We poll the mobile path in the
  // background while the user types (or doesn't type) the PIN.
  const [mobileStatus, setMobileStatus] = React.useState<"waiting" | "approved" | "expired">("waiting");
  const completedRef = React.useRef(false);

  async function login() {
    setBusy(true);
    try {
      const r = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "login", email, password, label }),
      });
      const data = await r.json();
      if (data.ok && data.accountId) {
        toast.success("Account added");
        onDone();
      } else if (data.challenge && data.challengeId) {
        setChallengeId(data.challengeId);
        setMobileStatus("waiting");
        completedRef.current = false;
        setStep("challenge");
      } else {
        toast.error(data.error || "Login failed");
      }
    } catch (err: any) {
      toast.error(err.message);
    }
    setBusy(false);
  }

  async function verify() {
    setBusy(true);
    try {
      const r = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "verify", challengeId, pin, label }),
      });
      const data = await r.json();
      if (data.ok && data.accountId) {
        completedRef.current = true; // stops the parallel mobile poll
        toast.success("Account added");
        onDone();
      } else {
        toast.error(data.error || "Verification failed");
      }
    } catch (err: any) {
      toast.error(err.message);
    }
    setBusy(false);
  }

  // Background poll for the mobile-app approval path. Runs only while the
  // challenge step is showing AND we haven't completed via PIN yet.
  React.useEffect(() => {
    if (step !== "challenge" || !challengeId) return;
    let cancelled = false;
    async function pollOnce() {
      if (cancelled || completedRef.current) return;
      try {
        const r = await fetch("/api/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "poll", challengeId, label }),
        });
        const data = await r.json();
        if (cancelled || completedRef.current) return;
        if (data.ok && data.accountId) {
          completedRef.current = true;
          setMobileStatus("approved");
          toast.success("Account added — approved on mobile");
          onDone();
          return;
        }
        if (data.error && /expired|not.found/i.test(String(data.error))) {
          setMobileStatus("expired");
          return; // stop polling
        }
        // pending — schedule next tick
        setTimeout(pollOnce, 3000);
      } catch {
        // Transient network error — retry slower
        if (!cancelled) setTimeout(pollOnce, 5000);
      }
    }
    // First poll after 2s (give LinkedIn a moment to deliver the push)
    const t = setTimeout(pollOnce, 2000);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [step, challengeId, label, onDone]);

  async function importCookies() {
    setBusy(true);
    try {
      const r = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "import", liAt, jsessionId: jsess, label }),
      });
      const data = await r.json();
      if (data.ok && data.accountId) {
        toast.success("Account imported");
        onDone();
      } else {
        toast.error(data.error || "Import failed");
      }
    } catch (err: any) {
      toast.error(err.message);
    }
    setBusy(false);
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">Add LinkedIn account</h2>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      {step === "form" ? (
        <>
          <div className="mb-4 flex gap-2 border-b">
            <button
              className={
                mode === "login"
                  ? "border-b-2 border-primary pb-2 text-sm font-medium"
                  : "pb-2 text-sm text-muted-foreground hover:text-foreground"
              }
              onClick={() => setMode("login")}
            >
              Email + password
            </button>
            <button
              className={
                mode === "import"
                  ? "border-b-2 border-primary pb-2 text-sm font-medium"
                  : "pb-2 text-sm text-muted-foreground hover:text-foreground"
              }
              onClick={() => setMode("import")}
            >
              Import cookies
            </button>
          </div>
          {mode === "login" ? (
            <div className="space-y-3">
              <Field id="email" label="LinkedIn email">
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field id="password" label="Password">
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <Field id="label" label="Label (optional)">
                <Input
                  id="label"
                  placeholder="e.g. Sales — John"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </Field>
              <Button onClick={login} disabled={busy || !email || !password}>
                {busy ? "Logging in…" : "Log in"}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <Field id="liAt" label="li_at cookie">
                <Input id="liAt" value={liAt} onChange={(e) => setLiAt(e.target.value)} />
              </Field>
              <Field id="jsess" label="JSESSIONID cookie">
                <Input id="jsess" value={jsess} onChange={(e) => setJsess(e.target.value)} />
              </Field>
              <Field id="ilabel" label="Label (optional)">
                <Input id="ilabel" value={label} onChange={(e) => setLabel(e.target.value)} />
              </Field>
              <Button onClick={importCookies} disabled={busy || !liAt || !jsess}>
                {busy ? "Importing…" : "Import"}
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            LinkedIn issued a verification challenge for <strong>{email}</strong>.
            Complete <em>either</em> path below — whichever you finish first will
            connect your account.
          </p>

          {/* Mobile app path */}
          <div className="rounded-md border bg-muted/40 p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                {mobileStatus === "approved" ? (
                  <span className="inline-block h-5 w-5 rounded-full bg-emerald-500 text-center text-xs leading-5 text-white">
                    ✓
                  </span>
                ) : mobileStatus === "expired" ? (
                  <span className="inline-block h-5 w-5 rounded-full bg-rose-500 text-center text-xs leading-5 text-white">
                    !
                  </span>
                ) : (
                  <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-primary" />
                )}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Approve on the LinkedIn mobile app</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {mobileStatus === "approved"
                    ? "Approved! Connecting your account…"
                    : mobileStatus === "expired"
                      ? "The challenge expired. Click Back and log in again."
                      : "Open LinkedIn on your phone — there should be a sign-in request notification. Tap “Yes, it’s me”. We’re polling for the result."}
                </p>
              </div>
            </div>
          </div>

          {/* PIN path */}
          <div className="rounded-md border bg-background p-4">
            <p className="mb-3 text-sm font-medium">Or enter the PIN we emailed you</p>
            <Field id="pin" label="6-digit PIN from LinkedIn email">
              <Input
                id="pin"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="123456"
                inputMode="numeric"
                autoComplete="one-time-code"
              />
            </Field>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep("form")}>
              Back
            </Button>
            <Button onClick={verify} disabled={busy || !pin}>
              {busy ? "Verifying…" : "Verify PIN"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
