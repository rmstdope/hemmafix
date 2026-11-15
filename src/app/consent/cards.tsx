"use client";

import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { MemberAvatar } from "@/components/member-avatar";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

const Card = ({ children, left = false }: { children: ReactNode; left?: boolean }) => (
  <div className={`w-full max-w-sm space-y-6 rounded-2xl border bg-card p-8 ${left ? "" : "text-center"}`}>{children}</div>
);

const HemmafixIcon = () => <Image src="/icon.svg" alt="" width={64} height={64} className="size-16" />;

/** Sends the browser back to the app: the redirect the server answers with, grant or refusal. */
async function answer(accept: boolean) {
  const { data } = await authClient.oauth2.consent({ accept });
  if (data?.url) window.location.href = data.url;
}

/** Logs out and starts the connection over from the login step, keeping the signed request. */
function useSwitchAccount() {
  const router = useRouter();
  return async () => {
    await authClient.signOut();
    router.push(`/login${window.location.search}`);
  };
}

export function ApprovalCard({
  appName,
  homeName,
  person,
}: {
  appName: string;
  homeName: string;
  person: { name: string; firstName: string; image: string | null };
}) {
  const switchAccount = useSwitchAccount();
  const [pending, setPending] = useState(false);
  const respond = async (accept: boolean) => {
    setPending(true);
    await answer(accept);
  };

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
        <h1 className="text-xl font-semibold break-words">{appName} vill ansluta till Hemmafix</h1>
        <p className="break-words">
          Om du godkänner kan {appName}, i hemmet <strong>{homeName}</strong>:
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>se våningar, rum, sysslor och familjen</li>
          <li>lägga till, ändra, ta bort och tilldela sysslor</li>
          <li>bocka av sysslor</li>
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
        <Button size="lg" className="h-11 w-full" disabled={pending} onClick={() => respond(true)}>
          Godkänn
        </Button>
        <Button size="lg" variant="outline" className="h-11 w-full" disabled={pending} onClick={() => respond(false)}>
          Avbryt
        </Button>
      </div>
      <p className="text-center text-xs text-muted-foreground">Du kan koppla från Claude när som helst.</p>
    </Card>
  );
}

export function ChildCard({ firstName }: { firstName: string }) {
  const switchAccount = useSwitchAccount();
  const [pending, setPending] = useState(false);
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
            await answer(false);
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
