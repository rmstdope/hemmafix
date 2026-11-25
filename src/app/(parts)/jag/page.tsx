import { Suspense } from "react";
import { Looks } from "@/components/jag/looks";
import { LevelCard } from "@/components/jag/level-card";
import { WeekCard } from "@/components/jag/week-card";
import { JagParts } from "@/components/jag/jag-parts";
import { LiveUpdates } from "@/components/live-updates";
import { PageCorner } from "@/components/page-corner";
import { BadgeGrid } from "@/components/jag/badge-grid";
import { StreakCard } from "@/components/jag/streak-card";
import { Butik } from "@/components/jag/butik";
import { can } from "@/lib/permissions";
import { getCoinTotal, getHousehold, getLifetimeCoins, getStreak } from "@/server/chores";
import { listMyPurchases, listRewards } from "@/server/rewards";
import { requireMember } from "@/server/dal";
import { getLooks } from "@/server/looks";
import { getBadges } from "@/server/badges";
import { getWeekCard } from "@/server/weeks";

export const metadata = { title: "Jag – Hemmafix" };

export default function JagPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pt-4 pb-4">
      <Suspense fallback={<Skeleton />}>
        <Jag />
      </Suspense>
    </main>
  );
}

async function Jag() {
  const member = await requireMember();
  // First, so a badge that just became true is counted in everything read below.
  const badges = await getBadges(member);
  const [home, lifetimeCoins, week, streak, coins, looks, rewards, purchases] = await Promise.all([
    getHousehold(member.householdId),
    getLifetimeCoins(member),
    getWeekCard(member),
    getStreak(member),
    getCoinTotal(member),
    getLooks(member),
    listRewards(member),
    listMyPurchases(member),
  ]);
  return (
    <>
      <LiveUpdates />
      {/* The controls drop under the heading when both do not fit on one row, so none covers it. The
          home's name takes no width of its own (w-0 min-w-full), so only the heading decides that, and
          it wraps rather than being cut where the controls leave it little room. Top-aligned, so a
          wrapped name never pulls the heading off the controls' line. */}
      <header className="mb-3 flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <div className="min-w-0 grow">
          <h1 className="text-xl font-semibold">Jag</h1>
          {home?.name ? <p className="w-0 min-w-full text-sm break-words text-muted-foreground">{home.name}</p> : null}
        </div>
        <div className="ml-auto sm:hidden">
          <PageCorner />
        </div>
      </header>
      <JagParts
        framsteg={
          <>
            <WeekCard now={week.now} before={week.before} />
            <div className="mb-3">
              <LevelCard name={member.name} image={member.image} lifetimeCoins={lifetimeCoins} frame={looks.chosen.frame} />
            </div>
            <StreakCard run={streak.run} />
            <BadgeGrid badges={badges} />
          </>
        }
        butik={
          <>
            <Butik
              rewards={rewards}
              purchases={purchases}
              balance={coins}
              isAdult={can(member.role, "reward:manage")}
              now={new Date().toISOString()}
            />
            <div className="mt-6">
              <Looks name={member.name} image={member.image} coins={coins} owned={looks.owned} chosen={looks.chosen} />
            </div>
          </>
        }
      />
    </>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3" aria-busy="true" aria-label="Laddar">
      <div className="h-12 rounded-xl bg-muted" />
      <div className="h-12 rounded-xl bg-muted" />
      <div className="h-24 rounded-xl bg-muted" />
    </div>
  );
}
