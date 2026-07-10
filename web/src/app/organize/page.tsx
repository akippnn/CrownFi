"use client";

import { useState, type FormEvent } from "react";
import { BarChart3, CheckCircle2, ClipboardCheck, Gem, ShieldCheck, TicketCheck, Vote } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SectionHeader,
  TextareaField,
  TextField,
} from "@/components/ui-kit";

const capabilities = [
  { icon: Vote, title: "Run voting", copy: "Open and close voting rounds with clear participant states." },
  { icon: TicketCheck, title: "Issue tickets", copy: "Sell verifiable digital passes and manage seat assignment." },
  { icon: Gem, title: "Fund contestants", copy: "Publish official portrait collectibles with transparent payments." },
  { icon: BarChart3, title: "Track activity", copy: "Review votes, tickets, collectibles, and participation statistics." },
];

export default function OrganizePage() {
  const [form, setForm] = useState({ orgName: "", contactName: "", email: "", pageantName: "", country: "", message: "" });
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const valid = Boolean(form.orgName && form.contactName && form.email && form.pageantName && form.country);

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setErr("");
    try {
      const response = await fetch("/api/organizer-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      if (response.ok) {
        setSent(true);
        return;
      }
      const data = await response.json().catch(() => ({}));
      setErr(data.error ?? "Something went wrong while submitting the application.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-10">
      <SectionHeader
        eyebrow="For pageant organizers"
        title="Bring your pageant to CrownFi"
        description="Apply to use CrownFi for voting, ticketing, contestant fundraising, and verifiable result publication. During the MVP, the CrownFi administration team reviews and configures each event with you."
      />

      <section aria-labelledby="organizer-capabilities">
        <h2 id="organizer-capabilities" className="sr-only">Organizer capabilities</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {capabilities.map(({ icon: Icon, title, copy }) => (
            <Card key={title} className="h-full">
              <CardContent className="pt-5">
                <span className="grid h-10 w-10 place-items-center rounded-2xl border border-gold/20 bg-gold/10 text-gold">
                  <Icon size={20} />
                </span>
                <h3 className="mt-4 font-display text-lg font-semibold text-white">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-gold-soft/50">{copy}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(260px,0.75fr)_minmax(0,1.25fr)]">
        <Card className="h-fit">
          <CardHeader>
            <Badge tone="gold" className="w-fit">MVP onboarding flow</Badge>
            <CardTitle>What happens next</CardTitle>
            <CardDescription>Applications are reviewed by CrownFi administrators before event setup begins.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-5">
              {[
                ["Submit your event", "Tell us who is organizing the pageant and what support you need."],
                ["CrownFi reviews it", "An administrator approves or rejects the request from the administration console."],
                ["Configure together", "The MVP does not create an organizer dashboard automatically; our team prepares the event with you."],
                ["Publish and prove", "Voting, ticketing, collectibles, and final blockchain checkpoints go live."],
              ].map(([title, copy], index) => (
                <li key={title} className="flex gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-gold/25 bg-gold/10 text-sm font-semibold text-gold">{index + 1}</span>
                  <div>
                    <div className="text-sm font-semibold text-white">{title}</div>
                    <p className="mt-1 text-sm leading-6 text-gold-soft/45">{copy}</p>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        {sent ? (
          <Card className="border-emerald/30">
            <CardContent className="flex min-h-[430px] flex-col items-center justify-center px-6 py-12 text-center">
              <span className="grid h-16 w-16 place-items-center rounded-full border border-emerald/30 bg-emerald/10 text-emerald">
                <CheckCircle2 size={30} />
              </span>
              <Badge tone="success" className="mt-5">Pending review</Badge>
              <h2 className="mt-4 font-display text-3xl font-semibold text-white">Application submitted</h2>
              <p className="mt-3 max-w-md text-sm leading-6 text-gold-soft/55">
                CrownFi received the application for <strong className="text-gold-soft">{form.pageantName}</strong>. The team will contact {form.email} after reviewing the event details.
              </p>
              <div className="mt-6 flex items-center gap-2 rounded-2xl border border-line bg-black/25 px-4 py-3 text-left text-sm text-gold-soft/55">
                <ClipboardCheck className="shrink-0 text-gold" size={20} />
                No organizer dashboard has been created yet. Approval is handled by a CrownFi administrator during the MVP.
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ShieldCheck className="text-gold" size={20} />
                <Badge tone="gold">Organizer application</Badge>
              </div>
              <CardTitle>Tell us about your pageant</CardTitle>
              <CardDescription>Required fields help the team validate the organizer and understand the event scope.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-7" onSubmit={submit}>
                <fieldset className="space-y-4">
                  <legend className="mb-3 font-display text-lg font-semibold text-white">Organization</legend>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField id="organizer-org" label="Organization" value={form.orgName} onChange={set("orgName")} placeholder="Miss Universe Philippines" required />
                    <TextField id="organizer-country" label="Country" value={form.country} onChange={set("country")} placeholder="Philippines" required />
                  </div>
                </fieldset>

                <fieldset className="space-y-4 border-t border-line pt-6">
                  <legend className="mb-3 font-display text-lg font-semibold text-white">Pageant details</legend>
                  <TextField id="organizer-pageant" label="Pageant name" value={form.pageantName} onChange={set("pageantName")} placeholder="Coronation Night 2026" required />
                  <TextareaField
                    id="organizer-message"
                    label="Event details"
                    helper="Optional: include expected scale, dates, location, and the CrownFi features you need."
                    value={form.message}
                    onChange={set("message")}
                    placeholder="We expect 2,000 attendees and need voting, ticketing, and contestant collectibles…"
                  />
                </fieldset>

                <fieldset className="space-y-4 border-t border-line pt-6">
                  <legend className="mb-3 font-display text-lg font-semibold text-white">Primary contact</legend>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField id="organizer-contact" label="Contact name" value={form.contactName} onChange={set("contactName")} placeholder="Your name" required />
                    <TextField id="organizer-email" label="Email" type="email" value={form.email} onChange={set("email")} placeholder="you@organization.com" required />
                  </div>
                </fieldset>

                {err && <p role="alert" className="rounded-2xl border border-ruby/30 bg-ruby/10 px-4 py-3 text-sm text-ruby">{err}</p>}

                <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
                  <Button type="submit" disabled={busy || !valid}>
                    {busy ? "Submitting application…" : "Submit organizer application"}
                  </Button>
                  <p className="text-xs leading-5 text-gold-soft/40">Submitting does not immediately grant organizer access.</p>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
