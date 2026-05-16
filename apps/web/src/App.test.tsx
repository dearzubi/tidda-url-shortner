import { HttpResponse, http } from 'msw';
import { setupWorker } from 'msw/browser';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import App from './App.js';

const worker = setupWorker();

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
    worker.use(
      http.get('/api/status', () => {
        return HttpResponse.json({ status: 'ok', service: 'backend' });
      }),
    );
  });

  afterEach(() => {
    worker.resetHandlers();
  });

  afterAll(() => {
    worker.stop();
  });

  it('renders the product name as a heading', async () => {
    const screen = await render(<App />);
    await expect.element(screen.getByRole('heading', { name: /template/i })).toBeVisible();
  });

  it('shows when the backend status endpoint is reachable', async () => {
    const screen = await render(<App />);

    await expect.element(screen.getByText('Backend connected')).toBeVisible();
    await expect.element(screen.getByText('backend', { exact: true })).toBeVisible();
  });
});
