import { Injectable } from '@nestjs/common';
import type { Link } from './link.model';
import { LinkRepository } from './link.repository';
import { encodeBase62Counter, isGeneratedSlug, isReservedSlug } from './slug';

export type CreateLinkInput = {
  destinationUrl: string;
};

@Injectable()
export class LinkService {
  constructor(private readonly repository: LinkRepository) {}

  async createLink(input: CreateLinkInput): Promise<Link> {
    let slug = '';

    do {
      slug = encodeBase62Counter(await this.repository.nextSlugCounter());
    } while (isReservedSlug(slug));

    return this.repository.create({
      slug,
      destinationUrl: input.destinationUrl,
    });
  }

  async resolveLink(slug: string): Promise<Link | null> {
    if (!isGeneratedSlug(slug)) {
      return null;
    }

    return this.repository.findBySlug(slug);
  }
}
