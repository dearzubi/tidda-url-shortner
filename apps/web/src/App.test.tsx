import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupWorker } from 'msw/browser';
import type { ReactElement } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import App from './App.js';

const worker = setupWorker();

type ClipboardLike = {
  writeText(text: string): Promise<void>;
};

type ClipboardStub = {
  writeText: ReturnType<typeof vi.fn<ClipboardLike['writeText']>>;
};

describe('<App />', () => {
  beforeAll(async () => {
    await worker.start({
      onUnhandledRequest: 'error',
      serviceWorker: {
        url: '/mockServiceWorker.js',
      },
    });
  });

  beforeEach(() => {
    window.localStorage.clear();
    stubClipboard();

    worker.use(
      http.get('/api/status', () => HttpResponse.json({ status: 'ok', service: 'backend' })),
      http.post('/api/links', async ({ request }) => {
        const body: unknown = await request.json();
        if (!isDestinationBody(body)) {
          return HttpResponse.json({ status: 'bad_request' }, { status: 400 });
        }

        return HttpResponse.json(
          {
            slug: '100000',
            shortPath: '/s/100000',
            destinationUrl: body.destinationUrl,
            createdAt: '2026-05-22T10:00:00.000Z',
          },
          { status: 201 },
        );
      }),
    );
  });

  afterEach(() => {
    worker.resetHandlers();
    vi.unstubAllGlobals();
  });

  afterAll(() => {
    worker.stop();
  });

  it('renders the polished creator screen', async () => {
    const screen = await renderWithQueryClient(<App />);

    await expect.element(screen.getByRole('heading', { name: /make long links/i })).toBeVisible();
    await expect.element(screen.getByLabelText(/destination url/i)).toBeVisible();
    await expect.element(screen.getByRole('button', { name: /shorten/i })).toBeVisible();
  });

  it('blocks invalid URLs with a friendly message', async () => {
    const screen = await renderWithQueryClient(<App />);

    await screen.getByLabelText(/destination url/i).fill('example.com');
    await screen.getByRole('button', { name: /shorten/i }).click();

    await expect.element(screen.getByText(/starts with http/i)).toBeVisible();
  });

  it('creates a link and adds it to recent history', async () => {
    const screen = await renderWithQueryClient(<App />);

    await screen.getByLabelText(/destination url/i).fill('https://example.com/a');
    await screen.getByRole('button', { name: /shorten/i }).click();

    await expect.element(screen.getByText(/your short link is ready/i)).toBeVisible();
    await expect.element(screen.getByText('https://example.com/a')).toBeVisible();
  });

  it('copies the generated link explicitly', async () => {
    const clipboard = stubClipboard();
    const screen = await renderWithQueryClient(<App />);

    await screen.getByLabelText(/destination url/i).fill('https://example.com/a');
    await screen.getByRole('button', { name: /shorten/i }).click();
    await screen.getByRole('button', { name: /copy/i }).click();

    expect(clipboard.writeText).toHaveBeenCalledWith(`${window.location.origin}/s/100000`);
    await expect.element(screen.getByText(/copied to clipboard/i)).toBeVisible();
  });

  it('shows a helpful message when copy fails', async () => {
    stubClipboard(vi.fn<ClipboardLike['writeText']>().mockRejectedValue(new Error('blocked')));
    const screen = await renderWithQueryClient(<App />);

    await screen.getByLabelText(/destination url/i).fill('https://example.com/a');
    await screen.getByRole('button', { name: /shorten/i }).click();
    await screen.getByRole('button', { name: /copy/i }).click();

    await expect.element(screen.getByText(/copy failed/i)).toBeVisible();
  });

  it('clears all recent links', async () => {
    const screen = await renderWithQueryClient(<App />);

    await screen.getByLabelText(/destination url/i).fill('https://example.com/a');
    await screen.getByRole('button', { name: /shorten/i }).click();
    await screen.getByRole('button', { name: /clear/i }).click();

    await expect.element(screen.getByTestId('recent-links-empty')).toBeVisible();
  });

  it('shows rate-limit retry timing when available', async () => {
    worker.use(
      http.post('/api/links', () =>
        HttpResponse.json(
          { status: 'rate_limited' },
          { status: 429, headers: { 'retry-after': '42' } },
        ),
      ),
    );
    const screen = await renderWithQueryClient(<App />);

    await screen.getByLabelText(/destination url/i).fill('https://example.com/a');
    await screen.getByRole('button', { name: /shorten/i }).click();

    await expect.element(screen.getByText(/try again in 42 seconds/i)).toBeVisible();
  });

  it('shows backend status from the page-load check', async () => {
    const screen = await renderWithQueryClient(<App />);

    await expect.element(screen.getByText(/backend reachable/i)).toBeVisible();
  });

  it('shows when backend status is unavailable', async () => {
    worker.use(
      http.get('/api/status', () => HttpResponse.json({ status: 'not_ready' }, { status: 503 })),
    );
    const screen = await renderWithQueryClient(<App />);

    await expect.element(screen.getByText(/backend unavailable/i)).toBeVisible();
  });
});

async function renderWithQueryClient(element: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>);
}

function stubClipboard(
  writeText: ClipboardStub['writeText'] = vi
    .fn<ClipboardLike['writeText']>()
    .mockResolvedValue(undefined),
): ClipboardStub {
  const clipboard = { writeText };
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });

  return clipboard;
}

function isDestinationBody(value: unknown): value is { destinationUrl: string } {
  if (typeof value !== 'object' || value === null || !('destinationUrl' in value)) {
    return false;
  }

  return typeof value.destinationUrl === 'string';
}
