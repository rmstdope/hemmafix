"use client";

import { Check, RotateCcw, Trash2 } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { assignTask, deleteTask, setTaskCompleted } from "@/app/actions";
import { Button } from "@/components/ui/button";
import type { Member, TaskView } from "@/server/tasks";
import { cn } from "@/lib/utils";
import { formatDue } from "@/lib/dates";

export function TaskItem({
  task,
  members,
  currentUserId,
}: {
  task: TaskView;
  members: Member[];
  currentUserId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [assigneeId, setOptimisticAssignee] = useOptimistic(task.assigneeId);
  const [hidden, setHidden] = useOptimistic(false);
  const completed = task.completedAt !== null;
  const due = formatDue(task.dueDate);

  const run = (fn: () => Promise<void>, onError = "Något gick fel, försök igen") =>
    startTransition(async () => {
      try {
        await fn();
      } catch {
        toast.error(onError);
      }
    });

  if (hidden) return null;

  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-card px-3 py-2 transition-opacity",
        pending && "opacity-60",
      )}
    >
      <Button
        variant={completed ? "secondary" : "outline"}
        size="icon-lg"
        className="size-10 shrink-0 rounded-full"
        aria-label={completed ? "Ångra klar" : "Markera som klar"}
        onClick={() =>
          run(async () => {
            setHidden(true);
            await setTaskCompleted(task.id, !completed);
          })
        }
      >
        {completed ? <RotateCcw /> : <Check className="opacity-40" />}
      </Button>

      <div className="min-w-0 flex-1">
        <p className={cn("truncate font-medium", completed && "text-muted-foreground line-through")}>
          {task.title}
        </p>
        {(due || task.notes) && (
          <p className="truncate text-xs text-muted-foreground">
            {due && <span className={cn(due.overdue && !completed && "font-medium text-destructive")}>{due.label}</span>}
            {due && task.notes && " · "}
            {task.notes}
          </p>
        )}
      </div>

      {!completed && (
        <select
          aria-label="Tilldela"
          value={assigneeId ?? ""}
          onChange={(e) => {
            const next = e.target.value || null;
            run(async () => {
              setOptimisticAssignee(next);
              await assignTask(task.id, next);
            });
          }}
          className="h-10 max-w-28 truncate rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
        >
          <option value="">Ingen</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id === currentUserId ? "Jag" : m.name.split(" ")[0]}
            </option>
          ))}
        </select>
      )}

      <Button
        variant="ghost"
        size="icon-lg"
        aria-label="Ta bort"
        className="shrink-0 text-muted-foreground"
        onClick={() =>
          run(async () => {
            setHidden(true);
            await deleteTask(task.id);
            toast.success(`"${task.title}" togs bort`);
          })
        }
      >
        <Trash2 />
      </Button>
    </li>
  );
}
