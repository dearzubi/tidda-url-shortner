import { CreateLinkRequestSchema, type CreateLinkResponse, parseSchema } from '@tidda/shared';
import { Check, Copy, Link2, Loader2 } from 'lucide-react';
import { type FormEvent, type JSX, useId, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { shortUrlFromPath } from '@/lib/api/api-url.js';
import { LinkApiError } from '@/lib/api/link-api.js';
import { copyText } from '@/lib/clipboard/copy-text.js';
import { useCreateLink } from './use-create-link.js';

type LinkCreatorProps = {
  onCreated(link: CreateLinkResponse): void;
};

type CopyState = 'idle' | 'copied' | 'failed';

export function LinkCreator({ onCreated }: LinkCreatorProps): JSX.Element {
  const inputId = useId();
  const statusId = useId();
  const [destinationUrl, setDestinationUrl] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [createdLink, setCreatedLink] = useState<CreateLinkResponse | null>(null);
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const mutation = useCreateLink();

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setCopyState('idle');
    setFormError(null);

    let parsedDestinationUrl: string;
    try {
      parsedDestinationUrl = parseSchema(
        CreateLinkRequestSchema,
        { destinationUrl },
        'Invalid link',
      ).destinationUrl;
    } catch {
      setFormError('Enter a URL that starts with http:// or https://.');
      return;
    }

    try {
      const response = await mutation.mutateAsync(parsedDestinationUrl);

      setCreatedLink(response);
      onCreated(response);
    } catch (err) {
      setFormError(errorMessage(err));
    }
  }

  async function handleCopy(): Promise<void> {
    if (createdLink === null) {
      return;
    }

    const copied = await copyText(shortUrlFromPath(window.location.origin, createdLink.shortPath));
    setCopyState(copied ? 'copied' : 'failed');
  }

  return (
    <section className="rounded-md border border-border bg-card p-5 shadow-sm sm:p-6">
      <form className="flex flex-col gap-4" onSubmit={(event) => void handleSubmit(event)}>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold" htmlFor={inputId}>
            Destination URL
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              aria-describedby={statusId}
              autoComplete="url"
              id={inputId}
              inputMode="url"
              onChange={(event) => setDestinationUrl(event.target.value)}
              placeholder="https://example.com/very-long-link"
              type="text"
              value={destinationUrl}
            />
            <Button className="sm:w-32" disabled={mutation.isPending} type="submit">
              {mutation.isPending ? (
                <Loader2 aria-hidden="true" className="animate-spin" size={18} />
              ) : null}
              Shorten
            </Button>
          </div>
        </div>

        <div aria-live="polite" className="min-h-6" id={statusId}>
          {formError !== null ? (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      </form>

      {createdLink !== null ? (
        <div className="mt-5 rounded-md bg-accent p-4 text-accent-foreground">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Link2 aria-hidden="true" size={18} />
            Your short link is ready
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <a
              className="min-w-0 flex-1 truncate rounded-md bg-card px-3 py-2 font-semibold text-foreground"
              href={createdLink.shortPath}
            >
              {shortUrlFromPath(window.location.origin, createdLink.shortPath)}
            </a>
            <Button onClick={() => void handleCopy()} variant="secondary">
              {copyState === 'copied' ? (
                <Check aria-hidden="true" size={18} />
              ) : (
                <Copy aria-hidden="true" size={18} />
              )}
              Copy
            </Button>
          </div>
          <p aria-live="polite" className="mt-2 text-sm">
            {copyState === 'copied' ? 'Copied to clipboard.' : null}
            {copyState === 'failed' ? 'Copy failed. Select the link and copy it manually.' : null}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function errorMessage(err: unknown): string {
  if (err instanceof LinkApiError) {
    if (err.kind === 'rate_limited') {
      if (err.retryAfterSeconds !== null) {
        return `Too many links right now. Try again in ${err.retryAfterSeconds} seconds.`;
      }

      return 'Too many links right now. Try again soon.';
    }

    return err.message;
  }

  return 'Something went wrong while creating your link.';
}
