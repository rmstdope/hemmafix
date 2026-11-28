"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { CALENDAR_LINK_REQUEST, type CalendarDay, type CalendarView as View } from "@/lib/calendar";
import { SAVE_FAILED } from "@/lib/routine-texts";
import { setNeedsCalendarAccess } from "./access-store";
import { CalendarSkeleton } from "./calendar-skeleton";

/** How often an open page reads Google again: how late a change there shows. */
const LOOK_MS = 15_000;
/** Longer than the server waits for Google, so only a lost connection reaches it. */
const GIVE_UP_MS = 60_000;

/**
 * The family calendar's coming days, read again and again while the page is shown. What was read is
 * held only here, never on the device.
 */
export function CalendarView({ loginHint }: { loginHint?: string }) {
  const router = useRouter();
  /** null while there is nothing to show yet. */
  const [view, setView] = useState<View | null>(null);
  const reading = useRef(false);

  const read = useCallback(async () => {
    if (reading.current) return;
    reading.current = true;
    try {
      const response = await fetch("/api/calendar", { cache: "no-store", signal: AbortSignal.timeout(GIVE_UP_MS) });
      // Logged out: the refresh leads to the login page.
      if (response.status === 401) return router.refresh();
      if (!response.ok) throw new Error(`${response.status}`);
      const next = (await response.json()) as View;
      setView(next);
      // A Google that does not answer says nothing about the access.
      if (next.state !== "unreachable") setNeedsCalendarAccess(next.state === "needs-access");
    } catch {
      // Hemmafix does not answer, as during a deploy: what is shown stays.
      setView((shown) => shown ?? { state: "unreachable" });
    } finally {
      reading.current = false;
    }
  }, [router]);

  useEffect(() => {
    const whenVisible = () => {
      if (document.visibilityState === "visible") void read();
    };
    const first = setTimeout(read);
    const timer = setInterval(whenVisible, LOOK_MS);
    document.addEventListener("visibilitychange", whenVisible);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", whenVisible);
    };
  }, [read]);

  const retry = (
    <Button
      variant="outline"
      className="h-11 px-4"
      onClick={() => {
        setView(null);
        void read();
      }}
    >
      Försök igen
    </Button>
  );

  if (!view) return <CalendarSkeleton />;
  switch (view.state) {
    case "needs-access":
      return (
        <Card
          picture="📅"
          title="Se familjens kalender här"
          text="Ge Hemmafix tillgång till familjekalendern i ditt Google-konto, så ser du vad som händer de närmaste 14 dagarna. Hemmafix kan bara läsa, aldrig ändra."
        >
          <GiveAccess loginHint={loginHint} />
        </Card>
      );
    case "no-calendar":
      return (
        <Card
          picture="🔍"
          title="Ingen familjekalender hittades"
          text="Ditt Google-konto har ingen familjekalender. Den finns när du är med i en familjegrupp i Google."
        >
          {retry}
        </Card>
      );
    case "unreachable":
      return (
        <Card picture="⚠️" title="Kunde inte hämta kalendern" text="Google svarar inte just nu.">
          {retry}
        </Card>
      );
    case "ok":
      if (view.days.length === 0) {
        return <Card picture="🌤️" title="Inget i kalendern" text="Familjekalendern är tom de närmaste 14 dagarna." />;
      }
      return <Days days={view.days} />;
  }
}

function GiveAccess({ loginHint }: { loginHint?: string }) {
  return (
    <Button
      className="h-11 px-4"
      onClick={async () => {
        // On success the browser leaves for Google, and comes back to Kalender.
        const failed = await authClient
          .linkSocial({ ...CALENDAR_LINK_REQUEST, loginHint })
          .then((result) => result.error !== null)
          .catch(() => true);
        if (failed) toast.error(SAVE_FAILED);
      }}
    >
      Ge tillgång med Google
    </Button>
  );
}

function Card({ picture, title, text, children }: { picture: string; title: string; text: string; children?: ReactNode }) {
  return (
    <div className="sky-box mt-8 rounded-xl border border-dashed px-5 py-6 text-center">
      <p className="text-4xl" aria-hidden>
        {picture}
      </p>
      <h2 className="mt-2 mb-1.5 font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{text}</p>
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}

/** The days with their events. Nothing here can be pressed: Kalender only shows. */
function Days({ days }: { days: CalendarDay[] }) {
  return (
    <>
      {days.map(({ day, heading, events }) => (
        <section key={day}>
          <h2 className="on-sky-muted mt-4 mb-1.5 text-sm font-semibold text-muted-foreground">
            <span className="on-sky text-foreground">{heading.lead}</span>
            {heading.rest ? ` · ${heading.rest}` : null}
          </h2>
          <ul className="space-y-2">
            {events.map((event) => (
              <li
                key={event.id}
                data-ended={event.ended || undefined}
                className="rounded-xl border bg-card px-3 py-2.5 wrap-anywhere data-ended:opacity-45"
              >
                <p className="font-semibold">{event.title}</p>
                <p className="text-sm text-muted-foreground">{event.line}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="on-sky-muted mt-5 text-center text-sm text-muted-foreground">Visar de närmaste 14 dagarna.</p>
    </>
  );
}
