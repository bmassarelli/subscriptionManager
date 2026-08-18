import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddSubscriptionForm from './AddSubscriptionForm';

const CLIENTS = [
  { clientId: 1, name: 'John', lastName: 'Doe', email: 'john@doe.com', msisdn: '+11234567890' },
];

const PLATFORMS = [{ id: 1, name: 'MOBILE_BSCS9' }];
const PAYMENT_MODES = [{ id: 1, name: 'OCC' }];

function mockCatalogFetches() {
  global.fetch
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => CLIENTS })
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => PLATFORMS })
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => PAYMENT_MODES });
}

async function fillForm({ platform, contract, amount, paymentModeId }) {
  await screen.findByRole('option', { name: 'John Doe' });
  userEvent.selectOptions(screen.getByLabelText('Client'), '1');
  if (platform !== undefined) {
    await screen.findByRole('option', { name: platform });
    userEvent.selectOptions(screen.getByLabelText('Platform'), platform);
  }
  if (contract !== undefined) userEvent.type(screen.getByLabelText('Contract'), contract);
  if (amount !== undefined) userEvent.type(screen.getByLabelText('Amount'), amount);
  if (paymentModeId !== undefined) {
    userEvent.selectOptions(screen.getByLabelText(/payment mode/i), paymentModeId);
  }
}

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('submits valid values and shows a success confirmation', async () => {
  mockCatalogFetches();
  global.fetch.mockResolvedValueOnce({
    ok: true,
    status: 201,
    json: async () => ({
      id: 1, clientName: 'John Doe', email: 'john@doe.com', msisdn: '+11234567890',
      platform: 'MOBILE_BSCS9', contract: 'CONTR_00001', status: 'TR',
      entryDate: '2026-08-17', amount: 29.75,
    }),
  });

  render(<AddSubscriptionForm />);
  await fillForm({ platform: 'MOBILE_BSCS9', contract: 'CONTR_00001', amount: '29.75' });
  userEvent.click(screen.getByRole('button', { name: /save subscription/i }));

  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(4));

  const [url, options] = global.fetch.mock.calls[3];
  expect(url).toBe('http://localhost:8080/api/subscriptions');
  expect(JSON.parse(options.body)).toEqual({
    clientId: 1,
    platform: 'MOBILE_BSCS9',
    contract: 'CONTR_00001',
    amount: 29.75,
  });

  expect(await screen.findByText(/subscription created successfully/i)).toBeInTheDocument();
  expect(screen.getByLabelText('Contract')).toHaveValue('');
});

test('submits with an optional payment mode included', async () => {
  mockCatalogFetches();
  global.fetch.mockResolvedValueOnce({
    ok: true,
    status: 201,
    json: async () => ({
      id: 1, clientName: 'John Doe', email: 'john@doe.com', msisdn: '+11234567890',
      platform: 'MOBILE_BSCS9', contract: 'CONTR_00001', status: 'TR',
      entryDate: '2026-08-17', amount: 29.75,
    }),
  });

  render(<AddSubscriptionForm />);
  await fillForm({ platform: 'MOBILE_BSCS9', contract: 'CONTR_00001', amount: '29.75', paymentModeId: '1' });
  userEvent.click(screen.getByRole('button', { name: /save subscription/i }));

  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(4));

  const [, options] = global.fetch.mock.calls[3];
  expect(JSON.parse(options.body)).toEqual({
    clientId: 1,
    platform: 'MOBILE_BSCS9',
    contract: 'CONTR_00001',
    amount: 29.75,
    paymentModeId: 1,
  });
});

test('blocks submission when a required field is missing', async () => {
  mockCatalogFetches();

  render(<AddSubscriptionForm />);
  await fillForm({ contract: 'CONTR_00001', amount: '29.75' });
  userEvent.click(screen.getByRole('button', { name: /save subscription/i }));

  expect(screen.getByText(/platform is required/i)).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledTimes(3);
});

test('renders backend field errors and preserves entered values', async () => {
  mockCatalogFetches();
  global.fetch.mockResolvedValueOnce({
    ok: false,
    status: 400,
    json: async () => ({ amount: 'amount must be positive' }),
  });

  render(<AddSubscriptionForm />);
  await fillForm({ platform: 'MOBILE_BSCS9', contract: 'CONTR_00001', amount: '-5' });
  userEvent.click(screen.getByRole('button', { name: /save subscription/i }));

  expect(await screen.findByText(/amount must be positive/i)).toBeInTheDocument();
  expect(screen.getByLabelText('Platform')).toHaveValue('MOBILE_BSCS9');
  expect(screen.getByLabelText('Amount')).toHaveValue(-5);
});
