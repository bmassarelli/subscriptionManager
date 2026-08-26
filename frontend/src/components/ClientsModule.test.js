import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ClientsModule from './ClientsModule';

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('fetches and renders the client list on mount', async () => {
  global.fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ([
      { clientId: 1, name: 'John', lastName: 'Doe', email: 'john@doe.com', msisdn: '+11234567890' },
    ]),
  });

  render(<ClientsModule />);

  expect(await screen.findByText('John')).toBeInTheDocument();
  expect(screen.getByText('Doe')).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith('http://localhost:8080/api/clients');
});

test('shows an empty-state message when the list is empty', async () => {
  global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ([]) });

  render(<ClientsModule />);

  expect(await screen.findByText(/no clients registered yet/i)).toBeInTheDocument();
});

test('refreshes the client list after a client is created', async () => {
  global.fetch
    .mockResolvedValueOnce({ ok: true, json: async () => ([]) }) // initial load
    .mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ clientId: 1, name: 'John', lastName: 'Doe', email: 'john@doe.com', msisdn: '+11234567890' }),
    }) // create
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ([
        { clientId: 1, name: 'John', lastName: 'Doe', email: 'john@doe.com', msisdn: '+11234567890' },
      ]),
    }); // refresh after create

  render(<ClientsModule />);
  expect(await screen.findByText(/no clients registered yet/i)).toBeInTheDocument();

  userEvent.click(screen.getByRole('button', { name: /add client/i }));
  userEvent.type(screen.getByLabelText('Name'), 'John');
  userEvent.type(screen.getByLabelText('Last Name'), 'Doe');
  userEvent.type(screen.getByLabelText('Email'), 'john@doe.com');
  userEvent.type(screen.getByLabelText('MSISDN'), '+11234567890');
  userEvent.click(screen.getByRole('button', { name: /save client/i }));

  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
  expect(await screen.findByText('John')).toBeInTheDocument();
});

test('filters the client list as the user types in the search box', async () => {
  global.fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ([
      { clientId: 1, name: 'Alice', lastName: 'Smith', email: 'alice@test.com', msisdn: '+111' },
      { clientId: 2, name: 'Bob', lastName: 'Jones', email: 'bob@test.com', msisdn: '+222' },
    ]),
  });

  render(<ClientsModule />);
  expect(await screen.findByText('Alice')).toBeInTheDocument();

  userEvent.type(screen.getByPlaceholderText(/Name \/ Last Name \/ Email \/ MSISDN/i), 'bob');

  await waitFor(() => expect(screen.queryByText('Alice')).not.toBeInTheDocument());
  expect(screen.getByText('Bob')).toBeInTheDocument();
});

test('shows a no-match message when the search matches nothing, and clearing restores the list', async () => {
  global.fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ([
      { clientId: 1, name: 'Alice', lastName: 'Smith', email: 'alice@test.com', msisdn: '+111' },
    ]),
  });

  render(<ClientsModule />);
  expect(await screen.findByText('Alice')).toBeInTheDocument();

  userEvent.type(screen.getByPlaceholderText(/Name \/ Last Name \/ Email \/ MSISDN/i), 'zzz');
  expect(await screen.findByText(/no clients match your search/i)).toBeInTheDocument();

  userEvent.click(screen.getByRole('button', { name: /clear search/i }));
  expect(await screen.findByText('Alice')).toBeInTheDocument();
});

test('clicking Edit shows a form pre-filled with that client\'s data', async () => {
  global.fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ([
      { clientId: 1, name: 'John', lastName: 'Doe', email: 'john@doe.com', msisdn: '+11234567890' },
    ]),
  });

  render(<ClientsModule />);
  expect(await screen.findByText('John')).toBeInTheDocument();

  userEvent.click(screen.getByRole('button', { name: /edit/i }));

  expect(screen.getByLabelText('Name')).toHaveValue('John');
  expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
});

test('deleting a client with no subscriptions removes it from the list', async () => {
  global.fetch
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ([
        { clientId: 1, name: 'John', lastName: 'Doe', email: 'john@doe.com', msisdn: '+11234567890' },
      ]),
    }) // initial load
    .mockResolvedValueOnce({ ok: true, status: 204 }) // delete
    .mockResolvedValueOnce({ ok: true, json: async () => ([]) }); // refresh after delete

  render(<ClientsModule />);
  expect(await screen.findByText('John')).toBeInTheDocument();

  userEvent.click(screen.getByRole('button', { name: /delete/i }));

  await waitFor(() => expect(screen.queryByText('John')).not.toBeInTheDocument());
});

test('deleting a client blocked by subscriptions shows the reason and keeps the row', async () => {
  global.fetch
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ([
        { clientId: 1, name: 'John', lastName: 'Doe', email: 'john@doe.com', msisdn: '+11234567890' },
      ]),
    }) // initial load
    .mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ clientId: 'Cannot delete client 1: 2 subscription(s) exist' }),
    }); // delete rejected

  render(<ClientsModule />);
  expect(await screen.findByText('John')).toBeInTheDocument();

  userEvent.click(screen.getByRole('button', { name: /delete/i }));

  expect(await screen.findByText(/cannot delete client 1/i)).toBeInTheDocument();
  expect(screen.getByText('John')).toBeInTheDocument();
});
