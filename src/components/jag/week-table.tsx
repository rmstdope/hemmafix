import type { WeekCounts } from "@/lib/weeks";

/** The two weeks side by side: tasks, coins and badges. */
export function WeekTable({ now, before, labels }: { now: WeekCounts; before: WeekCounts; labels: [string, string] }) {
  const rows = [
    ["Uppgifter", now.tasks, before.tasks],
    ["Mynt", now.coins, before.coins],
    ["Märken", now.badges, before.badges],
  ] as const;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-muted-foreground">
          <td />
          <th scope="col" className="w-20 py-1 text-right font-medium">
            {labels[0]}
          </th>
          <th scope="col" className="w-20 py-1 text-right font-medium">
            {labels[1]}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([name, a, b]) => (
          <tr key={name} className="border-t">
            <th scope="row" className="py-1.5 text-left font-normal">
              {name}
            </th>
            <td className="py-1.5 text-right font-semibold tabular-nums">{a}</td>
            <td className="py-1.5 text-right tabular-nums text-muted-foreground">{b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
