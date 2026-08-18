import { useState, useEffect, useCallback } from 'react';
import { STATUS_LABELS, STATUS_BADGE_CLASSES } from '../constants';

const ACTION_LABELS = {
  SUSPEND: 'Suspend',
  RECONNECT: 'Reconnect',
  CANCEL: 'Cancel',
  CHANGE_PLAN: 'Change Plan',
  CHANGE_MSISDN: 'Change MSISDN',
  CHANGE_SIM: 'Change SIM',
};

export default function SubscriptionDetail({ subscriptionId, onBack }) {
  const [detail, setDetail] = useState(null);
  const [operations, setOperations] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeAction, setActiveAction] = useState(null);
  const [actionValues, setActionValues] = useState({});
  const [actionError, setActionError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const loadDetail = useCallback(() => {
    setLoading(true);
    return Promise.all([
      fetch(`http://localhost:8080/api/subscriptions/${subscriptionId}`).then(res => {
        if (!res.ok) throw new Error('Failed to fetch subscription detail');
        return res.json();
      }),
      fetch(`http://localhost:8080/api/subscriptions/${subscriptionId}/operations`).then(res => {
        if (!res.ok) throw new Error('Failed to fetch subscription operations');
        return res.json();
      }),
    ])
      .then(([detailResult, operationsResult]) => {
        setDetail(detailResult);
        setOperations(operationsResult);
        setError(null);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [subscriptionId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    fetch('http://localhost:8080/api/platforms')
      .then(res => (res.ok ? res.json() : []))
      .then(setPlatforms)
      .catch(() => setPlatforms([]));
  }, []);

  function openAction(type) {
    setActiveAction(type);
    setActionValues(type === 'CANCEL' ? { immediate: false } : {});
    setActionError(null);
  }

  function closeAction() {
    setActiveAction(null);
    setActionValues({});
    setActionError(null);
  }

  async function submitAction(e) {
    e.preventDefault();
    setSubmitting(true);
    setActionError(null);
    try {
      const res = await fetch(`http://localhost:8080/api/subscriptions/${subscriptionId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: activeAction, ...actionValues }),
      });

      if (!res.ok) {
        const errorBody = await res.json();
        const message = Object.values(errorBody)[0] || 'Failed to apply action';
        setActionError(message);
        return;
      }

      closeAction();
      await loadDetail();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return (
    <div className="flex-grow-1 p-3 d-flex justify-content-center align-items-center">
      <div className="spinner-border text-primary" role="status">
        <span className="visually-hidden">Loading...</span>
      </div>
    </div>
  );

  if (error) return (
    <div className="flex-grow-1 p-3">
      <button className="btn btn-link p-0 mb-3" onClick={onBack}>&larr; Back</button>
      <div className="alert alert-danger">{error}</div>
    </div>
  );

  return (
    <div className="flex-grow-1 p-3 overflow-auto">
      <button className="btn btn-link p-0 mb-3" onClick={onBack}>&larr; Back</button>

      <div className="d-flex justify-content-between align-items-start mb-3">
        <div>
          <h2 className="h4 mb-1">{detail.clientName}</h2>
          <div className="text-muted">{detail.email} · {detail.msisdn}</div>
        </div>
        <span className={STATUS_BADGE_CLASSES[detail.status]}>{STATUS_LABELS[detail.status]}</span>
      </div>

      <div className="row g-3 mb-3">
        <div className="col-md-6">
          <h3 className="h6">Subscription</h3>
          <dl className="row mb-0 small">
            <dt className="col-5">Platform</dt><dd className="col-7">{detail.platform}</dd>
            <dt className="col-5">Contract</dt><dd className="col-7">{detail.contract}</dd>
            <dt className="col-5">PO</dt><dd className="col-7">{detail.po || '—'}</dd>
            <dt className="col-5">Payment Mode</dt><dd className="col-7">{detail.paymentModeName || '—'}</dd>
            <dt className="col-5">Amount</dt><dd className="col-7">${detail.amount.toFixed(2)}</dd>
            <dt className="col-5">MSISDN</dt><dd className="col-7">{detail.subscriptionMsisdn || '—'}</dd>
            <dt className="col-5">SIM/eSIM</dt><dd className="col-7">{detail.simIccid || '—'}</dd>
          </dl>
        </div>
        <div className="col-md-6">
          <h3 className="h6">Dates</h3>
          <dl className="row mb-0 small">
            <dt className="col-5">Entry</dt><dd className="col-7">{detail.entryDate || '—'}</dd>
            <dt className="col-5">Activate</dt><dd className="col-7">{detail.activateDate || '—'}</dd>
            <dt className="col-5">Deactivate</dt><dd className="col-7">{detail.deactivateDate || '—'}</dd>
            <dt className="col-5">Cancel</dt><dd className="col-7">{detail.cancelDate || '—'}</dd>
            <dt className="col-5">Trial Start</dt><dd className="col-7">{detail.startTrialDate || '—'}</dd>
            <dt className="col-5">Trial End</dt><dd className="col-7">{detail.endTrialDate || '—'}</dd>
          </dl>
        </div>
      </div>

      <div className="mb-3">
        <h3 className="h6">Lifecycle Actions</h3>
        {detail.availableActions.length === 0 ? (
          <div className="text-muted small">No actions available for this subscription's status.</div>
        ) : (
          <div className="d-flex gap-2 flex-wrap">
            {detail.availableActions.map(type => (
              <button
                key={type}
                type="button"
                className="btn btn-outline-primary btn-sm"
                onClick={() => openAction(type)}
              >
                {ACTION_LABELS[type] || type}
              </button>
            ))}
          </div>
        )}

        {activeAction && (
          <form className="border rounded p-3 mt-3 bg-light" onSubmit={submitAction}>
            <h4 className="h6">{ACTION_LABELS[activeAction] || activeAction}</h4>
            {actionError && <div className="alert alert-danger py-2">{actionError}</div>}

            {activeAction === 'CANCEL' && (
              <div className="form-check mb-2">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="action-immediate"
                  checked={!!actionValues.immediate}
                  onChange={e => setActionValues(prev => ({ ...prev, immediate: e.target.checked }))}
                />
                <label className="form-check-label" htmlFor="action-immediate">Immediate</label>
              </div>
            )}

            {activeAction === 'CHANGE_PLAN' && (
              <div className="mb-2">
                <label className="form-label" htmlFor="action-platform">New Platform</label>
                <select
                  id="action-platform"
                  className="form-select"
                  value={actionValues.platform || ''}
                  onChange={e => setActionValues(prev => ({ ...prev, platform: e.target.value }))}
                >
                  <option value="">Select a platform…</option>
                  {platforms.map(p => (
                    <option key={p.id} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}

            {activeAction === 'CHANGE_MSISDN' && (
              <div className="mb-2">
                <label className="form-label" htmlFor="action-msisdn">New MSISDN</label>
                <input
                  id="action-msisdn"
                  className="form-control"
                  value={actionValues.msisdn || ''}
                  onChange={e => setActionValues(prev => ({ ...prev, msisdn: e.target.value }))}
                />
              </div>
            )}

            {activeAction === 'CHANGE_SIM' && (
              <div className="mb-2">
                <label className="form-label" htmlFor="action-simIccid">New SIM/eSIM</label>
                <input
                  id="action-simIccid"
                  className="form-control"
                  value={actionValues.simIccid || ''}
                  onChange={e => setActionValues(prev => ({ ...prev, simIccid: e.target.value }))}
                />
              </div>
            )}

            <div className="d-flex gap-2">
              <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit'}
              </button>
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={closeAction}>
                Close
              </button>
            </div>
          </form>
        )}
      </div>

      <div>
        <h3 className="h6">History</h3>
        {operations.length === 0 ? (
          <div className="text-muted small">No operations recorded yet.</div>
        ) : (
          <table className="table table-sm table-striped">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Description</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {operations.map(op => (
                <tr key={op.id}>
                  <td className="text-muted">{op.createdDate}</td>
                  <td>{op.operationType}</td>
                  <td>{op.description || op.errorMessage}</td>
                  <td>{op.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
