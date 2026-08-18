import { render, screen } from '@testing-library/react';
import DashboardModule from './DashboardModule';

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('fetches and renders the dashboard summary', async () => {
  global.fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      clientCount: 2,
      subscriptionCount: 3,
      statusCounts: { AC: 1, TR: 1, SU: 0, EX: 0, CA: 1, ER: 0 },
      recentOperations: [
        { id: 1, subscriptionId: 1, clientName: 'John Doe', operationType: 'SUSPEND', status: 'COMPLETED',
          createdDate: '2026-08-17T10:00:00', updatedDate: '2026-08-17T10:00:00', errorMessage: null,
          description: 'AC -> SU' },
      ],
      operationTypeCounts: { SUSPEND: 1, CREATE: 3 },
    }),
  });

  render(<DashboardModule />);

  expect(await screen.findByText('2')).toBeInTheDocument();
  expect(screen.getAllByText('3').length).toBeGreaterThan(0);
  expect(screen.getByText('John Doe')).toBeInTheDocument();
  expect(screen.getAllByText('SUSPEND').length).toBeGreaterThan(0);
  expect(global.fetch).toHaveBeenCalledWith('http://localhost:8080/api/dashboard/summary');
});

test('renders the all-zero/empty state without error', async () => {
  global.fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      clientCount: 0,
      subscriptionCount: 0,
      statusCounts: { AC: 0, TR: 0, SU: 0, EX: 0, CA: 0, ER: 0 },
      recentOperations: [],
      operationTypeCounts: {},
    }),
  });

  render(<DashboardModule />);

  expect(await screen.findByText('Dashboard')).toBeInTheDocument();
  expect(screen.getAllByText('0').length).toBeGreaterThan(0);
  expect(screen.getAllByText(/no operations recorded yet/i).length).toBe(2);
});
