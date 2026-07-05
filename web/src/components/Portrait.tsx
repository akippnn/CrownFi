import { flag, gradientFromId, initials } from "@/lib/format";

export function Portrait({ id, name, sash, size = "lg" }: { id: string; name: string; sash: string; size?: "sm" | "lg" }) {
  const dim = size === "lg" ? "aspect-[4/5]" : "aspect-square";
  return (
    <div className={`relative ${dim} w-full overflow-hidden rounded-2xl`} style={{ background: gradientFromId(id) }}>
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-10%,rgba(212,175,55,0.28),transparent_55%)]" />
      <div className="absolute left-3 top-3 rounded-full bg-black/30 px-2 py-1 text-lg leading-none backdrop-blur">{flag(sash)}</div>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-display text-5xl font-semibold text-[#2a2d3a] drop-shadow">{initials(name)}</span>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/55 to-transparent" />
    </div>
  );
}
