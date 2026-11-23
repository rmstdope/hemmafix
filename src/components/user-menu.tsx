"use client";

import { Menu } from "@base-ui/react/menu";
import { History, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { authClient } from "@/lib/auth-client";
import { partOf } from "@/lib/parts";
import { cn } from "@/lib/utils";
import { MemberAvatar } from "./member-avatar";
import { rememberPart, useRememberedPart } from "./part-links";

const itemClass =
  "flex min-h-11 w-full cursor-default items-center gap-3 rounded-lg px-3 text-sm outline-none select-none data-[highlighted]:bg-muted data-[disabled]:opacity-50";

/** The member's picture, and the menu it opens: Gjort, Hemmet (adults) and Logga ut. */
export function UserMenu({
  name,
  image,
  role,
  canManageHome,
}: {
  name: string;
  image: string | null;
  role: "adult" | "child";
  canManageHome: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const remembered = useRememberedPart();
  const [pending, startTransition] = useTransition();
  // Next keeps a page it left alive, so a menu left open would still be open on the way back.
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);
  if (openedAt !== pathname) {
    setOpenedAt(pathname);
    setOpen(false);
  }
  // Gjort and Hemmet remember the part they were opened from; Gjort itself keeps what it has.
  const opening = () => rememberPart(partOf(pathname) ?? remembered);

  return (
    <Menu.Root open={open} onOpenChange={setOpen}>
      <Menu.Trigger
        aria-label="Meny"
        className="flex size-11 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-[popup-open]:bg-muted"
      >
        <MemberAvatar name={name} image={image} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={6} collisionPadding={8} className="z-50">
          <Menu.Popup className="w-56 max-w-[calc(100vw-1rem)] rounded-xl border bg-popover p-1 text-popover-foreground shadow-md outline-none">
            <div className="px-3 py-2">
              <p className="truncate text-sm font-medium">{name}</p>
              <p className="text-xs text-muted-foreground">{role === "adult" ? "Vuxen" : "Barn"}</p>
            </div>
            <Menu.LinkItem
              render={<Link href="/gjort" />}
              onClick={pathname === "/gjort" ? undefined : opening}
              aria-current={pathname === "/gjort" ? "page" : undefined}
              className={cn(itemClass, pathname === "/gjort" && "bg-muted font-medium")}
            >
              <History className="size-5" aria-hidden />
              Gjort
            </Menu.LinkItem>
            {canManageHome && (
              <Menu.LinkItem render={<Link href="/hemmet" />} onClick={opening} className={itemClass}>
                <Settings className="size-5" aria-hidden />
                Hemmet
              </Menu.LinkItem>
            )}
            <Menu.Separator className="my-1 h-px bg-border" />
            <Menu.Item
              closeOnClick={false}
              disabled={pending}
              className={itemClass}
              onClick={() =>
                startTransition(async () => {
                  await authClient.signOut();
                  router.replace("/login");
                })
              }
            >
              <LogOut className="size-5" aria-hidden />
              {pending ? "Loggar ut…" : "Logga ut"}
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
