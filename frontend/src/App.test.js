import { render, screen } from '@testing-library/react';
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
  availableActions: ['SUSPEND', 'CANCEL'],
};

beforeEach(() => {
  global.fetch = jest.fn((url) => {
    if (url.endsWith('/api/subscriptions')) {
      return Promise.resolve({ ok: true, json: async () => SUBSCRIPTIONS });
    }
    if (url.endsWith('/operations')) {
      return Promise.resolve({ ok: true, json: async () => [] });
    }
    if (url.includes('/api/subscriptions/1')) {
      return Promise.resolve({ ok: true, json: async () => DETAIL });
    }
    return Promise.resolve({ ok: true, json: async () => [] });
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('viewing a subscription and going back returns to the table', async () => {
  render(<App />);

  await screen.findByRole('button', { name: /view/i });

  userEvent.click(screen.getByRole('button', { name: /view/i }));

  await screen.findByRole('button', { name: /back/i });
  expect(screen.getAllByText('John Doe').length).toBeGreaterThan(0);

  userEvent.click(screen.getByRole('button', { name: /back/i }));

  await screen.findByRole('button', { name: /view/i });
});
