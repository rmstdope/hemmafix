"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { setMemberRole } from "@/app/actions";
import { MemberAvatar } from "@/components/member-avatar";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/permissions";

type Member = { id: string; name: string; image: string | null; role: Role };

export function MemberRoles({ members, currentUserId }: { members: Member[]; currentUserId: string }) {
  const [pending, startTransition] = useTransition();

  const change = (member: Member, role: Role) =>
    startTransition(async () => {
      const result = await setMemberRole(member.id, role);
      if (result.error) toast.error(result.error);
      else toast.success(`${member.name.split(" ")[0]} är nu ${ROLE_LABELS[role].toLowerCase()}`);
    });

  return (
    <ul className="divide-y rounded-xl border bg-card" aria-label="Familjen">
      {members.map((m) => (
        <li key={m.id} className="flex items-center gap-3 px-3 py-2">
          <MemberAvatar name={m.name} image={m.image} size="sm" />
          <span className="min-w-0 flex-1 truncate">
            {m.name}
            {m.id === currentUserId && <span className="text-muted-foreground"> (jag)</span>}
          </span>
          <select
            aria-label={`Roll för ${m.name}`}
            value={m.role}
            disabled={pending}
            onChange={(e) => change(m, e.target.value as Role)}
            className="h-10 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </li>
      ))}
    </ul>
  );
}
