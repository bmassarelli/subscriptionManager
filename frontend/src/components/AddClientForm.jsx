import { useState } from 'react';

const INITIAL_VALUES = { name: '', lastName: '', email: '', msisdn: '' };

const FIELD_LABELS = {
  name: 'Name',
  lastName: 'Last Name',
  email: 'Email',
  msisdn: 'MSISDN',
};

export default function AddClientForm({ onCreated, client, onSaved }) {
  const isEditMode = !!client;
  const [values, setValues] = useState(() => (client
    ? { name: client.name, lastName: client.lastName, email: client.email, msisdn: client.msisdn }
    : INITIAL_VALUES));
  const [errors, setErrors] = useState({});
  const [successMessage, setSuccessMessage] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function handleChange(field) {
    return (e) => {
      setValues(prev => ({ ...prev, [field]: e.target.value }));
    };
  }

  function validate() {
    const nextErrors = {};
    Object.keys(INITIAL_VALUES).forEach(field => {
      if (!values[field].trim()) {
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
      const url = isEditMode
        ? `http://localhost:8080/api/clients/${client.clientId}`
        : 'http://localhost:8080/api/clients';
      const res = await fetch(url, {
        method: isEditMode ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (res.status === 400) {
        const fieldErrors = await res.json();
        setErrors(fieldErrors);
        return;
      }

      if (!res.ok) {
        throw new Error(isEditMode ? 'Failed to update client' : 'Failed to create client');
      }

      if (isEditMode) {
        onSaved?.();
      } else {
        onCreated?.();
        setValues(INITIAL_VALUES);
        setSuccessMessage('Client created successfully.');
      }
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
        {Object.keys(INITIAL_VALUES).map(field => (
          <div className="col-auto" key={field}>
            <label className="form-label mb-0" htmlFor={`client-${field}`}>
              {FIELD_LABELS[field]}
            </label>
            <input
              id={`client-${field}`}
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
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving...' : (isEditMode ? 'Save Changes' : 'Save Client')}
          </button>
        </div>
      </div>
    </form>
  );
}
