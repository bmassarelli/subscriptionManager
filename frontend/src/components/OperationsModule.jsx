import { useState, useEffect, useCallback } from 'react';

export default function OperationsModule({ onViewSubscription }) {
  const [operations, setOperations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadOperations = useCallback(() => {
    setLoading(true);
    return fetch('http://localhost:8080/api/operations')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch operations');
        return res.json();
      })
      .then(data => {
        setOperations(data);
        setError(null);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadOperations();
  }, [loadOperations]);

  return (
    <div className="flex-grow-1 p-3">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="h4 mb-0">Operations</h2>
      </div>

      {loading && (
        <div className="d-flex justify-content-center align-items-center py-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      )}

      {!loading && error && (
        <div className="alert alert-danger">{error}</div>
      )}

      {!loading && !error && operations.length === 0 && (
        <div className="alert alert-secondary">No operations recorded yet.</div>
      )}

      {!loading && !error && operations.length > 0 && (
        <table className="table table-striped">
          <thead>
            <tr>
              <th>ID</th>
              <th>Subscription</th>
              <th>Client</th>
              <th>Type</th>
              <th>Status</th>
              <th>Created</th>
              <th>Updated</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {operations.map(operation => (
              <tr key={operation.id}>
                <td>{operation.id}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn-link p-0"
                    onClick={() => onViewSubscription(operation.subscriptionId)}
                  >
                    {operation.subscriptionId}
                  </button>
                </td>
                <td>{operation.clientName}</td>
                <td>{operation.operationType}</td>
                <td>{operation.status}</td>
                <td>{operation.createdDate}</td>
                <td>{operation.updatedDate}</td>
                <td>{operation.errorMessage}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
