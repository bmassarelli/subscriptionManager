import { useState, useEffect } from 'react';
import { ALL_STATUSES, STATUS_LABELS, STATUS_TOKEN, OPERATION_TYPE_CHART_TOKEN } from '../constants';
import { apiFetch } from '../api';
import LoadingState from './ui/LoadingState';
import ErrorState from './ui/ErrorState';
import EmptyState from './ui/EmptyState';
import MetricCard from './ui/MetricCard';
import PieChart from './ui/PieChart';
import DataTable from './ui/DataTable';

export default function DashboardModule() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    apiFetch('/api/dashboard/summary')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch dashboard summary');
        return res.json();
      })
      .then(data => {
        setSummary(data);
        setError(null);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  const operationTypeEntries = Object.entries(summary.operationTypeCounts);

  const statusSlices = ALL_STATUSES.map(status => ({
    key: status,
    label: STATUS_LABELS[status],
    value: summary.statusCounts[status] ?? 0,
    token: STATUS_TOKEN[status],
  }));

  const operationTypeSlices = [...operationTypeEntries]
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({
      key: type,
      label: type,
      value: count,
      // Neutral fallback for an unrecognized operation type — must not be any
      // real category's token ('cat-1'..'cat-9'), or an unknown type would be
      // visually indistinguishable from whichever operation owns that slot.
      token: OPERATION_TYPE_CHART_TOKEN[type] || 'slate',
    }));

  return (
    <div className="page">
      <h2 className="page__title mb-3">Dashboard</h2>

      <div className="row g-3 mb-4">
        <div className="col-md-3">
          <MetricCard label="Total Clients" value={summary.clientCount} />
        </div>
        <div className="col-md-3">
          <MetricCard label="Total Subscriptions" value={summary.subscriptionCount} />
        </div>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-md-6">
          <h3 className="h6">Subscriptions by Status</h3>
          <PieChart slices={statusSlices} />
        </div>

        <div className="col-md-6">
          <h3 className="h6">Operations by Type</h3>
          {operationTypeEntries.length === 0 ? (
            <EmptyState message="No operations recorded yet." />
          ) : (
            <PieChart slices={operationTypeSlices} />
          )}
        </div>
      </div>

      <div>
        <h3 className="h6">Recent Operations</h3>
        {summary.recentOperations.length === 0 ? (
          <EmptyState message="No operations recorded yet." />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th>Date</th>
                <th>Client</th>
                <th>Type</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {summary.recentOperations.map(op => (
                <tr key={op.id}>
                  <td className="text-muted font-mono">{op.createdDate}</td>
                  <td>{op.clientName}</td>
                  <td>{op.operationType}</td>
                  <td>{op.status}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </div>
    </div>
  );
}
