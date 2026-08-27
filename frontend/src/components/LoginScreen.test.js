import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginScreen from './LoginScreen';

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('renders the login form', () => {
  render(<LoginScreen onLoggedIn={jest.fn()} />);

  expect(screen.getByText('Subscription Manager')).toBeInTheDocument();
  expect(screen.getByLabelText('Username')).toBeInTheDocument();
  expect(screen.getByLabelText('Password')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
});

test('submitting valid credentials calls onLoggedIn', async () => {
  global.fetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ username: 'ops' }),
  });

  const onLoggedIn = jest.fn();
  render(<LoginScreen onLoggedIn={onLoggedIn} />);

  userEvent.type(screen.getByLabelText('Username'), 'ops');
  userEvent.type(screen.getByLabelText('Password'), 'secret');
  userEvent.click(screen.getByRole('button', { name: /log in/i }));

  await waitFor(() => expect(onLoggedIn).toHaveBeenCalled());
});

test('a rejected login shows the error message inline and does not call onLoggedIn', async () => {
  global.fetch.mockResolvedValueOnce({
    ok: false,
    status: 401,
    json: async () => ({ error: 'Invalid username or password' }),
  });

  const onLoggedIn = jest.fn();
  render(<LoginScreen onLoggedIn={onLoggedIn} />);

  userEvent.type(screen.getByLabelText('Username'), 'ops');
  userEvent.type(screen.getByLabelText('Password'), 'wrong');
  userEvent.click(screen.getByRole('button', { name: /log in/i }));

  expect(await screen.findByText('Invalid username or password')).toBeInTheDocument();
  expect(onLoggedIn).not.toHaveBeenCalled();
});
