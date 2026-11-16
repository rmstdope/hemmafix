"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useActionState, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { addRoom, deleteRoom, renameRoom, type ActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { submitKeepingValues } from "@/components/submit-keeping-values";
import { ROOM_SUGGESTIONS } from "@/lib/rooms";

type Room = { id: string; name: string };

/**
 * The rooms on one floor, with a field and suggestions to add more. `where` ("på Plan 2")
 * is added to labels when the home has several floors, so each floor's controls are distinct.
 */
export function RoomList({ rooms, floorId, where = "" }: { rooms: Room[]; floorId: string; where?: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [, action, pending] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await addRoom(prev, formData);
    if (result.ok) formRef.current?.reset();
    else if (result.error) toast.error(result.error);
    return result;
  }, { ok: false });
  const [busy, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const suffix = where ? ` ${where}` : "";

  const taken = new Set(rooms.map((r) => r.name.toLowerCase()));
  const suggestions = ROOM_SUGGESTIONS.filter((s) => !taken.has(s.toLowerCase()));

  const addSuggestion = (name: string) =>
    startTransition(async () => {
      const data = new FormData();
      data.set("name", name);
      data.set("floorId", floorId);
      const result = await addRoom({ ok: false }, data);
      if (result.error) toast.error(result.error);
    });

  const remove = (room: Room) =>
    startTransition(async () => {
      const result = await deleteRoom(room.id);
      if (result.error) toast.error(result.error);
    });

  return (
    <div className="space-y-3">
      {rooms.length === 0 ? (
        <p className="text-sm text-muted-foreground">Inga rum{suffix} ännu.</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card" aria-label={`Rum${suffix}`}>
          {rooms.map((r) =>
            editingId === r.id ? (
              <li key={r.id} className="p-2">
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const name = String(new FormData(e.currentTarget).get("name") ?? "");
                    startTransition(async () => {
                      const result = await renameRoom(r.id, name);
                      if (result.error) toast.error(result.error);
                      else setEditingId(null);
                    });
                  }}
                >
                  <Input
                    name="name"
                    defaultValue={r.name}
                    aria-label={`Nytt namn för ${r.name}${suffix}`}
                    autoFocus
                    required
                    maxLength={40}
                    className="h-11 text-base md:text-sm"
                  />
                  <Button type="submit" className="h-11 shrink-0" disabled={busy} aria-label={`Spara namnet på ${r.name}${suffix}`}>
                    Spara
                  </Button>
                  <Button type="button" variant="ghost" className="h-11 shrink-0" onClick={() => setEditingId(null)}>
                    Avbryt
                  </Button>
                </form>
              </li>
            ) : (
              <li key={r.id} className="flex items-center gap-1 py-1 pr-1 pl-3">
                <span className="flex-1">{r.name}</span>
                <Button
                  variant="ghost"
                  size="icon-lg"
                  aria-label={`Byt namn på ${r.name}${suffix}`}
                  className="size-11 text-muted-foreground"
                  disabled={busy}
                  onClick={() => setEditingId(r.id)}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-lg"
                  aria-label={`Ta bort ${r.name}${suffix}`}
                  className="size-11 text-muted-foreground"
                  disabled={busy}
                  onClick={() => remove(r)}
                >
                  <Trash2 />
                </Button>
              </li>
            ),
          )}
        </ul>
      )}

      <form ref={formRef} onSubmit={submitKeepingValues(action)} className="flex gap-2">
        <input type="hidden" name="floorId" value={floorId} />
        <Input
          name="name"
          placeholder="Nytt rum"
          aria-label={`Nytt rum${suffix}`}
          autoComplete="off"
          required
          maxLength={40}
          className="h-11 text-base md:text-sm"
        />
        <Button
          type="submit"
          size="icon-lg"
          className="size-11 shrink-0"
          disabled={pending}
          aria-label={`Lägg till rum${suffix}`}
        >
          <Plus />
        </Button>
      </form>

      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label={`Förslag${suffix}`}>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy}
              onClick={() => addSuggestion(s)}
              className="rounded-full border border-dashed px-3.5 py-2.5 text-sm text-muted-foreground disabled:opacity-50"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
