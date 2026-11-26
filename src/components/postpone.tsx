"use client";

import { createContext, useCallback, useContext, useRef } from "react";
import { addDays } from "@/lib/dates";
import { laterThan, quickDays } from "@/lib/postpone";

/** A move of an open chore to a later day, asked for by its row and carried out by the board. */
export type Postpone = (task: { id: string; title: string }, day: string) => void;

export const PostponeContext = createContext<Postpone | null>(null);

const button = "h-10 min-w-0 rounded-lg border border-input text-xs whitespace-nowrap hover:bg-muted min-[360px]:text-[13px] dark:bg-input/30";

/** "Skjut upp": the three days after the chore's own (or today), and the device's picker for any later one. */
export function PostponeLine({
  task,
  today,
  onChosen,
}: {
  task: { id: string; title: string; dueDate: string };
  today: string;
  /** Told as the move is sent, so the row can close its panel. */
  onChosen: () => void;
}) {
  const postpone = useContext(PostponeContext);
  const field = useRef<HTMLInputElement | null>(null);
  const last = laterThan(task.dueDate, today);

  const choose = useCallback(
    (day: string) => {
      onChosen();
      postpone?.(task, day);
    },
    [onChosen, postpone, task],
  );

  // The native `change`, which comes when a day is picked: React's onChange is `input`, which a
  // picker also sends while the person is still looking around in it.
  const listen = useCallback(
    (input: HTMLInputElement | null) => {
      field.current = input;
      if (!input) return;
      const picked = () => {
        const day = input.value;
        input.value = "";
        // Not every phone's picker honours `min`.
        if (day > last) choose(day);
      };
      input.addEventListener("change", picked);
      return () => input.removeEventListener("change", picked);
    },
    [choose, last],
  );

  const openPicker = () => {
    const input = field.current;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      // A browser without it: focusing and clicking the field is what is left.
      input.focus();
    }
  };

  if (!postpone) return null;

  return (
    <div role="group" aria-label={`${task.title}: skjut upp`} className="space-y-1.5">
      <p className="text-sm text-muted-foreground">Skjut upp</p>
      <div className="grid max-w-[420px] grid-cols-4 gap-1">
        {quickDays(task.dueDate, today).map((q) => (
          <button key={q.day} type="button" className={button} onClick={() => choose(q.day)}>
            {q.label}
          </button>
        ))}
        <div className="relative grid min-w-0">
          <button type="button" className={button} onClick={openPicker}>
            Välj dag…
          </button>
          {/* Lies unseen over the button, so a tap is a tap on the field and a phone opens its own picker. */}
          <input
            ref={listen}
            type="date"
            min={addDays(last, 1)}
            tabIndex={-1}
            aria-hidden
            className="absolute inset-0 size-full cursor-pointer opacity-0"
            onClick={openPicker}
          />
        </div>
      </div>
    </div>
  );
}
