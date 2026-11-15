"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

const ERRORS: Record<string, string> = {
  EMAIL_NOT_ALLOWED: "Ditt Google-konto har inte tillgång till Hemmafix. Be den som administrerar appen att lägga till din adress.",
  EMAIL_NOT_VERIFIED: "Din e-postadress är inte verifierad hos Google.",
};

export function LoginCard({ connectApp }: { connectApp?: string }) {
  const error = useSearchParams().get("error");
  const [pending, setPending] = useState(false);

  return (
    <div className="w-full max-w-sm space-y-6 rounded-2xl border bg-card p-8 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.svg" alt="" className="mx-auto size-16" />
      <div>
        <h1 className="text-2xl font-semibold">Hemmafix</h1>
        <p className="text-muted-foreground">Familjens att-göra-lista</p>
      </div>

      {connectApp && (
        <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          Logga in för att ansluta <strong className="text-foreground">{connectApp}</strong> till ditt hem.
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {ERRORS[error] ?? "Inloggningen misslyckades. Försök igen."}
        </p>
      )}

      <Button
        size="lg"
        className="h-11 w-full"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          await authClient.signIn.social({
            provider: "google",
            callbackURL: "/",
            errorCallbackURL: "/login",
          });
        }}
      >
        Logga in med Google
      </Button>
    </div>
  );
}
