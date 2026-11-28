"use client";

import { useId, type RefObject } from "react";
import { MemberAvatar } from "@/components/member-avatar";
import type { ListSharing } from "@/lib/lists";
import { firstName } from "@/lib/mcp-texts";
import { cn } from "@/lib/utils";

/** Someone a list may be shared with: another member of the home. */
export type ShareChoice = { id: string; name: string; image: string | null; frame: string };

/** The Privat lista switch, the words under it, and while it is on a chip for every other member. */
export function SharingPicker({
  value,
  onChange,
  choices,
  switchRef,
}: {
  value: ListSharing;
  onChange: (next: ListSharing) => void;
  choices: ShareChoice[];
  switchRef?: RefObject<HTMLButtonElement | null>;
}) {
  const wordsId = useId();
  const picked = new Set(value.shareWith);
  const toggle = (id: string) =>
    onChange({
      ...value,
      shareWith: picked.has(id) ? value.shareWith.filter((p) => p !== id) : [...value.shareWith, id],
    });

  return (
    <div>
      <button
        ref={switchRef}
        type="button"
        role="switch"
        aria-checked={value.isPrivate}
        aria-describedby={wordsId}
        onClick={() => onChange({ ...value, isPrivate: !value.isPrivate })}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span>Privat lista</span>
        <span
          aria-hidden
          className={cn("flex h-6 w-10 shrink-0 rounded-full p-0.5", value.isPrivate ? "justify-end bg-foreground" : "bg-input")}
        >
          <span className="size-5 rounded-full bg-background shadow-sm" />
        </span>
      </button>
      <p id={wordsId} className="text-sm text-muted-foreground">
        {!value.isPrivate
          ? "Alla i hemmet ser listan."
          : choices.length > 0
            ? "Bara du ser listan. Dela med:"
            : "Bara du ser listan."}
      </p>
      {value.isPrivate && choices.length > 0 && (
        <div role="group" aria-labelledby={wordsId} className="mt-2 flex flex-wrap gap-2">
          {choices.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={picked.has(m.id)}
              onClick={() => toggle(m.id)}
              className={cn(
                "flex min-h-11 max-w-full items-center gap-2 rounded-full border py-1 pr-3 pl-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                picked.has(m.id) ? "border-foreground bg-foreground text-background" : "border-input",
              )}
            >
              {/* The picture is decoration: the chip's name is the person's. */}
              <span aria-hidden className="flex shrink-0 text-foreground">
                <MemberAvatar name={m.name} image={m.image} frame={m.frame} size="sm" />
              </span>
              <span className="min-w-0 break-words">{firstName(m.name)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
