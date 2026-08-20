import { STATUS_LABELS, STATUS_TOKEN, statusRailClassName } from '../constants';
import StatusBadge from './ui/StatusBadge';
import DataTable from './ui/DataTable';

const SORTABLE_COLUMNS = ['clientName', 'platform', 'entryDate', 'amount'];

const COLUMNS = [
  { key: 'clientName', label: 'Client' },
  { key: 'platform',   label: 'Platform' },
  { key: 'contract',   label: 'Contract' },
  { key: 'status',     label: 'Status' },
  { key: 'entryDate',  label: 'Entry Date' },
  { key: 'amount',     label: 'Amount' },
  { key: 'actions',    label: 'Actions' },
];

function SortIndicator({ column, sort }) {
  if (sort.column !== column) return <span className="text-muted ms-1" style={{ fontSize: '0.7rem' }}>↕</span>;
  return <span className="ms-1">{sort.direction === 'asc' ? '↑' : '↓'}</span>;
}

export default function SubscriptionTable({ rows, total, sort, onSort, page, rowsPerPage, onPageChange, onRowsPerPageChange, onView }) {
  const totalPages = Math.ceil(total / rowsPerPage) || 1;
  const from = total === 0 ? 0 : (page - 1) * rowsPerPage + 1;
  const to = Math.min(page * rowsPerPage, total);

  function handleHeaderClick(colKey) {
    if (!SORTABLE_COLUMNS.includes(colKey)) return;
    onSort({
      column: colKey,
      direction: sort.column === colKey && sort.direction === 'asc' ? 'desc' : 'asc',
    });
  }

  return (
    <div className="page">
      <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
        <small className="text-muted">
          Showing <strong>{from}–{to}</strong> of <strong>{total}</strong> subscriptions
        </small>
        <div className="d-flex align-items-center gap-2">
          <small className="text-muted">Rows per page:</small>
          <select
            className="form-select form-select-sm"
            style={{ width: 'auto' }}
            value={rowsPerPage}
            onChange={e => { onRowsPerPageChange(Number(e.target.value)); onPageChange(1); }}
          >
            {[10, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <button
            className="btn btn-outline-secondary btn-sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >◀</button>
          <small className="text-muted">{page} / {totalPages}</small>
          <button
            className="btn btn-outline-secondary btn-sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >▶</button>
        </div>
      </div>

      <DataTable>
        <thead>
          <tr>
            {COLUMNS.map(col => (
              <th
                key={col.key}
                className={SORTABLE_COLUMNS.includes(col.key) ? 'sortable' : ''}
                onClick={() => handleHeaderClick(col.key)}
              >
                {col.label}
                {SORTABLE_COLUMNS.includes(col.key) && (
                  <SortIndicator column={col.key} sort={sort} />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="text-center text-muted py-4">
                No subscriptions found
              </td>
            </tr>
          ) : (
            rows.map(row => (
              <tr key={row.id} className={statusRailClassName(row.status)}>
                <td>
                  <div className="fw-semibold">{row.clientName}</div>
                  <div className="text-muted small">{row.email} · <span className="font-mono">{row.msisdn}</span></div>
                </td>
                <td>{row.platform}</td>
                <td className="text-muted font-mono">{row.contract}</td>
                <td>
                  <StatusBadge token={STATUS_TOKEN[row.status]} label={STATUS_LABELS[row.status]} />
                </td>
                <td className="text-muted font-mono">{row.entryDate}</td>
                <td className="font-mono">${row.amount.toFixed(2)}</td>
                <td>
                  <button className="btn btn-link btn-sm p-0" onClick={() => onView(row.id)}>View</button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </DataTable>
    </div>
  );
}
