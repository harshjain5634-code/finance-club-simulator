"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Lock } from "lucide-react";
import { EventStatusBadge } from "@/components/market/status";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Select } from "@/components/ui/select";
import { DEMO_EVENT_ID } from "@/data/scenarios/shared";
import type { EventState } from "@/lib/domain/types";
import { formatLongDate } from "@/lib/format";
import { useEventByCode } from "@/lib/mock/hooks";
import { setTeamSession } from "@/lib/mock/session";

export function TeamLogin() {
  const params = useParams<{ code: string }>();
  const code = decodeURIComponent(params.code).toUpperCase();
  const state = useEventByCode(code);

  if (state === null) {
    return (
      <div className="w-full max-w-md space-y-3 rounded-xl border border-border bg-surface p-6">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-24" />
      </div>
    );
  }
  if (state === undefined) {
    return (
      <div className="w-full max-w-md rounded-xl border border-border bg-surface">
        <EmptyState
          title={`No event found for ${code}`}
          description="Check the code with your host and try again."
          action={
            <Link href="/join" className="text-[13px] text-accent-text hover:underline">
              Enter another code
            </Link>
          }
        />
      </div>
    );
  }
  return <LoginForm state={state} code={code} />;
}

function LoginForm({ state, code }: { state: EventState; code: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [teamId, setTeamId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  const signIn = (targetTeamId: string, enteredPin: string) => {
    const team = state.teams.find((t) => t.id === targetTeamId);
    if (!team) return setError("Choose your team.");
    if (team.pin !== enteredPin) return setError("That PIN does not match this team.");
    if (team.status === "DISABLED") return setError(`${team.name} is disabled. Speak to your host.`);
    setTeamSession(code, { teamId: team.id, eventId: state.event.id, loggedInAt: Date.now() });
    router.replace(`/event/${code}/dashboard`);
  };

  const demoTeam = searchParams.get("demo")?.toUpperCase();
  useEffect(() => {
    if (!demoTeam || state.event.id !== DEMO_EVENT_ID) return;
    const team = state.teams.find((t) => t.loginCode === demoTeam);
    if (team) {
      setTeamSession(code, { teamId: team.id, eventId: state.event.id, loggedInAt: Date.now() });
      router.replace(`/event/${code}/dashboard`);
    }
  }, [demoTeam, state, code, router]);

  const isDemo = state.event.id === DEMO_EVENT_ID;

  return (
    <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-xs tracking-wider text-fg-muted">{state.event.code}</span>
        <EventStatusBadge status={state.event.status} />
      </div>
      <h1 className="mt-2 text-xl font-semibold tracking-tight text-fg-primary">{state.event.name}</h1>
      <p className="mt-1 text-[13px] text-fg-secondary">{formatLongDate(state.event.scheduledDate)} · {state.teams.length} teams</p>

      <form
        className="mt-6 flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          signIn(teamId, pin);
        }}
      >
        <Field label="Team" htmlFor="login-team">
          <Select id="login-team" value={teamId} onValueChange={setTeamId} placeholder="Select your team" options={state.teams.map((t) => ({ value: t.id, label: t.name, hint: t.status === "DISABLED" ? "Disabled" : undefined }))} />
        </Field>
        <Field label="Team PIN" htmlFor="login-pin" hint="4 digits, provided by your host">
          <Input id="login-pin" inputMode="numeric" autoComplete="one-time-code" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} className="font-mono tracking-[0.4em]" />
        </Field>
        {error && (
          <p role="alert" className="rounded-md border border-warning/40 bg-warning/8 px-3 py-2 text-[13px] text-fg-primary">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" size="lg" disabled={!teamId || pin.length !== 4}>
          <Lock className="size-3.5" />
          Enter terminal
        </Button>
      </form>

      {isDemo && (
        <div className="mt-6 border-t border-border pt-4">
          <p className="text-[11px] font-medium tracking-wide text-fg-muted uppercase">Prototype shortcuts</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {state.teams.slice(0, 2).map((team) => (
              <Button key={team.id} variant="secondary" size="sm" onClick={() => signIn(team.id, team.pin)}>
                Sign in as {team.name}
                <ArrowRight className="size-3" />
              </Button>
            ))}
          </div>
          <p className="mt-2 text-xs text-fg-muted">Each browser tab keeps its own team session, so you can open several teams side by side.</p>
        </div>
      )}
    </div>
  );
}
