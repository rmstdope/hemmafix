import { Suspense } from "react";
import { readConnectingApp } from "@/server/oauth-request";
import { LoginCard } from "./login-card";

export const metadata = { title: "Logga in – Hemmafix" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Suspense>
        <Login searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Login({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const app = await readConnectingApp(await searchParams);
  return <LoginCard connectApp={app?.nameInline} />;
}
