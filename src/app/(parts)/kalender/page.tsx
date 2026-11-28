import { Suspense } from "react";
import { CalendarSkeleton } from "@/components/calendar/calendar-skeleton";
import { CalendarView } from "@/components/calendar/calendar-view";
import { LiveUpdates } from "@/components/live-updates";
import { PageCorner } from "@/components/page-corner";
import { PageHeader } from "@/components/page-header";
import { loginHintFor } from "@/server/calendar";
import { getHousehold } from "@/server/chores";
import { requireMember } from "@/server/dal";

export const metadata = { title: "Kalender – Hemmafix" };

export default function KalenderPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pt-4 pb-4">
      <Suspense fallback={<CalendarSkeleton />}>
        <Kalender />
      </Suspense>
    </main>
  );
}

async function Kalender() {
  const member = await requireMember();
  const [home, loginHint] = await Promise.all([getHousehold(member.householdId), loginHintFor(member)]);
  return (
    <>
      <LiveUpdates />
      <PageHeader title="Kalender" subtitle={home?.name}>
        <div className="sm:hidden">
          <PageCorner />
        </div>
      </PageHeader>
      <div>
        <CalendarView loginHint={loginHint} />
      </div>
    </>
  );
}
