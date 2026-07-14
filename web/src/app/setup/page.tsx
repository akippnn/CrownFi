"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Cloud, Crown, LockKeyhole, ShieldCheck, Wallet } from "lucide-react";
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
    stellarNetwork: "testnet",
    r2Endpoint: "",
    r2Bucket: "",
    r2AccessKeyId: "",
    r2SecretAccessKey: "",
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
          r2: {
            endpoint: form.r2Endpoint,
            bucket: form.r2Bucket,
            accessKeyId: form.r2AccessKeyId,
            secretAccessKey: form.r2SecretAccessKey,
          },
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
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-gold/20 bg-black/40 p-10 text-center text-gold-soft/60">
        Loading CrownFi setup…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-gold/25 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.2),transparent_48%),rgba(7,7,9,0.96)] p-7 sm:p-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-gold/25 bg-gold/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-gold-soft">
              <Crown size={14} /> First-run setup
            </div>
            <h1 className="mt-5 font-display text-4xl font-semibold text-white">
              Initialize CrownFi without editing SQL or hidden environment allowlists.
            </h1>
            <p className="mt-4 text-sm leading-7 text-gold-soft/60">
              Authorize the first administrator wallet, create the initial organization, choose the Stellar network, and optionally save integration configuration.
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-xs leading-5 text-emerald-100/80">
            <ShieldCheck className="mb-2" size={20} />
            CrownFi requests only signed messages and public wallet addresses. Never enter a seed phrase or private key.
          </div>
        </div>
      </section>

      <form onSubmit={submit} className="space-y-6">
        <section className="rounded-3xl border border-line bg-black/35 p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-gold/10 text-gold"><Wallet size={19} /></span>
            <div>
              <h2 className="font-display text-2xl font-semibold text-white">Administrator identity</h2>
              <p className="text-sm text-gold-soft/50">One CrownFi account may link multiple verified wallets.</p>
            </div>
          </div>

          {!account ? (
            <button
              type="button"
              onClick={connect}
              disabled={connecting}
              className="mt-6 rounded-xl bg-gold px-5 py-3 text-sm font-bold text-black transition hover:brightness-110 disabled:opacity-60"
            >
              {connecting ? "Waiting for Freighter…" : "Connect and authorize Freighter"}
            </button>
          ) : (
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
              <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-300" size={18} />
              <div>
                <div className="font-semibold text-emerald-100">Wallet ownership verified</div>
                <div className="mt-1 break-all font-mono text-xs text-emerald-100/60">{address}</div>
              </div>
            </div>
          )}
          {walletError && <p className="mt-3 text-sm text-red-300">{walletError}</p>}

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field label="Display name" value={form.displayName} onChange={(value) => setField("displayName", value)} required />
            <Field label="Email (optional)" type="email" value={form.email} onChange={(value) => setField("email", value)} />
          </div>
        </section>

        <section className="rounded-3xl border border-line bg-black/35 p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-gold/10 text-gold"><LockKeyhole size={19} /></span>
            <div>
              <h2 className="font-display text-2xl font-semibold text-white">Site and organization</h2>
              <p className="text-sm text-gold-soft/50">The bootstrap token is read from the deployment’s protected setup configuration.</p>
            </div>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field label="Site name" value={form.siteName} onChange={(value) => setField("siteName", value)} required />
            <Field label="Bootstrap token" type="password" value={form.bootstrapToken} onChange={(value) => setField("bootstrapToken", value)} required autoComplete="off" />
            <Field
              label="Organization name"
              value={form.organizationName}
              onChange={(value) => {
                setField("organizationName", value);
                if (!form.organizationSlug) setField("organizationSlug", slugify(value));
              }}
              required
            />
            <Field label="Organization slug" value={form.organizationSlug} onChange={(value) => setField("organizationSlug", slugify(value))} required />
          </div>
        </section>

        <section className="rounded-3xl border border-line bg-black/35 p-6 sm:p-8">
          <h2 className="font-display text-2xl font-semibold text-white">Stellar network</h2>
          <p className="mt-2 text-sm text-gold-soft/50">Network selection is stored as site configuration. Mainnet remains double-gated in code and deployment configuration.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="rounded-2xl border border-gold/40 bg-gold/10 p-4">
              <input type="radio" checked readOnly className="mr-3 accent-[#d4af37]" />
              <span className="font-semibold text-white">Stellar Testnet</span>
              <span className="mt-1 block pl-6 text-xs text-gold-soft/55">Enabled for hackathon testing and browser acceptance.</span>
            </label>
            <label className="cursor-not-allowed rounded-2xl border border-line bg-white/[0.02] p-4 opacity-45">
              <input type="radio" disabled className="mr-3" />
              <span className="font-semibold text-white">Stellar Mainnet</span>
              <span className="mt-1 block pl-6 text-xs text-gold-soft/55">Unavailable until a future production-readiness gate is explicitly enabled.</span>
            </label>
          </div>
        </section>

        <details className="rounded-3xl border border-line bg-black/35 p-6 sm:p-8">
          <summary className="flex cursor-pointer list-none items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-gold/10 text-gold"><Cloud size={19} /></span>
            <div>
              <h2 className="font-display text-2xl font-semibold text-white">Optional Cloudflare R2 configuration</h2>
              <p className="text-sm text-gold-soft/50">Saved as protected configuration. Provider validation remains a separate acceptance step.</p>
            </div>
          </summary>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field label="S3 endpoint" value={form.r2Endpoint} onChange={(value) => setField("r2Endpoint", value)} />
            <Field label="Bucket" value={form.r2Bucket} onChange={(value) => setField("r2Bucket", value)} />
            <Field label="Access key ID" value={form.r2AccessKeyId} onChange={(value) => setField("r2AccessKeyId", value)} autoComplete="off" />
            <Field label="Secret access key" type="password" value={form.r2SecretAccessKey} onChange={(value) => setField("r2SecretAccessKey", value)} autoComplete="off" />
          </div>
        </details>

        {message && <div className="rounded-2xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-200">{message}</div>}

        <button
          type="submit"
          disabled={busy || !account}
          className="w-full rounded-2xl bg-gold px-6 py-4 text-sm font-bold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy ? "Initializing CrownFi…" : "Complete first-administrator setup"}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <label className="grid gap-2 text-sm text-gold-soft/70">
      <span className="font-medium">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        autoComplete={autoComplete}
        className="rounded-xl border border-line bg-black/50 px-3 py-2.5 text-white outline-none transition placeholder:text-gold-soft/25 focus:border-gold/60"
      />
    </label>
  );
}
