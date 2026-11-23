import { streakCard } from "@/lib/streak";

/** Framsteg's streak card: a flame and where the streak stands. */
export function StreakCard({ run }: { run: number }) {
  const { title, hint } = streakCard(run);
  return (
    <section className="flex items-center gap-3 rounded-xl border bg-card p-3">
      <span aria-hidden className="text-2xl">
        🔥
      </span>
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
    </section>
  );
}
