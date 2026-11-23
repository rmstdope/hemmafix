"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type RefObject } from "react";
import { toast } from "sonner";
import { addReward, buyReward, cancelPurchase, deleteReward, updateReward } from "@/app/actions";
import { Sheet } from "@/components/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCoins } from "@/lib/coins";
import { buyText, coinsLeftText, givenWhen, PRICE_ERROR, purchasedWhen } from "@/lib/rewards";
import { cn } from "@/lib/utils";
import type { PurchaseView, RewardView } from "@/server/rewards";

const NOT_ENOUGH = "Du har inte tillräckligt med mynt.";
const NAME_ERROR = "Skriv ett namn.";
const priceClass =
  "flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-3 text-sm font-semibold whitespace-nowrap text-zinc-900 tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:border-border disabled:bg-muted disabled:text-muted-foreground dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100 dark:disabled:bg-muted dark:disabled:text-muted-foreground";
const fieldClass = "h-11 text-base md:text-sm";

type Sheet = { kind: "new" } | { kind: "edit"; reward: RewardView } | { kind: "buy"; reward: RewardView };

/** Butik: what you bought, and the rewards the family agreed on (adults add, change and remove them). */
export function Butik({
  rewards,
  purchases,
  balance,
  isAdult,
  now,
}: {
  rewards: RewardView[];
  purchases: PurchaseView[];
  balance: number;
  isAdult: boolean;
  /** ISO time of the server render, so server and browser write the same dates. */
  now: string;
}) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const open = (next: Sheet, el: HTMLElement) => {
    opener.current = el;
    setSheet(next);
  };
  const close = () => setSheet(null);
  const at = new Date(now);

  return (
    <div className="space-y-6">
      {purchases.length > 0 && (
        <section aria-labelledby="butik-kopt">
          <h2 id="butik-kopt" className="mb-2 text-sm font-semibold text-muted-foreground">
            Köpt
          </h2>
          <ul className="space-y-2">
            {purchases.map((p) => (
              <PurchaseRow key={p.id} purchase={p} now={at} />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="butik-beloningar">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 id="butik-beloningar" className="text-sm font-semibold text-muted-foreground">
            Belöningar
          </h2>
          {isAdult && (
            <Button variant="outline" className="min-h-11" onClick={(e) => open({ kind: "new" }, e.currentTarget)}>
              ＋ Ny belöning
            </Button>
          )}
        </div>
        {rewards.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">
            Inga belöningar än.
            <br />
            {isAdult ? "Lägg till något familjen kan köpa för sina mynt." : "Be en vuxen lägga till några."}
          </p>
        ) : (
          <ul className="space-y-2">
            {rewards.map((r) => {
              const affordable = balance >= r.price;
              return (
                <li key={r.id} className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2">
                  <div className="min-w-0 flex-1">
                    {isAdult ? (
                      <button
                        type="button"
                        className="block min-h-11 w-full text-left font-medium break-words outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                        onClick={(e) => open({ kind: "edit", reward: r }, e.currentTarget)}
                      >
                        {r.name}
                      </button>
                    ) : (
                      <p className="font-medium break-words">{r.name}</p>
                    )}
                    {!affordable && <p className="text-sm text-muted-foreground">{coinsLeftText(r.price, balance)}</p>}
                  </div>
                  <button
                    type="button"
                    disabled={!affordable}
                    aria-label={`Köp ${r.name} för ${formatCoins(r.price)} mynt`}
                    className={priceClass}
                    onClick={(e) => open({ kind: "buy", reward: r }, e.currentTarget)}
                  >
                    {formatCoins(r.price)}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {sheet?.kind === "buy" && <BuySheet reward={sheet.reward} balance={balance} onClose={close} returnFocusTo={opener} />}
      {(sheet?.kind === "new" || sheet?.kind === "edit") && (
        <RewardSheet reward={sheet.kind === "edit" ? sheet.reward : null} onClose={close} returnFocusTo={opener} />
      )}
    </div>
  );
}

function PurchaseRow({ purchase: p, now }: { purchase: PurchaseView; now: Date }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <li className={cn("flex items-center gap-3 rounded-xl border bg-card px-3 py-2", pending && "opacity-60")}>
      <div className="min-w-0 flex-1">
        <p className="font-medium break-words">{p.name}</p>
        <p className="text-sm text-muted-foreground">
          {p.status === "waiting" && purchasedWhen(p.createdAt, now)}
          {p.status === "given" && givenWhen(p.resolvedAt ?? p.createdAt, now)}
          {p.status === "declined" && "Inte given · mynten tillbaka"}
        </p>
      </div>
      {p.status === "waiting" && (
        <>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            Väntar
          </span>
          <Button
            variant="outline"
            className="min-h-11"
            aria-label={`Ångra köpet: ${p.name}`}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await cancelPurchase(p.id);
                if (result.error) {
                  toast.error(result.error);
                  router.refresh();
                }
              })
            }
          >
            Ångra köpet
          </Button>
        </>
      )}
      {p.status === "given" && <span className="text-sm font-semibold text-green-700 dark:text-green-400">✓ Fått</span>}
      {p.status === "declined" && (
        <span className="text-sm font-semibold text-muted-foreground">↩ {formatCoins(p.price)}</span>
      )}
    </li>
  );
}

function BuySheet({
  reward,
  balance,
  onClose,
  returnFocusTo,
}: {
  reward: RewardView;
  balance: number;
  onClose: () => void;
  returnFocusTo: RefObject<HTMLElement | null>;
}) {
  const buy = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const short = balance < reward.price;
  return (
    <Sheet title={`Köpa ${reward.name}?`} onClose={onClose} returnFocusTo={returnFocusTo} focusRef={buy}>
      {!short && <p className="mb-4">{buyText(reward.price, balance)}</p>}
      {(error ?? (short ? NOT_ENOUGH : null)) && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {error ?? NOT_ENOUGH}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Button
          ref={buy}
          className="min-h-11"
          disabled={pending || short}
          onClick={() =>
            startTransition(async () => {
              const result = await buyReward(reward.id);
              if (result.ok) return onClose();
              if (result.error === NOT_ENOUGH) return setError(NOT_ENOUGH);
              // The reward is gone: say so, close, and refresh since an error skips the action's refresh.
              toast.error(result.error ?? "Något gick fel");
              router.refresh();
              onClose();
            })
          }
        >
          Köp för {formatCoins(reward.price)} mynt
        </Button>
        <Button variant="outline" className="min-h-11" onClick={onClose}>
          Avbryt
        </Button>
      </div>
    </Sheet>
  );
}

function RewardSheet({
  reward,
  onClose,
  returnFocusTo,
}: {
  reward: RewardView | null;
  onClose: () => void;
  returnFocusTo: RefObject<HTMLElement | null>;
}) {
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(reward?.name ?? "");
  const [price, setPrice] = useState(reward ? String(reward.price) : "");
  const [errors, setErrors] = useState<{ name?: string; price?: string }>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const finish = (result: { ok: boolean; error?: string }) => {
    if (result.ok) return onClose();
    if (result.error === NAME_ERROR) setErrors({ name: NAME_ERROR });
    else if (result.error === PRICE_ERROR) setErrors({ price: PRICE_ERROR });
    else {
      toast.error(result.error ?? "Något gick fel");
      if (result.error === "Belöningen finns inte längre.") {
        router.refresh();
        onClose();
      }
    }
  };

  return (
    <Sheet title={reward ? "Ändra belöning" : "Ny belöning"} onClose={onClose} returnFocusTo={returnFocusTo} focusRef={nameRef}>
      <form
        className="space-y-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setErrors({});
          startTransition(async () => {
            finish(await (reward ? updateReward(reward.id, { name, price }) : addReward({ name, price })));
          });
        }}
      >
        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">Namn</span>
          <Input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            maxLength={80}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "reward-name-error" : undefined}
            className={fieldClass}
          />
          {errors.name && (
            <span id="reward-name-error" role="alert" className="block text-destructive">
              {errors.name}
            </span>
          )}
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">Pris i mynt</span>
          <Input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="numeric"
            autoComplete="off"
            aria-invalid={Boolean(errors.price)}
            aria-describedby={errors.price ? "reward-price-error" : undefined}
            className={fieldClass}
          />
          {errors.price && (
            <span id="reward-price-error" role="alert" className="block text-destructive">
              {errors.price}
            </span>
          )}
        </label>
        <div className="flex flex-col gap-2 pt-1">
          <Button type="submit" className="min-h-11" disabled={pending}>
            {reward ? "Spara" : "Lägg till"}
          </Button>
          {reward && (
            <Button
              type="button"
              variant="destructive"
              className="min-h-11"
              disabled={pending}
              onClick={() => startTransition(async () => finish(await deleteReward(reward.id)))}
            >
              Ta bort belöning
            </Button>
          )}
          <Button type="button" variant="outline" className="min-h-11" onClick={onClose}>
            Avbryt
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
