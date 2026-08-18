import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SubscriptionTable from './SubscriptionTable';

const ROWS = [
  { id: 1, clientName: 'John Doe', email: 'john@doe.com', msisdn: '+1', platform: 'Netflix',
    contract: 'CONTR_001', status: 'AC', entryDate: '2026-08-01', amount: 9.99 },
  { id: 2, clientName: 'Jane Roe', email: 'jane@roe.com', msisdn: '+2', platform: 'Spotify',
    contract: 'CONTR_002', status: 'TR', entryDate: '2026-08-02', amount: 4.99 },
];

function renderTable(overrides = {}) {
  const onSort = jest.fn();
  const onPageChange = jest.fn();
  const onRowsPerPageChange = jest.fn();
  const onView = jest.fn();
  render(
    <SubscriptionTable
      rows={ROWS}
      total={2}
      sort={{ column: 'entryDate', direction: 'desc' }}
      onSort={onSort}
      page={1}
      rowsPerPage={10}
      onPageChange={onPageChange}
      onRowsPerPageChange={onRowsPerPageChange}
      onView={onView}
      {...overrides}
    />
  );
  return { onSort, onPageChange, onRowsPerPageChange, onView };
}

test('renders rows with client, platform, status, and amount', () => {
  renderTable();
  expect(screen.getByText('John Doe')).toBeInTheDocument();
  expect(screen.getByText('Netflix')).toBeInTheDocument();
  expect(screen.getByText('$9.99')).toBeInTheDocument();
});

test('shows an empty state when there are no rows', () => {
  renderTable({ rows: [], total: 0 });
  expect(screen.getByText('No subscriptions found')).toBeInTheDocument();
});

test('clicking a sortable column header toggles sort direction', () => {
  const { onSort } = renderTable({ sort: { column: 'clientName', direction: 'asc' } });

  userEvent.click(screen.getByText('Client'));

  expect(onSort).toHaveBeenCalledWith({ column: 'clientName', direction: 'desc' });
});

test('clicking a non-sortable column header does nothing', () => {
  const { onSort } = renderTable();

  userEvent.click(screen.getByText('Contract'));

  expect(onSort).not.toHaveBeenCalled();
});

test('pagination buttons are disabled at the boundaries', () => {
  renderTable({ page: 1, total: 2, rowsPerPage: 10 });

  expect(screen.getByText('◀')).toBeDisabled();
  expect(screen.getByText('▶')).toBeDisabled();
});

test('next page button is enabled when more pages exist and calls onPageChange', () => {
  const { onPageChange } = renderTable({ page: 1, total: 25, rowsPerPage: 10 });

  const nextButton = screen.getByText('▶');
  expect(nextButton).not.toBeDisabled();
  userEvent.click(nextButton);

  expect(onPageChange).toHaveBeenCalledWith(2);
});

test('changing rows per page resets to page 1', () => {
  const { onRowsPerPageChange, onPageChange } = renderTable();

  userEvent.selectOptions(screen.getByDisplayValue('10'), '25');

  expect(onRowsPerPageChange).toHaveBeenCalledWith(25);
  expect(onPageChange).toHaveBeenCalledWith(1);
});

test('clicking View calls onView with the row id', () => {
  const { onView } = renderTable();

  userEvent.click(screen.getAllByRole('button', { name: 'View' })[0]);

  expect(onView).toHaveBeenCalledWith(1);
});
