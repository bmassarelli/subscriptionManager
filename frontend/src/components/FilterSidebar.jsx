import { useState } from 'react';
import { ALL_STATUSES, STATUS_LABELS } from '../constants';
import FilterPanel from './ui/FilterPanel';

export default function FilterSidebar({ filters, platforms, onApply, onClear }) {
  const [pendingDates, setPendingDates] = useState({ dateFrom: filters.dateFrom, dateTo: filters.dateTo });

  function handleSearchChange(e) {
    onApply({ ...filters, search: e.target.value });
  }

  function handleStatusChange(e) {
    const value = e.target.value;
    onApply({ ...filters, statuses: value === 'All' ? ALL_STATUSES : [value] });
  }

  function handlePlatformChange(e) {
    onApply({ ...filters, platform: e.target.value });
  }

  function handleApplyDates() {
    onApply({ ...filters, ...pendingDates });
  }

  function handleClear() {
    const reset = { search: '', statuses: ALL_STATUSES, platform: 'All', dateFrom: '', dateTo: '' };
    setPendingDates({ dateFrom: '', dateTo: '' });
    onClear(reset);
  }

  const statusValue = filters.statuses.length === 1 ? filters.statuses[0] : 'All';

  return (
    <FilterPanel>
      <div className="filter-panel__group">
        <label className="filter-panel__label">Search</label>
        <input
          type="text"
          className="form-control form-control-sm"
          placeholder="Name / Email / MSISDN / Contract"
          value={filters.search}
          onChange={handleSearchChange}
        />
      </div>

      <div className="filter-panel__group">
        <label className="filter-panel__label">Status</label>
        <select
          className="form-select form-select-sm"
          value={statusValue}
          onChange={handleStatusChange}
        >
          <option value="All">All statuses</option>
          {ALL_STATUSES.map(status => (
            <option key={status} value={status}>{STATUS_LABELS[status]}</option>
          ))}
        </select>
      </div>

      <div className="filter-panel__group">
        <label className="filter-panel__label">Platform</label>
        <select
          className="form-select form-select-sm"
          value={filters.platform}
          onChange={handlePlatformChange}
        >
          <option value="All">All platforms</option>
          {platforms.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <div className="filter-panel__group">
        <label className="filter-panel__label">Entry Date</label>
        <input
          type="date"
          aria-label="Entry date from"
          className="form-control form-control-sm mb-1"
          value={pendingDates.dateFrom}
          onChange={e => setPendingDates(prev => ({ ...prev, dateFrom: e.target.value }))}
        />
        <input
          type="date"
          aria-label="Entry date to"
          className="form-control form-control-sm"
          value={pendingDates.dateTo}
          onChange={e => setPendingDates(prev => ({ ...prev, dateTo: e.target.value }))}
        />
      </div>

      <div className="d-grid gap-2">
        <button className="btn btn-primary btn-sm" onClick={handleApplyDates}>Apply</button>
        <button className="btn btn-outline-secondary btn-sm" onClick={handleClear}>Clear</button>
      </div>
    </FilterPanel>
  );
}
