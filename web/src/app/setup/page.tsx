"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Cloud, Crown, LockKeyhole, ShieldCheck, Wallet } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Notice,
  PageHeader,
  TextField,
} from "@/components/ui-kit";
import { useSession } from "@/session/SessionProvider";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function SetupPage() {
  const router = useRouter();
  const {
    account,
    address,
    connect,
    connecting,
    error: walletError,
    ready,
    setupRequired,
    refresh,
  } = useSession();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    bootstrapToken: "",
    displayName: "",
    email: "",
    siteName: "CrownFi",
    organizationName: "",
    organizationSlug: "",
  });

  useEffect(() => {
    if (account && !form.displayName) {
      setForm((current) => ({
        ...current,
        displayName: account.display_name || "",
        email: account.email || "",
      }));
    }
  }, [account, form.displayName]);

  useEffect(() => {
    if (ready && !setupRequired) router.replace("/manage");
  }, [ready, setupRequired, router]);

  const completedSteps = useMemo(
    () => [Boolean(account), Boolean(form.bootstrapToken && form.displayName), Boolean(form.organizationName && form.organizationSlug)],
    [account, form.bootstrapToken, form.displayName, form.organizationName, form.organizationSlug],
  );

  function setField(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!account) {
      setMessage("Connect and authorize a Freighter account before completing setup.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/setup/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bootstrapToken: form.bootstrapToken,
          displayName: form.displayName,
          email: form.email,
          siteName: form.siteName,
          organizationName: form.organizationName,
          organizationSlug: form.organizationSlug,
          stellarNetwork: "testnet",
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data.error || "Setup could not be completed.");
        return;
      }
      await refresh();
      router.replace("/manage");
    } catch {
      setMessage("CrownFi could not reach the setup service.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !setupRequired) {
    return <EmptyState title="Loading CrownFi setup" description="Checking whether first-administrator setup is still required…" />;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 sm:space-y-6">
      <PageHeader
        eyebrow="First-run setup"
        title="Initialize CrownFi safely"
        description="Authorize the first administrator, create the initial organization, and keep deployment integrations outside the browser setup flow."
        meta={
          <>
            <Badge tone="gold">Stellar Testnet</Badge>
            <Badge tone="neutral">Mainnet disabled</Badge>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["1", "Verify wallet", completedSteps[0]],
          ["2", "Administrator", completedSteps[1]],
          ["3", "Organization", completedSteps[2]],
        ].map(([number, label, complete]) => (
          <div key={String(number)} className={`flex items-center gap-3 rounded-2xl border p-3 ${complete ? "border-emerald/30 bg-emerald/10" : "border-line bg-black/25"}`}>
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-bold ${complete ? "bg-emerald text-black" : "bg-gold/10 text-gold"}`}>
              {complete ? <CheckCircle2 size={18} /> : number}
            </span>
            <span className="text-sm font-semibold text-white">{label}</span>
          </div>
        ))}
      </div>

      <Notice tone="info" title="Protected integration boundary">
        Cloudflare R2 credentials are provisioned as deployment or Arcturus host secrets, not entered into this browser form. After rotation, new uploads automatically use the active server-side configuration.
      </Notice>

      <form onSubmit={submit} className="space-y-5">
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-gold/20 bg-gold/10 text-gold"><Wallet size={19} /></span>
              <div>
                <CardTitle>1. Verify the administrator wallet</CardTitle>
                <CardDescription>CrownFi requests only a signed message and public address. Never enter a private key or seed phrase.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!account ? (
              <Button type="button" onClick={connect} disabled={connecting} className="w-full sm:w-auto">
                {connecting ? "Waiting for Freighter…" : "Connect and authorize Freighter"}
              </Button>
            ) : (
              <Notice tone="success" title="Wallet ownership verified">
                <span className="break-all font-mono text-xs">{address}</span>
              </Notice>
            )}
            {walletError && <Notice tone="danger" className="mt-4">{walletError}</Notice>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-gold/20 bg-gold/10 text-gold"><LockKeyhole size={19} /></span>
              <div>
                <CardTitle>2. Create the site administrator</CardTitle>
                <CardDescription>The one-time bootstrap token comes from protected deployment configuration.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <TextField id="setup-display-name" label="Display name" value={form.displayName} onChange={(event) => setField("displayName", event.target.value)} required />
            <TextField id="setup-email" label="Email (optional)" type="email" value={form.email} onChange={(event) => setField("email", event.target.value)} />
            <TextField id="setup-site-name" label="Site name" value={form.siteName} onChange={(event) => setField("siteName", event.target.value)} required />
            <TextField id="setup-bootstrap-token" label="Bootstrap token" type="password" value={form.bootstrapToken} onChange={(event) => setField("bootstrapToken", event.target.value)} required autoComplete="off" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-gold/20 bg-gold/10 text-gold"><Crown size={19} /></span>
              <div>
                <CardTitle>3. Create the initial organization</CardTitle>
                <CardDescription>The first administrator becomes the initial organization owner.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <TextField
              id="setup-organization-name"
              label="Organization name"
              value={form.organizationName}
              onChange={(event) => {
                const value = event.target.value;
                setForm((current) => ({
                  ...current,
                  organizationName: value,
                  organizationSlug: current.organizationSlug || slugify(value),
                }));
              }}
              required
            />
            <TextField id="setup-organization-slug" label="Organization slug" value={form.organizationSlug} onChange={(event) => setField("organizationSlug", slugify(event.target.value))} required />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-gold/20 bg-gold/10 text-gold"><Cloud size={19} /></span>
              <div>
                <CardTitle>Deployment integrations</CardTitle>
                <CardDescription>R2, RPC, and future provider credentials stay server-side. Setup records no secret values in the browser.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              <Notice tone="gold" title="Cloudflare R2">Configured and rotated through reviewed deployment configuration. Browser uploads receive short-lived presigned requests only.</Notice>
              <Notice tone="success" title="Stellar Testnet"><ShieldCheck className="mr-1 inline" size={16} /> Enabled for hackathon acceptance. Mainnet remains fail-closed.</Notice>
            </div>
          </CardContent>
        </Card>

        {message && <Notice tone="danger">{message}</Notice>}

        <div className="sticky bottom-20 z-20 rounded-2xl border border-line bg-black/90 p-3 backdrop-blur-xl md:static md:border-0 md:bg-transparent md:p-0">
          <Button type="submit" disabled={busy || !account} size="lg" className="w-full">
            {busy ? "Initializing CrownFi…" : "Complete first-administrator setup"}
          </Button>
        </div>
      </form>
    </div>
  );
}
