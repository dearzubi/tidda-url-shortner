import { useQuery } from '@tanstack/react-query';
import type { JSX } from 'react';
import { env } from './config/env.js';
import { LinkCreator } from './features/link-creator/LinkCreator.js';
import { RecentLinks } from './features/recent-links/RecentLinks.js';
import { useRecentLinks } from './features/recent-links/use-recent-links.js';
import { getBackendStatus } from './lib/api/status-api.js';

export default function App(): JSX.Element {
  const recentLinks = useRecentLinks();
  const status = useQuery({
    queryKey: ['backend-status'],
    queryFn: () => getBackendStatus(env.VITE_API_URL),
  });

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-6 sm:py-12">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <header className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-lg font-black tracking-normal">Tidda</p>
            <BackendStatusDot
              state={status.isSuccess ? 'online' : status.isError ? 'offline' : 'checking'}
            />
          </div>
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-muted-foreground">Short links, easy rhythm</p>
            <h1 className="mt-3 text-4xl font-black tracking-normal sm:text-5xl">
              Make long links easier to share.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
              Paste a URL, create a tidy Tidda link, and keep your latest links on this device until
              you clear them.
            </p>
          </div>
        </header>

        <LinkCreator onCreated={recentLinks.addLink} />
        <RecentLinks links={recentLinks.links} onClear={recentLinks.clearLinks} />
      </div>
    </main>
  );
}

type BackendStatusDotProps = {
  state: 'checking' | 'online' | 'offline';
};

function BackendStatusDot({ state }: BackendStatusDotProps): JSX.Element {
  const label = {
    checking: 'Checking backend status',
    online: 'Backend reachable',
    offline: 'Backend unavailable',
  }[state];

  const tone = {
    checking: 'bg-muted',
    online: 'bg-accent',
    offline: 'bg-destructive',
  }[state];

  return (
    <div className="inline-flex items-center gap-2 text-sm text-muted-foreground" title={label}>
      <span className={`h-2.5 w-2.5 rounded-full ${tone}`} />
      <span>{label}</span>
    </div>
  );
}
