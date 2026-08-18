import { useState, useEffect } from 'react';
import { ALL_STATUSES, STATUS_LABELS } from '../constants';

export default function DashboardModule() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetch('http://localhost:8080/api/dashboard/summary')
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

  if (loading) return (
    <div className="flex-grow-1 p-3 d-flex justify-content-center align-items-center">
      <div className="spinner-border text-primary" role="status">
        <span className="visually-hidden">Loading...</span>
      </div>
    </div>
  );

  if (error) return (
    <div className="flex-grow-1 p-3">
      <div className="alert alert-danger">{error}</div>
    </div>
  );

  const operationTypeEntries = Object.entries(summary.operationTypeCounts);

  return (
    <div className="flex-grow-1 p-3">
      <h2 className="h4 mb-3">Dashboard</h2>

      <div className="row g-3 mb-4">
        <div className="col-md-3">
          <div className="border rounded p-3 text-center">
            <div className="text-muted small">Total Clients</div>
            <div className="fs-3 fw-semibold">{summary.clientCount}</div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="border rounded p-3 text-center">
            <div className="text-muted small">Total Subscriptions</div>
            <div className="fs-3 fw-semibold">{summary.subscriptionCount}</div>
          </div>
        </div>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-md-6">
          <h3 className="h6">Subscriptions by Status</h3>
          <table className="table table-sm table-striped">
            <thead>
              <tr>
                <th>Status</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {ALL_STATUSES.map(status => (
                <tr key={status}>
                  <td>{STATUS_LABELS[status]}</td>
                  <td>{summary.statusCounts[status] ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="col-md-6">
          <h3 className="h6">Operations by Type</h3>
          {operationTypeEntries.length === 0 ? (
            <div className="text-muted small">No operations recorded yet.</div>
          ) : (
            <table className="table table-sm table-striped">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {operationTypeEntries.map(([type, count]) => (
                  <tr key={type}>
                    <td>{type}</td>
                    <td>{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div>
        <h3 className="h6">Recent Operations</h3>
        {summary.recentOperations.length === 0 ? (
          <div className="text-muted small">No operations recorded yet.</div>
        ) : (
          <table className="table table-sm table-striped">
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
                  <td className="text-muted">{op.createdDate}</td>
                  <td>{op.clientName}</td>
                  <td>{op.operationType}</td>
                  <td>{op.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
