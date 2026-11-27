"use client";

import { useCallback, useEffect, useMemo, useOptimistic, useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { postponeInstance, undoPostpone, type ActionState } from "@/app/actions";
import { boardTabs, splitByTab, tabOf, type TabKey } from "@/lib/board-tabs";
import { focusAfterMove, moveTask, movedText, restoredText } from "@/lib/postpone";
import { SAVE_FAILED } from "@/lib/routine-texts";
import type { InstanceView, Member, MoveReport } from "@/server/chores";
import { BoardTabs } from "./board-tabs";
import { ChoreItem } from "./chore-item";
import { PostponeContext, type Postpone } from "./postpone";

/** How long a tab's count stays lit after a chore moved there. */
const LIT_MS = 2_000;

/** What to focus once the board has redrawn: a chore's ⌄, or a tab. */
type Focus = { selector: string };

/**
 * The open tasks over the five tabs. It is here, in the browser, so that a postponed chore moves
 * at once, between lists too; every refresh from the server replaces what it started from.
 */
export function OpenBoard({
  open,
  today,
  filtered,
  initialTab,
  underTabs,
  nuTop,
  nuBottom,
  ...rows
}: {
  open: InstanceView[];
  /** YYYY-MM-DD in the household's time zone, from the server. */
  today: string;
  /** Whether a room or person filter is on. */
  filtered: boolean;
  initialTab: TabKey;
  underTabs: ReactNode;
  /** Above and below Nu's list. */
  nuTop: ReactNode;
  nuBottom: ReactNode;
  members: Member[];
  currentUserId: string;
  canManage: boolean;
  showFloors: boolean;
  floors: { id: string; name: string }[];
  rooms: { id: string; name: string; floorId: string }[];
}) {
  const [, startTransition] = useTransition();
  const [tasks, move] = useOptimistic(open, (now, to: { id: string; day: string }) => moveTask(now, to.id, to.day));
  const [lit, setLit] = useState<TabKey | null>(null);
  const [focus, setFocus] = useState<Focus | null>(null);
  const litTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const split = useMemo(() => splitByTab(tasks, today), [tasks, today]);
  const tabs = boardTabs(
    today,
    { nu: split.nu.length, d1: split.d1.length, d2: split.d2.length, d3: split.d3.length, senare: split.senare.length },
    split.nu.some((t) => t.dueDate !== null && t.dueDate < today),
  );

  useEffect(() => () => clearTimeout(litTimer.current), []);
  useEffect(() => {
    if (!focus) return;
    const target = document.querySelector<HTMLElement>(focus.selector);
    target?.focus();
    // The message that held Ångra takes focus back as it is left; the second call stays.
    if (target && document.activeElement !== target) target.focus();
  }, [focus]);

  /** Moves the chore at once and sends it; a refused or failed save puts it back and says why. */
  const send = useCallback(
    (
      to: { id: string; day: string },
      action: () => Promise<ActionState<MoveReport>>,
      saved: (result: ActionState<MoveReport>) => void,
    ) => {
      startTransition(async () => {
        move(to);
        const result = await action().catch((): ActionState<MoveReport> => ({ ok: false, error: SAVE_FAILED }));
        if (result.ok) saved(result);
        else toast.error(result.error ?? SAVE_FAILED);
      });
    },
    [move],
  );

  const postpone = useCallback<Postpone>(
    ({ id, title }, day) => {
      const task = tasks.find((t) => t.id === id);
      if (!task) return;
      // The row is on the tab the adult is looking at, and they stay there.
      const from = tabOf(task.dueDate, today);
      const to = tabOf(day, today);
      const ids = tasks.filter((t) => tabOf(t.dueDate, today) === from).map((t) => t.id);
      const next = focusAfterMove(ids, id, from === to);
      setFocus({ selector: next ? `[data-more="${next}"]` : `#tab-${from}` });
      clearTimeout(litTimer.current);
      setLit(from === to ? null : to);
      litTimer.current = setTimeout(() => setLit(null), LIT_MS);

      send({ id, day }, () => postponeInstance(id, day), ({ report }) => {
        if (!report) return;
        const { postponed } = report;
        toast(movedText(title, day), {
          action: {
            label: "Ångra",
            onClick: () => {
              setFocus({ selector: `[data-more="${id}"]` });
              setLit(null);
              const back = { to: postponed.from, version: postponed.version };
              send({ id, day: postponed.from }, () => undoPostpone(id, back), () =>
                toast.success(restoredText(title, postponed.from)),
              );
            },
          },
        });
      });
    },
    [tasks, today, send],
  );

  const emptyText = (key: TabKey) =>
    filtered
      ? "Inga uppgifter här."
      : key === "nu"
        ? "🎉 Allt i Nu är klart!"
        : key === "senare"
          ? "Inget planerat längre fram."
          : "Inget att göra den här dagen.";
  const list = (key: TabKey, items: InstanceView[], showDue: (dueDate: string | null) => boolean) =>
    items.length === 0 ? (
      <p className="sky-box rounded-xl border border-dashed p-6 text-center text-muted-foreground">{emptyText(key)}</p>
    ) : (
      <ul
        className="space-y-2"
        aria-label={tabs.find((t) => t.key === key)?.ariaLabel}
        data-clears-nu={key === "nu" && !filtered ? "" : undefined}
      >
        {items.map((t) => (
          <ChoreItem key={t.id} instance={t} today={today} canUndo={false} showDue={showDue(t.dueDate)} {...rows} />
        ))}
      </ul>
    );

  return (
    <PostponeContext value={postpone}>
      <BoardTabs
        tabs={tabs}
        initial={initialTab}
        lit={lit}
        underTabs={underTabs}
        panels={{
          nu: (
            <>
              {nuTop}
              {list("nu", split.nu, (d) => d !== null && d < today)}
              {nuBottom}
            </>
          ),
          imorgon: list("imorgon", split.d1, () => false),
          d2: list("d2", split.d2, () => false),
          d3: list("d3", split.d3, () => false),
          senare: list("senare", split.senare, () => true),
        }}
      />
    </PostponeContext>
  );
}
