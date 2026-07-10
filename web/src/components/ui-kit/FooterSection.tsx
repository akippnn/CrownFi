import Link from "next/link";
import { Button } from "./Button";
import * as Lucide from "lucide-react";

type FooterSectionProps = {
  logoSrc: string;
  brandName: string;
  tagline: string;
  links: Array<{ label: string; href: string }>;
  socials?: Array<{ iconName: "Twitter" | "Instagram" | "Send" | "Disc"; href: string }>;
  newsletterPlaceholder?: string;
  onSubscribe?: (email: string) => void;
};

export function FooterSection({
  logoSrc,
  brandName,
  tagline,
  links,
  socials = [
    { iconName: "Twitter", href: "#" },
    { iconName: "Disc", href: "#" },
    { iconName: "Instagram", href: "#" },
    { iconName: "Send", href: "#" },
  ],
  newsletterPlaceholder = "Enter your email",
  onSubscribe
}: FooterSectionProps) {
  return (
    <div className="pt-8">
      <footer className="border border-gold/15 bg-white/95 dark:bg-black/95 pt-16 pb-8 px-6 sm:px-10 rounded-3xl overflow-hidden relative shadow-[0_-15px_40px_rgba(0,0,0,0.04)] dark:shadow-[0_-15px_40px_rgba(0,0,0,0.8)]">
        {/* Abstract golden ribbon wave background */}
        <div 
          className="absolute inset-0 bg-cover bg-bottom opacity-[0.08] dark:opacity-15 mix-blend-multiply dark:mix-blend-screen pointer-events-none"
          style={{ backgroundImage: "url('/assets/backgrounds/gold-ribbon_wave_footer-abstract.webp')" }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,rgba(212,175,55,0.06)_0%,transparent_60%)] dark:bg-[radial-gradient(circle_at_bottom,rgba(212,175,55,0.12)_0%,transparent_60%)] pointer-events-none" />
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-10 relative z-10">
          {/* Logo / Brand */}
          <div className="space-y-4 text-left">
            <div className="flex items-center gap-2">
              <img src={logoSrc} alt={`${brandName} Logo`} className="h-6 w-6 object-contain" />
              <span className="font-display text-xl font-semibold tracking-wide text-gold">{brandName}</span>
            </div>
            <p className="text-[11px] leading-5 text-ink/70 dark:text-gold-soft/45">
              {tagline}
            </p>
            <div className="text-[10px] text-ink/50 dark:text-gold-soft/30 mt-4">
              © {new Date().getFullYear()} {brandName}. All rights reserved.
            </div>
          </div>

          {/* Quick Links */}
          <div className="text-left">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gold mb-4 font-display">Quick Links</h4>
            <ul className="space-y-2.5 text-[11px]">
              {links.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="text-ink/70 dark:text-gold-soft/60 hover:text-gold dark:hover:text-gold transition-colors duration-150">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Follow Us */}
          <div className="text-left">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gold mb-4 font-display">Follow Us</h4>
            <div className="flex gap-4">
              {socials.map((s, idx) => {
                let IconComp = Lucide.Twitter;
                if (s.iconName === "Disc") IconComp = Lucide.Disc;
                if (s.iconName === "Instagram") IconComp = Lucide.Instagram;
                if (s.iconName === "Send") IconComp = Lucide.Send;
                
                return (
                  <a key={idx} href={s.href} className="h-8 w-8 rounded-full border border-gold/25 flex items-center justify-center text-ink/60 hover:text-ink dark:text-gold-soft/60 dark:hover:text-white hover:border-gold hover:bg-gold/15 hover:scale-105 active:scale-95 transition-all duration-150 bg-white/40 dark:bg-black/40 shadow-inner">
                    <IconComp size={14} />
                  </a>
                );
              })}
            </div>
          </div>

          {/* Newsletter */}
          <div className="space-y-4 text-left">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gold font-display">Newsletter</h4>
            <p className="text-[11px] text-ink/75 dark:text-gold-soft/50 leading-relaxed">
              Stay updated with our latest news and events.
            </p>
            <form onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const input = form.elements.namedItem("email") as HTMLInputElement;
              if (onSubscribe && input?.value) {
                onSubscribe(input.value);
                input.value = "";
              }
            }} className="flex flex-col gap-2">
              <input
                type="email"
                name="email"
                required
                placeholder={newsletterPlaceholder}
                className="w-full rounded-full border border-gold/20 bg-white/60 dark:bg-black/60 px-4 py-2 text-xs text-ink dark:text-white placeholder-ink/40 dark:placeholder-gold-soft/30 outline-none focus:border-gold"
              />
              <Button variant="primary" size="sm" type="submit" className="w-full uppercase tracking-wider font-bold">
                Subscribe
              </Button>
            </form>
          </div>
        </div>

        <div className="border-t border-gold/10 pt-4 flex flex-col md:flex-row justify-between text-[9px] text-ink/40 dark:text-gold-soft/30 gap-2">
          <div>
            Platform secured via Stellar onchain verification tallies.
          </div>
          <div className="flex gap-4">
            <a href="#" className="hover:underline">Privacy Policy</a>
            <span>|</span>
            <a href="#" className="hover:underline">Terms of Service</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
