import { CreateLinkResponseSchema, parseSchema } from '@tidda/shared';
import { apiUrl } from './api-url.js';

export type CreateLinkOptions = {
  apiBaseUrl: string;
  destinationUrl: string;
  fetcher?: typeof fetch;
};

export type LinkApiErrorKind = 'validation' | 'rate_limited' | 'network' | 'unexpected';

export class LinkApiError extends Error {
  readonly kind: LinkApiErrorKind;
  readonly retryAfterSeconds: number | null;

  constructor(kind: LinkApiErrorKind, message: string, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = 'LinkApiError';
    this.kind = kind;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function createLink(options: CreateLinkOptions) {
  const fetcher = options.fetcher ?? fetch;

  let response: Response;
  try {
    response = await fetcher(apiUrl(options.apiBaseUrl, '/links'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ destinationUrl: options.destinationUrl }),
    });
  } catch {
    throw new LinkApiError('network', 'Unable to reach Tidda right now');
  }

  if (response.status === 429) {
    throw new LinkApiError(
      'rate_limited',
      'Too many links right now',
      parseRetryAfter(response.headers.get('retry-after')),
    );
  }

  if (response.status === 400) {
    throw new LinkApiError('validation', 'Enter a URL that starts with http:// or https://');
  }

  if (!response.ok) {
    throw new LinkApiError('unexpected', 'Something went wrong while creating your link');
  }

  try {
    const body: unknown = await response.json();
    return parseSchema(CreateLinkResponseSchema, body, 'Invalid create-link response');
  } catch {
    throw new LinkApiError('unexpected', 'Tidda returned an unexpected response');
  }
}

function parseRetryAfter(value: string | null): number | null {
  if (value === null) {
    return null;
  }

  const seconds = Number(value);
  if (!Number.isInteger(seconds) || seconds < 0) {
    return null;
  }

  return seconds;
}
