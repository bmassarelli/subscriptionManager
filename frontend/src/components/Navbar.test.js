import { render, screen } from '@testing-library/react';
import Navbar from './Navbar';

test('renders the brand text', () => {
  render(<Navbar />);
  expect(screen.getByText('Subscription Manager')).toBeInTheDocument();
});
