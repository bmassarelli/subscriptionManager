import { render, screen } from '@testing-library/react';
import SubscriptionHistoryTimeline from './SubscriptionHistoryTimeline';

const OLDER = {
  id: 1, subscriptionId: 1, clientName: 'John Doe', operationType: 'CREATE', status: 'COMPLETED',
  createdDate: '2026-08-01T10:00:00', updatedDate: '2026-08-01T10:00:00', errorMessage: null,
  description: 'Subscription created',
};

const NEWER = {
  id: 2, subscriptionId: 1, clientName: 'John Doe', operationType: 'SUSPEND', status: 'COMPLETED',
  createdDate: '2026-08-17T10:00:00', updatedDate: '2026-08-17T10:00:00', errorMessage: null,
  description: 'AC -> SU',
};

test('renders entries most-recent-first with date/time, type, description, and outcome', () => {
  render(<SubscriptionHistoryTimeline operations={[OLDER, NEWER]} />);

  const items = screen.getAllByRole('listitem');
  expect(items).toHaveLength(2);
  expect(items[0]).toHaveTextContent('SUSPEND');
  expect(items[0]).toHaveTextContent('AC -> SU');
  expect(items[0]).toHaveTextContent('2026-08-17T10:00:00');
  expect(items[0]).toHaveTextContent('COMPLETED');
  expect(items[1]).toHaveTextContent('CREATE');
});

test('shows an empty-state message when operations is empty', () => {
  render(<SubscriptionHistoryTimeline operations={[]} />);

  expect(screen.getByText(/no operations recorded yet/i)).toBeInTheDocument();
});

test('renders FAILED entries with a distinguishing visual treatment', () => {
  const failed = { ...NEWER, id: 3, status: 'FAILED', description: null, errorMessage: 'msisdn must be a valid phone number' };
  render(<SubscriptionHistoryTimeline operations={[failed]} />);

  const item = screen.getByRole('listitem');
  expect(item).toHaveClass('timeline__item--failed');
  expect(screen.getByText('FAILED')).toHaveClass('status-badge--coral');
});
