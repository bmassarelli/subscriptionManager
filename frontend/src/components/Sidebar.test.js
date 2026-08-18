import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Sidebar from './Sidebar';

test('selecting Clients calls onSelect with the clients module', () => {
  const onSelect = jest.fn();
  render(<Sidebar activeModule="subscriptions" onSelect={onSelect} />);

  userEvent.click(screen.getByRole('button', { name: 'Clients' }));

  expect(onSelect).toHaveBeenCalledWith('clients');
});

test('marks the active module and does not mark the other one', () => {
  render(<Sidebar activeModule="clients" onSelect={jest.fn()} />);

  expect(screen.getByRole('button', { name: 'Clients' })).toHaveAttribute('aria-current', 'true');
  expect(screen.getByRole('button', { name: 'Subscriptions' })).not.toHaveAttribute('aria-current');
});

test('selecting Operations calls onSelect with the operations module', () => {
  const onSelect = jest.fn();
  render(<Sidebar activeModule="subscriptions" onSelect={onSelect} />);

  userEvent.click(screen.getByRole('button', { name: 'Operations' }));

  expect(onSelect).toHaveBeenCalledWith('operations');
});

test('selecting Dashboard calls onSelect with the dashboard module', () => {
  const onSelect = jest.fn();
  render(<Sidebar activeModule="subscriptions" onSelect={onSelect} />);

  userEvent.click(screen.getByRole('button', { name: 'Dashboard' }));

  expect(onSelect).toHaveBeenCalledWith('dashboard');
});
