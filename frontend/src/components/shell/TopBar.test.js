import { render, screen } from '@testing-library/react';
import TopBar from './TopBar';

test('renders the brand text', () => {
  render(<TopBar />);
  expect(screen.getByText('Subscription Manager')).toBeInTheDocument();
});
