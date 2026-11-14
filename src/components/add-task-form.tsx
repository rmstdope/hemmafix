"use client";

import { ChevronDown, Plus } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { createTask, type ActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Member } from "@/server/tasks";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-transparent px-3 text-base md:text-sm dark:bg-input/30";

export function AddTaskForm({ members, currentUserId }: { members: Member[]; currentUserId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(createTask, { ok: false });

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      formRef.current?.querySelector<HTMLInputElement>("input[name=title]")?.focus();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-2">
      <div className="flex gap-2">
        <Input
          name="title"
          placeholder="Vad behöver göras?"
          aria-label="Ny uppgift"
          autoComplete="off"
          required
          maxLength={200}
          className="h-11 text-base md:text-sm"
        />
        <Button type="submit" size="icon-lg" className="size-11 shrink-0" disabled={pending} aria-label="Lägg till">
          <Plus />
        </Button>
      </div>

      <button
        type="button"
        onClick={() => setShowDetails((v) => !v)}
        className="flex items-center gap-1 text-sm text-muted-foreground"
        aria-expanded={showDetails}
      >
        Fler val
        <ChevronDown className={`size-4 transition-transform ${showDetails ? "rotate-180" : ""}`} />
      </button>

      <div hidden={!showDetails} className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Vem</span>
          <select name="assigneeId" defaultValue="" className={selectClass}>
            <option value="">Ingen</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === currentUserId ? `${m.name} (jag)` : m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Klart senast</span>
          <input type="date" name="dueDate" className={selectClass} />
        </label>
      </div>
    </form>
  );
}
