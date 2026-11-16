"use client";

import { Plus, X } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import { toast } from "sonner";
import { addRoutine, createChore, type ActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CHORE_TEMPLATES, findTemplate } from "@/lib/chore-templates";
import type { RecurrenceUnit } from "@/lib/recurrence";
import { addRoutineButtonLabel, routineAddedNotice } from "@/lib/routine-texts";
import { cn } from "@/lib/utils";
import { RoomOptions } from "./room-options";

type Option = { id: string; name: string };
type Room = Option & { floorId: string };
type RoutineOption = Option & { tasks: string[] };

const fieldClass =
  "h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 text-base md:text-sm dark:bg-input/30";

const UNIT_OPTIONS: { value: RecurrenceUnit; one: string; many: string }[] = [
  { value: "day", one: "dag", many: "dagar" },
  { value: "week", one: "vecka", many: "veckor" },
  { value: "month", one: "månad", many: "månader" },
];

type Draft = {
  mode: "task" | "routine";
  routineId: string;
  templateKey: string;
  title: string;
  roomId: string;
  kind: "recurring" | "once";
  interval: string;
  unit: RecurrenceUnit;
  date: string;
  assigneeId: string;
};

const empty = (today: string): Draft => ({
  mode: "task",
  routineId: "",
  templateKey: "",
  title: "",
  roomId: "",
  kind: "recurring",
  interval: "1",
  unit: "week",
  date: today,
  assigneeId: "",
});

