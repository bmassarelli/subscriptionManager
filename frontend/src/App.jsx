import { useState, useMemo, useEffect } from 'react';
import { ALL_STATUSES } from './constants';
import { applyFilters, applySort, paginate } from './utils/filterSort';
import Navbar from './components/Navbar';
import FilterSidebar from './components/FilterSidebar';
import SubscriptionTable from './components/SubscriptionTable';

const API_BASE = 'http://localhost:4000/api';

const INITIAL_FILTERS = {
  search: '',
  statuses: ALL_STATUSES,
  platform: 'All',
  dateFrom: '',
  dateTo: '',
};

const INITIAL_SORT = { column: 'entryDate', direction: 'desc' };

export default function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [sort, setSort] = useState(INITIAL_SORT);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [activatingId, setActivatingId] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/subscriptions`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(rows => {
        setData(rows);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  async function handleActivate(id) {
    setActivatingId(id);
    try {
      const res = await fetch(`${API_BASE}/subscriptions/${id}/activate`, {
        method: 'PUT',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(prev =>
        prev.map(row => (row.id === id ? { ...row, status: 'A' } : row))
      );
    } catch (err) {
      console.error('Activate failed:', err);
    } finally {
      setActivatingId(null);
    }
  }

  const platforms = useMemo(
    () => [...new Set(data.map(d => d.platform))].sort(),
    [data]
  );

  const { rows, total } = useMemo(() => {
    const filtered = applyFilters(data, filters);
    const sorted = applySort(filtered, sort);
    return paginate(sorted, page, rowsPerPage);
  }, [data, filters, sort, page, rowsPerPage]);

  function handleApply(newFilters) {
    setFilters(newFilters);
    setPage(1);
  }

  function handleClear(resetFilters) {
    setFilters(resetFilters);
    setSort(INITIAL_SORT);
    setPage(1);
  }

  function handleSort(newSort) {
    setSort(newSort);
    setPage(1);
  }

  if (loading) {
    return (
      <div className="d-flex flex-column min-vh-100">
        <Navbar />
        <div className="d-flex flex-grow-1 align-items-center justify-content-center">
          <div className="text-center">
            <div className="spinner-border text-primary mb-3" role="status" style={{ width: '3rem', height: '3rem' }}>
              <span className="visually-hidden">Loading...</span>
            </div>
            <div className="fw-semibold text-primary">Loading subscriptions...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="d-flex flex-column min-vh-100">
        <Navbar />
        <div className="d-flex flex-grow-1 align-items-center justify-content-center">
          <div className="alert alert-danger" role="alert">
            <strong>Could not connect to the API.</strong> Make sure the backend is running at <code>{API_BASE}</code>.
            <br />
            <small className="text-muted">{error}</small>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="d-flex flex-column min-vh-100">
      <Navbar />
      <div className="d-flex flex-grow-1">
        <FilterSidebar
          filters={filters}
          platforms={platforms}
          onApply={handleApply}
          onClear={handleClear}
        />
        <SubscriptionTable
          rows={rows}
          total={total}
          sort={sort}
          onSort={handleSort}
          page={page}
          rowsPerPage={rowsPerPage}
          onPageChange={setPage}
          onRowsPerPageChange={setRowsPerPage}
          activatingId={activatingId}
          onActivate={handleActivate}
        />
      </div>
    </div>
  );
}
