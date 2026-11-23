import { can } from "@/lib/permissions";
import { tickDay } from "@/lib/streak";
import { getCoinTotal, getStreak } from "@/server/chores";
import { requireMember } from "@/server/dal";
import { getLooks } from "@/server/looks";
import { UserMenu } from "./user-menu";

/** The top-right corner of a part: the member's picture, which opens the menu. */
export async function PageCorner() {
  const member = await requireMember();
  const [coins, streak, looks] = await Promise.all([getCoinTotal(member), getStreak(member), getLooks(member)]);
  return (
    <UserMenu
      name={member.name}
      image={member.image}
      frame={looks.chosen.frame}
      role={member.role}
      canManageHome={can(member.role, "household:rename")}
      coins={coins}
      streak={streak.run}
      tickStreakDay={tickDay(streak)}
    />
  );
}
