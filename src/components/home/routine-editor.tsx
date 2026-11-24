"use client";

import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  addRoutineTask,
  deleteRoutine,
  removeRoutineTask,
  renameRoutine,
  updateRoutineTask,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { attempt } from "@/components/attempt";
import { TaskRowBody } from "@/components/task-row";
import { CoinStepper } from "@/components/coin-stepper";
import { removeRoutineNotice } from "@/lib/routine-texts";

type Routine = { id: string; name: string; tasks: { id: string; title: string; coins: number }[] };

/** A routine's page: its name, its tasks, and what can be done to them. */
export function RoutineEditor({ routine, suggestions }: { routine: Routine; suggestions: string[] }) {
  const [pending, startTransition] = useTransition();
  const [renaming, setRenaming] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const taken = new Set(routine.tasks.map((t) => t.title.toLowerCase()));
  const offered = suggestions.filter((s) => !taken.has(s.toLowerCase()));

  const removeTask = (task: { id: string; title: string }) =>
    startTransition(async () => {
      if (await attempt(() => removeRoutineTask(routine.id, task.id))) toast.success(`${task.title} är borttagen`);
    });

  return (
    <>
      <header className="mb-6 flex items-center gap-2">
        <Link
          href="/hemmet"
          aria-label="Tillbaka"
          className="-ml-3 flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground"
        >
          <ArrowLeft className="size-5" />
        </Link>
        {renaming ? (
          <EditField
            key={routine.id}
            label={`Nytt namn för ${routine.name}`}
            initial={routine.name}
            onCancel={() => setRenaming(false)}
            onSave={(name) => attempt(() => renameRoutine(routine.id, name))}
            onSaved={() => setRenaming(false)}
          />
        ) : (
          <>
            <h1 className="min-w-0 flex-1 text-xl font-semibold break-words">{routine.name}</h1>
            <Button
              variant="ghost"
              size="icon-lg"
              className="h-8 w-11 shrink-0 text-muted-foreground"
              aria-label={`Byt namn på ${routine.name}`}
              onClick={() => setRenaming(true)}
            >
              <Pencil />
            </Button>
          </>
        )}
      </header>

      <section className="space-y-3" aria-labelledby="tasks-heading">
        <h2 id="tasks-heading" className="text-sm font-medium text-muted-foreground">
          Uppgifter
        </h2>
        {routine.tasks.length === 0 ? (
          <p className="rounded-xl border border-dashed p-3.5 text-sm text-muted-foreground">
            Inga uppgifter ännu. Lägg till det som brukar göras tillsammans.
          </p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card" aria-label="Uppgifter">
            {routine.tasks.map((t) =>
              editingId === t.id ? (
                <li key={t.id} className="p-2">
                  <EditField
                    label={`Ändra ${t.title}`}
                    initial={t.title}
                    coins={t.coins}
                    onCancel={() => setEditingId(null)}
                    onSave={(title, coins) => attempt(() => updateRoutineTask(routine.id, t.id, title, coins))}
                    onSaved={() => setEditingId(null)}
                  />
                </li>
              ) : (
                <li key={t.id} className="flex py-1 pr-1 pl-3">
                  <TaskRowBody
                    title={t.title}
                    coins={t.coins}
                    trailing={
                      <>
                        <Button
                          variant="ghost"
                          size="icon-lg"
                          className="h-8 w-11 shrink-0 text-muted-foreground"
                          aria-label={`Ändra ${t.title}`}
                          disabled={pending}
                          onClick={() => setEditingId(t.id)}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-lg"
                          className="h-8 w-11 shrink-0 text-muted-foreground"
                          aria-label={`Ta bort ${t.title}`}
                          disabled={pending}
                          onClick={() => removeTask(t)}
                        >
                          <Trash2 />
                        </Button>
                      </>
                    }
                  />
                </li>
              ),
            )}
          </ul>
        )}

        <NewTask routineId={routine.id} suggestions={offered} />
      </section>

      <RemoveRoutine routine={routine} />
    </>
  );
}

