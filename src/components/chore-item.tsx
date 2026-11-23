"use client";

import { Check, ChevronDown, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useOptimistic, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  assignChore,
  assignInstance,
  completeInstance,
  deleteChore,
  setHighFive,
  uncompleteInstance,
  type ActionState,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/lists/modal";
import { undoDebtText, undoDebtTitle, type UndoDebt } from "@/lib/debt";
import { joinNames } from "@/lib/high-fives";
import { DEFAULT_COINS } from "@/lib/coins";
import { formatDue } from "@/lib/dates";
import { roomLabel } from "@/lib/floors";
import { CoinBadge } from "./coin-badge";
import { useCelebrateNuCleared, useCoinShower, useOfferChest, useOfferCelebrations, type Shower } from "./coin-shower";
import { EditChoreForm } from "./edit-chore-form";
import { cn } from "@/lib/utils";
import type { InstanceView, Member } from "@/server/chores";

const selectClass = "h-10 truncate rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30";

export function ChoreItem({
  instance: t,
  members,
  currentUserId,
  today,
  canManage,
  canUndo,
  showDue,
  showFloors,
  floors,
  rooms,
  highFive,
}: {
  instance: InstanceView;
  members: Member[];
  currentUserId: string;
  /** YYYY-MM-DD in the household's time zone, from the server. */
  today: string;
  /** Adults assign and delete. The server enforces the same rules. */
  canManage: boolean;
  /** Whether this person may undo the tick (their own, or anyone's for adults). */
  canUndo: boolean;
  /** Whether the row says when it is due; under a named day the divider already does. */
  showDue: boolean;
  /** Whether the home has several floors, so rooms are shown with theirs. */
  showFloors: boolean;
  /** The home's floors and rooms, for editing the task (adults). */
  floors: { id: string; name: string }[];
  rooms: { id: string; name: string; floorId: string }[];
  /** On a done row: whether the person may cheer it, whether they did, and who cheered their own. */
  highFive?: { canGive: boolean; givenByMe: boolean; names: string[] };
}) {
  const startShower = useCoinShower();
  const offerChest = useOfferChest();
  const offerCelebrations = useOfferCelebrations();
  const celebrateNuCleared = useCelebrateNuCleared();
  const [pending, startTransition] = useTransition();
  const [assigneeId, setOptimisticAssignee] = useOptimistic(t.assigneeId);
  const [hidden, setHidden] = useOptimistic(false);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showWho, setShowWho] = useState(false);
  const [asking, setAsking] = useState<UndoDebt | null>(null);
  const undoButton = useRef<HTMLButtonElement>(null);
  const cancelUndo = useRef<HTMLButtonElement>(null);
  const [cheered, setCheered] = useOptimistic(highFive?.givenByMe ?? false);
  const completed = t.completedAt !== null;
  const due = completed || !showDue ? null : formatDue(t.dueDate, today);
  const firstName = (id: string | null) =>
    id === currentUserId ? "Jag" : (members.find((m) => m.id === id)?.name.split(" ")[0] ?? "");

  const run = (
    fn: () => Promise<ActionState>,
    optimistic?: () => void,
    success?: string,
    shower?: Shower,
    row?: HTMLElement | null,
  ) =>
    startTransition(async () => {
      // Nu is cleared when this was the last row left in its (unfiltered) Nu list.
      // Decided when pressed, since a row ticked at the same moment is already gone from the list by the answer.
      const nuList = row?.closest<HTMLElement>("[data-clears-nu]");
      const lastInNu = nuList !== null && nuList !== undefined && [...nuList.children].every((li) => li === row);
      optimistic?.();
      let result: ActionState;
      try {
        result = await fn();
      } catch (e) {
        shower?.failed();
        throw e;
      }
      if (result.error) {
        shower?.failed();
        toast.error(result.error);
      } else if (result.confirm) {
        // Nothing was undone: the coins are spent, so the person is asked first.
        setAsking(result.confirm);
      } else {
        shower?.saved();
        if (result.chestId && result.chestCoins !== undefined) offerChest({ id: result.chestId, coins: result.chestCoins });
        if (result.badges || result.levelUp) offerCelebrations({ badges: result.badges ?? [], levelUp: result.levelUp });
        if (lastInNu) celebrateNuCleared();
        if (success) toast.success(success);
      }
    });

  if (hidden) return null;

  return (
    <li className={cn("rounded-xl border bg-card transition-opacity", pending && "opacity-60")}>
      <div className="flex items-center gap-3 px-3 py-2">
        {completed ? (
          canUndo ? (
            <Button
              variant="secondary"
              size="icon-lg"
              className="size-11 shrink-0 rounded-full"
              ref={undoButton}
              aria-label={`${t.title}: ångra klar`}
              // No optimistic hide: a spent tick asks first, and its row must stay where it is until the answer.
              onClick={() => run(() => uncompleteInstance(t.id))}
            >
              <RotateCcw />
            </Button>
          ) : (
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary" aria-hidden>
              <Check className="size-4" />
            </span>
          )
        ) : (
          <Button
            variant="outline"
            size="icon-lg"
            className="size-11 shrink-0 rounded-full"
            aria-label={`${t.title}: markera som klar`}
            onClick={(e) =>
              run(
                () => completeInstance(t.id),
                () => setHidden(true),
                undefined,
                startShower(e.currentTarget.getBoundingClientRect(), t.coins ?? DEFAULT_COINS),
                e.currentTarget.closest("li"),
              )
            }
          >
            <Check className="opacity-40" />
          </Button>
        )}

        <div className="min-w-0 flex-1">
          <p className={cn("truncate font-medium", completed && "text-muted-foreground line-through")}>{t.title}</p>
          <p className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
            {t.roomName && <span>{roomLabel(t.roomName, t.floorName, showFloors)}</span>}
            {due && (
              <>
                <span aria-hidden>·</span>
                <span className={cn(due.overdue && "font-medium text-destructive")}>{due.label}</span>
              </>
            )}
            {completed && t.completedByName && (
              <>
                <span aria-hidden>·</span>
                <span>Klar av {t.completedById === currentUserId ? "mig" : t.completedByName.split(" ")[0]}</span>
              </>
            )}
          </p>
        </div>

        {completed && highFive && t.completedById === currentUserId && highFive.names.length > 0 && (
          <Button
            variant="ghost"
            className="h-10 shrink-0 px-2"
            aria-expanded={showWho}
            onClick={() => setShowWho((v) => !v)}
          >
            👏 {highFive.names.length}
          </Button>
        )}

        {completed && highFive?.canGive && t.completedById !== currentUserId && (
          <Button
            variant={cheered ? "secondary" : "ghost"}
            size="icon-lg"
            className="size-11 shrink-0"
            aria-label={cheered ? "Ta tillbaka high five" : "Ge high five"}
            aria-pressed={cheered}
            onClick={() => run(() => setHighFive(t.id, !cheered), () => setCheered(!cheered))}
          >
            <span aria-hidden>👏</span>
          </Button>
        )}

        {t.coins !== null && <CoinBadge coins={t.coins} faded={completed} />}

        {!completed && !canManage && assigneeId && (
          <span className="shrink-0 text-sm text-muted-foreground">{firstName(assigneeId)}</span>
        )}

        {!completed && canManage && (
          <>
            <select
              aria-label={`${t.title}: tilldela den här gången`}
              value={assigneeId ?? ""}
              onChange={(e) => {
                const next = e.target.value || null;
                run(() => assignInstance(t.id, next), () => setOptimisticAssignee(next));
              }}
              className={cn(selectClass, "max-w-24")}
            >
              <option value="">Ingen</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {firstName(m.id)}
                </option>
              ))}
            </select>
            <Button
              variant="ghost"
              size="icon-lg"
              className="size-11 shrink-0 text-muted-foreground"
              aria-label={`${t.title}: mer`}
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
            >
              <ChevronDown className={cn("transition-transform", expanded && "rotate-180")} />
            </Button>
          </>
        )}
      </div>

      {showWho && highFive && highFive.names.length > 0 && (
        <p className="border-t px-3 py-2 text-sm text-muted-foreground">{joinNames(highFive.names)}</p>
      )}

      {expanded && canManage && !completed && editing && (
        <div className="border-t px-3 py-3">
          <EditChoreForm task={t} floors={floors} rooms={rooms} onDone={() => setEditing(false)} />
        </div>
      )}

      {expanded && canManage && !completed && !editing && (
        <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2">
          {t.recurrence && (
            <label className="flex flex-1 items-center gap-2 text-sm text-muted-foreground">
              <span className="whitespace-nowrap">Alla gånger</span>
              <select
                aria-label={`${t.title}: tilldela alla gånger`}
                value={t.seriesAssigneeId ?? ""}
                onChange={(e) => {
                  const next = e.target.value || null;
                  run(
                    () => assignChore(t.choreId, next),
                    () => setOptimisticAssignee(next),
                    next ? `${firstName(next)} gör "${t.title}" alla gånger` : `Ingen har "${t.title}" alla gånger`,
                  );
                }}
                className={cn(selectClass, "min-w-0 flex-1")}
              >
                <option value="">Ingen</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id === currentUserId ? `${m.name} (jag)` : m.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button variant="ghost" className="ml-auto h-10" onClick={() => setEditing(true)}>
            <Pencil /> Ändra
          </Button>
          <Button
            variant="ghost"
            className="h-10 text-destructive"
            onClick={() => run(() => deleteChore(t.choreId), () => setHidden(true), `"${t.title}" togs bort`)}
          >
            <Trash2 /> Ta bort uppgiften
          </Button>
        </div>
      )}
      {asking && (
        <Modal title={undoDebtTitle(asking)} onClose={() => setAsking(null)} focusRef={cancelUndo} returnFocusTo={undoButton}>
          <p className="mt-2 text-sm text-muted-foreground">{undoDebtText(asking)}</p>
          <div className="mt-5 flex flex-wrap-reverse justify-end gap-2">
            <Button ref={cancelUndo} variant="outline" className="min-h-11 grow sm:grow-0" onClick={() => setAsking(null)}>
              Avbryt
            </Button>
            <Button
              className="min-h-11 grow sm:grow-0"
              onClick={() => {
                setAsking(null);
                run(() => uncompleteInstance(t.id, true), () => setHidden(true));
              }}
            >
              Ångra ändå
            </Button>
          </div>
        </Modal>
      )}
    </li>
  );
}
