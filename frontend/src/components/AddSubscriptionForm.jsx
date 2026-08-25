import { useState, useEffect } from 'react';

const INITIAL_VALUES = { clientId: '', platform: '', contract: '', amount: '', paymentModeId: '', po: '' };

const FIELD_LABELS = {
  clientId: 'Client',
  platform: 'Platform',
  contract: 'Contract',
  amount: 'Amount',
};

const REQUIRED_FIELDS = ['clientId', 'platform', 'contract', 'amount'];

export default function AddSubscriptionForm({ onCreated }) {
  const [clients, setClients] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [paymentModes, setPaymentModes] = useState([]);
  const [productOfferings, setProductOfferings] = useState([]);
  const [values, setValues] = useState(INITIAL_VALUES);
  const [errors, setErrors] = useState({});
  const [successMessage, setSuccessMessage] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch('http://localhost:8080/api/clients')
      .then(res => (res.ok ? res.json() : []))
      .then(setClients)
      .catch(() => setClients([]));

    fetch('http://localhost:8080/api/platforms')
      .then(res => (res.ok ? res.json() : []))
      .then(setPlatforms)
      .catch(() => setPlatforms([]));

    fetch('http://localhost:8080/api/payment-modes')
      .then(res => (res.ok ? res.json() : []))
      .then(setPaymentModes)
      .catch(() => setPaymentModes([]));

    fetch('http://localhost:8080/api/product-offerings')
      .then(res => (res.ok ? res.json() : []))
      .then(setProductOfferings)
      .catch(() => setProductOfferings([]));
  }, []);

  function handleChange(field) {
    return (e) => {
      setValues(prev => ({ ...prev, [field]: e.target.value }));
    };
  }

  function validate() {
    const nextErrors = {};
    REQUIRED_FIELDS.forEach(field => {
      if (!String(values[field]).trim()) {
        nextErrors[field] = `${FIELD_LABELS[field]} is required`;
      }
    });
    return nextErrors;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSuccessMessage(null);

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      const res = await fetch('http://localhost:8080/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: Number(values.clientId),
          platform: values.platform,
          contract: values.contract,
          amount: Number(values.amount),
          ...(values.paymentModeId ? { paymentModeId: Number(values.paymentModeId) } : {}),
          ...(values.po ? { po: values.po } : {}),
        }),
      });

      if (res.status === 400) {
        const fieldErrors = await res.json();
        setErrors(fieldErrors);
        return;
      }

      if (!res.ok) {
        throw new Error('Failed to create subscription');
      }

      onCreated?.();
      setValues(INITIAL_VALUES);
      setSuccessMessage('Subscription created successfully.');
    } catch (err) {
      setErrors({ form: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {successMessage && (
        <div className="alert alert-success py-2" role="status">{successMessage}</div>
      )}
      {errors.form && (
        <div className="alert alert-danger py-2" role="alert">{errors.form}</div>
      )}
      <div className="row g-2 align-items-end">
        <div className="col-auto">
          <label className="form-label mb-0" htmlFor="subscription-clientId">Client</label>
          <select
            id="subscription-clientId"
            className={`form-select${errors.clientId ? ' is-invalid' : ''}`}
            value={values.clientId}
            onChange={handleChange('clientId')}
          >
            <option value="">Select a client…</option>
            {clients.map(client => (
              <option key={client.clientId} value={client.clientId}>
                {client.name} {client.lastName}
              </option>
            ))}
          </select>
          {errors.clientId && (
            <div className="invalid-feedback">{errors.clientId}</div>
          )}
        </div>

        <div className="col-auto">
          <label className="form-label mb-0" htmlFor="subscription-platform">Platform</label>
          <select
            id="subscription-platform"
            className={`form-select${errors.platform ? ' is-invalid' : ''}`}
            value={values.platform}
            onChange={handleChange('platform')}
          >
            <option value="">Select a platform…</option>
            {platforms.map(platform => (
              <option key={platform.id} value={platform.name}>
                {platform.name}
              </option>
            ))}
          </select>
          {errors.platform && (
            <div className="invalid-feedback">{errors.platform}</div>
          )}
        </div>

        {['contract', 'amount'].map(field => (
          <div className="col-auto" key={field}>
            <label className="form-label mb-0" htmlFor={`subscription-${field}`}>
              {FIELD_LABELS[field]}
            </label>
            <input
              id={`subscription-${field}`}
              type={field === 'amount' ? 'number' : 'text'}
              className={`form-control${errors[field] ? ' is-invalid' : ''}`}
              value={values[field]}
              onChange={handleChange(field)}
            />
            {errors[field] && (
              <div className="invalid-feedback">{errors[field]}</div>
            )}
          </div>
        ))}

        <div className="col-auto">
          <label className="form-label mb-0" htmlFor="subscription-paymentModeId">
            Payment Mode (optional)
          </label>
          <select
            id="subscription-paymentModeId"
            className={`form-select${errors.paymentModeId ? ' is-invalid' : ''}`}
            value={values.paymentModeId}
            onChange={handleChange('paymentModeId')}
          >
            <option value="">None</option>
            {paymentModes.map(paymentMode => (
              <option key={paymentMode.id} value={paymentMode.id}>
                {paymentMode.name}
              </option>
            ))}
          </select>
          {errors.paymentModeId && (
            <div className="invalid-feedback">{errors.paymentModeId}</div>
          )}
        </div>

        <div className="col-auto">
          <label className="form-label mb-0" htmlFor="subscription-po">
            Product Offering (optional)
          </label>
          <select
            id="subscription-po"
            className={`form-select${errors.po ? ' is-invalid' : ''}`}
            value={values.po}
            onChange={handleChange('po')}
          >
            <option value="">None</option>
            {productOfferings.map(po => (
              <option key={po.id} value={po.name}>
                {po.name}
              </option>
            ))}
          </select>
          {errors.po && (
            <div className="invalid-feedback">{errors.po}</div>
          )}
        </div>

        <div className="col-auto">
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving...' : 'Save Subscription'}
          </button>
        </div>
      </div>
    </form>
  );
}
