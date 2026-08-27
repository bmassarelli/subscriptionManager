import { useState, useEffect, useMemo } from 'react';
import { ALL_STATUSES } from './constants';
import { applyFilters, applySort, paginate } from './utils/filterSort';
import { apiFetch } from './api';
import AppShell from './components/shell/AppShell';
import FilterSidebar from './components/FilterSidebar';
import SubscriptionTable from './components/SubscriptionTable';
import ClientsModule from './components/ClientsModule';
import OperationsModule from './components/OperationsModule';
import DashboardModule from './components/DashboardModule';
import AddSubscriptionForm from './components/AddSubscriptionForm';
import SubscriptionDetail from './components/SubscriptionDetail';
import LoginScreen from './components/LoginScreen';
import LoadingState from './components/ui/LoadingState';
import ErrorState from './components/ui/ErrorState';

const INITIAL_FILTERS = {
  search: '',
  statuses: ALL_STATUSES,
  platform: 'All',
  dateFrom: '',
  dateTo: '',
};

const INITIAL_SORT = { column: 'entryDate', direction: 'desc' };

export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [activeModule, setActiveModule] = useState('dashboard');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [sort, setSort] = useState(INITIAL_SORT);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [showAddSubscription, setShowAddSubscription] = useState(false);
  const [selectedSubscriptionId, setSelectedSubscriptionId] = useState(null);

  function loadSubscriptions() {
    setLoading(true);
    return apiFetch('/api/subscriptions')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch subscriptions');
        return res.json();
      })
      .then(result => {
        setData(result);
        setError(null);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    apiFetch('/api/auth/me')
      .then(res => {
        setAuthenticated(res.ok);
      })
      .finally(() => setAuthChecked(true));
  }, []);

  useEffect(() => {
    function handleUnauthorized() {
      setAuthenticated(false);
    }
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  useEffect(() => {
    if (authenticated) {
      loadSubscriptions();
    }
  }, [authenticated]);

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

  function renderSubscriptionsModule() {
    if (loading) return <LoadingState />;
    if (error) return <ErrorState message={error} />;

    return (
      <div className="split-layout">
        <FilterSidebar
          filters={filters}
          platforms={platforms}
          onApply={handleApply}
          onClear={handleClear}
        />
        <div className="split-layout__content">
          <div className="toolbar">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setShowAddSubscription(prev => !prev)}
            >
              {showAddSubscription ? 'Close' : 'Add Subscription'}
            </button>
          </div>
          {showAddSubscription && (
            <div className="toolbar--panel">
              <AddSubscriptionForm onCreated={loadSubscriptions} />
            </div>
          )}
          <SubscriptionTable
            rows={rows}
            total={total}
            sort={sort}
            onSort={handleSort}
            page={page}
            rowsPerPage={rowsPerPage}
            onPageChange={setPage}
            onRowsPerPageChange={setRowsPerPage}
            onView={setSelectedSubscriptionId}
          />
        </div>
      </div>
    );
  }

  if (!authChecked) {
    return <LoadingState />;
  }

  if (!authenticated) {
    return <LoginScreen onLoggedIn={() => setAuthenticated(true)} />;
  }

  return (
    <AppShell activeModule={activeModule} onSelectModule={setActiveModule} onLoggedOut={() => setAuthenticated(false)}>
      {activeModule === 'subscriptions' && (
        selectedSubscriptionId ? (
          <SubscriptionDetail
            subscriptionId={selectedSubscriptionId}
            onBack={() => setSelectedSubscriptionId(null)}
          />
        ) : renderSubscriptionsModule()
      )}
      {activeModule === 'clients' && <ClientsModule />}
      {activeModule === 'operations' && (
        <OperationsModule
          onViewSubscription={id => {
            setSelectedSubscriptionId(id);
            setActiveModule('subscriptions');
          }}
        />
      )}
      {activeModule === 'dashboard' && <DashboardModule />}
    </AppShell>
  );
}
