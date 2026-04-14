import { useState } from 'react';
import { ALL_STATUSES, STATUS_LABELS } from '../constants';

export default function FilterSidebar({ filters, platforms, onApply, onClear }) {
  const [draft, setDraft] = useState(filters);

  function handleStatusChange(status) {
    setDraft(prev => {
      const statuses = prev.statuses.includes(status)
        ? prev.statuses.filter(s => s !== status)
        : [...prev.statuses, status];
      return { ...prev, statuses };
    });
  }

  function handleClear() {
    const reset = { search: '', statuses: ALL_STATUSES, platform: 'All', dateFrom: '', dateTo: '' };
    setDraft(reset);
    onClear(reset);
  }

  return (
    <div className="bg-light border-end p-3" style={{ width: '220px', flexShrink: 0 }}>
      <h6 className="fw-bold mb-3">Filters</h6>

      <div className="mb-3">
        <label className="form-label small fw-semibold text-secondary">Search</label>
        <input
          type="text"
          className="form-control form-control-sm"
          placeholder="Name / Email / MSISDN"
          value={draft.search}
          onChange={e => setDraft(prev => ({ ...prev, search: e.target.value }))}
        />
      </div>

      <div className="mb-3">
        <label className="form-label small fw-semibold text-secondary">Status</label>
        {ALL_STATUSES.map(status => (
          <div className="form-check" key={status}>
            <input
              className="form-check-input"
              type="checkbox"
              id={`status-${status}`}
              checked={draft.statuses.includes(status)}
              onChange={() => handleStatusChange(status)}
            />
            <label className="form-check-label small" htmlFor={`status-${status}`}>
              {STATUS_LABELS[status]}
            </label>
          </div>
        ))}
      </div>

      <div className="mb-3">
        <label className="form-label small fw-semibold text-secondary">Platform</label>
        <select
          className="form-select form-select-sm"
          value={draft.platform}
          onChange={e => setDraft(prev => ({ ...prev, platform: e.target.value }))}
        >
          <option value="All">All platforms</option>
          {platforms.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <div className="mb-3">
        <label className="form-label small fw-semibold text-secondary">Entry Date</label>
        <input
          type="date"
          className="form-control form-control-sm mb-1"
          value={draft.dateFrom}
          onChange={e => setDraft(prev => ({ ...prev, dateFrom: e.target.value }))}
        />
        <input
          type="date"
          className="form-control form-control-sm"
          value={draft.dateTo}
          onChange={e => setDraft(prev => ({ ...prev, dateTo: e.target.value }))}
        />
      </div>

      <div className="d-grid gap-2">
        <button className="btn btn-primary btn-sm" onClick={() => onApply(draft)}>Apply</button>
        <button className="btn btn-outline-secondary btn-sm" onClick={handleClear}>Clear</button>
      </div>
    </div>
  );
}
