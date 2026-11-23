import { can } from "@/lib/permissions";
import { getCoinTotal } from "@/server/chores";
import { requireMember } from "@/server/dal";
import { getLooks } from "@/server/looks";
import { UserMenu } from "./user-menu";

/** The top-right corner of a part: the member's picture, which opens the menu. */
export async function PageCorner() {
  const member = await requireMember();
  const [coins, looks] = await Promise.all([getCoinTotal(member), getLooks(member)]);
  return (
    <UserMenu
      name={member.name}
      image={member.image}
      frame={looks.chosen.frame}
      role={member.role}
      canManageHome={can(member.role, "household:rename")}
      coins={coins}
    />
  );
}
