import type { CreateLinkResponse } from '@tidda/shared';
import { Clock3, Trash2 } from 'lucide-react';
import type { JSX } from 'react';

import { Button } from '@/components/ui/button.js';
import { shortUrlFromPath } from '@/lib/api/api-url.js';

type RecentLinksProps = {
  links: ReadonlyArray<CreateLinkResponse>;
  onClear(): void;
  origin?: string;
};

export function RecentLinks({ links, onClear, origin }: RecentLinksProps): JSX.Element {
  const displayOrigin = origin ?? window.location.origin;

  if (links.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="recent-links-empty">
        Your recent links will appear here.
      </p>
    );
  }

  return (
    <section aria-labelledby="recent-links-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold" id="recent-links-heading">
          Recent links
        </h2>
        <Button aria-label="Clear recent links" onClick={onClear} type="button" variant="ghost">
          <Trash2 aria-hidden="true" size={18} />
          Clear
        </Button>
      </div>

      <ul className="grid gap-2">
        {links.map((link) => {
          const shortUrl = shortUrlFromPath(displayOrigin, link.shortPath);

          return (
            <li
              className="rounded-md border border-border bg-card px-4 py-3 shadow-sm"
              key={`${link.slug}-${link.createdAt}`}
            >
              <a className="font-semibold text-foreground hover:underline" href={link.shortPath}>
                {shortUrl}
              </a>
              <p
                className="mt-1 truncate text-sm text-muted-foreground"
                title={link.destinationUrl}
              >
                {link.destinationUrl}
              </p>
              <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Clock3 aria-hidden="true" size={14} />
                {formatCreatedAt(link.createdAt)}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function formatCreatedAt(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