export function AddChoreForm({
  floors,
  rooms,
  routines,
  members,
  currentUserId,
  today,
}: {
  floors: Option[];
  rooms: Room[];
  /** The home's routines with their task titles, in the order they were made. */
  routines: RoutineOption[];
  members: Option[];
  currentUserId: string;
  /** YYYY-MM-DD in the household's time zone, from the server. */
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => empty(today));
  const [, action, pending] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const isRoutine = formData.get("mode") === "routine";
    const result = isRoutine ? await addRoutine(prev, formData) : await createChore(prev, formData);
    if (result.ok) {
      toast.success(isRoutine ? routineAddedNotice(result.count ?? 0) : "Uppgiften är tillagd");
      setDraft(empty(today));
      // Closing unmounts the form, so it opens empty next time.
      setOpen(false);
    } else if (result.error) {
      toast.error(result.error);
    }
    return result;
  }, { ok: false });

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const pickTemplate = (key: string) => {
    const template = findTemplate(key);
    if (!template) return set({ templateKey: "" });
    // The template's room when the home has exactly one by that name (Badrum on two floors
    // is for the person to choose).
    const matches = rooms.filter((r) => r.name.toLowerCase() === template.room.toLowerCase());
    const room = matches.length === 1 ? matches[0] : undefined;
    set({
      templateKey: key,
      title: template.title,
      roomId: room?.id ?? draft.roomId,
      kind: template.recurrence ? "recurring" : "once",
      interval: String(template.recurrence?.interval ?? draft.interval),
      unit: template.recurrence?.unit ?? draft.unit,
    });
  };

  if (!open) {
    return (
      <Button size="lg" className="h-11 w-full" onClick={() => setOpen(true)}>
        <Plus /> Ny uppgift
      </Button>
    );
  }

  if (rooms.length === 0) {
    return (
      <div className="space-y-3 rounded-xl border bg-card p-4 text-sm">
        <p>Varje uppgift hör till ett rum. Lägg till hemmets rum först.</p>
        <div className="flex gap-2">
          <Link href="/hemmet" className="flex h-11 items-center rounded-lg bg-primary px-4 font-medium text-primary-foreground">
            Lägg till rum
          </Link>
          <Button variant="ghost" className="h-11" onClick={() => setOpen(false)}>
            Avbryt
          </Button>
        </div>
      </div>
    );
  }

  const isRoutine = draft.mode === "routine";
  const chosen = routines.find((r) => r.id === draft.routineId);
  const taskCount = chosen?.tasks.length ?? 0;
  // A routine that vanished while the form was open stays pressable, so the server answers it.
  const canSubmit = isRoutine ? Boolean(draft.routineId) && (!chosen || taskCount > 0) : true;
  const plural = draft.interval !== "1";
  const recurring = draft.kind === "recurring";

  return (
    <form
      // Not `action`: React resets a form after its action, and the selects would then show their
      // first option while the draft still holds what was chosen.
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(() => action(formData));
      }}
      className="space-y-3 rounded-xl border bg-card p-4"
      aria-label="Ny uppgift"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Ny uppgift</h2>
        <Button type="button" variant="ghost" size="icon-lg" aria-label="Stäng" onClick={() => setOpen(false)}>
          <X />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm" role="radiogroup" aria-label="Vad ska läggas till?">
        {(
          [
            ["task", "En uppgift"],
            ["routine", "En rutin"],
          ] as const
        ).map(([value, label]) => (
          <label
            key={value}
            className={cn(
              "flex h-11 cursor-pointer items-center justify-center rounded-md has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              draft.mode === value ? "bg-background font-medium shadow-sm" : "text-muted-foreground",
            )}
          >
            <input
              type="radio"
              name="mode"
              value={value}
              checked={draft.mode === value}
              onChange={() => set({ mode: value })}
              className="sr-only"
            />
            {label}
          </label>
        ))}
      </div>

      {isRoutine && routines.length === 0 ? (
        <div className="space-y-2 rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
          <p>Inga rutiner ännu.</p>
          <Link href="/hemmet#routines-heading" className="inline-flex h-11 items-center font-medium text-foreground underline">
            Skapa en rutin
          </Link>
        </div>
      ) : (
        <>
          {isRoutine ? (
            <>
              <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">Rutin</span>
                <select
                  aria-label="Rutin"
                  value={draft.routineId}
                  onChange={(e) => set({ routineId: e.target.value })}
                  className={cn(fieldClass, "h-auto min-h-11 py-2 break-words whitespace-normal")}
                >
                  <option value="">Välj rutin</option>
                  {routines.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              {/* From the draft, not the select: the choice survives the routine being removed. */}
              <input type="hidden" name="routineId" value={draft.routineId} />
              {chosen && taskCount === 0 ? (
                <p className="rounded-xl border border-dashed p-3 text-sm break-words text-muted-foreground">
                  {chosen.name} har inga uppgifter ännu.
                </p>
              ) : chosen ? (
                <ul aria-label="Uppgifter i rutinen" className="space-y-1 text-sm">
                  {chosen.tasks.map((title, i) => (
                    <li key={i} className="break-words">
                      · {title}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <>
              <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">Välj en vanlig uppgift</span>
                <select
                  aria-label="Fördefinierad uppgift"
                  value={draft.templateKey}
                  onChange={(e) => pickTemplate(e.target.value)}
                  className={fieldClass}
                >
                  <option value="">Egen uppgift</option>
                  {CHORE_TEMPLATES.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </label>
              <input type="hidden" name="templateKey" value={draft.templateKey} />

              <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">Vad ska göras?</span>
                <Input
                  name="title"
                  value={draft.title}
                  onChange={(e) => {
                    const title = e.target.value;
                    // A title typed over the template's makes it a task of one's own.
                    const template = findTemplate(draft.templateKey);
                    set({ title, templateKey: template && template.title === title ? draft.templateKey : "" });
                  }}
                  aria-label="Titel"
                  autoComplete="off"
                  required
                  maxLength={200}
                  className="h-11 text-base md:text-sm"
                />
              </label>
            </>
          )}

          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">Rum</span>
            <select
              name="roomId"
              aria-label="Rum"
              value={draft.roomId}
              onChange={(e) => set({ roomId: e.target.value })}
              required
              className={fieldClass}
            >
              <option value="" disabled>
                Välj rum
              </option>
              <RoomOptions floors={floors} rooms={rooms} />
            </select>
          </label>

          <fieldset className="space-y-2 text-sm">
            <legend className="mb-1 text-muted-foreground">Hur ofta?</legend>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              {(
                [
                  ["recurring", "Återkommande"],
                  ["once", "En gång"],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={cn(
                    "flex h-9 cursor-pointer items-center justify-center rounded-md has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                    draft.kind === value ? "bg-background font-medium shadow-sm" : "text-muted-foreground",
                  )}
                >
                  <input
                    type="radio"
                    name="kind"
                    value={value}
                    checked={draft.kind === value}
                    onChange={() => set({ kind: value, date: value === "recurring" ? today : "" })}
                    className="sr-only"
                  />
                  {label}
                </label>
              ))}
            </div>

            {recurring ? (
              <div className="grid grid-cols-[auto_5rem_1fr] items-center gap-2">
                <span>Var</span>
                <Input
                  type="number"
                  name="interval"
                  aria-label="Antal"
                  inputMode="numeric"
                  min={1}
                  max={365}
                  required
                  value={draft.interval}
                  onChange={(e) => set({ interval: e.target.value })}
                  className="h-11 text-base md:text-sm"
                />
                <select
                  name="unit"
                  aria-label="Enhet"
                  value={draft.unit}
                  onChange={(e) => set({ unit: e.target.value as RecurrenceUnit })}
                  className={fieldClass}
                >
                  {UNIT_OPTIONS.map((u) => (
                    <option key={u.value} value={u.value}>
                      {plural ? u.many : u.one}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </fieldset>

          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">{recurring ? "Första gången" : "Klart senast"}</span>
              <input
                type="date"
                name={recurring ? "startDate" : "dueDate"}
                aria-label={recurring ? "Första gången" : "Klart senast"}
                value={draft.date}
                onChange={(e) => set({ date: e.target.value })}
                className={fieldClass}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">{recurring ? "Vem (alla gånger)" : "Vem"}</span>
              <select
                name="assigneeId"
                aria-label="Vem"
                value={draft.assigneeId}
                onChange={(e) => set({ assigneeId: e.target.value })}
                className={fieldClass}
              >
                <option value="">Ingen</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id === currentUserId ? `${m.name} (jag)` : m.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </>
      )}

      {isRoutine && routines.length === 0 ? null : (
        <Button type="submit" size="lg" className="h-11 w-full" disabled={pending || !canSubmit}>
          {isRoutine ? addRoutineButtonLabel(taskCount) : "Lägg till"}
        </Button>
      )}
    </form>
  );
}
