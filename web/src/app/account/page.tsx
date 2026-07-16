"use client";

import { Link2, LogOut, ShieldCheck, UserRound, Wallet } from "lucide-react";
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
} from "@/components/ui-kit";
import { useSession } from "@/session/SessionProvider";

function short(address: string) {
  return `${address.slice(0, 7)}…${address.slice(-7)}`;
}

export default function AccountPage() {
  const {
    account,
    address,
    connect,
    linkWallet,
    disconnect,
    connecting,
    stellarNetwork,
    error,
    ready,
  } = useSession();

  if (!ready) {
    return <EmptyState title="Loading your account" description="Checking the active session and linked wallets…" />;
  }

  if (!account) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="border-gold/25">
          <CardContent className="flex flex-col items-center px-6 py-10 text-center sm:px-10 sm:py-14">
            <span className="grid h-14 w-14 place-items-center rounded-2xl border border-gold/20 bg-gold/10 text-gold">
              <UserRound size={25} />
            </span>
            <h1 className="mt-5 text-balance font-display text-3xl font-semibold text-white">Your CrownFi account</h1>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-gold-soft/55">
              Sign in by proving ownership of a Freighter wallet. CrownFi creates one persistent account that may hold multiple linked wallets and organization roles.
            </p>
            <Button onClick={connect} disabled={connecting} className="mt-6 w-full sm:w-auto">
              {connecting ? "Waiting for Freighter…" : "Sign in with Freighter"}
            </Button>
            {error && <Notice tone="danger" className="mt-5 w-full text-left">{error}</Notice>}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 sm:space-y-6">
      <PageHeader
        eyebrow="Identity & access"
        title={account.display_name}
        description="Review the account, verified wallets, and organization access that CrownFi uses for server-side authorization."
        meta={
          <>
            <Badge tone="success"><ShieldCheck size={13} /> Wallet-authenticated</Badge>
            <Badge tone="neutral">Stellar {stellarNetwork === "public" ? "Mainnet" : "Testnet"}</Badge>
            <Badge tone="gold">{account.site_role || "Public user"}</Badge>
          </>
        }
      />

      {error && <Notice tone="danger">{error}</Notice>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(260px,0.7fr)]">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle>Linked wallets</CardTitle>
              <CardDescription>A wallet can belong to only one CrownFi account per Stellar network. Linking requires a fresh signed message.</CardDescription>
            </div>
            <Button size="sm" variant="secondary" onClick={linkWallet} disabled={connecting} className="hidden shrink-0 sm:inline-flex">
              <Link2 size={16} /> {connecting ? "Waiting…" : "Link wallet"}
            </Button>
          </CardHeader>
          <CardContent>
            <Button size="sm" variant="secondary" onClick={linkWallet} disabled={connecting} className="mb-4 w-full sm:hidden">
              <Link2 size={16} /> {connecting ? "Waiting for Freighter…" : "Link another wallet"}
            </Button>
            <div className="grid gap-3">
              {account.wallets.map((wallet) => (
                <div key={wallet.id} className="rounded-2xl border border-line bg-black/25 p-4">
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-gold/20 bg-gold/10 text-gold">
                      <Wallet size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-sm text-white" title={wallet.address}>{short(wallet.address)}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.14em] text-gold-soft/40">{wallet.network}</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {wallet.address === address && <Badge tone="success">Current</Badge>}
                        {wallet.is_primary && <Badge tone="gold">Primary</Badge>}
                        {wallet.verified_at && <Badge tone="neutral">Verified</Badge>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Account details</CardTitle>
              <CardDescription>Stable identity shared by linked wallets.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-[0.14em] text-gold-soft/35">Account ID</dt>
                  <dd className="mt-1 break-all font-mono text-xs text-gold-soft/65">{account.id}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.14em] text-gold-soft/35">Site role</dt>
                  <dd className="mt-1 font-semibold capitalize text-white">{account.site_role || "Public user"}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Organization roles</CardTitle>
              <CardDescription>Roles grant access only inside the named organization.</CardDescription>
            </CardHeader>
            <CardContent>
              {account.organization_roles.length === 0 ? (
                <p className="text-sm leading-6 text-gold-soft/50">No organizer memberships.</p>
              ) : (
                <div className="grid gap-3">
                  {account.organization_roles.map((membership) => (
                    <div key={membership.organization_id} className="rounded-2xl border border-line bg-black/25 p-3">
                      <div className="font-semibold text-white">{membership.organization_name}</div>
                      <Badge tone="gold" className="mt-2 capitalize">{membership.role === "editor" ? "organizer" : membership.role}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex justify-end border-t border-line pt-5">
        <Button variant="danger" onClick={disconnect} className="w-full sm:w-auto">
          <LogOut size={16} /> Sign out of CrownFi
        </Button>
      </div>
    </div>
  );
}
