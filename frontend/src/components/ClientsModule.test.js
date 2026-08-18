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
