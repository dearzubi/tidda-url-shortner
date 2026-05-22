import type { CreateLinkResponse } from '@tidda/shared';
import { CreateLinkResponseSchema, DestinationUrlSchema, parseSchema } from '@tidda/shared';
import { z } from 'zod';

export const RECENT_LINK_LIMIT = 10;

const RECENT_LINK_STORAGE_KEY = 'tidda.recentLinks.v1';

const RecentLinkSchema = CreateLinkResponseSchema.extend({
  destinationUrl: DestinationUrlSchema,
});

const RecentLinksSchema = z.array(RecentLinkSchema);

export function loadRecentLinks(storage: Storage): ReadonlyArray<CreateLinkResponse> {
  try {
    const raw = storage.getItem(RECENT_LINK_STORAGE_KEY);
    if (raw === null) {
      return [];
    }

    return parseSchema(RecentLinksSchema, JSON.parse(raw), 'Invalid recent links').slice(
      0,
      RECENT_LINK_LIMIT,
    );
  } catch {
    return [];
  }
}

export function saveRecentLinks(storage: Storage, links: ReadonlyArray<CreateLinkResponse>): void {
  storage.setItem(RECENT_LINK_STORAGE_KEY, JSON.stringify(links.slice(0, RECENT_LINK_LIMIT)));
}

export function clearRecentLinks(storage: Storage): void {
  storage.removeItem(RECENT_LINK_STORAGE_KEY);
}
