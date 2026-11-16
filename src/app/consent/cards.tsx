"use client";

import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { MemberAvatar } from "@/components/member-avatar";
import { Button } from "@/components/ui/button";
import type { AppAddress } from "@/lib/connecting-app";
import { authClient } from "@/lib/auth-client";

const Card = ({ children, left = false }: { children: ReactNode; left?: boolean }) => (
  <div className={`w-full max-w-sm space-y-6 rounded-2xl border bg-card p-8 ${left ? "" : "text-center"}`}>{children}</div>
);

const HemmafixIcon = () => <Image src="/icon.svg" alt="" width={64} height={64} className="size-16" />;

/**
 * Sends the browser back to the app with the server's answer; false when the link no longer works.
 *
 * The server answers `{ redirect: true, url }`, and Better Auth's client follows that itself.
 * Navigating here as well sent the browser to the app twice.
 */
async function answer(accept: boolean): Promise<boolean> {
  const { data } = await authClient.oauth2.consent({ accept });
  if (!data?.url) return false;
  if (!data.redirect) window.location.href = data.url;
  return true;
}

/** Logs out and starts the connection over from the login step, keeping the signed request. */
function useSwitchAccount(onFailed: () => void) {
  const router = useRouter();
  return async () => {
    const { error } = await authClient.signOut();
    if (error) return onFailed();
    router.push(`/login${window.location.search}`);
  };
}

export function ApprovalCard({
  appName,
  appNameInline,
  address,
  homeName,
  person,
}: {
  appName: string;
  appNameInline: string;
  address: AppAddress;
  homeName: string;
  person: { name: string; firstName: string; image: string | null };
}) {
  const [pending, setPending] = useState(false);
  // The signed link only lasts a few minutes: when the server no longer accepts it, say so.
  const [expired, setExpired] = useState(false);
  const switchAccount = useSwitchAccount(() => setExpired(true));
  const respond = async (accept: boolean) => {
    setPending(true);
    if (!(await answer(accept))) setExpired(true);
  };
  if (expired) return <ExpiredCard />;

  return (
    <Card left>
      <div className="flex items-center gap-3">
        <div aria-hidden className="flex size-16 items-center justify-center rounded-2xl bg-muted text-2xl font-semibold">
          {appName.charAt(0).toUpperCase()}
        </div>
        <ArrowRight aria-hidden className="size-5 text-muted-foreground" />
        <HemmafixIcon />
      </div>
      <div className="space-y-3">
        <h1 className="text-xl font-semibold [overflow-wrap:anywhere]">{appName} vill ansluta till Hemmafix</h1>
        <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
          Skickar dig tillbaka till <strong className="text-foreground">{address.label}</strong>
        </p>
        {!address.known && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 [overflow-wrap:anywhere]">
            Hemmafix känner inte igen den här adressen. Godkänn bara om du själv nyss anslöt Hemmafix från{" "}
            <strong>{address.label}</strong>.
          </p>
        )}
        <p className="[overflow-wrap:anywhere]">
          Om du godkänner kan {appNameInline}, i hemmet <strong>{homeName}</strong>:
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>se våningar, rum, uppgifter, rutiner och familjen</li>
          <li>lägga till, ändra, ta bort och tilldela uppgifter</li>
          <li>bocka av uppgifter</li>
          <li>skapa, ändra och ta bort rutiner och lägga till dem i hemmet</li>
          <li>ändra hemmet, rummen och familjens roller</li>
        </ul>
      </div>
      <div className="flex items-center gap-3 rounded-lg bg-muted p-3 text-sm">
        <MemberAvatar name={person.name} image={person.image} />
        <p className="min-w-0 flex-1 break-words">
          Inloggad som <strong>{person.firstName}</strong> ·{" "}
          <button type="button" onClick={switchAccount} className="underline underline-offset-2">
            Byt konto
          </button>
        </p>
      </div>
      <div className="space-y-2">
        {/* An unknown address makes the safe choice the main button; DOM order is the visual and tab order. */}
        {(address.known ? [true, false] : [false, true]).map((accept, i) => (
          <Button
            key={String(accept)}
            size="lg"
            variant={i === 0 ? "default" : "outline"}
            className="h-11 w-full"
            disabled={pending}
            onClick={() => respond(accept)}
          >
            {accept ? "Godkänn" : "Avbryt"}
          </Button>
        ))}
      </div>
      <p className="text-center text-xs text-muted-foreground [overflow-wrap:anywhere]">Du kan koppla från {appNameInline} när som helst.</p>
    </Card>
  );
}

export function ChildCard({ firstName }: { firstName: string }) {
  const [pending, setPending] = useState(false);
  const [expired, setExpired] = useState(false);
  const switchAccount = useSwitchAccount(() => setExpired(true));
  if (expired) return <ExpiredCard />;
  return (
    <Card>
      <HemmafixIcon />
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">Bara vuxna kan ansluta appar</h1>
        <p className="break-words">
          Du är inloggad som <strong>{firstName}</strong>, som är barn i hemmet. Be en vuxen i familjen om hjälp.
        </p>
      </div>
      <div className="space-y-2">
        <Button size="lg" className="h-11 w-full" disabled={pending} onClick={switchAccount}>
          Logga in med ett annat konto
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-11 w-full"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            if (!(await answer(false))) setExpired(true);
          }}
        >
          Tillbaka till Claude
        </Button>
      </div>
    </Card>
  );
}

export function ExpiredCard() {
  return (
    <Card>
      <HemmafixIcon />
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">Anslutningen gick inte att slutföra</h1>
        <p className="text-muted-foreground">
          Länken har gått ut eller är felaktig. Börja om genom att ansluta Hemmafix i Claude igen.
        </p>
      </div>
    </Card>
  );
}
