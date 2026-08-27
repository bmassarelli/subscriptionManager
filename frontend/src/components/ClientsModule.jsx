import { useState, useEffect, useCallback, useMemo } from 'react';
import AddClientForm from './AddClientForm';
import { applyClientSearch } from '../utils/filterSort';
import { apiFetch } from '../api';
import LoadingState from './ui/LoadingState';
import ErrorState from './ui/ErrorState';
import EmptyState from './ui/EmptyState';
import DataTable from './ui/DataTable';

export default function ClientsModule() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddClient, setShowAddClient] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [deleteErrors, setDeleteErrors] = useState({});
  const [search, setSearch] = useState('');

  const loadClients = useCallback(() => {
    setLoading(true);
    return apiFetch('/api/clients')
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

  function startEditing(client) {
    setShowAddClient(false);
    setEditingClient(client);
  }

  function stopEditing() {
    setEditingClient(null);
  }

  async function handleDelete(clientId) {
    const res = await apiFetch(`/api/clients/${clientId}`, { method: 'DELETE' });
    if (!res.ok) {
      const errorBody = await res.json();
      const message = Object.values(errorBody)[0] || 'Failed to delete client';
      setDeleteErrors(prev => ({ ...prev, [clientId]: message }));
      return;
    }
    setDeleteErrors(prev => {
      const next = { ...prev };
      delete next[clientId];
      return next;
    });
    await loadClients();
  }

  return (
    <div className="page">
      <div className="page__header">
        <h2 className="page__title">Clients</h2>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setEditingClient(null);
            setShowAddClient(prev => !prev);
          }}
        >
          {showAddClient ? 'Close' : 'Add Client'}
        </button>
      </div>

      {showAddClient && (
        <div className="toolbar--panel mb-3">
          <AddClientForm onCreated={loadClients} />
        </div>
      )}

      {editingClient && (
        <div className="toolbar--panel mb-3">
          <AddClientForm
            client={editingClient}
            onSaved={() => {
              stopEditing();
              loadClients();
            }}
          />
          <button type="button" className="btn btn-link btn-sm mt-2 p-0" onClick={stopEditing}>
            Cancel
          </button>
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

      {loading && <LoadingState />}

      {!loading && error && <ErrorState message={error} />}

      {!loading && !error && clients.length === 0 && (
        <EmptyState message="No clients registered yet." />
      )}

      {!loading && !error && clients.length > 0 && filteredClients.length === 0 && (
        <EmptyState message="No clients match your search." />
      )}

      {!loading && !error && filteredClients.length > 0 && (
        <DataTable>
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Last Name</th>
              <th>Email</th>
              <th>MSISDN</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredClients.map(client => (
              <tr key={client.clientId}>
                <td className="font-mono text-muted">{client.clientId}</td>
                <td>{client.name}</td>
                <td>{client.lastName}</td>
                <td>{client.email}</td>
                <td className="font-mono">{client.msisdn}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn-link btn-sm p-0 me-3"
                    onClick={() => startEditing(client)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-link btn-sm text-danger p-0"
                    onClick={() => handleDelete(client.clientId)}
                  >
                    Delete
                  </button>
                  {deleteErrors[client.clientId] && (
                    <div className="text-danger small mt-1">{deleteErrors[client.clientId]}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </div>
  );
}
