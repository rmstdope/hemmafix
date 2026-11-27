"use client";

import { useRef, useState } from "react";
import { buyLook, chooseLook, type ActionState } from "@/app/actions";
import type { Won } from "@/server/badges";
import { useOfferCelebrations } from "@/components/coin-shower";
import { formatCoins } from "@/lib/coins";
import { buyLookLabel, coinsLeft, LOOKS_TITLES, LOOK_KINDS, looksOf, previewMotionText, previewText, type Look } from "@/lib/looks";
import { skyTheme } from "@/lib/sky";
import { cn } from "@/lib/utils";
import { attempt } from "../attempt";
import { CoinDot } from "../coin-pill";
import { MemberAvatar } from "../member-avatar";
import { Sheet } from "../sheet";
import { SCENES } from "../sky/scenes";

type Props = {
  name: string;
  image: string | null;
  coins: number;
  owned: string[];
  chosen: Record<Look["kind"], string>;
};

/** What a look looks like: a frame on the person's own picture, a theme colour, a coin. */
function Visual({ look, name, image, large }: { look: Look; name: string; image: string | null; large?: boolean }) {
  if (look.kind === "frame") return <MemberAvatar name={name} image={image} size={large ? "lg" : "default"} frame={look.key} />;
  if (look.kind === "coin") {
    return (
      <span className={cn("flex items-center justify-center", large ? "size-10 scale-[2]" : "size-8 scale-[1.4]")}>
        <CoinDot look={look.key} />
      </span>
    );
  }
  const sky = skyTheme(look.key);
  if (sky) {
    const { Swatch, Preview } = SCENES[sky];
    return large ? <Preview /> : <Swatch />;
  }
  return (
    <span data-look-theme={look.key} className={cn("flex items-center justify-center rounded-lg", large ? "h-10 w-32" : "size-8")}>
      <span className={cn("rounded-md bg-primary text-xs font-semibold text-primary-foreground", large ? "px-4 py-2" : "size-8")}>
        {large ? "Knapp" : ""}
      </span>
    </span>
  );
}

/** Butik's three rows of looks: Ramar, Teman and Mynt. */
export function Looks({ name, image, coins, owned, chosen }: Props) {
  // What the sheet was opened with: the coins then, so a live refresh never takes Köp away
  // from under a finger. Pressing it asks the server, which has the last word.
  const [open, setOpen] = useState<{ look: Look; coins: number } | null>(null);
  const preview = open?.look ?? null;
  const setPreview = (look: Look | null) => setOpen(look ? { look, coins } : null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const offerCelebrations = useOfferCelebrations();
  const opener = useRef<HTMLElement | null>(null);
  const focus = useRef<HTMLButtonElement>(null);

  const isOwned = (l: Look) => l.price === 0 || owned.includes(`${l.kind}:${l.key}`);

  const press = (look: Look, el: HTMLElement) => {
    if (isOwned(look)) {
      if (chosen[look.kind] !== look.key) void attempt(() => chooseLook(look.kind, look.key));
      return;
    }
    opener.current = el;
    setError(null);
    setPreview(look);
  };

  const buy = async (look: Look) => {
    setBusy(true);
    const result: ActionState<Won> = await buyLook(look.kind, look.key).catch(() => ({ ok: false, error: "Det gick inte att spara. Försök igen." }));
    setBusy(false);
    if (result.ok) {
      setPreview(null);
      if (result.report) offerCelebrations(result.report);
    } else setError(result.error ?? null);
  };

  const openedWith = open?.coins ?? coins;
  const affordable = preview ? openedWith >= preview.price : false;

  return (
    <div className="space-y-4">
      {LOOK_KINDS.map((kind) => (
        <section key={kind} aria-labelledby={`looks-${kind}`}>
          <h2 id={`looks-${kind}`} className="on-sky mb-2 text-sm font-semibold">
            {LOOKS_TITLES[kind]}
          </h2>
          <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {looksOf(kind).map((look) => {
              const used = chosen[kind] === look.key;
              const own = isOwned(look);
              const label = used ? `${look.name}, används` : own ? look.name : `${look.name}, ${look.price} mynt`;
              return (
                <li key={look.key} className="shrink-0">
                  <button
                    type="button"
                    aria-label={label}
                    onClick={(e) => press(look, e.currentTarget)}
                    className={cn(
                      "sky-box flex min-h-11 w-24 flex-col items-center gap-1.5 rounded-xl border p-2 text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      used && "border-green-500 ring-2 ring-green-500",
                    )}
                  >
                    <span className="flex h-12 items-center justify-center">
                      <Visual look={look} name={name} image={image} />
                    </span>
                    <span aria-hidden className="truncate">
                      {look.name}
                    </span>
                    <span aria-hidden className={cn("font-semibold", used ? "text-green-600" : !own && "flex items-center gap-1")}>
                      {used ? "✓ Används" : own ? "Använd" : (
                        <>
                          <CoinDot look="guld" />
                          {formatCoins(look.price)}
                        </>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {preview && (
        <Sheet title={preview.name} onClose={() => setPreview(null)} returnFocusTo={opener} focusRef={focus}>
          <div className="flex flex-col items-center gap-4 py-2 text-center">
            <div className="flex min-h-20 w-full items-center justify-center">
              <Visual look={preview} name={name} image={image} large />
            </div>
            <p>{previewText(preview.kind)}</p>
            {previewMotionText(preview) && <p className="-mt-3 text-sm text-muted-foreground">{previewMotionText(preview)}</p>}
            {!affordable && <p className="text-sm text-muted-foreground">{coinsLeft(preview.price, openedWith)}</p>}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex w-full flex-col gap-2">
              {affordable ? (
                <button
                  ref={focus}
                  type="button"
                  disabled={busy}
                  onClick={() => void buy(preview)}
                  className="min-h-11 rounded-lg bg-primary px-4 font-medium text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
                >
                  {buyLookLabel(preview.price)}
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  className="min-h-11 rounded-lg bg-primary px-4 font-medium text-primary-foreground opacity-50"
                >
                  {buyLookLabel(preview.price)}
                </button>
              )}
              <button
                ref={affordable ? undefined : focus}
                type="button"
                onClick={() => setPreview(null)}
                className="min-h-11 rounded-lg border px-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                Avbryt
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
