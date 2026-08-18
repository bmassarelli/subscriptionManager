import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FilterSidebar from './FilterSidebar';
import { ALL_STATUSES } from '../constants';

const INITIAL_FILTERS = {
  search: '',
  statuses: ALL_STATUSES,
  platform: 'All',
  dateFrom: '',
  dateTo: '',
};

function renderFilterSidebar(overrides = {}) {
  const onApply = jest.fn();
  const onClear = jest.fn();
  render(
    <FilterSidebar
      filters={{ ...INITIAL_FILTERS, ...overrides }}
      platforms={['Netflix', 'Spotify']}
      onApply={onApply}
      onClear={onClear}
    />
  );
  return { onApply, onClear };
}

test('typing a search term and applying passes it through', () => {
  const { onApply } = renderFilterSidebar();

  userEvent.type(screen.getByPlaceholderText('Name / Email / MSISDN'), 'alice');
  userEvent.click(screen.getByRole('button', { name: 'Apply' }));

  expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ search: 'alice' }));
});

test('unchecking a status and applying removes it from the list', () => {
  const { onApply } = renderFilterSidebar();

  userEvent.click(screen.getByLabelText('Trial'));
  userEvent.click(screen.getByRole('button', { name: 'Apply' }));

  const [applied] = onApply.mock.calls[0];
  expect(applied.statuses).not.toContain('TR');
});

test('selecting a platform and applying passes it through', () => {
  const { onApply } = renderFilterSidebar();

  userEvent.selectOptions(screen.getByDisplayValue('All platforms'), 'Netflix');
  userEvent.click(screen.getByRole('button', { name: 'Apply' }));

  expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ platform: 'Netflix' }));
});

test('clicking Clear resets the draft and calls onClear', () => {
  const { onClear } = renderFilterSidebar({ search: 'alice', platform: 'Netflix' });

  userEvent.click(screen.getByRole('button', { name: 'Clear' }));

  expect(onClear).toHaveBeenCalledWith(expect.objectContaining({
    search: '', platform: 'All', statuses: ALL_STATUSES,
  }));
  expect(screen.getByPlaceholderText('Name / Email / MSISDN')).toHaveValue('');
});
