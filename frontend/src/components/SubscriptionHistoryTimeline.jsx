import Timeline from './ui/Timeline';
import EmptyState from './ui/EmptyState';
import { OPERATION_STATUS_TOKEN } from '../constants';

export default function SubscriptionHistoryTimeline({ operations }) {
  if (operations.length === 0) {
    return <EmptyState message="No operations recorded yet." />;
  }

  const sorted = [...operations].sort(
    (a, b) => new Date(b.createdDate) - new Date(a.createdDate)
  );

  const items = sorted.map(op => ({
    id: op.id,
    token: OPERATION_STATUS_TOKEN[op.status] || 'slate',
    title: op.operationType,
    date: op.createdDate,
    body: op.description || op.errorMessage,
    status: op.status,
    failed: op.status === 'FAILED',
  }));

  return <Timeline items={items} />;
}
