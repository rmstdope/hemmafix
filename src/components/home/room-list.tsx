"use client";

import { Plus, Trash2 } from "lucide-react";
import { useActionState, useEffect, useRef, useTransition } from "react";
import { toast } from "sonner";
import { addRoom, deleteRoom, type ActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROOM_SUGGESTIONS } from "@/lib/rooms";

type Room = { id: string; name: string };

export function RoomList({ rooms }: { rooms: Room[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<ActionState, FormData>(addRoom, { ok: false });
  const [busy, startTransition] = useTransition();

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
    else if (state.error) toast.error(state.error);
  }, [state]);

  const taken = new Set(rooms.map((r) => r.name.toLowerCase()));
  const suggestions = ROOM_SUGGESTIONS.filter((s) => !taken.has(s.toLowerCase()));

  const addSuggestion = (name: string) =>
    startTransition(async () => {
      const data = new FormData();
      data.set("name", name);
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
        <p className="text-sm text-muted-foreground">Inga rum ännu. Lägg till de rum ni har hemma.</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card" aria-label="Rum">
          {rooms.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 py-1 pr-1 pl-3">
              <span>{r.name}</span>
              <Button
                variant="ghost"
                size="icon-lg"
                aria-label={`Ta bort ${r.name}`}
                className="text-muted-foreground"
                disabled={busy}
                onClick={() => remove(r)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form ref={formRef} action={action} className="flex gap-2">
        <Input
          name="name"
          placeholder="Nytt rum"
          aria-label="Nytt rum"
          autoComplete="off"
          required
          maxLength={40}
          className="h-11 text-base md:text-sm"
        />
        <Button type="submit" size="icon-lg" className="size-11 shrink-0" disabled={pending} aria-label="Lägg till rum">
          <Plus />
        </Button>
      </form>

      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Förslag">
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
