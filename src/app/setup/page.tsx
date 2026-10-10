import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { SetupForm } from "@/components/auth/SetupForm";
import { checkSetupToken } from "@/lib/auth/setup";

// /setup?token=<SETUP_TOKEN>: first-run passkey enrollment. 404s once used.
export default function SetupPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  return (
    <AuthCard>
      <Suspense fallback={<p className="mt-4 text-sm text-muted">Checking…</p>}>
        <SetupGate searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}

async function SetupGate({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token || !(await checkSetupToken(token))) notFound();
  return <SetupForm token={token} />;
}
