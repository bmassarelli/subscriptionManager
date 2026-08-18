import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OperationsModule from './OperationsModule';

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('fetches and renders the operations list on mount', async () => {
  global.fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ([
      {
        id: 1,
        subscriptionId: 10,
        clientName: 'John Doe',
        operationType: 'SUSPEND',
        status: 'COMPLETED',
        createdDate: '2026-08-17T10:00:00',
        updatedDate: '2026-08-17T10:00:00',
        errorMessage: null,
        description: 'AC -> SU',
      },
    ]),
  });

  render(<OperationsModule onViewSubscription={jest.fn()} />);

  expect(await screen.findByText('SUSPEND')).toBeInTheDocument();
  expect(screen.getByText('John Doe')).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith('http://localhost:8080/api/operations');
});

test('shows an empty-state message when the list is empty', async () => {
  global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ([]) });

  render(<OperationsModule onViewSubscription={jest.fn()} />);

  expect(await screen.findByText(/no operations recorded yet/i)).toBeInTheDocument();
});

test('clicking a row subscription link opens that subscription', async () => {
  global.fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ([
      {
        id: 1,
        subscriptionId: 10,
        clientName: 'John Doe',
        operationType: 'SUSPEND',
        status: 'COMPLETED',
        createdDate: '2026-08-17T10:00:00',
        updatedDate: '2026-08-17T10:00:00',
        errorMessage: null,
        description: 'AC -> SU',
      },
    ]),
  });
  const onViewSubscription = jest.fn();

  render(<OperationsModule onViewSubscription={onViewSubscription} />);

  userEvent.click(await screen.findByRole('button', { name: '10' }));

  expect(onViewSubscription).toHaveBeenCalledWith(10);
});
