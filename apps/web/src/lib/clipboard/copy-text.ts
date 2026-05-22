export type ClipboardLike = {
  writeText(text: string): Promise<void>;
};

export async function copyText(text: string, clipboard?: ClipboardLike | null): Promise<boolean> {
  const activeClipboard = clipboard ?? getClipboard();
  if (activeClipboard === null) {
    return false;
  }

  try {
    await activeClipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function getClipboard(): ClipboardLike | null {
  return globalThis.navigator?.clipboard ?? null;
}
