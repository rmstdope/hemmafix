import { ArrowLeft, Check } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { HistoryFilters } from "@/components/history-filters";
import { LiveUpdates } from "@/components/live-updates";
import { formatDay, formatTime, todayIso } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { requireMember } from "@/server/dal";
import { HISTORY_LIMIT, HISTORY_PERIODS, listCompletedBy, listMembers, type DoneView, type HistoryPeriod } from "@/server/chores";

export const metadata = { title: "Gjort – Hemmafix" };

export default function HistoryPage({ searchParams }: PageProps<"/gjort">) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted" aria-busy="true" />}>
        <History searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const PERIOD_LABELS: Record<HistoryPeriod, string> = { 7: "senaste veckan", 30: "senaste månaden", 365: "senaste året" };

async function History({ searchParams }: { searchParams: PageProps<"/gjort">["searchParams"] }) {
  const member = await requireMember();
  const params = await searchParams;
  const canSeeOthers = can(member.role, "history:view-anyone");
  const members = await listMembers(member.householdId);

  // Children always see their own; adults may pick anyone in the home.
  const requested = first(params.vem);
  const personId =
    canSeeOthers && requested && members.some((m) => m.id === requested) ? requested : member.userId;
  const requestedPeriod = Number(first(params.period));
  const period: HistoryPeriod = (HISTORY_PERIODS as readonly number[]).includes(requestedPeriod)
    ? (requestedPeriod as HistoryPeriod)
    : 30;

  const done = await listCompletedBy(member, personId, period);
  const today = todayIso();
  const days = groupByDay(done);
  const person = members.find((m) => m.id === personId);
  const who = personId === member.userId ? "Du" : (person?.name.split(" ")[0] ?? "");

  return (
    <>
      <LiveUpdates />
      <header className="mb-4 flex items-center gap-2">
        <Link
          href="/"
          aria-label="Tillbaka"
          className="-ml-3 flex size-11 items-center justify-center rounded-lg text-muted-foreground"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-xl font-semibold">Gjort</h1>
      </header>

      <HistoryFilters
        members={canSeeOthers ? members : []}
        currentUserId={member.userId}
        personId={personId}
        period={period}
      />

      <p className="mt-4 mb-3 text-sm text-muted-foreground" aria-live="polite">
        {done.length === 0
          ? `${who} har inte bockat av något ${PERIOD_LABELS[period]}.`
          : done.length >= HISTORY_LIMIT
            ? `${who} har gjort minst ${HISTORY_LIMIT} uppgifter ${PERIOD_LABELS[period]}. De ${HISTORY_LIMIT} senaste visas.`
            : `${who} har gjort ${done.length} ${done.length === 1 ? "uppgift" : "uppgifter"} ${PERIOD_LABELS[period]}.`}
      </p>

      <div className="space-y-6">
        {days.map(({ day, items }) => (
          <section key={day} aria-label={formatDay(day, today)}>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">{formatDay(day, today)}</h2>
            <ul className="divide-y rounded-xl border bg-card">
              {items.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary" aria-hidden>
                    <Check className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{d.title}</p>
                    {d.roomName && <p className="text-xs text-muted-foreground">{d.roomName}</p>}
                  </div>
                  <time dateTime={d.completedAt.toISOString()} className="shrink-0 text-sm text-muted-foreground">
                    {formatTime(d.completedAt)}
                  </time>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

/** Groups (newest first) by calendar day in the household's time zone. */
function groupByDay(done: DoneView[]) {
  const days: { day: string; items: DoneView[] }[] = [];
  for (const d of done) {
    const day = todayIso(d.completedAt);
    const last = days.at(-1);
    if (last?.day === day) last.items.push(d);
    else days.push({ day, items: [d] });
  }
  return days;
}
