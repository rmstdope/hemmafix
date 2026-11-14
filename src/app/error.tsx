"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="max-w-sm space-y-4 text-center">
        <h1 className="text-xl font-semibold">Något gick fel</h1>
        <p className="text-muted-foreground">
          Försök igen. Om det inte hjälper kan du ladda om sidan eller logga in på nytt.
        </p>
        <div className="flex justify-center gap-2">
          <Button onClick={reset}>Försök igen</Button>
          <Link href="/login" className={buttonVariants({ variant: "outline" })}>
            Till inloggningen
          </Link>
        </div>
      </div>
    </main>
  );
}
