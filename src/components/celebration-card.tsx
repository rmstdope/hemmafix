"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Confetti } from "./confetti";

/**
 * A moment's card in the middle of the screen over a dark backdrop, on the browser's own
 * `<dialog>` like the chest: focus goes to "Fortsätt" and stays inside, Esc and a press outside
 * close it. Closing in any way hands back where the card was, for coins to fly from.
 */
export function CelebrationCard({
  title,
  announcement,
  picture,
  children,
  onFinish,
}: {
  /** What a screen reader says once the card is up, politely ("Nytt märke: Tio av samma, 25 mynt"). */
  announcement: string;
  /** The heading, which also names the dialog ("Nytt märke!", "Nivå 5!"). */
  title: string;
  picture: ReactNode;
  children: ReactNode;
  onFinish: (origin: DOMRect) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const keepGoing = useRef<HTMLButtonElement>(null);
  const [said, setSaid] = useState("");

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    el.showModal();
    keepGoing.current?.focus();
    return () => el.close();
  }, []);

  // A live region only speaks changes, so its words arrive just after the card does.
  useEffect(() => {
    const timer = setTimeout(() => setSaid(announcement), 150);
    return () => clearTimeout(timer);
  }, [announcement]);

  const finish = () => {
    const rect = (dialog.current ?? keepGoing.current)?.getBoundingClientRect();
    if (rect) onFinish(rect);
  };

  return (
    <dialog
      ref={dialog}
      aria-labelledby="celebration-title"
      onCancel={(e) => {
        e.preventDefault();
        finish();
      }}
      onClick={(e) => {
        if (e.target === dialog.current) finish();
      }}
      className="m-auto w-[calc(100%-3rem)] max-w-xs rounded-3xl bg-background p-0 text-center text-foreground shadow-2xl backdrop:bg-black/45"
    >
      <Confetti />
      <p role="status" aria-live="polite" className="sr-only">
        {said}
      </p>
      <div className="flex flex-col items-center gap-1 px-5 py-6">
        <div aria-hidden className="mb-1 text-6xl leading-none">
          {picture}
        </div>
        <h2 id="celebration-title" className="text-lg font-bold">
          {title}
        </h2>
        {children}
        <button
          ref={keepGoing}
          type="button"
          onClick={finish}
          className="mt-3 w-full rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Fortsätt
        </button>
      </div>
    </dialog>
  );
}
