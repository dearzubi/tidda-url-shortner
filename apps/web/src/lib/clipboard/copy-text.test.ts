import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from './copy-text.js';

describe('copyText', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('copies text through the provided clipboard', async () => {
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };

    await copyText('https://tidda.example/s/100000', clipboard);

    expect(clipboard.writeText).toHaveBeenCalledWith('https://tidda.example/s/100000');
  });

  it('returns false when copying fails', async () => {
    const clipboard = { writeText: vi.fn().mockRejectedValue(new Error('blocked')) };

    await expect(copyText('https://tidda.example/s/100000', clipboard)).resolves.toBe(false);
  });

  it('returns false when no browser clipboard is available', async () => {
    vi.stubGlobal('navigator', {});

    await expect(copyText('https://tidda.example/s/100000')).resolves.toBe(false);
  });
});
