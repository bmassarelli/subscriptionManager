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
  availableProductActions: ['SUSPEND', 'CANCEL'],
  availableServiceActions: ['CHANGE_PLAN', 'CHANGE_MSISDN', 'CHANGE_SIM'],
};

const OPERATIONS = [
  { id: 1, subscriptionId: 1, clientName: 'John Doe', operationType: 'CREATE', status: 'COMPLETED',
    createdDate: '2026-08-01T10:00:00', updatedDate: '2026-08-01T10:00:00', errorMessage: null,
    description: 'Subscription created' },
];

const RESOURCES = [
  { id: 1, subscriptionId: 1, resourceType: 'IP', value: '10.0.0.1' },
];

function mockFetch(overrides = {}) {
  global.fetch = jest.fn((url, options = {}) => {
    if (url.endsWith('/operations')) {
      return Promise.resolve({ ok: true, json: async () => overrides.operations ?? OPERATIONS });
    }
    if (url.endsWith('/resources') && (!options.method || options.method === 'GET')) {
      return Promise.resolve({ ok: true, json: async () => overrides.resources ?? RESOURCES });
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

test('renders fetched subscription data and operation history as a timeline', async () => {
  mockFetch();
  render(<SubscriptionDetail subscriptionId={1} onBack={jest.fn()} />);

  expect(await screen.findByText('John Doe')).toBeInTheDocument();
  expect(screen.getByText('MOBILE_BSCS9')).toBeInTheDocument();
  expect(screen.getByText('CONTR_001')).toBeInTheDocument();
  expect(screen.getByRole('list')).toBeInTheDocument();
  expect(screen.getByRole('listitem')).toHaveTextContent('Subscription created');
});

test('renders only the fetched available actions as buttons', async () => {
  mockFetch({ detail: { ...BASE_DETAIL, status: 'SU', availableProductActions: ['RECONNECT', 'CANCEL'], availableServiceActions: [] } });
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
  const refreshedDetail = { ...BASE_DETAIL, status: 'SU', availableProductActions: ['RECONNECT', 'CANCEL'], availableServiceActions: [] };
  global.fetch
    .mockImplementationOnce(() => Promise.resolve({ ok: true, json: async () => refreshedDetail }))
    .mockImplementationOnce(() => Promise.resolve({ ok: true, json: async () => OPERATIONS }));

  userEvent.click(screen.getByRole('button', { name: /^submit$/i }));

  await waitFor(() => expect(screen.getByRole('button', { name: 'Reconnect' })).toBeInTheDocument());
});

test('submitting a product action posts to product-actions and a service action posts to service-actions', async () => {
  const detail = { ...BASE_DETAIL, availableProductActions: ['SUSPEND'], availableServiceActions: ['CHANGE_PLAN'] };
  mockFetch({ detail });
  render(<SubscriptionDetail subscriptionId={1} onBack={jest.fn()} />);
  await screen.findByText('John Doe');

  userEvent.click(screen.getByRole('button', { name: 'Suspend' }));

  global.fetch
    .mockImplementationOnce(() => Promise.resolve({ ok: true, json: async () => ({}) })) // POST product action
    .mockImplementationOnce(() => Promise.resolve({ ok: true, json: async () => detail })) // refresh detail
    .mockImplementationOnce(() => Promise.resolve({ ok: true, json: async () => OPERATIONS })) // refresh operations
    .mockImplementationOnce(() => Promise.resolve({ ok: true, json: async () => RESOURCES })); // refresh resources

  userEvent.click(screen.getByRole('button', { name: /^submit$/i }));

  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    'http://localhost:8080/api/subscriptions/1/product-actions',
    expect.objectContaining({ method: 'POST' }),
  ));

  userEvent.click(screen.getByRole('button', { name: 'Change Plan' }));

  global.fetch
    .mockImplementationOnce(() => Promise.resolve({ ok: true, json: async () => ({}) })) // POST service action
    .mockImplementationOnce(() => Promise.resolve({ ok: true, json: async () => detail })) // refresh detail
    .mockImplementationOnce(() => Promise.resolve({ ok: true, json: async () => OPERATIONS })) // refresh operations
    .mockImplementationOnce(() => Promise.resolve({ ok: true, json: async () => RESOURCES })); // refresh resources

  userEvent.click(screen.getByRole('button', { name: /^submit$/i }));

  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    'http://localhost:8080/api/subscriptions/1/service-actions',
    expect.objectContaining({ method: 'POST' }),
  ));
});

