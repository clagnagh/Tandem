import { healthResponseSchema } from '@tandem/shared';

// Rendered on every request so the status line is live.
export const dynamic = 'force-dynamic';

async function apiStatus(): Promise<string> {
  const origin = process.env.API_ORIGIN ?? 'http://localhost:4000';
  try {
    const res = await fetch(`${origin}/health`, { cache: 'no-store' });
    const body = healthResponseSchema.parse(await res.json());
    return body.status === 'ok' ? 'API and database are up' : 'API is up, database is down';
  } catch {
    return 'API is unreachable';
  }
}

export default async function Home() {
  const status = await apiStatus();
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-6 py-24">
      <h1 className="text-4xl font-semibold tracking-tight">Tandem</h1>
      <p className="text-zinc-600">
        Docs, tasks and an AI assistant for your team. Phase 1 is under construction.
      </p>
      <p className="text-sm text-zinc-500" data-testid="api-status">
        {status}
      </p>
    </main>
  );
}
