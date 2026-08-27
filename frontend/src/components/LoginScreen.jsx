import { useState } from 'react';
import { apiFetch } from '../api';

export default function LoginScreen({ onLoggedIn }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error || 'Login failed');
        return;
      }
      onLoggedIn();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '100vh' }}>
      <form onSubmit={handleSubmit} style={{ width: '320px' }}>
        <h1 className="h4 mb-3">Subscription Manager</h1>
        {error && <div className="alert alert-danger py-2">{error}</div>}
        <div className="mb-2">
          <label className="form-label" htmlFor="login-username">Username</label>
          <input id="login-username" className="form-control" value={username} onChange={e => setUsername(e.target.value)} required />
        </div>
        <div className="mb-3">
          <label className="form-label" htmlFor="login-password">Password</label>
          <input id="login-password" type="password" className="form-control" value={password} onChange={e => setPassword(e.target.value)} required />
        </div>
        <button type="submit" className="btn btn-primary w-100" disabled={submitting}>
          {submitting ? 'Logging in...' : 'Log In'}
        </button>
      </form>
    </div>
  );
}
