import { useState, useEffect, useMemo } from 'react';
import { ALL_STATUSES } from './constants';
import { applyFilters, applySort, paginate } from './utils/filterSort';
import Navbar from './components/Navbar';
import FilterSidebar from './components/FilterSidebar';
import SubscriptionTable from './components/SubscriptionTable';

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

  useEffect(() => {
    fetch('http://localhost:8080/api/subscriptions')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch subscriptions');
        return res.json();
      })
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

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

  if (loading) return (
    <div className="d-flex flex-column min-vh-100">
      <Navbar />
      <div className="d-flex justify-content-center align-items-center flex-grow-1">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    </div>
  );

  if (error) return (
    <div className="d-flex flex-column min-vh-100">
      <Navbar />
      <div className="d-flex justify-content-center align-items-center flex-grow-1">
        <div className="alert alert-danger">{error}</div>
      </div>
    </div>
  );

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
        />
      </div>
    </div>
  );
}
