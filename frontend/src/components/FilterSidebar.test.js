import { useState } from 'react';
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

// Mirrors how App.jsx really uses FilterSidebar: filters live in the parent
// and flow back down after every onApply call, so live fields (search/status/
// platform) accumulate across keystrokes instead of resetting each render.
function renderControlled(overrides = {}) {
  const onApplySpy = jest.fn();
  const onClear = jest.fn();

  function Harness() {
    const [filters, setFilters] = useState({ ...INITIAL_FILTERS, ...overrides });
    return (
      <FilterSidebar
        filters={filters}
        platforms={['Netflix', 'Spotify']}
        onApply={next => { onApplySpy(next); setFilters(next); }}
        onClear={onClear}
      />
    );
  }

  render(<Harness />);
  return { onApplySpy, onClear };
}

test('typing a search term filters live, with no Apply click needed', () => {
  const { onApplySpy } = renderControlled();

  userEvent.type(screen.getByPlaceholderText('Name / Email / MSISDN / Contract'), 'alice');

  expect(onApplySpy).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'alice' }));
});

test('selecting a status filters live and narrows to a single status', () => {
  const { onApplySpy } = renderControlled();

  userEvent.selectOptions(screen.getByDisplayValue('All statuses'), 'Trial');

  expect(onApplySpy).toHaveBeenLastCalledWith(expect.objectContaining({ statuses: ['TR'] }));
});

test('selecting "All statuses" restores every status', () => {
  const { onApplySpy } = renderControlled({ statuses: ['TR'] });

  userEvent.selectOptions(screen.getByDisplayValue('Trial'), 'All');

  expect(onApplySpy).toHaveBeenLastCalledWith(expect.objectContaining({ statuses: ALL_STATUSES }));
});

test('selecting a platform filters live, with no Apply click needed', () => {
  const { onApplySpy } = renderControlled();

  userEvent.selectOptions(screen.getByDisplayValue('All platforms'), 'Netflix');

  expect(onApplySpy).toHaveBeenLastCalledWith(expect.objectContaining({ platform: 'Netflix' }));
});

test('changing entry date inputs does not filter until Apply is clicked', () => {
  const { onApplySpy } = renderControlled();

  userEvent.type(screen.getByLabelText('Entry date from'), '2026-01-01');
  userEvent.type(screen.getByLabelText('Entry date to'), '2026-01-31');

  expect(onApplySpy).not.toHaveBeenCalled();

  userEvent.click(screen.getByRole('button', { name: 'Apply' }));

  expect(onApplySpy).toHaveBeenCalledWith(expect.objectContaining({
    dateFrom: '2026-01-01', dateTo: '2026-01-31',
  }));
});

test('clicking Clear resets everything and calls onClear', () => {
  const { onClear } = renderControlled({ search: 'alice', platform: 'Netflix' });

  userEvent.click(screen.getByRole('button', { name: 'Clear' }));

  expect(onClear).toHaveBeenCalledWith(expect.objectContaining({
    search: '', platform: 'All', statuses: ALL_STATUSES,
  }));
});
