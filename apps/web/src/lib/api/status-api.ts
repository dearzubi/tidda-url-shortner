import { parseSchema } from '@tidda/shared';
import { z } from 'zod';
import { apiUrl } from './api-url.js';

const BackendStatusSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
});

export type BackendStatus = z.infer<typeof BackendStatusSchema>;

export async function getBackendStatus(
  apiBaseUrl: string,
  fetcher?: typeof fetch,
): Promise<BackendStatus> {
  const activeFetcher = fetcher ?? fetch;
  const response = await activeFetcher(apiUrl(apiBaseUrl, '/status'));
  if (!response.ok) {
    throw new Error('Backend status unavailable');
  }

  return parseSchema(BackendStatusSchema, await response.json(), 'Invalid backend status');
}
