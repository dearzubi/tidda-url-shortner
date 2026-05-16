import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import process from 'node:process';

// Load .env files in the same precedence order Vite uses, so backend dev
// behaves consistently with apps/web. Higher entries win. process.env entries
// are not overridden
export type LoadEnvFilesOptions = {
  envDir?: string;
  mode?: string;
};

export function getBackendEnvDir(moduleDir = __dirname): string {
  const absoluteModuleDir = resolve(moduleDir);

  if (absoluteModuleDir.endsWith(`${sep}dist${sep}src${sep}config`)) {
    return resolve(absoluteModuleDir, '..', '..', '..');
  }

  return resolve(absoluteModuleDir, '..', '..');
}

export function loadEnvFiles(options: LoadEnvFilesOptions = {}): void {
  const mode = options.mode ?? process.env.NODE_ENV ?? 'development';
  const envDir = options.envDir ?? getBackendEnvDir();
  const candidates = [`.env.${mode}.local`, `.env.${mode}`, '.env.local', '.env'];

  for (const file of candidates) {
    const absolute = resolve(envDir, file);
    if (existsSync(absolute)) {
      process.loadEnvFile(absolute);
    }
  }
}
