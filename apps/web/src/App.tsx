import { parseSchema } from '@template/shared';
import { type JSX, useEffect, useState } from 'react';
import { z } from 'zod';
import { env } from './config/env.js';

const BackendStatusSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
});

type ConnectionState =
  | { status: 'loading' }
  | { status: 'connected'; service: string }
  | { status: 'error' };

function apiUrl(path: string): string {
  const baseUrl = env.VITE_API_URL.endsWith('/') ? env.VITE_API_URL.slice(0, -1) : env.VITE_API_URL;
  return `${baseUrl}${path}`;
}

export default function App(): JSX.Element {
  const [connection, setConnection] = useState<ConnectionState>({ status: 'loading' });

  useEffect(() => {
    const abortController = new AbortController();

    async function checkBackend(): Promise<void> {
      try {
        const response = await fetch(apiUrl('/status'), { signal: abortController.signal });
        if (!response.ok) {
          setConnection({ status: 'error' });
          return;
        }

        const body = parseSchema(
          BackendStatusSchema,
          await response.json(),
          'Invalid backend status',
        );
        setConnection({ status: 'connected', service: body.service });
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setConnection({ status: 'error' });
        }
      }
    }

    void checkBackend();

    return () => {
      abortController.abort();
    };
  }, []);

  return (
    <main className="min-h-screen bg-background px-6 py-10 text-foreground">
      <section className="mx-auto flex max-w-3xl flex-col gap-6">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Full-stack starter</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-normal">Template</h1>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">Backend status</p>
          {connection.status === 'loading' ? (
            <p className="mt-2 text-lg font-semibold">Checking backend...</p>
          ) : null}
          {connection.status === 'connected' ? (
            <div className="mt-2 flex flex-col gap-1">
              <p className="text-lg font-semibold">Backend connected</p>
              <p className="text-sm text-muted-foreground">{connection.service}</p>
            </div>
          ) : null}
          {connection.status === 'error' ? (
            <p className="mt-2 text-lg font-semibold text-destructive">Backend unavailable</p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
