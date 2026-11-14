import { Settings } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { AddTaskForm } from "@/components/add-task-form";
import { LiveUpdates } from "@/components/live-updates";
import { TaskItem } from "@/components/task-item";
import { UserMenu } from "@/components/user-menu";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { todayIso } from "@/lib/dates";
import { taskFilter, type TaskFilter } from "@/lib/validation";
import { requireMember } from "@/server/dal";
import { getHousehold, listMembers, listOpenTasks, listRecentlyCompleted } from "@/server/tasks";

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <Suspense fallback={<BoardSkeleton />}>
        <Board searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const FILTERS: { value: TaskFilter; label: string }[] = [
  { value: "all", label: "Alla" },
  { value: "mine", label: "Mina" },
  { value: "unassigned", label: "Ingen tilldelad" },
];

async function Board({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const member = await requireMember();
  const filter = taskFilter.parse((await searchParams).filter);
  const today = todayIso();
  const isAdult = can(member.role, "task:create");

  const [home, members, open, completed] = await Promise.all([
    getHousehold(member.householdId),
    listMembers(member.householdId),
    listOpenTasks(member.householdId, filter, member.userId),
    listRecentlyCompleted(member.householdId),
  ]);

  return (
    <>
      <LiveUpdates />
      <header className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Hemmafix</h1>
          <p className="text-sm text-muted-foreground">{home?.name}</p>
        </div>
        <div className="flex items-center gap-1">
          {isAdult && (
            <Link
              href="/hemmet"
              aria-label="Hemmet"
              className="flex size-11 items-center justify-center rounded-lg text-muted-foreground"
            >
              <Settings className="size-5" />
            </Link>
          )}
          <UserMenu name={member.name} image={member.image} />
        </div>
      </header>

      {isAdult && <AddTaskForm members={members} currentUserId={member.userId} />}

      <nav className={cn("mb-3 flex gap-1 overflow-x-auto", isAdult && "mt-6")} aria-label="Filter">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={f.value === "all" ? "/" : `/?filter=${f.value}`}
            replace
            className={cn(
              "rounded-full px-3 py-1.5 text-sm whitespace-nowrap",
              filter === f.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
            aria-current={filter === f.value ? "page" : undefined}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {open.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">
          {filter === "all" ? "Inget att göra just nu 🎉" : "Inga uppgifter här."}
        </p>
      ) : (
        <ul className="space-y-2">
          {open.map((t) => (
            <TaskItem
              key={t.id}
              task={t}
              members={members}
              currentUserId={member.userId}
              today={today}
              canManage={isAdult}
            />
          ))}
        </ul>
      )}

      {completed.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Klart senaste veckan ({completed.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {completed.map((t) => (
              <TaskItem
              key={t.id}
              task={t}
              members={members}
              currentUserId={member.userId}
              today={today}
              canManage={isAdult}
            />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function BoardSkeleton() {
  return (
    <div className="animate-pulse space-y-3" aria-busy="true" aria-label="Laddar">
      <div className="h-12 rounded-xl bg-muted" />
      <div className="h-11 rounded-xl bg-muted" />
      <div className="h-14 rounded-xl bg-muted" />
      <div className="h-14 rounded-xl bg-muted" />
    </div>
  );
}
