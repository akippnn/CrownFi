import "./globals.css";
import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { SessionProvider } from "@/session/SessionProvider";
import { AppShell } from "@/components/AppShell";

// Display: Fraunces — a high-contrast "old style" serif with soft, editorial character.
// Body: Manrope — a modern geometric sans that stays crisp at small sizes.
const display = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-display",
});
const body = Manrope({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "CrownFi - Crown your queen, on-chain",
  description: "Blockchain-powered voting, ticketing, and fan experience for pageants, built on Stellar.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="font-sans antialiased">
        <SessionProvider>
          <AppShell>{children}</AppShell>
        </SessionProvider>
      </body>
    </html>
  );
}
