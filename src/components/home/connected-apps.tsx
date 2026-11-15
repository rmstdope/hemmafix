"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { disconnectApp } from "@/app/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export type ConnectedApp = {
  id: string;
  name: string;
  /** The name for the middle of a sentence. */
  nameInline: string;
  /** Where the app sends the person back to; null when it registered nothing readable. */
  address: { label: string; known: boolean } | null;
  icon: string | null;
  connectedText: string;
  /** The whole line: "Senast använd i dag 08:14" or "Inte använd ännu". */
  lastUsedLine: string;
};

/** Only an https address is loaded as an icon: it is chosen by the app, so it is untrusted. */
const isHttps = (url: string | null): url is string => !!url && url.startsWith("https://");

function AppIcon({ name, icon }: { name: string; icon: string | null }) {
  return (
    <Avatar className="rounded-lg after:rounded-lg">
      {isHttps(icon) && <AvatarImage src={icon} alt="" referrerPolicy="no-referrer" className="rounded-lg" />}
      <AvatarFallback aria-hidden className="rounded-lg font-semibold">
        {name.trim().charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

export function ConnectedApps({ apps }: { apps: ConnectedApp[] }) {
  const [asking, setAsking] = useState<ConnectedApp | null>(null);
  const [pending, startTransition] = useTransition();
  // The list length once the disconnect shows: focus moves when the list shrinks to it.
  const focusWhenLengthIs = useRef<number | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const emptyRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (asking && !dialog.open) {
      dialog.showModal();
      // Never the red button: a stray Enter must not disconnect.
      cancelRef.current?.focus();
    }
    if (!asking && dialog.open) dialog.close();
  }, [asking]);

  // After a disconnect the row is gone: put focus on the heading, or on the empty line.
  useEffect(() => {
    if (focusWhenLengthIs.current === null || asking || apps.length > focusWhenLengthIs.current) return;
    focusWhenLengthIs.current = null;
    (emptyRef.current ?? headingRef.current)?.focus();
  }, [asking, apps.length]);

  const close = () => {
    if (pending) return;
    setAsking(null);
    openerRef.current?.focus();
  };

  const confirm = () => {
    const app = asking;
    if (!app) return;
    startTransition(async () => {
      // A thrown action (network or database failure) is a failed disconnect like any other.
      const result = await disconnectApp(app.id).catch(() => ({ ok: false }));
      if (result.ok) focusWhenLengthIs.current = apps.length - 1;
      setAsking(null);
      if (result.ok) {
        toast.success(`${app.name} är frånkopplad`);
      } else {
        toast.error(`Det gick inte att koppla från ${app.nameInline}. Försök igen.`);
        openerRef.current?.focus();
      }
    });
  };

  return (
    <section className="mt-8 space-y-2" aria-labelledby="apps-heading">
      <h2 id="apps-heading" ref={headingRef} tabIndex={-1} className="text-sm font-medium text-muted-foreground outline-none">
        Anslutna appar
      </h2>
      {apps.length === 0 ? (
        <p ref={emptyRef} tabIndex={-1} className="rounded-xl border border-dashed p-3.5 text-sm text-muted-foreground outline-none">
          Du har inte anslutit några appar. När du ansluter till exempel Claude till Hemmafix syns den här.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Appar du har gett tillgång till hemmet. Bara du ser dina.</p>
          <ul className="divide-y rounded-xl border bg-card" aria-label="Anslutna appar">
            {apps.map((app) => (
              <li key={app.id} className="flex items-center gap-3 px-3 py-2.5">
                <AppIcon name={app.name} icon={app.icon} />
                <div className="min-w-0 flex-1">
                  <p className="break-words">{app.name}</p>
                  {app.address && (
                    <p className={`text-sm break-all ${app.address.known ? "text-muted-foreground" : "text-amber-800 dark:text-amber-300"}`}>
                      {app.address.known ? app.address.label : `${app.address.label} · okänd adress`}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">Ansluten {app.connectedText}</p>
                  <p className="text-sm text-muted-foreground">{app.lastUsedLine}</p>
                </div>
                <button
                  type="button"
                  aria-label={`Koppla från ${app.nameInline}`}
                  onClick={(e) => {
                    openerRef.current = e.currentTarget;
                    setAsking(app);
                  }}
                  className="min-h-11 shrink-0 rounded-lg px-2 text-sm font-medium whitespace-nowrap text-destructive focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  Koppla från
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby="disconnect-heading"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl bg-background p-0 text-foreground shadow-lg backdrop:bg-black/45"
      >
        {asking && (
          <div className="p-5">
            <h3 id="disconnect-heading" className="text-lg font-semibold break-words">
              Koppla från {asking.nameInline}?
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {asking.name} kan inte längre se eller ändra hemmet. För att ansluta igen måste du godkänna på nytt.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={confirm}
                disabled={pending}
                className="h-11 rounded-xl bg-destructive font-semibold text-white disabled:opacity-50"
              >
                {pending ? "Kopplar från…" : "Koppla från"}
              </button>
              <button
                type="button"
                ref={cancelRef}
                onClick={close}
                disabled={pending}
                className="h-11 rounded-xl border font-semibold disabled:opacity-50"
              >
                Avbryt
              </button>
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
}
