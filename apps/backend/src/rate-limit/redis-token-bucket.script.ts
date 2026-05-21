import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const REDIS_TOKEN_BUCKET_SCRIPT = readFileSync(
  join(__dirname, 'redis-token-bucket.lua'),
  'utf8',
);
