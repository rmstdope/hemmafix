"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The day's chest: a card in the middle of the screen over a dark backdrop, on the browser's own
 * `<dialog>` (focus stays inside, Esc and a press outside close it). Pressing the chest shows
 * what is in it; closing it in any way, opened or not, hands back where the coins start from.
 */
export function ChestCard({ coins, onFinish }: { coins: number; onFinish: (origin: DOMRect) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const chest = useRef<HTMLButtonElement>(null);
  const keepGoing = useRef<HTMLButtonElement>(null);
  const [opened, setOpened] = useState(false);
  const [calm] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    el.showModal();
    chest.current?.focus();
    return () => el.close();
  }, []);

  useEffect(() => {
    if (opened) keepGoing.current?.focus();
  }, [opened]);

  const finish = () => {
    const rect = (chest.current ?? dialog.current)?.getBoundingClientRect();
    if (rect) onFinish(rect);
  };

  return (
    <dialog
      ref={dialog}
      aria-labelledby="chest-title"
      onCancel={(e) => {
        e.preventDefault();
        finish();
      }}
      onClick={(e) => {
        if (e.target === dialog.current) finish();
      }}
      className="m-auto w-[calc(100%-3rem)] max-w-xs rounded-3xl bg-background p-0 text-center text-foreground shadow-2xl backdrop:bg-black/45"
    >
      <div className="flex flex-col items-center gap-1 px-5 py-6">
        <button
          ref={chest}
          type="button"
          aria-label="Öppna kistan"
          disabled={opened}
          onClick={() => setOpened(true)}
          className="relative text-6xl leading-none outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-100"
        >
          <span aria-hidden>{opened ? "✨" : "🧰"}</span>
          {opened && !calm && (
            <span aria-hidden data-sparkle className="absolute inset-0 animate-ping rounded-full bg-amber-300/40" />
          )}
        </button>
        {opened ? (
          <>
            <h2 id="chest-title" className="sr-only">
              Dagens kista
            </h2>
            <p className="text-xl font-bold">+{coins} mynt</p>
            <p className="text-sm text-muted-foreground">Ny kista i morgon</p>
            <button
              ref={keepGoing}
              type="button"
              onClick={finish}
              className="mt-3 w-full rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Fortsätt
            </button>
          </>
        ) : (
          <>
            <h2 id="chest-title" className="text-lg font-bold">
              Dagens kista
            </h2>
            <p className="text-sm text-muted-foreground">Tryck för att öppna</p>
          </>
        )}
      </div>
    </dialog>
  );
}
