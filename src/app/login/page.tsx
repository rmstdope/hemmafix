import { Suspense } from "react";
import { LoginCard } from "./login-card";

export const metadata = { title: "Logga in – Hemmafix" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Suspense>
        <LoginCard />
      </Suspense>
    </main>
  );
}
