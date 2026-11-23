"use client";

import { useRef, useState, useTransition } from "react";
import { closeWeekRecap } from "@/app/actions";
import { WeekTable } from "@/components/jag/week-table";
import { Sheet } from "@/components/sheet";
import { Button } from "@/components/ui/button";
import { comparisonLine } from "@/lib/weeks";
import type { WeekRecap } from "@/server/weeks";

/** "Din vecka": last week against the week before, the first time it is opened in a new week. */
export function WeekRecapSheet({ recap }: { recap: WeekRecap }) {
  const [open, setOpen] = useState(true);
  const [, startTransition] = useTransition();
  const none = useRef<HTMLElement | null>(null);
  const keep = useRef<HTMLButtonElement>(null);
  if (!open) return null;
  const close = () => {
    setOpen(false);
    startTransition(async () => {
      await closeWeekRecap();
    });
  };
  return (
    <Sheet title="Din vecka" onClose={close} returnFocusTo={none} focusRef={keep}>
      <p className="mb-2 text-sm text-muted-foreground">{recap.range}</p>
      <WeekTable now={recap.week} before={recap.before} labels={["Veckan", "Veckan före"]} />
      <p className="mt-3 text-sm font-medium text-emerald-700 dark:text-emerald-400">{comparisonLine(recap.week, recap.before, "veckan före")}</p>
      <Button ref={keep} onClick={close} className="mt-4 h-11 w-full">
        Fortsätt
      </Button>
    </Sheet>
  );
}
