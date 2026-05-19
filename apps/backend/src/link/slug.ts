import { GENERATED_LINK_SLUG_PATTERN } from '@tidda/shared';
import { LINK_SLUG_COUNTER_START } from '../db/link-slug-counter';

export const SLUG_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const RESERVED_SLUGS = ['links', 'livez', 'readyz', 'status', 'metrics'] as const;

const BASE = BigInt(SLUG_ALPHABET.length);
const RESERVED_SLUG_SET = new Set<string>(RESERVED_SLUGS);

export function encodeBase62Counter(counter: bigint): string {
  if (counter < LINK_SLUG_COUNTER_START) {
    throw new Error(`Slug counter must be greater than or equal to ${LINK_SLUG_COUNTER_START}`);
  }

  let value = counter;
  let slug = '';

  do {
    const remainder = Number(value % BASE);
    slug = `${SLUG_ALPHABET[remainder]}${slug}`;
    value = value / BASE;
  } while (value > 0n);

  return slug;
}

export function isGeneratedSlug(value: string): boolean {
  return GENERATED_LINK_SLUG_PATTERN.test(value);
}

export function isReservedSlug(value: string): boolean {
  return RESERVED_SLUG_SET.has(value);
}
