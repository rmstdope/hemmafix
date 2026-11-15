import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LiveUpdates } from "@/components/live-updates";
import { RoutineEditor } from "@/components/home/routine-editor";
import { CHORE_TEMPLATES } from "@/lib/chore-templates";
import { can } from "@/lib/permissions";
import { requireMember } from "@/server/dal";
import { getRoutine } from "@/server/routines";

export const metadata = { title: "Rutin – Hemmafix" };

export default function RoutinePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted" aria-busy="true" />}>
        <RoutineContent params={params} />
      </Suspense>
    </main>
  );
}

async function RoutineContent({ params }: { params: Promise<{ id: string }> }) {
  const member = await requireMember();
  // Only adults manage routines; the actions refuse children as well.
  if (!can(member.role, "routine:manage")) redirect("/");
  const { id } = await params;
  const routine = await getRoutine(member, id);

  return (
    <>
      <LiveUpdates />
      {routine ? (
        <RoutineEditor routine={routine} suggestions={CHORE_TEMPLATES.map((t) => t.title)} />
      ) : (
        <>
          <header className="mb-6 flex items-center gap-2">
            <BackToHome />
            <h1 className="text-xl font-semibold">Rutin</h1>
          </header>
          <div className="rounded-xl border border-dashed p-3.5 text-sm text-muted-foreground">
            <p>Den här rutinen finns inte längre.</p>
            <Link href="/hemmet" className="mt-3 inline-block min-h-11 py-2.5 font-medium text-foreground underline">
              Tillbaka till Hemmet
            </Link>
          </div>
        </>
      )}
    </>
  );
}

function BackToHome() {
  return (
    <Link
      href="/hemmet"
      aria-label="Tillbaka"
      className="-ml-3 flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground"
    >
      <ArrowLeft className="size-5" />
    </Link>
  );
}
