import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SubscriptionDetail from './SubscriptionDetail';

const BASE_DETAIL = {
  id: 1,
  clientName: 'John Doe',
  email: 'john@doe.com',
  msisdn: '+11234567890',
  platform: 'MOBILE_BSCS9',
  contract: 'CONTR_001',
  po: null,
  paymentModeName: null,
  status: 'AC',
  entryDate: '2026-08-01',
  activateDate: null,
  deactivateDate: null,
  cancelDate: null,
  startTrialDate: null,
  endTrialDate: null,
  amount: 9.99,
  subscriptionMsisdn: null,
  simIccid: null,
  availableActions: ['SUSPEND', 'CANCEL', 'CHANGE_PLAN', 'CHANGE_MSISDN', 'CHANGE_SIM'],
};

const OPERATIONS = [
  { id: 1, subscriptionId: 1, clientName: 'John Doe', operationType: 'CREATE', status: 'COMPLETED',
    createdDate: '2026-08-01T10:00:00', updatedDate: '2026-08-01T10:00:00', errorMessage: null,
    description: 'Subscription created' },
];

function mockFetch(overrides = {}) {
  global.fetch = jest.fn((url) => {
    if (url.endsWith('/operations')) {
      return Promise.resolve({ ok: true, json: async () => overrides.operations ?? OPERATIONS });
    }
    if (url.includes('/api/platforms')) {
      return Promise.resolve({ ok: true, json: async () => overrides.platforms ?? [{ id: 1, name: 'FIXED_BSCS7' }] });
    }
    if (url.includes('/api/subscriptions/')) {
      return Promise.resolve({ ok: true, json: async () => overrides.detail ?? BASE_DETAIL });
    }
    return Promise.resolve({ ok: true, json: async () => [] });
  });
}

afterEach(() => {
  jest.restoreAllMocks();
});

test('renders fetched subscription data and operation history', async () => {
  mockFetch();
  render(<SubscriptionDetail subscriptionId={1} onBack={jest.fn()} />);

  expect(await screen.findByText('John Doe')).toBeInTheDocument();
  expect(screen.getByText('MOBILE_BSCS9')).toBeInTheDocument();
  expect(screen.getByText('CONTR_001')).toBeInTheDocument();
  expect(screen.getByText('Subscription created')).toBeInTheDocument();
});

test('renders only the fetched available actions as buttons', async () => {
  mockFetch({ detail: { ...BASE_DETAIL, status: 'SU', availableActions: ['RECONNECT', 'CANCEL'] } });
  render(<SubscriptionDetail subscriptionId={1} onBack={jest.fn()} />);

  await screen.findByText('John Doe');

  expect(screen.getByRole('button', { name: 'Reconnect' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Suspend' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Change Plan' })).not.toBeInTheDocument();
});

test('submitting an action successfully refreshes the screen', async () => {
  mockFetch();
  render(<SubscriptionDetail subscriptionId={1} onBack={jest.fn()} />);
  await screen.findByText('John Doe');

  userEvent.click(screen.getByRole('button', { name: 'Suspend' }));

  global.fetch.mockImplementationOnce(() => Promise.resolve({ ok: true, json: async () => ({}) }));
  const refreshedDetail = { ...BASE_DETAIL, status: 'SU', availableActions: ['RECONNECT', 'CANCEL'] };
  global.fetch
    .mockImplementationOnce(() => Promise.resolve({ ok: true, json: async () => refreshedDetail }))
    .mockImplementationOnce(() => Promise.resolve({ ok: true, json: async () => OPERATIONS }));

  userEvent.click(screen.getByRole('button', { name: /^submit$/i }));

  await waitFor(() => expect(screen.getByRole('button', { name: 'Reconnect' })).toBeInTheDocument());
});

test('a rejected action shows its error without changing the displayed data', async () => {
  mockFetch();
  render(<SubscriptionDetail subscriptionId={1} onBack={jest.fn()} />);
  await screen.findByText('John Doe');

  userEvent.click(screen.getByRole('button', { name: 'Change MSISDN' }));
  userEvent.type(screen.getByLabelText('New MSISDN'), 'not-a-number');

  global.fetch.mockImplementationOnce(() => Promise.resolve({
    ok: false,
    json: async () => ({ msisdn: 'msisdn must be a valid phone number' }),
  }));

  userEvent.click(screen.getByRole('button', { name: /^submit$/i }));

  expect(await screen.findByText('msisdn must be a valid phone number')).toBeInTheDocument();
  expect(screen.getByText('Active')).toBeInTheDocument();
});
