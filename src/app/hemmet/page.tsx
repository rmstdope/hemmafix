import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LiveUpdates } from "@/components/live-updates";
import { MemberRoles } from "@/components/home/member-roles";
import { RenameForm } from "@/components/home/rename-form";
import { FloorsAndRooms } from "@/components/home/floors-and-rooms";
import { ConnectedApps } from "@/components/home/connected-apps";
import { formatConnectedDate, formatLastUsed } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { listConnections } from "@/server/connections";
import { requireMember } from "@/server/dal";
import { listFloors, listMembersWithRoles, listRooms } from "@/server/household";
import { getHousehold } from "@/server/chores";

export const metadata = { title: "Hemmet – Hemmafix" };

export default function HomeSettingsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted" aria-busy="true" />}>
        <HomeSettings />
      </Suspense>
    </main>
  );
}

async function HomeSettings() {
  const member = await requireMember();
  // Only adults manage the home; the actions refuse children as well.
  if (!can(member.role, "household:rename")) redirect("/");

  const [home, floors, rooms, members, connections] = await Promise.all([
    getHousehold(member.householdId),
    listFloors(member.householdId),
    listRooms(member.householdId),
    listMembersWithRoles(member.householdId),
    listConnections(member.userId),
  ]);
  const now = new Date();

  return (
    <>
      <LiveUpdates />
      <header className="mb-6 flex items-center gap-2">
        <Link
          href="/"
          aria-label="Tillbaka"
          className="-ml-3 flex size-11 items-center justify-center rounded-lg text-muted-foreground"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-xl font-semibold">Hemmet</h1>
      </header>

      <section className="space-y-2" aria-labelledby="name-heading">
        <h2 id="name-heading" className="text-sm font-medium text-muted-foreground">
          Namn
        </h2>
        <RenameForm name={home?.name ?? ""} />
      </section>

      <section className="mt-8 space-y-2" aria-labelledby="rooms-heading">
        <h2 id="rooms-heading" className="text-sm font-medium text-muted-foreground">
          {floors.length > 1 ? "Våningar och rum" : "Rum"}
        </h2>
        <FloorsAndRooms floors={floors} rooms={rooms} />
      </section>

      <section className="mt-8 space-y-2" aria-labelledby="family-heading">
        <h2 id="family-heading" className="text-sm font-medium text-muted-foreground">
          Familjen
        </h2>
        <p className="text-sm text-muted-foreground">
          Vuxna kan ändra hemmet och uppgifterna. Barn kan bocka av och se vad de gjort. Nya
          personer blir barn tills en vuxen ändrar det.
        </p>
        <MemberRoles members={members} currentUserId={member.userId} />
      </section>

      <ConnectedApps
        apps={connections.map((c) => ({
          id: c.id,
          name: c.appName,
          icon: c.icon,
          connectedText: formatConnectedDate(c.connectedAt),
          lastUsedText: formatLastUsed(c.lastUsedAt, now),
        }))}
      />
    </>
  );
}
