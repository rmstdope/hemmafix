"use client";

import { useRef, useState, type ComponentProps } from "react";
import { AddChoreForm } from "./add-chore-form";
import { FloatingAdd, Sheet } from "./sheet";

type FormProps = Omit<ComponentProps<typeof AddChoreForm>, "onClose">;

/** The round + (adults) and the add form it opens in a sheet (phone) or dialog (desktop). */
export function AddChoreSheet(props: FormProps) {
  const [open, setOpen] = useState(false);
  const plus = useRef<HTMLButtonElement>(null);
  return (
    <>
      <FloatingAdd label="Ny uppgift" buttonRef={plus} onClick={() => setOpen(true)} />
      {open && (
        <Sheet title="Ny uppgift" onClose={() => setOpen(false)} returnFocusTo={plus}>
          <AddChoreForm {...props} onClose={() => setOpen(false)} />
        </Sheet>
      )}
    </>
  );
}