test('renders fetched resources', async () => {
  mockFetch();
  render(<SubscriptionDetail subscriptionId={1} onBack={jest.fn()} />);
  await screen.findByText('John Doe');

  expect(screen.getByText('IP')).toBeInTheDocument();
  expect(screen.getByText('10.0.0.1')).toBeInTheDocument();
});

test('shows an empty-state message when no resources are assigned', async () => {
  mockFetch({ resources: [] });
  render(<SubscriptionDetail subscriptionId={1} onBack={jest.fn()} />);
  await screen.findByText('John Doe');

  expect(screen.getByText(/no resources assigned yet/i)).toBeInTheDocument();
});

test('assigning a resource refreshes the resources list', async () => {
  mockFetch({ resources: [] });
  render(<SubscriptionDetail subscriptionId={1} onBack={jest.fn()} />);
  await screen.findByText('John Doe');
  expect(await screen.findByText(/no resources assigned yet/i)).toBeInTheDocument();

  userEvent.click(screen.getByRole('button', { name: 'Add Resource' }));
  userEvent.type(screen.getByLabelText('Value'), '10.0.0.1');

  global.fetch
    .mockImplementationOnce(() => Promise.resolve({ ok: true, json: async () => ({}) })) // POST
    .mockImplementationOnce(() => Promise.resolve({ ok: true, json: async () => BASE_DETAIL })) // refresh detail
    .mockImplementationOnce(() => Promise.resolve({ ok: true, json: async () => OPERATIONS })) // refresh operations
    .mockImplementationOnce(() => Promise.resolve({ ok: true, json: async () => RESOURCES })); // refresh resources

  userEvent.click(screen.getByRole('button', { name: /^save$/i }));

  expect(await screen.findByText('10.0.0.1')).toBeInTheDocument();
});

test('removing a resource refreshes the resources list', async () => {
  mockFetch();
  render(<SubscriptionDetail subscriptionId={1} onBack={jest.fn()} />);
  await screen.findByText('John Doe');
  expect(await screen.findByText('10.0.0.1')).toBeInTheDocument();

  global.fetch
    .mockImplementationOnce(() => Promise.resolve({ ok: true, json: async () => ({}) })) // DELETE
    .mockImplementationOnce(() => Promise.resolve({ ok: true, json: async () => BASE_DETAIL })) // refresh detail
    .mockImplementationOnce(() => Promise.resolve({ ok: true, json: async () => OPERATIONS })) // refresh operations
    .mockImplementationOnce(() => Promise.resolve({ ok: true, json: async () => [] })); // refresh resources (empty)

  userEvent.click(screen.getByRole('button', { name: 'Remove' }));

  expect(await screen.findByText(/no resources assigned yet/i)).toBeInTheDocument();
});

test('editing contract and amount refreshes the displayed values', async () => {
  mockFetch();
  render(<SubscriptionDetail subscriptionId={1} onBack={jest.fn()} />);
  await screen.findByText('John Doe');

  userEvent.click(screen.getByRole('button', { name: 'Edit' }));
  userEvent.clear(screen.getByLabelText('Contract'));
  userEvent.type(screen.getByLabelText('Contract'), 'CONTR_002');

  const refreshedDetail = { ...BASE_DETAIL, contract: 'CONTR_002', amount: 19.99 };
  global.fetch
    .mockImplementationOnce(() => Promise.resolve({ ok: true, json: async () => refreshedDetail })) // PUT
    .mockImplementationOnce(() => Promise.resolve({ ok: true, json: async () => refreshedDetail })) // refresh detail
    .mockImplementationOnce(() => Promise.resolve({ ok: true, json: async () => OPERATIONS })) // refresh operations
    .mockImplementationOnce(() => Promise.resolve({ ok: true, json: async () => RESOURCES })); // refresh resources

  userEvent.click(screen.getByRole('button', { name: /^save$/i }));

  expect(await screen.findByText('CONTR_002')).toBeInTheDocument();
});

test('a rejected subscription edit shows its error without changing the displayed data', async () => {
  mockFetch();
  render(<SubscriptionDetail subscriptionId={1} onBack={jest.fn()} />);
  await screen.findByText('John Doe');

  userEvent.click(screen.getByRole('button', { name: 'Edit' }));
  userEvent.clear(screen.getByLabelText('Amount'));
  userEvent.type(screen.getByLabelText('Amount'), '-5');

  global.fetch.mockImplementationOnce(() => Promise.resolve({
    ok: false,
    json: async () => ({ amount: 'amount must be positive' }),
  }));

  userEvent.click(screen.getByRole('button', { name: /^save$/i }));

  expect(await screen.findByText('amount must be positive')).toBeInTheDocument();
  expect(screen.getByText('CONTR_001')).toBeInTheDocument();
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
