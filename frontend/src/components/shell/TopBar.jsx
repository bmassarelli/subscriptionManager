import { apiFetch } from '../../api';

export default function TopBar({ onLoggedOut }) {
  async function handleLogout() {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    onLoggedOut();
  }

  return (
    <header className="topbar">
      <span className="topbar__mark" aria-hidden="true" />
      <span className="topbar__brand">Subscription Manager</span>
      <button type="button" className="btn btn-outline-secondary btn-sm ms-auto" onClick={handleLogout}>
        Logout
      </button>
    </header>
  );
}
