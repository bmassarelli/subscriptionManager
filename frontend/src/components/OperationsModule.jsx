import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ALL_OPERATION_TYPES, OPERATION_TYPE_LABELS,
  ALL_OPERATION_STATUSES, OPERATION_STATUS_LABELS, OPERATION_STATUS_TOKEN,
} from '../constants';
import { applyOperationFilters } from '../utils/filterSort';
import { apiFetch } from '../api';
import FilterPanel from './ui/FilterPanel';
import LoadingState from './ui/LoadingState';
import ErrorState from './ui/ErrorState';
import EmptyState from './ui/EmptyState';
import DataTable from './ui/DataTable';
import StatusBadge from './ui/StatusBadge';

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
    return apiFetch('/api/operations')
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
    <div className="split-layout">
      <FilterPanel>
        <div className="filter-panel__group">
          <label className="filter-panel__label">Search</label>
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder="Client / Subscription ID"
            value={filters.search}
            onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
          />
        </div>

        <div className="filter-panel__group">
          <label className="filter-panel__label">Type</label>
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

        <div className="filter-panel__group">
          <label className="filter-panel__label">Status</label>
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

        <div className="filter-panel__group">
          <label className="filter-panel__label">Created Date</label>
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
      </FilterPanel>

      <div className="split-layout__content page">
        <div className="page__header">
          <h2 className="page__title">Operations</h2>
        </div>

        {loading && <LoadingState />}

        {!loading && error && <ErrorState message={error} />}

        {!loading && !error && operations.length === 0 && (
          <EmptyState message="No operations recorded yet." />
        )}

        {!loading && !error && operations.length > 0 && filteredOperations.length === 0 && (
          <EmptyState message="No operations match your filters." />
        )}

        {!loading && !error && filteredOperations.length > 0 && (
          <DataTable>
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
                  <td className="font-mono text-muted">{operation.id}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-link p-0 font-mono"
                      onClick={() => onViewSubscription(operation.subscriptionId)}
                    >
                      {operation.subscriptionId}
                    </button>
                  </td>
                  <td>{operation.clientName}</td>
                  <td>{operation.operationType}</td>
                  <td>
                    <StatusBadge
                      token={OPERATION_STATUS_TOKEN[operation.status] || 'slate'}
                      label={operation.status}
                    />
                  </td>
                  <td className="text-muted font-mono">{operation.createdDate}</td>
                  <td className="text-muted font-mono">{operation.updatedDate}</td>
                  <td className="text-muted">{operation.errorMessage}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </div>
    </div>
  );
}
