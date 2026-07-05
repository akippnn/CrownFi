// Central icon set. Replaces emoji used as structural icons (skill rule: no emoji as icons).
// Install first:  npm i lucide-react
import { Vote, ShieldCheck, Ticket, Gem, User, Crown, Lock, Menu, ChevronLeft, ChevronRight, Wallet, Check, X } from "lucide-react";

export const Icons = {
  Vote,            // was ♛ (tab: Vote)
  Verify: ShieldCheck, // was ✓ (tab: Verify)
  Tickets: Ticket, // was 🎟 (tab: Tickets)
  Collect: Gem,    // was ◈ (tab: Collect)
  Me: User,        // was ☺ (tab: Me)
  Crown,           // was ♛ (brand mark)
  Lock,            // was 🔒 (admin locked panel)
  Menu,            // hamburger
  Wallet,          // Freighter connect
  Check,
  X,
  Prev: ChevronLeft,
  Next: ChevronRight,
};

// Usage: <Icons.Vote size={20} strokeWidth={1.75} />
