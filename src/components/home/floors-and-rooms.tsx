"use client";

import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addFloor, deleteFloor, moveFloor, renameFloor, type ActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { floorLabel } from "@/lib/floors";
import { RoomList } from "./room-list";

type Floor = { id: string; name: string };
type Room = { id: string; name: string; floorId: string };

/**
 * The home's floors (top floor first) and the rooms on each. With a single floor it looks
 * like a plain room list; floors appear once a second one is added.
 */
export function FloorsAndRooms({ floors, rooms }: { floors: Floor[]; rooms: Room[] }) {
  const [pending, startTransition] = useTransition();
  const many = floors.length > 1;

  const run = (fn: () => Promise<ActionState>, success?: string) =>
    startTransition(async () => {
      const result = await fn();
      if (result.error) toast.error(result.error);
      else if (success) toast.success(success);
    });

  return (
    <div className="space-y-4">
      {floors.map((f, i) => {
        const label = floorLabel(f.name);
        const floorRooms = rooms.filter((r) => r.floorId === f.id);
        if (!many) return <RoomList key={f.id} rooms={floorRooms} floorId={f.id} />;
        return (
          <section key={f.id} aria-label={label} className="sky-box space-y-2 rounded-xl border p-3">
            <FloorHeader
              floor={f}
              isTop={i === 0}
              isBottom={i === floors.length - 1}
              pending={pending}
              onMove={(direction) => run(() => moveFloor(f.id, direction))}
              onRename={(name) => run(() => renameFloor(f.id, name))}
              onDelete={() => run(() => deleteFloor(f.id), `${label} togs bort`)}
            />
            <RoomList rooms={floorRooms} floorId={f.id} where={`på ${label}`} />
          </section>
        );
      })}

      <Button variant="outline" className="sky-box h-11 w-full" disabled={pending} onClick={() => run(() => addFloor())}>
        <Plus /> Lägg till våning
      </Button>
    </div>
  );
}

function FloorHeader({
  floor,
  isTop,
  isBottom,
  pending,
  onMove,
  onRename,
  onDelete,
}: {
  floor: Floor;
  isTop: boolean;
  isBottom: boolean;
  pending: boolean;
  onMove: (direction: "up" | "down") => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const label = floorLabel(floor.name);

  if (editing) {
    return (
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onRename(String(new FormData(e.currentTarget).get("name") ?? ""));
          setEditing(false);
        }}
      >
        <Input
          name="name"
          defaultValue={floor.name}
          aria-label={`Nytt namn för ${label}`}
          autoFocus
          required
          maxLength={30}
          className="h-11 text-base md:text-sm"
        />
        <Button type="submit" className="h-11 shrink-0" aria-label={`Spara namnet på ${label}`}>
          Spara
        </Button>
        <Button type="button" variant="ghost" className="h-11 shrink-0" onClick={() => setEditing(false)}>
          Avbryt
        </Button>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <h3 className="flex-1 font-medium">{label}</h3>
      <Button
        variant="ghost"
        size="icon-lg"
        className="size-11 text-muted-foreground"
        aria-label={`Flytta ${label} upp en våning`}
        disabled={pending || isTop}
        onClick={() => onMove("up")}
      >
        <ChevronUp />
      </Button>
      <Button
        variant="ghost"
        size="icon-lg"
        className="size-11 text-muted-foreground"
        aria-label={`Flytta ${label} ner en våning`}
        disabled={pending || isBottom}
        onClick={() => onMove("down")}
      >
        <ChevronDown />
      </Button>
      <Button
        variant="ghost"
        size="icon-lg"
        className="size-11 text-muted-foreground"
        aria-label={`Byt namn på ${label}`}
        disabled={pending}
        onClick={() => setEditing(true)}
      >
        <Pencil />
      </Button>
      <Button
        variant="ghost"
        size="icon-lg"
        className="size-11 text-muted-foreground"
        aria-label={`Ta bort ${label}`}
        disabled={pending}
        onClick={onDelete}
      >
        <Trash2 />
      </Button>
    </div>
  );
}
