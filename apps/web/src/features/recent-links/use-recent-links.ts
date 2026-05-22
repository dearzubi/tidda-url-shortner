import type { CreateLinkResponse } from '@tidda/shared';
import { useCallback, useEffect, useState } from 'react';
import {
  clearRecentLinks,
  loadRecentLinks,
  RECENT_LINK_LIMIT,
  saveRecentLinks,
} from './recent-link-storage.js';

type RecentLinksState = {
  links: ReadonlyArray<CreateLinkResponse>;
  addLink(link: CreateLinkResponse): void;
  clearLinks(): void;
};

export function useRecentLinks(storage?: Storage | null): RecentLinksState {
  const activeStorage = storage ?? getBrowserStorage();
  const [links, setLinks] = useState<ReadonlyArray<CreateLinkResponse>>([]);

  useEffect(() => {
    if (activeStorage === null) {
      return;
    }

    setLinks(loadRecentLinks(activeStorage));
  }, [activeStorage]);

  const addLink = useCallback(
    (link: CreateLinkResponse) => {
      setLinks((current) => {
        const next = [link, ...current].slice(0, RECENT_LINK_LIMIT);

        if (activeStorage !== null) {
          try {
            saveRecentLinks(activeStorage, next);
          } catch {
            return next;
          }
        }

        return next;
      });
    },
    [activeStorage],
  );

  const clearLinks = useCallback(() => {
    if (activeStorage !== null) {
      try {
        clearRecentLinks(activeStorage);
      } catch {
        // Clearing local history should never block the visible UI state.
      }
    }

    setLinks([]);
  }, [activeStorage]);

  return { links, addLink, clearLinks };
}

function getBrowserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
