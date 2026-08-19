import { useState, useEffect, useCallback, useMemo } from 'react';
import AddClientForm from './AddClientForm';
import { applyClientSearch } from '../utils/filterSort';

export default function ClientsModule() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddClient, setShowAddClient] = useState(false);
  const [search, setSearch] = useState('');

  const loadClients = useCallback(() => {
    setLoading(true);
    return fetch('http://localhost:8080/api/clients')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch clients');
        return res.json();
      })
      .then(data => {
        setClients(data);
        setError(null);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const filteredClients = useMemo(
    () => applyClientSearch(clients, search),
    [clients, search]
  );

  return (
    <div className="flex-grow-1 p-3">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="h4 mb-0">Clients</h2>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setShowAddClient(prev => !prev)}
        >
          {showAddClient ? 'Close' : 'Add Client'}
        </button>
      </div>

      {showAddClient && (
        <div className="border rounded p-3 mb-3 bg-light">
          <AddClientForm onCreated={loadClients} />
        </div>
      )}

      <div className="mb-3">
        <div className="input-group" style={{ maxWidth: '320px' }}>
          <input
            type="text"
            className="form-control"
            placeholder="Name / Last Name / Email / MSISDN"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search clients"
          />
          {search && (
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={() => setSearch('')}
              aria-label="Clear search"
            >
              &times;
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="d-flex justify-content-center align-items-center py-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      )}

      {!loading && error && (
        <div className="alert alert-danger">{error}</div>
      )}

      {!loading && !error && clients.length === 0 && (
        <div className="alert alert-secondary">No clients registered yet.</div>
      )}

      {!loading && !error && clients.length > 0 && filteredClients.length === 0 && (
        <div className="alert alert-secondary">No clients match your search.</div>
      )}

      {!loading && !error && filteredClients.length > 0 && (
        <table className="table table-striped">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Last Name</th>
              <th>Email</th>
              <th>MSISDN</th>
            </tr>
          </thead>
          <tbody>
            {filteredClients.map(client => (
              <tr key={client.clientId}>
                <td>{client.clientId}</td>
                <td>{client.name}</td>
                <td>{client.lastName}</td>
                <td>{client.email}</td>
                <td>{client.msisdn}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
