import { comparisonLine, type WeekCounts } from "@/lib/weeks";
import { WeekTable } from "./week-table";

/** "Den här veckan": this week against last, with one line that cheers and never scolds. */
export function WeekCard({ now, before }: { now: WeekCounts; before: WeekCounts }) {
  return (
    <section aria-labelledby="week-card-title" className="mb-3 rounded-xl border p-3">
      <h2 id="week-card-title" className="mb-1 font-semibold">
        Den här veckan
      </h2>
      <WeekTable now={now} before={before} labels={["Nu", "Förra"]} />
      <p className="mt-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">{comparisonLine(now, before, "förra veckan")}</p>
    </section>
  );
}
