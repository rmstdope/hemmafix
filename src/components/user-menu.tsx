"use client";

import { Menu } from "@base-ui/react/menu";
import { Popover } from "@base-ui/react/popover";
import { History, LogOut, Settings, Volume2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { authClient } from "@/lib/auth-client";
import { coinsLabel, formatCoins } from "@/lib/coins";
import { isHemmet, litPart } from "@/lib/parts";
import { cn } from "@/lib/utils";
import { CoinDot, pillClassFor } from "./coin-pill";
import { useReportStreakDay, useShownCoins } from "./coin-shower";
import { setSoundOn, useSoundOn } from "./sound-setting";
import { unlockSound } from "./coin-sound";
import { MemberAvatar } from "./member-avatar";
import { rememberPart, useRememberedPart } from "./part-links";
import { StreakPill } from "./streak-pill";
import { setSkyHint } from "./jul/sky-hint";

const itemClass =
  "flex min-h-11 w-full cursor-default items-center gap-3 rounded-lg px-3 text-sm outline-none select-none data-[highlighted]:bg-muted data-[disabled]:opacity-50";

type Panel = "menu" | "coins" | null;

/**
 * The member's coin total, and the picture with the menu it opens: Gjort, Hemmet (adults) and
 * Logga ut. The pill's bubble and the menu are never open together.
 */
export function UserMenu({
  name,
  image,
  frame,
  role,
  canManageHome,
  coins: serverCoins,
  streak,
  tickStreakDay,
}: {
  name: string;
  image: string | null;
  frame: string;
  role: "adult" | "child";
  canManageHome: boolean;
  coins: number;
  /** Days in a row with a tick-off. */
  streak: number;
  /** The streak day a tick made now would fall on, for the shower's total. */
  tickStreakDay: number;
}) {
  const pill = useRef<HTMLButtonElement>(null);
  const { coins, glow } = useShownCoins(serverCoins, pill);
  useReportStreakDay(tickStreakDay);
  const router = useRouter();
  const pathname = usePathname();
  const remembered = useRememberedPart();
  const soundOn = useSoundOn();
  const [pending, startTransition] = useTransition();
  // Next keeps a page it left alive, so a menu left open would still be open on the way back.
  const [panel, setPanel] = useState<Panel>(null);
  const [openedAt, setOpenedAt] = useState(pathname);
  if (openedAt !== pathname) {
    setOpenedAt(pathname);
    setPanel(null);
  }
  // Closing only closes your own panel: a press on the other trigger has already opened that one.
  const panelState = (mine: Exclude<Panel, null>) => ({
    open: panel === mine,
    onOpenChange: (next: boolean) => setPanel((current) => (next ? mine : current === mine ? null : current)),
  });
  // Gjort and Hemmet remember the part they were opened from; Gjort itself keeps what it has.
  const opening = () => rememberPart(litPart(pathname, remembered) ?? remembered);

  return (
    <div className="flex shrink-0 items-center gap-2">
      <StreakPill run={streak} />
      <Popover.Root {...panelState("coins")}>
        <Popover.Trigger
          ref={pill}
          aria-label={coinsLabel(coins)}
          data-glow={glow ? "" : undefined}
          className={cn(
            pillClassFor(coins),
            "focus-visible:ring-3 focus-visible:ring-ring/50 data-[glow]:ring-3 data-[glow]:ring-amber-200 data-[popup-open]:ring-3 data-[popup-open]:ring-amber-200 dark:data-[glow]:ring-amber-800 dark:data-[popup-open]:ring-amber-800",
          )}
        >
          <CoinDot />
          {formatCoins(coins)}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner side="bottom" align="end" sideOffset={6} collisionPadding={16} className="z-50">
            <Popover.Popup
              initialFocus={false}
              className="w-56 max-w-[calc(100vw-2rem)] rounded-xl border bg-popover p-3 text-popover-foreground shadow-md outline-none"
            >
              <Popover.Title className="text-sm font-medium">Dina mynt</Popover.Title>
              <Popover.Description className="mt-1 text-sm text-muted-foreground">
                Du får mynt för varje uppgift du bockar av.
              </Popover.Description>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      <Menu.Root {...panelState("menu")}>
        <Menu.Trigger
          aria-label="Meny"
          className="flex size-11 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-[popup-open]:bg-muted"
        >
          <MemberAvatar name={name} image={image} frame={frame} />
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
                closeOnClick
                onClick={pathname === "/gjort" ? undefined : opening}
                aria-current={pathname === "/gjort" ? "page" : undefined}
                className={cn(itemClass, pathname === "/gjort" && "bg-muted font-medium")}
              >
                <History className="size-5" aria-hidden />
                Gjort
              </Menu.LinkItem>
              {canManageHome && (
                <Menu.LinkItem
                  render={<Link href="/hemmet" />}
                  closeOnClick
                  onClick={pathname === "/hemmet" ? undefined : opening}
                  aria-current={isHemmet(pathname) ? "page" : undefined}
                  className={cn(itemClass, isHemmet(pathname) && "bg-muted font-medium")}
                >
                  <Settings className="size-5" aria-hidden />
                  Hemmet
                </Menu.LinkItem>
              )}
              <Menu.CheckboxItem
                checked={soundOn}
                closeOnClick={false}
                onCheckedChange={(on) => {
                  setSoundOn(on);
                  if (on) unlockSound();
                }}
                className={itemClass}
              >
                <Volume2 className="size-5" aria-hidden />
                Ljud och vibration
                <span
                  aria-hidden
                  className={cn(
                    "relative ml-auto h-6 w-10 shrink-0 rounded-full transition-colors",
                    soundOn ? "bg-green-600" : "bg-zinc-300 dark:bg-zinc-600",
                  )}
                >
                  <span className={cn("absolute top-[3px] size-[18px] rounded-full bg-white transition-[left]", soundOn ? "left-[19px]" : "left-[3px]")} />
                </span>
              </Menu.CheckboxItem>
              <Menu.Separator className="my-1 h-px bg-border" />
              <Menu.Item
                closeOnClick={false}
                disabled={pending}
                className={itemClass}
                onClick={() =>
                  startTransition(async () => {
                    await authClient.signOut();
                    setSkyHint(false);
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
    </div>
  );
}
