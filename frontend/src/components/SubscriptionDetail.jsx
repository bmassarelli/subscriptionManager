import { useState, useEffect, useCallback } from 'react';
import { STATUS_LABELS, STATUS_TOKEN, statusRailClassName } from '../constants';
import SubscriptionHistoryTimeline from './SubscriptionHistoryTimeline';
import StatusBadge from './ui/StatusBadge';
import LoadingState from './ui/LoadingState';
import ErrorState from './ui/ErrorState';
import EmptyState from './ui/EmptyState';
import DataTable from './ui/DataTable';

const ACTION_LABELS = {
  SUSPEND: 'Suspend',
  RECONNECT: 'Reconnect',
  CANCEL: 'Cancel',
  CHANGE_PLAN: 'Change Plan',
  CHANGE_MSISDN: 'Change MSISDN',
  CHANGE_SIM: 'Change SIM',
};

const RESOURCE_TYPES = ['IP', 'VLAN', 'CPE', 'PORT', 'EQUIPMENT', 'NODE'];

export default function SubscriptionDetail({ subscriptionId, onBack }) {
  const [detail, setDetail] = useState(null);
  const [operations, setOperations] = useState([]);
  const [resources, setResources] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeAction, setActiveAction] = useState(null);
  const [actionValues, setActionValues] = useState({});
  const [actionError, setActionError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showAddResource, setShowAddResource] = useState(false);
  const [newResourceType, setNewResourceType] = useState(RESOURCE_TYPES[0]);
  const [newResourceValue, setNewResourceValue] = useState('');
  const [resourceError, setResourceError] = useState(null);
  const [resourceSubmitting, setResourceSubmitting] = useState(false);
  const [editingSubscription, setEditingSubscription] = useState(false);
  const [editValues, setEditValues] = useState({ contract: '', amount: '' });
  const [editError, setEditError] = useState(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

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
      fetch(`http://localhost:8080/api/subscriptions/${subscriptionId}/resources`).then(res => {
        if (!res.ok) throw new Error('Failed to fetch subscription resources');
        return res.json();
      }),
    ])
      .then(([detailResult, operationsResult, resourcesResult]) => {
        setDetail(detailResult);
        setOperations(operationsResult);
        setResources(resourcesResult);
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

  async function submitResource(e) {
    e.preventDefault();
    setResourceSubmitting(true);
    setResourceError(null);
    try {
      const res = await fetch(`http://localhost:8080/api/subscriptions/${subscriptionId}/resources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resourceType: newResourceType, value: newResourceValue }),
      });

      if (!res.ok) {
        const errorBody = await res.json();
        const message = Object.values(errorBody)[0] || 'Failed to add resource';
        setResourceError(message);
        return;
      }

      setNewResourceValue('');
      setShowAddResource(false);
      await loadDetail();
    } catch (err) {
      setResourceError(err.message);
    } finally {
      setResourceSubmitting(false);
    }
  }

  function openEditSubscription() {
    setEditValues({ contract: detail.contract, amount: String(detail.amount) });
    setEditError(null);
    setEditingSubscription(true);
  }

  function closeEditSubscription() {
    setEditingSubscription(false);
    setEditError(null);
  }

  async function submitEditSubscription(e) {
    e.preventDefault();
    setEditSubmitting(true);
    setEditError(null);
    try {
      const res = await fetch(`http://localhost:8080/api/subscriptions/${subscriptionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contract: editValues.contract, amount: Number(editValues.amount) }),
      });

      if (!res.ok) {
        const errorBody = await res.json();
        const message = Object.values(errorBody)[0] || 'Failed to update subscription';
        setEditError(message);
        return;
      }

      setEditingSubscription(false);
      await loadDetail();
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditSubmitting(false);
    }
  }

  async function removeResource(resourceId) {
    await fetch(`http://localhost:8080/api/subscriptions/${subscriptionId}/resources/${resourceId}`, {
      method: 'DELETE',
    });
    await loadDetail();
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

  if (loading) return <LoadingState />;

  if (error) return (
    <div className="page">
      <button className="btn btn-link p-0 mb-3" onClick={onBack}>&larr; Back</button>
      <ErrorState message={error} />
    </div>
  );

  return (
    <div className="page">
      <button className="btn btn-link p-0 mb-3" onClick={onBack}>&larr; Back</button>

      <div className={`${statusRailClassName(detail.status)} d-flex justify-content-between align-items-start mb-3 p-3 bg-white border rounded`}>
        <div>
          <h2 className="h4 mb-1">{detail.clientName}</h2>
          <div className="text-muted">{detail.email} · <span className="font-mono">{detail.msisdn}</span></div>
        </div>
        <StatusBadge token={STATUS_TOKEN[detail.status]} label={STATUS_LABELS[detail.status]} />
      </div>

      <div className="row g-3 mb-3">
        <div className="col-md-6">
          <div className="d-flex justify-content-between align-items-center">
            <h3 className="h6 mb-0">Subscription</h3>
            {!editingSubscription && (
              <button type="button" className="btn btn-link btn-sm p-0" onClick={openEditSubscription}>
                Edit
              </button>
            )}
          </div>
          <dl className="row mb-0 small">
            <dt className="col-5">Platform</dt><dd className="col-7">{detail.platform}</dd>
            <dt className="col-5">Contract</dt><dd className="col-7 font-mono">{detail.contract}</dd>
            <dt className="col-5">PO</dt><dd className="col-7 font-mono">{detail.po || '—'}</dd>
            <dt className="col-5">Payment Mode</dt><dd className="col-7">{detail.paymentModeName || '—'}</dd>
            <dt className="col-5">Amount</dt><dd className="col-7 font-mono">${detail.amount.toFixed(2)}</dd>
            <dt className="col-5">MSISDN</dt><dd className="col-7 font-mono">{detail.subscriptionMsisdn || '—'}</dd>
            <dt className="col-5">SIM/eSIM</dt><dd className="col-7 font-mono">{detail.simIccid || '—'}</dd>
          </dl>

          {editingSubscription && (
            <form className="border rounded p-3 mt-2 bg-light" onSubmit={submitEditSubscription}>
              {editError && <div className="alert alert-danger py-2">{editError}</div>}
              <div className="row g-2 align-items-end">
                <div className="col-auto">
                  <label className="form-label" htmlFor="edit-contract">Contract</label>
                  <input
                    id="edit-contract"
                    className="form-control"
                    value={editValues.contract}
                    onChange={e => setEditValues(prev => ({ ...prev, contract: e.target.value }))}
                  />
                </div>
                <div className="col-auto">
                  <label className="form-label" htmlFor="edit-amount">Amount</label>
                  <input
                    id="edit-amount"
                    type="number"
                    className="form-control"
                    value={editValues.amount}
                    onChange={e => setEditValues(prev => ({ ...prev, amount: e.target.value }))}
                  />
                </div>
                <div className="col-auto d-flex gap-2">
                  <button type="submit" className="btn btn-primary btn-sm" disabled={editSubmitting}>
                    {editSubmitting ? 'Saving...' : 'Save'}
                  </button>
                  <button type="button" className="btn btn-outline-secondary btn-sm" onClick={closeEditSubscription}>
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          )}
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
          <EmptyState message="No actions available for this subscription's status." />
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

      <div className="mb-3">
        <div className="d-flex justify-content-between align-items-center">
          <h3 className="h6 mb-0">Resources</h3>
          <button
            type="button"
            className="btn btn-outline-primary btn-sm"
            onClick={() => setShowAddResource(prev => !prev)}
          >
            {showAddResource ? 'Close' : 'Add Resource'}
          </button>
        </div>

        {showAddResource && (
          <form className="border rounded p-3 mt-2 bg-light" onSubmit={submitResource}>
            {resourceError && <div className="alert alert-danger py-2">{resourceError}</div>}
            <div className="row g-2 align-items-end">
              <div className="col-auto">
                <label className="form-label" htmlFor="resource-type">Type</label>
                <select
                  id="resource-type"
                  className="form-select"
                  value={newResourceType}
                  onChange={e => setNewResourceType(e.target.value)}
                >
                  {RESOURCE_TYPES.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
              <div className="col-auto">
                <label className="form-label" htmlFor="resource-value">Value</label>
                <input
                  id="resource-value"
                  className="form-control"
                  value={newResourceValue}
                  onChange={e => setNewResourceValue(e.target.value)}
                />
              </div>
              <div className="col-auto">
                <button type="submit" className="btn btn-primary btn-sm" disabled={resourceSubmitting}>
                  {resourceSubmitting ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </form>
        )}

        {resources.length === 0 ? (
          <div className="mt-2"><EmptyState message="No resources assigned yet." /></div>
        ) : (
          <div className="mt-2">
            <DataTable>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Value</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {resources.map(resource => (
                  <tr key={resource.id}>
                    <td>{resource.resourceType}</td>
                    <td className="font-mono">{resource.value}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-link btn-sm text-danger p-0"
                        onClick={() => removeResource(resource.id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        )}
      </div>

      <div>
        <h3 className="h6">History</h3>
        <SubscriptionHistoryTimeline operations={operations} />
      </div>
    </div>
  );
}
