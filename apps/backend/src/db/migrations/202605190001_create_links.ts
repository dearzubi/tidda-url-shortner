import { type Kysely, sql } from 'kysely';
import { LINK_SLUG_COUNTER_SEQUENCE, LINK_SLUG_COUNTER_START } from '../link-slug-counter';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`create extension if not exists pgcrypto`.execute(db);
  await sql`create sequence ${sql.ref(LINK_SLUG_COUNTER_SEQUENCE)} as bigint start with ${sql.raw(
    LINK_SLUG_COUNTER_START.toString(),
  )}`.execute(db);

  await db.schema
    .createTable('links')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('slug', 'text', (col) => col.notNull())
    .addColumn('destination_url', 'text', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema.createIndex('links_slug_unique').on('links').column('slug').unique().execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('links').execute();
  await sql`drop sequence ${sql.ref(LINK_SLUG_COUNTER_SEQUENCE)}`.execute(db);
}
