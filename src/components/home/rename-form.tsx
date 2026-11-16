"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { renameHousehold, type ActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { submitKeepingValues } from "@/components/submit-keeping-values";

export function RenameForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(renameHousehold, { ok: false });

  useEffect(() => {
    if (state.ok) toast.success("Namnet är sparat");
    else if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form onSubmit={submitKeepingValues(action)} className="flex gap-2">
      <Input
        name="name"
        defaultValue={name}
        aria-label="Hemmets namn"
        autoComplete="off"
        required
        maxLength={60}
        className="h-11 text-base md:text-sm"
      />
      <Button type="submit" className="h-11 shrink-0" disabled={pending}>
        Spara
      </Button>
    </form>
  );
}
