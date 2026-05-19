import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { DatabaseService } from '../db/database.service';
import { LINK_SLUG_COUNTER_SEQUENCE } from '../db/link-slug-counter';
import type { CreateLinkRecord, Link } from './link.model';

type LinkRow = {
  id: string;
  slug: string;
  destination_url: string;
  created_at: Date;
};

@Injectable()
export class LinkRepository {
  constructor(private readonly database: DatabaseService) {}

  async nextSlugCounter(): Promise<bigint> {
    const result = await sql<{
      value: string;
    }>`select nextval(${LINK_SLUG_COUNTER_SEQUENCE})::text as value`.execute(this.database.getDb());
    const value = result.rows[0]?.value;

    if (value === undefined) {
      throw new Error('Failed to allocate link slug counter');
    }

    return BigInt(value);
  }

  async create(input: CreateLinkRecord): Promise<Link> {
    const row = await this.database
      .getDb()
      .insertInto('links')
      .values({
        slug: input.slug,
        destination_url: input.destinationUrl,
      })
      .returning(['id', 'slug', 'destination_url', 'created_at'])
      .executeTakeFirstOrThrow();

    return toLink(row);
  }

  async findBySlug(slug: string): Promise<Link | null> {
    const row = await this.database
      .getDb()
      .selectFrom('links')
      .select(['id', 'slug', 'destination_url', 'created_at'])
      .where('slug', '=', slug)
      .executeTakeFirst();

    return row === undefined ? null : toLink(row);
  }
}

function toLink(row: LinkRow): Link {
  return {
    id: row.id,
    slug: row.slug,
    destinationUrl: row.destination_url,
    createdAt: row.created_at,
  };
}
