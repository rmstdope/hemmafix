"use client";

import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { clampCoins, MAX_COINS, stepCoins } from "@/lib/coins";
import { CoinIcon } from "./coin-badge";

/**
 * "Mynt": the amount a task gives, 0 to 100, between − and +. The number can be typed; what is
 * typed is made whole and kept within 0 and 100 when the field is left, and an emptied field
 * goes back to what it was. With `name` the amount is submitted with the form.
 */
export function CoinStepper({
  value,
  onChange,
  name,
}: {
  value: number;
  onChange: (coins: number) => void;
  name?: string;
}) {
  // What is typed while the field has focus; null shows `value`.
  const [typed, setTyped] = useState<string | null>(null);
  const shown = typed ?? String(value);
  // The form always submits a valid amount, even when it is sent from the middle of typing.
  const submitted = typed === null ? value : clampCoins(typed, value);

  return (
    <div className="space-y-1 text-sm">
      <span className="text-muted-foreground">Mynt</span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          className="size-11 shrink-0"
          aria-label="Färre mynt"
          disabled={submitted <= 0}
          onClick={() => {
            setTyped(null);
            onChange(stepCoins(submitted, -1));
          }}
        >
          <Minus />
        </Button>
        <div className="flex h-11 w-24 items-center gap-1.5 rounded-lg border border-input px-2 dark:bg-input/30">
          <CoinIcon className="size-4" />
          <input
            type="number"
            inputMode="numeric"
            aria-label="Mynt"
            step="any"
            value={shown}
            onChange={(e) => {
              setTyped(e.target.value);
              // The parent always holds what leaving the field would make of it, so Enter saves that.
              if (Number.isFinite(Number(e.target.value)) && e.target.value.trim() !== "") {
                onChange(clampCoins(e.target.value, value));
              }
            }}
            onKeyDown={(e) => {
              // No minus sign (nor the exponent or plus a number field would take).
              if (["-", "+", "e", "E"].includes(e.key)) e.preventDefault();
              // The arrows step by 1 within 0 and 100. No min and max on the field itself: the
              // browser would refuse to submit a typed 150 instead of letting it become 100.
              if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                e.preventDefault();
                setTyped(null);
                onChange(clampCoins(String(submitted + (e.key === "ArrowUp" ? 1 : -1)), submitted));
              }
            }}
            onBlur={() => {
              if (typed !== null) onChange(clampCoins(typed, value));
              setTyped(null);
            }}
            className="h-full w-full min-w-0 [appearance:textfield] bg-transparent text-center text-base font-semibold tabular-nums outline-none md:text-sm [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          className="size-11 shrink-0"
          aria-label="Fler mynt"
          disabled={submitted >= MAX_COINS}
          onClick={() => {
            setTyped(null);
            onChange(stepCoins(submitted, 1));
          }}
        >
          <Plus />
        </Button>
      </div>
      {name && <input type="hidden" name={name} value={submitted} />}
    </div>
  );
}
