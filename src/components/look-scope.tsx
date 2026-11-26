import { Suspense, type ReactNode } from "react";
import { getCurrentMember } from "@/server/dal";
import { getLooks } from "@/server/looks";
import { LookMarks, ScopeMark } from "./look-marks";

/**
 * Marks the page with the theme and coin look the logged-in person chose. The marks are hidden
 * elements that stream in with the page, and src/app/globals.css turns them into colours with
 * `:root:has(…)`, so only this person's screens change, dialogs included, and nothing blocks the
 * layout on the database.
 */
async function Marks() {
  const member = await getCurrentMember();
  const chosen = member ? (await getLooks(member)).chosen : null;
  return <LookMarks theme={chosen?.theme ?? "svart"} coin={chosen?.coin ?? "guld"} />;
}

export function LookScope({ children }: { children: ReactNode }) {
  return (
    <>
      <ScopeMark />
      <Suspense>
        <Marks />
      </Suspense>
      {children}
    </>
  );
}
