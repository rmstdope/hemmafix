import { can } from "@/lib/permissions";
import { requireMember } from "@/server/dal";
import { UserMenu } from "./user-menu";

/** The top-right corner of a part: the member's picture, which opens the menu. */
export async function PageCorner() {
  const member = await requireMember();
  return (
    <UserMenu
      name={member.name}
      image={member.image}
      role={member.role}
      canManageHome={can(member.role, "household:rename")}
    />
  );
}