/** The field with Spara and Avbryt that replaces a name while it is changed (as for a room). */
function EditField({
  label,
  initial,
  coins,
  onSave,
  onSaved,
  onCancel,
}: {
  label: string;
  initial: string;
  /** With an amount (a routine's task), the "Mynt" control comes with the name. */
  coins?: number;
  onSave: (value: string, coins?: number) => Promise<boolean>;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [amount, setAmount] = useState(coins ?? 0);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className={coins === undefined ? "flex min-w-0 flex-1 gap-2" : "min-w-0 flex-1 space-y-3"}
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          if (await onSave(value, coins === undefined ? undefined : amount)) onSaved();
        });
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div className="flex min-w-0 flex-1 gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label={label}
          autoFocus
          autoComplete="off"
          className="h-11 text-base md:text-sm"
        />
        {coins === undefined && <EditButtons pending={pending} onCancel={onCancel} />}
      </div>
      {coins !== undefined && (
        <>
          <CoinStepper value={amount} onChange={setAmount} />
          <div className="flex gap-2">
            <EditButtons pending={pending} onCancel={onCancel} />
          </div>
        </>
      )}
    </form>
  );
}

function EditButtons({ pending, onCancel }: { pending: boolean; onCancel: () => void }) {
  return (
    <>
      <Button type="submit" className="h-11 shrink-0" disabled={pending}>
        Spara
      </Button>
      <Button type="button" variant="ghost" className="h-11 shrink-0" onClick={onCancel}>
        Avbryt
      </Button>
    </>
  );
}

/** "Ny uppgift" and the tap-to-add suggestions; focus stays in the field after each add. */
function NewTask({ routineId, suggestions }: { routineId: string; suggestions: string[] }) {
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const add = (value: string, onAdded?: () => void) =>
    startTransition(async () => {
      if (await attempt(() => addRoutineTask(routineId, value))) onAdded?.();
      inputRef.current?.focus();
    });

  return (
    <>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add(title, () => setTitle(""));
        }}
      >
        <Input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ny uppgift"
          aria-label="Ny uppgift"
          autoComplete="off"
          className="h-11 text-base md:text-sm"
        />
        <Button type="submit" className="h-11 shrink-0" disabled={pending}>
          Lägg till
        </Button>
      </form>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Förslag">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              disabled={pending}
              onClick={() => add(s)}
              className="min-h-11 rounded-full border border-dashed px-3.5 text-sm text-muted-foreground disabled:opacity-50"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/** "Ta bort rutinen" and its confirmation, built like the one for disconnecting an app. */
function RemoveRoutine({ routine }: { routine: Routine }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [pending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (asking && !dialog.open) {
      dialog.showModal();
      // Never the red button: a stray Enter must not remove the routine.
      cancelRef.current?.focus();
    }
    if (!asking && dialog.open) dialog.close();
  }, [asking]);

  const close = () => {
    if (pending) return;
    setAsking(false);
    openerRef.current?.focus();
  };

  const confirm = () =>
    startTransition(async () => {
      const ok = await attempt(() => deleteRoutine(routine.id));
      setAsking(false);
      if (ok) {
        toast.success(`${routine.name} är borttagen`);
        router.push("/hemmet");
      } else {
        openerRef.current?.focus();
      }
    });

  return (
    <>
      <button
        type="button"
        ref={openerRef}
        onClick={() => setAsking(true)}
        className="mt-8 h-11 w-full rounded-xl border font-semibold text-destructive"
      >
        Ta bort rutinen
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="remove-routine-heading"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl bg-background p-0 text-foreground shadow-lg backdrop:bg-black/45"
      >
        {asking && (
          <div className="p-5">
            <h2 id="remove-routine-heading" className="text-lg font-semibold break-words">
              Ta bort {routine.name}?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {removeRoutineNotice(routine.tasks.length)}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={confirm}
                disabled={pending}
                className="h-11 rounded-xl bg-destructive font-semibold text-white disabled:opacity-50"
              >
                {pending ? "Tar bort…" : "Ta bort"}
              </button>
              <button
                type="button"
                ref={cancelRef}
                onClick={close}
                disabled={pending}
                className="h-11 rounded-xl border font-semibold disabled:opacity-50"
              >
                Avbryt
              </button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
