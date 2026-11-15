import { redirect } from "next/navigation";
import { Suspense } from "react";
import { toQueryString } from "@/lib/query-string";
import { can } from "@/lib/permissions";
import { getCurrentMember } from "@/server/dal";
import { getHousehold } from "@/server/chores";
import { readConnectingApp } from "@/server/oauth-request";
import { ApprovalCard, ChildCard, ExpiredCard } from "./cards";

export const metadata = { title: "Anslut – Hemmafix" };

export default function ConsentPage({ searchParams }: PageProps<"/consent">) {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Suspense>
        <Consent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Consent({ searchParams }: { searchParams: PageProps<"/consent">["searchParams"] }) {
  const params = await searchParams;
  const app = await readConnectingApp(params);
  if (!app) return <ExpiredCard />;

  const member = await getCurrentMember();
  if (!member) redirect(`/login?${toQueryString(params)}`);

  const firstName = member.name.split(/\s+/)[0] ?? member.name;
  if (!can(member.role, "app:connect")) return <ChildCard firstName={firstName} />;

  const home = await getHousehold(member.householdId);
  return (
    <ApprovalCard
      appName={app.name}
      appNameInline={app.nameInline}
      address={app.address}
      homeName={home?.name ?? ""}
      person={{ name: member.name, firstName, image: member.image }}
    />
  );
}
