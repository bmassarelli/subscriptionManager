import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddClientForm from './AddClientForm';

function fillForm({ name, lastName, email, msisdn }) {
  if (name !== undefined) userEvent.type(screen.getByLabelText('Name'), name);
  if (lastName !== undefined) userEvent.type(screen.getByLabelText('Last Name'), lastName);
  if (email !== undefined) userEvent.type(screen.getByLabelText('Email'), email);
  if (msisdn !== undefined) userEvent.type(screen.getByLabelText('MSISDN'), msisdn);
}

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('submits valid values and shows a success confirmation', async () => {
  global.fetch.mockResolvedValueOnce({
    ok: true,
    status: 201,
    json: async () => ({ clientId: 1, name: 'John', lastName: 'Doe', email: 'john@doe.com', msisdn: '+11234567890' }),
  });

  render(<AddClientForm />);
  fillForm({ name: 'John', lastName: 'Doe', email: 'john@doe.com', msisdn: '+11234567890' });
  userEvent.click(screen.getByRole('button', { name: /save client/i }));

  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

  const [url, options] = global.fetch.mock.calls[0];
  expect(url).toBe('http://localhost:8080/api/clients');
  expect(JSON.parse(options.body)).toEqual({
    name: 'John',
    lastName: 'Doe',
    email: 'john@doe.com',
    msisdn: '+11234567890',
  });

  expect(await screen.findByText(/client created successfully/i)).toBeInTheDocument();
  expect(screen.getByLabelText('Name')).toHaveValue('');
});

test('blocks submission when a required field is missing', () => {
  render(<AddClientForm />);
  fillForm({ lastName: 'Doe', email: 'john@doe.com', msisdn: '+11234567890' });
  userEvent.click(screen.getByRole('button', { name: /save client/i }));

  expect(screen.getByText(/name is required/i)).toBeInTheDocument();
  expect(global.fetch).not.toHaveBeenCalled();
});

test('renders backend field errors and preserves entered values', async () => {
  global.fetch.mockResolvedValueOnce({
    ok: false,
    status: 400,
    json: async () => ({ email: 'email must be a valid email address' }),
  });

  render(<AddClientForm />);
  fillForm({ name: 'John', lastName: 'Doe', email: 'not-an-email', msisdn: '+11234567890' });
  userEvent.click(screen.getByRole('button', { name: /save client/i }));

  expect(await screen.findByText(/email must be a valid email address/i)).toBeInTheDocument();
  expect(screen.getByLabelText('Name')).toHaveValue('John');
  expect(screen.getByLabelText('Email')).toHaveValue('not-an-email');
});
