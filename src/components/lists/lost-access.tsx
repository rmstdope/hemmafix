"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

/** Shown in place of a list the person no longer sees: back to Listor, saying why. */
export function LostAccess({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  useEffect(() => {
    // A moment later, so that on a page just loaded the notices are listening. The id keeps it one.
    setTimeout(() => toast(`${name} delas inte längre med dig.`, { id: `lost-${id}` }));
    router.replace("/listor");
  }, [id, name, router]);
  return null;
}
