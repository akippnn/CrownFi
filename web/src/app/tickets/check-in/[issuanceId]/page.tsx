"use client";

import { useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { CheckCircle2, ScanLine, ShieldAlert } from "lucide-react";
import { postJson } from "@/lib/api";
import { useSession } from "@/session/SessionProvider";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardContent,
  EmptyState,
  Field,
  PageSection,
  SectionHeader,
} from "@/components/ui-kit";

type CheckInRecord = {
  id: string;
  ticket_issuance_id: string;
  ticket_event_id: string;
  checked_in_by_user_id: string;
  device_reference?: string | null;
  checked_in_at: string;
  metadata: Record<string, unknown>;
};

export default function TicketCheckInPage() {
  const params = useParams<{ issuanceId: string }>();
  const searchParams = useSearchParams();
  const { fan, ready, connecting, connect } = useSession();
  const issuanceId = params.issuanceId;
  const initialNonce = useMemo(() => searchParams.get("nonce")?.trim() ?? "", [searchParams]);
  const [nonce, setNonce] = useState(initialNonce);
  const [deviceReference, setDeviceReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckInRecord | null>(null);
  const [error, setError] = useState("");

  async function checkIn() {
    if (!nonce.trim()) return;
    setBusy(true);
    setError("");
    const response = await postJson<CheckInRecord & { error?: string }>(
      `/api/ticketing/issuances/${encodeURIComponent(issuanceId)}/check-in`,
      {
        nonce: nonce.trim(),
        deviceReference: deviceReference.trim() || null,
        metadata: {
          source: "operator_check_in_page",
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        },
      },
    );
    const payload = response.data as CheckInRecord & { error?: string };
    if (response.ok) {
      setResult(payload);
    } else if (payload.error === "ticket_already_checked_in" || payload.error === "ticket_check_in_replay") {
      setError("Replay rejected: this ticket already has a valid check-in record.");
    } else if (payload.error === "forbidden") {
      setError("Your current role is not authorized to check in tickets for this organization.");
    } else if (payload.error === "ticket_not_issued") {
      setError("This ticket has no accepted ownership evidence and cannot be checked in.");
    } else {
      setError(`Check-in failed${payload.error ? `: ${payload.error}` : "."}`);
    }
    setBusy(false);
  }

  if (!ready) {
    return (
      <PageSection className="max-w-2xl py-12">
        <EmptyState title="Preparing operator session" description="Loading your authorized CrownFi account." />
      </PageSection>
    );
  }

  return (
    <PageSection className="max-w-2xl space-y-8 px-0 py-0">
      <SectionHeader
        eyebrow="Venue operations"
        title="Replay-resistant ticket check-in"
        description="A valid issued ticket may be checked in once. CrownFi authorizes the operator server-side and preserves the first successful record even when the same QR or nonce is replayed."
        trailing={<Badge tone="gold">Issuance {issuanceId.slice(0, 8)}…</Badge>}
      />

      {!fan ? (
        <Card>
          <CardContent className="pt-5">
            <EmptyState
              title="Connect your operator account"
              description="The check-in endpoint requires an active organization or site-administrator role."
              action={<Button onClick={() => void connect()} loading={connecting}>Connect account</Button>}
            />
          </CardContent>
        </Card>
      ) : result ? (
        <Card className="border-emerald/30 bg-emerald/5">
          <CardContent className="space-y-5 pt-6">
            <div className="flex items-start gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-emerald/15 text-emerald"><CheckCircle2 size={25} /></span>
              <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald">Check-in accepted</p><h1 className="mt-1 font-display text-3xl font-semibold text-white">Admit attendee</h1></div>
            </div>
            <dl className="divide-y divide-line rounded-2xl border border-line bg-black/20 text-sm">
              <div className="grid gap-1 p-4 sm:grid-cols-[10rem_1fr]"><dt className="text-gold-soft/40">Check-in ID</dt><dd className="break-all font-mono text-gold-soft">{result.id}</dd></div>
              <div className="grid gap-1 p-4 sm:grid-cols-[10rem_1fr]"><dt className="text-gold-soft/40">Event</dt><dd className="break-all font-mono text-gold-soft">{result.ticket_event_id}</dd></div>
              <div className="grid gap-1 p-4 sm:grid-cols-[10rem_1fr]"><dt className="text-gold-soft/40">Accepted at</dt><dd className="text-gold-soft">{new Date(result.checked_in_at).toLocaleString()}</dd></div>
              <div className="grid gap-1 p-4 sm:grid-cols-[10rem_1fr]"><dt className="text-gold-soft/40">Device</dt><dd className="text-gold-soft">{result.device_reference || "Not supplied"}</dd></div>
            </dl>
            <ButtonLink href="/tickets" variant="secondary">Return to ticket operations</ButtonLink>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-5 pt-6">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl border border-gold/20 bg-gold/10 text-gold"><ScanLine size={21} /></span>
              <div><h2 className="font-display text-2xl font-semibold text-white">Confirm scanned ticket</h2><p className="mt-1 text-sm leading-6 text-gold-soft/45">Use the nonce encoded in the organizer-issued QR. The database stores only its hash.</p></div>
            </div>
            <Field label="Check-in nonce" htmlFor="check-in-nonce">
              <input id="check-in-nonce" value={nonce} onChange={(event) => setNonce(event.target.value)} autoComplete="off" className="min-h-11 w-full rounded-xl border border-line bg-black/30 px-3 font-mono text-sm text-white" />
            </Field>
            <Field label="Device reference" hint="Optional operator scanner or gate label" htmlFor="device-reference">
              <input id="device-reference" value={deviceReference} onChange={(event) => setDeviceReference(event.target.value)} className="min-h-11 w-full rounded-xl border border-line bg-black/30 px-3 text-sm text-white" placeholder="Gate A · Scanner 2" />
            </Field>
            {error && <div className="flex gap-3 rounded-2xl border border-ruby/30 bg-ruby/10 p-4 text-sm leading-6 text-ruby"><ShieldAlert className="mt-0.5 shrink-0" size={18} />{error}</div>}
            <Button onClick={() => void checkIn()} loading={busy} disabled={!nonce.trim()} className="w-full">Accept first check-in</Button>
          </CardContent>
        </Card>
      )}
    </PageSection>
  );
}
