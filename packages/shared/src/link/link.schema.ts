import { z } from 'zod';

const MIN_GENERATED_SLUG_LENGTH = 6;
const MAX_GENERATED_SLUG_LENGTH = 12;

export const GENERATED_LINK_SLUG_PATTERN = /^[0-9A-Za-z]{6,12}$/;

export const LinkSlugSchema = z
  .string()
  .min(MIN_GENERATED_SLUG_LENGTH)
  .max(MAX_GENERATED_SLUG_LENGTH)
  .regex(GENERATED_LINK_SLUG_PATTERN, 'Slug must contain only letters and digits');

export const DestinationUrlSchema = z.url().refine((value) => {
  const parsed = new URL(value);
  return parsed.protocol === 'http:' || parsed.protocol === 'https:';
}, 'Destination URL must use http and https');

export const CreateLinkRequestSchema = z.object({
  destinationUrl: DestinationUrlSchema,
});

export const CreateLinkResponseSchema = z.object({
  slug: LinkSlugSchema,
  shortPath: z.templateLiteral(['/', LinkSlugSchema]),
  destinationUrl: DestinationUrlSchema,
  createdAt: z.iso.datetime(),
});

export type CreateLinkRequest = z.infer<typeof CreateLinkRequestSchema>;
export type CreateLinkResponse = z.infer<typeof CreateLinkResponseSchema>;
export type LinkSlug = z.infer<typeof LinkSlugSchema>;
