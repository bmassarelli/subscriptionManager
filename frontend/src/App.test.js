import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

const SUBSCRIPTIONS = [
  { id: 1, clientName: 'John Doe', email: 'john@doe.com', msisdn: '+11234567890',
    platform: 'MOBILE_BSCS9', contract: 'CONTR_001', status: 'AC', entryDate: '2026-08-01', amount: 9.99 },
];

const DETAIL = {
  id: 1, clientName: 'John Doe', email: 'john@doe.com', msisdn: '+11234567890',
  platform: 'MOBILE_BSCS9', contract: 'CONTR_001', po: null, paymentModeName: null, status: 'AC',
  entryDate: '2026-08-01', activateDate: null, deactivateDate: null, cancelDate: null,
  startTrialDate: null, endTrialDate: null, amount: 9.99, subscriptionMsisdn: null, simIccid: null,
  availableProductActions: ['SUSPEND', 'CANCEL'],
  availableServiceActions: [],
};

const DASHBOARD_SUMMARY = {
  clientCount: 1,
  subscriptionCount: 1,
  statusCounts: { AC: 1, TR: 0, SU: 0, EX: 0, CA: 0, ER: 0 },
  recentOperations: [],
  operationTypeCounts: {},
};

function mockFetch({ authenticated = true } = {}) {
  global.fetch = jest.fn((url) => {
    if (url.endsWith('/api/auth/me')) {
      return authenticated
        ? Promise.resolve({ ok: true, status: 200, json: async () => ({ username: 'ops' }) })
        : Promise.resolve({ ok: false, status: 401, json: async () => ({}) });
    }
    if (url.endsWith('/api/dashboard/summary')) {
      return Promise.resolve({ ok: true, json: async () => DASHBOARD_SUMMARY });
    }
    if (url.endsWith('/api/subscriptions')) {
      return Promise.resolve({ ok: true, json: async () => SUBSCRIPTIONS });
    }
    if (url.endsWith('/operations')) {
      return Promise.resolve({ ok: true, json: async () => [] });
    }
    if (url.endsWith('/resources')) {
      return Promise.resolve({ ok: true, json: async () => [] });
    }
    if (url.includes('/api/subscriptions/1')) {
      return Promise.resolve({ ok: true, json: async () => DETAIL });
    }
    return Promise.resolve({ ok: true, json: async () => [] });
  });
}

beforeEach(() => {
  mockFetch();
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('shows the Dashboard module by default on load', async () => {
  render(<App />);

  expect(await screen.findByText('Total Clients')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'true');
});

test('viewing a subscription and going back returns to the table', async () => {
  render(<App />);

  userEvent.click(await screen.findByRole('button', { name: 'Subscriptions' }));

  await screen.findByRole('button', { name: /view/i });

  userEvent.click(screen.getByRole('button', { name: /view/i }));

  await screen.findByRole('button', { name: /back/i });
  expect(screen.getAllByText('John Doe').length).toBeGreaterThan(0);

  userEvent.click(screen.getByRole('button', { name: /back/i }));

  await screen.findByRole('button', { name: /view/i });
});

test('shows the login screen instead of the app shell when unauthenticated, and fetches no subscription data', async () => {
  mockFetch({ authenticated: false });

  render(<App />);

  expect(await screen.findByText('Subscription Manager')).toBeInTheDocument();
  expect(screen.getByLabelText('Username')).toBeInTheDocument();
  expect(screen.queryByText('Total Clients')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Dashboard' })).not.toBeInTheDocument();

  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    'http://localhost:8080/api/auth/me',
    expect.objectContaining({ credentials: 'include' }),
  ));
  expect(global.fetch).not.toHaveBeenCalledWith(
    'http://localhost:8080/api/dashboard/summary',
    expect.anything(),
  );
});

test('shows the app shell once authenticated', async () => {
  mockFetch({ authenticated: true });

  render(<App />);

  expect(await screen.findByText('Total Clients')).toBeInTheDocument();
  expect(screen.queryByLabelText('Username')).not.toBeInTheDocument();
});

test('logging out returns to the login screen', async () => {
  mockFetch({ authenticated: true });

  render(<App />);

  await screen.findByText('Total Clients');

  global.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });

  userEvent.click(screen.getByRole('button', { name: /logout/i }));

  expect(await screen.findByLabelText('Username')).toBeInTheDocument();
  expect(screen.queryByText('Total Clients')).not.toBeInTheDocument();
});
