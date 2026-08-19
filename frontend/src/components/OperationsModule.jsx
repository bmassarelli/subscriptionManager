import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ALL_OPERATION_TYPES, OPERATION_TYPE_LABELS,
  ALL_OPERATION_STATUSES, OPERATION_STATUS_LABELS,
} from '../constants';
import { applyOperationFilters } from '../utils/filterSort';

const INITIAL_OPERATION_FILTERS = {
  search: '',
  types: ALL_OPERATION_TYPES,
  statuses: ALL_OPERATION_STATUSES,
  dateFrom: '',
  dateTo: '',
};

export default function OperationsModule({ onViewSubscription }) {
  const [operations, setOperations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState(INITIAL_OPERATION_FILTERS);

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

  function handleTypeChange(type) {
    setFilters(prev => {
      const types = prev.types.includes(type)
        ? prev.types.filter(t => t !== type)
        : [...prev.types, type];
      return { ...prev, types };
    });
  }

  function handleStatusChange(status) {
    setFilters(prev => {
      const statuses = prev.statuses.includes(status)
        ? prev.statuses.filter(s => s !== status)
        : [...prev.statuses, status];
      return { ...prev, statuses };
    });
  }

  function handleClear() {
    setFilters(INITIAL_OPERATION_FILTERS);
  }

  const filteredOperations = useMemo(
    () => applyOperationFilters(operations, filters),
    [operations, filters]
  );

  return (
    <>
      <div className="bg-light border-end p-3" style={{ width: '220px', flexShrink: 0 }}>
        <h6 className="fw-bold mb-3">Filters</h6>

        <div className="mb-3">
          <label className="form-label small fw-semibold text-secondary">Search</label>
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder="Client / Subscription ID"
            value={filters.search}
            onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
          />
        </div>

        <div className="mb-3">
          <label className="form-label small fw-semibold text-secondary">Type</label>
          {ALL_OPERATION_TYPES.map(type => (
            <div className="form-check" key={type}>
              <input
                className="form-check-input"
                type="checkbox"
                id={`op-type-${type}`}
                checked={filters.types.includes(type)}
                onChange={() => handleTypeChange(type)}
              />
              <label className="form-check-label small" htmlFor={`op-type-${type}`}>
                {OPERATION_TYPE_LABELS[type]}
              </label>
            </div>
          ))}
        </div>

        <div className="mb-3">
          <label className="form-label small fw-semibold text-secondary">Status</label>
          {ALL_OPERATION_STATUSES.map(status => (
            <div className="form-check" key={status}>
              <input
                className="form-check-input"
                type="checkbox"
                id={`op-status-${status}`}
                checked={filters.statuses.includes(status)}
                onChange={() => handleStatusChange(status)}
              />
              <label className="form-check-label small" htmlFor={`op-status-${status}`}>
                {OPERATION_STATUS_LABELS[status]}
              </label>
            </div>
          ))}
        </div>

        <div className="mb-3">
          <label className="form-label small fw-semibold text-secondary">Created Date</label>
          <input
            type="date"
            className="form-control form-control-sm mb-1"
            value={filters.dateFrom}
            onChange={e => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
          />
          <input
            type="date"
            className="form-control form-control-sm"
            value={filters.dateTo}
            onChange={e => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
          />
        </div>

        <div className="d-grid">
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={handleClear}>
            Clear
          </button>
        </div>
      </div>

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

        {!loading && !error && operations.length > 0 && filteredOperations.length === 0 && (
          <div className="alert alert-secondary">No operations match your filters.</div>
        )}

        {!loading && !error && filteredOperations.length > 0 && (
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
              {filteredOperations.map(operation => (
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
    </>
  );
}
