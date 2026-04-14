import { useState, useMemo } from 'react';
import { mockData } from './mockData';
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

const platforms = [...new Set(mockData.map(d => d.platform))].sort();

export default function App() {
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [sort, setSort] = useState(INITIAL_SORT);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const { rows, total } = useMemo(() => {
    const filtered = applyFilters(mockData, filters);
    const sorted = applySort(filtered, sort);
    return paginate(sorted, page, rowsPerPage);
  }, [filters, sort, page, rowsPerPage]);

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
