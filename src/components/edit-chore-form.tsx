"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { editChore, type ActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { submitKeepingValues } from "@/components/submit-keeping-values";
import type { Recurrence, RecurrenceUnit } from "@/lib/recurrence";
import { cn } from "@/lib/utils";
import { RoomOptions } from "./room-options";

type Option = { id: string; name: string };
type Room = Option & { floorId: string };

const fieldClass =
  "h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 text-base md:text-sm dark:bg-input/30";

const UNITS: { value: RecurrenceUnit; one: string; many: string }[] = [
  { value: "day", one: "dag", many: "dagar" },
  { value: "week", one: "vecka", many: "veckor" },
  { value: "month", one: "månad", many: "månader" },
];

/** Edits a task in place: title, room, how often and when it is next due. */
export function EditChoreForm({
  task,
  floors,
  rooms,
  onDone,
}: {
  /** The open instance the form edits from, and its task. */
  task: { id: string; title: string; roomId: string | null; recurrence: Recurrence | null; dueDate: string | null };
  floors: Option[];
  rooms: Room[];
  onDone: () => void;
}) {
  const [kind, setKind] = useState<"recurring" | "once">(task.recurrence ? "recurring" : "once");
  const [interval, setInterval] = useState(String(task.recurrence?.interval ?? 1));
  const [roomId, setRoomId] = useState(task.roomId ?? "");
  const [, action, pending] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await editChore(task.id, prev, formData);
    if (result.ok) {
      toast.success("Uppgiften är ändrad");
      onDone();
    } else if (result.error) {
      toast.error(result.error);
    }
    return result;
  }, { ok: false });
  const recurring = kind === "recurring";
  // The chosen room may be removed while the form is open, and the live refresh then takes its
  // option away. Left to itself the browser would fall back to the first room; it has to be chosen
  // again instead, and "Välj rum" is required.
  const shownRoomId = rooms.some((r) => r.id === roomId) ? roomId : "";

  return (
    <form onSubmit={submitKeepingValues(action)} className="w-full space-y-3" aria-label={`Ändra ${task.title}`}>
      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">Vad ska göras?</span>
        <Input
          name="title"
          defaultValue={task.title}
          aria-label="Titel"
          autoComplete="off"
          required
          maxLength={200}
          className="h-11 text-base md:text-sm"
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">Rum</span>
        <select
          name="roomId"
          aria-label="Rum"
          value={shownRoomId}
          onChange={(e) => setRoomId(e.target.value)}
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
                kind === value ? "bg-background font-medium shadow-sm" : "text-muted-foreground",
              )}
            >
              <input
                type="radio"
                name="kind"
                value={value}
                checked={kind === value}
                onChange={() => setKind(value)}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
        {recurring && (
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
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
              className="h-11 text-base md:text-sm"
            />
            <select name="unit" aria-label="Enhet" defaultValue={task.recurrence?.unit ?? "week"} className={fieldClass}>
              {UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {interval === "1" ? u.one : u.many}
                </option>
              ))}
            </select>
          </div>
        )}
      </fieldset>

      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">{recurring ? "Nästa gång" : "Klart senast"}</span>
        <input
          type="date"
          name="dueDate"
          aria-label={recurring ? "Nästa gång" : "Klart senast"}
          defaultValue={task.dueDate ?? ""}
          className={fieldClass}
        />
      </label>

      <div className="flex gap-2">
        <Button type="submit" className="h-11 flex-1" disabled={pending}>
          Spara
        </Button>
        <Button type="button" variant="ghost" className="h-11" onClick={onDone}>
          Avbryt
        </Button>
      </div>
    </form>
  );
}
