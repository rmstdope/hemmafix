import { formatCoins } from "@/lib/coins";
import { levelFor } from "@/lib/levels";
import { MemberAvatar } from "../member-avatar";

/** Framsteg's level card: the member's level and title, how far through it they are, and what is left. */
export function LevelCard({ name, image, lifetimeCoins, frame }: { name: string; image: string | null; lifetimeCoins: number; frame?: string }) {
  const { level, title, start, next, progress } = levelFor(lifetimeCoins);
  const heading = `Nivå ${level} · ${title}`;
  const left = `${formatCoins(Math.max(0, lifetimeCoins) - start)} av ${formatCoins(next - start)} mynt till nivå ${level + 1}`;
  return (
    <section aria-label="Nivå" className="sky-box flex items-center gap-3 rounded-xl border p-3">
      <MemberAvatar name={name} image={image} size="lg" frame={frame} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{heading}</p>
        <div
          role="progressbar"
          aria-label="Framsteg till nästa nivå"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.floor(progress * 100)}
          aria-valuetext={left}
          className="my-1.5 h-2 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-amber-400" style={{ width: `${progress * 100}%` }} />
        </div>
        <p className="text-sm text-muted-foreground">{left}</p>
      </div>
    </section>
  );
}
