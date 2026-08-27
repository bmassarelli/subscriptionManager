import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TopBar from './TopBar';

afterEach(() => {
  jest.restoreAllMocks();
});

test('renders the brand text', () => {
  global.fetch = jest.fn();
  render(<TopBar onLoggedOut={jest.fn()} />);
  expect(screen.getByText('Subscription Manager')).toBeInTheDocument();
});

test('clicking Logout posts to /api/auth/logout and calls onLoggedOut', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  const onLoggedOut = jest.fn();

  render(<TopBar onLoggedOut={onLoggedOut} />);
  userEvent.click(screen.getByRole('button', { name: /logout/i }));

  await waitFor(() => expect(onLoggedOut).toHaveBeenCalled());
  expect(global.fetch).toHaveBeenCalledWith(
    'http://localhost:8080/api/auth/logout',
    expect.objectContaining({ method: 'POST', credentials: 'include' }),
  );
});
