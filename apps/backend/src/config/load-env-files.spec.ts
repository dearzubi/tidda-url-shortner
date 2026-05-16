import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBackendEnvDir, loadEnvFiles } from './load-env-files.js';

describe('load-env-files', () => {
  let tmp: string;
  const originalNodeEnv = process.env.NODE_ENV;
  const trackedEnv = new Set<string>();

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'template-env-'));
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    for (const key of trackedEnv) delete process.env[key];
    trackedEnv.clear();
    vi.restoreAllMocks();
  });

  function write(name: string, contents = '') {
    writeFileSync(join(tmp, name), contents);
  }

  function trackEnv(key: string, value?: string) {
    trackedEnv.add(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  function loadFromTmp(mode = 'development'): void {
    loadEnvFiles({ envDir: tmp, mode });
  }

  it('does not load env files just by importing the loader module', () => {
    const loadSpy = vi.spyOn(process, 'loadEnvFile').mockImplementation(() => {});

    expect(loadSpy).not.toHaveBeenCalled();
  });

  it('loads all four candidate files in precedence order when present', () => {
    const loadedPaths: string[] = [];
    vi.spyOn(process, 'loadEnvFile').mockImplementation((p) => {
      if (typeof p === 'string') loadedPaths.push(p);
    });
    write('.env');
    write('.env.local');
    write('.env.development');
    write('.env.development.local');

    loadFromTmp();

    expect(loadedPaths).toEqual([
      join(tmp, '.env.development.local'),
      join(tmp, '.env.development'),
      join(tmp, '.env.local'),
      join(tmp, '.env'),
    ]);
  });

  it('skips missing files while preserving order for the ones that do exist', () => {
    const loadedPaths: string[] = [];
    vi.spyOn(process, 'loadEnvFile').mockImplementation((p) => {
      if (typeof p === 'string') loadedPaths.push(p);
    });
    write('.env.development.local');
    write('.env');

    loadFromTmp();

    expect(loadedPaths).toEqual([join(tmp, '.env.development.local'), join(tmp, '.env')]);
  });

  it('defaults to development mode when NODE_ENV is unset', () => {
    delete process.env.NODE_ENV;
    const loadSpy = vi.spyOn(process, 'loadEnvFile').mockImplementation(() => {});
    write('.env.development.local');

    loadEnvFiles({ envDir: tmp });

    expect(loadSpy).toHaveBeenCalledWith(join(tmp, '.env.development.local'));
  });

  it('honours NODE_ENV for mode-scoped filenames', () => {
    process.env.NODE_ENV = 'production';
    const loadSpy = vi.spyOn(process, 'loadEnvFile').mockImplementation(() => {});
    write('.env.production');

    loadFromTmp('production');

    expect(loadSpy).toHaveBeenCalledWith(join(tmp, '.env.production'));
    expect(loadSpy).not.toHaveBeenCalledWith(join(tmp, '.env.development'));
  });

  it('does nothing when no env files exist', () => {
    const loadSpy = vi.spyOn(process, 'loadEnvFile').mockImplementation(() => {});

    loadFromTmp();

    expect(loadSpy).not.toHaveBeenCalled();
  });

  it('does not override pre-existing process.env values', () => {
    trackEnv('LOAD_ENV_TEST_PROBE', 'from-process');
    write('.env', 'LOAD_ENV_TEST_PROBE=from-file\n');

    loadFromTmp();

    expect(process.env.LOAD_ENV_TEST_PROBE).toBe('from-process');
  });

  it('adds new keys from files into process.env', () => {
    trackEnv('LOAD_ENV_TEST_NEW');
    write('.env', 'LOAD_ENV_TEST_NEW=from-file\n');

    loadFromTmp();

    expect(process.env.LOAD_ENV_TEST_NEW).toBe('from-file');
  });

  it('lets the most-specific env file win when the same key is in multiple files', () => {
    trackEnv('LOAD_ENV_TEST_OVERLAP');
    write('.env', 'LOAD_ENV_TEST_OVERLAP=from-base\n');
    write('.env.development', 'LOAD_ENV_TEST_OVERLAP=from-mode\n');

    loadFromTmp();

    expect(process.env.LOAD_ENV_TEST_OVERLAP).toBe('from-mode');
  });

  it('lets a .local file win over its non-local sibling', () => {
    trackEnv('LOAD_ENV_TEST_LOCAL');
    write('.env.development', 'LOAD_ENV_TEST_LOCAL=from-mode\n');
    write('.env.development.local', 'LOAD_ENV_TEST_LOCAL=from-local\n');

    loadFromTmp();

    expect(process.env.LOAD_ENV_TEST_LOCAL).toBe('from-local');
  });

  it('can load from an app env directory when cwd is the repo root', () => {
    const repoRoot = tmp;
    const appEnvDir = join(repoRoot, 'apps', 'backend');
    mkdirSync(appEnvDir, { recursive: true });
    const loadSpy = vi.spyOn(process, 'loadEnvFile').mockImplementation(() => {});
    writeFileSync(join(appEnvDir, '.env.development'), '');

    loadEnvFiles({ envDir: appEnvDir, mode: 'development' });

    expect(loadSpy).toHaveBeenCalledWith(join(appEnvDir, '.env.development'));
  });

  it('resolves the backend app env directory from compiled dist modules', () => {
    const appEnvDir = join(tmp, 'apps', 'backend');
    const compiledConfigDir = join(appEnvDir, 'dist', 'src', 'config');

    expect(getBackendEnvDir(compiledConfigDir)).toBe(appEnvDir);
  });

  it('resolves the backend app env directory from compiled dist modules without sourceRoot', () => {
    const appEnvDir = join(tmp, 'apps', 'backend');
    const compiledConfigDir = join(appEnvDir, 'dist', 'config');

    expect(getBackendEnvDir(compiledConfigDir)).toBe(appEnvDir);
  });

  it('resolves the backend app env directory from source modules', () => {
    const appEnvDir = join(tmp, 'apps', 'backend');
    const sourceConfigDir = join(appEnvDir, 'src', 'config');

    expect(getBackendEnvDir(sourceConfigDir)).toBe(appEnvDir);
  });
});
