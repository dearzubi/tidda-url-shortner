import { describe, expect, it } from 'vitest';
import { LINK_SLUG_COUNTER_SEQUENCE, LINK_SLUG_COUNTER_START } from './link-slug-counter';

describe('link slug counter constants', () => {
  it('names the PostgreSQL sequence used for slug allocation', () => {
    expect(LINK_SLUG_COUNTER_SEQUENCE).toBe('link_slug_counter');
  });

  it('starts at the first six-character Base62 value', () => {
    expect(LINK_SLUG_COUNTER_START).toBe(62n ** 5n);
  });
});
