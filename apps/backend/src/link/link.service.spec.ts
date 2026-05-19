import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { LINK_SLUG_COUNTER_START } from '../db/link-slug-counter';
import { LinkRepository } from './link.repository';
import { LinkService } from './link.service';
import { encodeBase62Counter, isGeneratedSlug, RESERVED_SLUGS, SLUG_ALPHABET } from './slug';

function makeLink(slug: string) {
  return {
    id: '1c78fd52-ff7f-455d-9c08-3f530ea9c8d1',
    slug,
    destinationUrl: 'https://example.com/a',
    createdAt: new Date('2026-05-19T12:00:00.000Z'),
  };
}

describe('LinkService', () => {
  async function createService(
    repository: Pick<LinkRepository, 'nextSlugCounter' | 'create' | 'findBySlug'>,
  ): Promise<LinkService> {
    const moduleRef = await Test.createTestingModule({
      providers: [LinkService, { provide: LinkRepository, useValue: repository }],
    }).compile();

    return moduleRef.get(LinkService);
  }

  it('creates a link from the next allocated counter', async () => {
    const repository = {
      nextSlugCounter: vi.fn().mockResolvedValue(LINK_SLUG_COUNTER_START),
      create: vi.fn().mockResolvedValue(makeLink('100000')),
      findBySlug: vi.fn(),
    } satisfies Pick<LinkRepository, 'nextSlugCounter' | 'create' | 'findBySlug'>;
    const service = await createService(repository);

    const link = await service.createLink({ destinationUrl: 'https://example.com/a' });

    expect(link.slug).toBe('100000');
    expect(repository.create).toHaveBeenCalledWith({
      slug: '100000',
      destinationUrl: 'https://example.com/a',
    });
  });

  it.each(
    generatedReservedSlugs(),
  )('burns reserved application path %s and uses the next counter', async (reservedSlug) => {
    const reservedCounter = decodeBase62Slug(reservedSlug);
    const nextCounter = reservedCounter + 1n;
    const nextSlug = encodeBase62Counter(nextCounter);
    const repository = {
      nextSlugCounter: vi
        .fn()
        .mockResolvedValueOnce(reservedCounter)
        .mockResolvedValueOnce(nextCounter),
      create: vi.fn().mockResolvedValue(makeLink(nextSlug)),
      findBySlug: vi.fn(),
    } satisfies Pick<LinkRepository, 'nextSlugCounter' | 'create' | 'findBySlug'>;
    const service = await createService(repository);

    const link = await service.createLink({ destinationUrl: 'https://example.com/a' });

    expect(link.slug).toBe(nextSlug);
    expect(repository.nextSlugCounter).toHaveBeenCalledTimes(2);
    expect(repository.create).not.toHaveBeenCalledWith({
      slug: reservedSlug,
      destinationUrl: 'https://example.com/a',
    });
    expect(repository.create).toHaveBeenCalledWith({
      slug: nextSlug,
      destinationUrl: 'https://example.com/a',
    });
  });

  it('returns null for malformed slugs', async () => {
    const repository = {
      nextSlugCounter: vi.fn(),
      create: vi.fn(),
      findBySlug: vi.fn(),
    } satisfies Pick<LinkRepository, 'nextSlugCounter' | 'create' | 'findBySlug'>;
    const service = await createService(repository);

    await expect(service.resolveLink('bad_slug')).resolves.toBeNull();
    expect(repository.findBySlug).not.toHaveBeenCalled();
  });

  it('resolves generated slugs through the repository', async () => {
    const repository = {
      nextSlugCounter: vi.fn(),
      create: vi.fn(),
      findBySlug: vi.fn().mockResolvedValue(makeLink('100000')),
    } satisfies Pick<LinkRepository, 'nextSlugCounter' | 'create' | 'findBySlug'>;
    const service = await createService(repository);

    await expect(service.resolveLink('100000')).resolves.toEqual(makeLink('100000'));
  });
});

function decodeBase62Slug(slug: string): bigint {
  let value = 0n;

  for (const character of slug) {
    const index = SLUG_ALPHABET.indexOf(character);
    if (index < 0) {
      throw new Error(`Invalid Base62 character: ${character}`);
    }

    value = value * BigInt(SLUG_ALPHABET.length) + BigInt(index);
  }

  return value;
}

function generatedReservedSlugs(): string[] {
  return RESERVED_SLUGS.filter((slug) => {
    if (!isGeneratedSlug(slug)) {
      return false;
    }

    return decodeBase62Slug(slug) >= LINK_SLUG_COUNTER_START;
  });
}
