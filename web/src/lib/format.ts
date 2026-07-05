// Country code (e.g. "PH") -> flag emoji.
export function flag(cc: string): string {
  if (!cc || cc.length !== 2) return "🏳️";
  const base = 0x1f1e6;
  return String.fromCodePoint(
    base + (cc.toUpperCase().charCodeAt(0) - 65),
    base + (cc.toUpperCase().charCodeAt(1) - 65)
  );
}

// Deterministic gold-tinted gradient per id, for portrait tiles (no image assets needed).
export function gradientFromId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  const a = h;
  const b = (h + 40) % 360;
  return `linear-gradient(140deg, hsl(${a} 45% 22%), hsl(${b} 55% 12%))`;
}

export function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

export function short(hash?: string | null, n = 8): string {
  if (!hash) return "-";
  return hash.length <= n * 2 ? hash : `${hash.slice(0, n)}...${hash.slice(-4)}`;
}
