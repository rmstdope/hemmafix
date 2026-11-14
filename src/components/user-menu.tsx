"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { MemberAvatar } from "./member-avatar";

export function UserMenu({ name, image }: { name: string; image: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <MemberAvatar name={name} image={image} />
      <Button
        variant="ghost"
        size="icon-lg"
        aria-label="Logga ut"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await authClient.signOut();
            router.replace("/login");
          })
        }
      >
        <LogOut />
      </Button>
    </div>
  );
}
