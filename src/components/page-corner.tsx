import { can } from "@/lib/permissions";
import { requireMember } from "@/server/dal";
import { GjortLink, HemmetLink } from "./part-links";
import { UserMenu } from "./user-menu";

/** The icons in the top-right corner of a part: Gjort (board only), Hemmet (adults), you. */
export async function PageCorner() {
  const member = await requireMember();
  return (
    <div className="flex items-center gap-1">
      <GjortLink />
      {can(member.role, "household:rename") && <HemmetLink />}
      <UserMenu name={member.name} image={member.image} />
    </div>
  );
}
