import { applyFilters, applySort, paginate, applyClientSearch, applyOperationFilters } from './filterSort';

const data = [
  { id: 1, clientName: 'Alice Smith', email: 'alice@test.com', msisdn: '+111', platform: 'Netflix', status: 'AC', entryDate: '2024-01-10', amount: 9.99, contract: 'CONT-001' },
  { id: 2, clientName: 'Bob Jones',   email: 'bob@test.com',   msisdn: '+222', platform: 'Spotify', status: 'TR', entryDate: '2024-01-15', amount: 4.99, contract: 'CONT-002' },
  { id: 3, clientName: 'Carol Lee',   email: 'carol@test.com', msisdn: '+333', platform: 'Netflix', status: 'CA', entryDate: '2024-01-20', amount: 7.99, contract: 'CONT-003' },
];

describe('applyFilters', () => {
  test('returns all records when filters are empty/default', () => {
    const filters = { search: '', statuses: ['AC', 'TR', 'CA', 'IN'], platform: 'All', dateFrom: '', dateTo: '' };
    expect(applyFilters(data, filters)).toHaveLength(3);
  });

  test('filters by clientName (case-insensitive)', () => {
    const filters = { search: 'alice', statuses: ['AC', 'TR', 'CA', 'IN'], platform: 'All', dateFrom: '', dateTo: '' };
    const result = applyFilters(data, filters);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  test('filters by email', () => {
    const filters = { search: 'bob@', statuses: ['AC', 'TR', 'CA', 'IN'], platform: 'All', dateFrom: '', dateTo: '' };
    const result = applyFilters(data, filters);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  test('filters by msisdn', () => {
    const filters = { search: '+333', statuses: ['AC', 'TR', 'CA', 'IN'], platform: 'All', dateFrom: '', dateTo: '' };
    const result = applyFilters(data, filters);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(3);
  });

  test('filters by single status', () => {
    const filters = { search: '', statuses: ['AC'], platform: 'All', dateFrom: '', dateTo: '' };
    const result = applyFilters(data, filters);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  test('returns empty array when no statuses selected', () => {
    const filters = { search: '', statuses: [], platform: 'All', dateFrom: '', dateTo: '' };
    expect(applyFilters(data, filters)).toHaveLength(0);
  });

  test('filters by platform', () => {
    const filters = { search: '', statuses: ['AC', 'TR', 'CA', 'IN'], platform: 'Netflix', dateFrom: '', dateTo: '' };
    const result = applyFilters(data, filters);
    expect(result).toHaveLength(2);
    expect(result.map(r => r.id)).toEqual(expect.arrayContaining([1, 3]));
  });

  test('filters by dateFrom (inclusive)', () => {
    const filters = { search: '', statuses: ['AC', 'TR', 'CA', 'IN'], platform: 'All', dateFrom: '2024-01-15', dateTo: '' };
    const result = applyFilters(data, filters);
    expect(result).toHaveLength(2);
    expect(result.map(r => r.id)).toEqual(expect.arrayContaining([2, 3]));
  });

  test('filters by dateTo (inclusive)', () => {
    const filters = { search: '', statuses: ['AC', 'TR', 'CA', 'IN'], platform: 'All', dateFrom: '', dateTo: '2024-01-15' };
    const result = applyFilters(data, filters);
    expect(result).toHaveLength(2);
    expect(result.map(r => r.id)).toEqual(expect.arrayContaining([1, 2]));
  });

  test('filters by contract (case-insensitive)', () => {
    const filters = { search: 'cont-002', statuses: ['AC', 'TR', 'CA', 'IN'], platform: 'All', dateFrom: '', dateTo: '' };
    const result = applyFilters(data, filters);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });
});

describe('applySort', () => {
  test('sorts by clientName ascending', () => {
    const result = applySort(data, { column: 'clientName', direction: 'asc' });
    expect(result[0].clientName).toBe('Alice Smith');
    expect(result[2].clientName).toBe('Carol Lee');
  });

  test('sorts by clientName descending', () => {
    const result = applySort(data, { column: 'clientName', direction: 'desc' });
    expect(result[0].clientName).toBe('Carol Lee');
    expect(result[2].clientName).toBe('Alice Smith');
  });

  test('sorts by amount ascending', () => {
    const result = applySort(data, { column: 'amount', direction: 'asc' });
    expect(result[0].amount).toBe(4.99);
    expect(result[2].amount).toBe(9.99);
  });

  test('does not mutate the input array', () => {
    const original = [...data];
    applySort(data, { column: 'clientName', direction: 'desc' });
    expect(data[0].id).toBe(original[0].id);
  });
});

describe('paginate', () => {
  test('returns first page with correct total', () => {
    const { rows, total } = paginate(data, 1, 2);
    expect(rows).toHaveLength(2);
    expect(total).toBe(3);
    expect(rows[0].id).toBe(1);
  });

  test('returns second page', () => {
    const { rows, total } = paginate(data, 2, 2);
    expect(rows).toHaveLength(1);
    expect(total).toBe(3);
    expect(rows[0].id).toBe(3);
  });

  test('returns empty rows when page exceeds data length', () => {
    const { rows } = paginate(data, 10, 2);
    expect(rows).toHaveLength(0);
  });

  test('returns all records when rowsPerPage exceeds data length', () => {
    const { rows, total } = paginate(data, 1, 100);
    expect(rows).toHaveLength(3);
    expect(total).toBe(3);
  });
});

describe('applyClientSearch', () => {
  const clients = [
    { clientId: 1, name: 'Alice', lastName: 'Smith', email: 'alice@test.com', msisdn: '+111' },
    { clientId: 2, name: 'Bob', lastName: 'Jones', email: 'bob@test.com', msisdn: '+222' },
  ];

  test('returns all clients when search is empty', () => {
    expect(applyClientSearch(clients, '')).toHaveLength(2);
  });

  test('matches by first name (case-insensitive)', () => {
    const result = applyClientSearch(clients, 'ALICE');
    expect(result).toHaveLength(1);
    expect(result[0].clientId).toBe(1);
  });

  test('matches by last name', () => {
    const result = applyClientSearch(clients, 'Jones');
    expect(result).toHaveLength(1);
    expect(result[0].clientId).toBe(2);
  });

  test('matches by email', () => {
    const result = applyClientSearch(clients, 'bob@');
    expect(result).toHaveLength(1);
    expect(result[0].clientId).toBe(2);
  });

  test('matches by msisdn', () => {
    const result = applyClientSearch(clients, '+111');
    expect(result).toHaveLength(1);
    expect(result[0].clientId).toBe(1);
  });

  test('returns empty array when nothing matches', () => {
    expect(applyClientSearch(clients, 'nomatch')).toHaveLength(0);
  });
});

describe('applyOperationFilters', () => {
  const ops = [
    { id: 1, subscriptionId: 10, clientName: 'Alice Smith', operationType: 'SUSPEND', status: 'COMPLETED', createdDate: '2026-08-10T09:00:00' },
    { id: 2, subscriptionId: 20, clientName: 'Bob Jones', operationType: 'CANCEL', status: 'FAILED', createdDate: '2026-08-15T09:00:00' },
    { id: 3, subscriptionId: 30, clientName: 'Carol Lee', operationType: 'CREATE', status: 'COMPLETED', createdDate: '2026-08-20T09:00:00' },
  ];
  const ALL = {
    search: '',
    types: ['CREATE', 'SUSPEND', 'RECONNECT', 'CANCEL', 'CHANGE_PLAN', 'CHANGE_MSISDN', 'CHANGE_SIM'],
    statuses: ['COMPLETED', 'FAILED'],
    dateFrom: '',
    dateTo: '',
  };

  test('returns all when filters are default', () => {
    expect(applyOperationFilters(ops, ALL)).toHaveLength(3);
  });

  test('filters by client name search', () => {
    const result = applyOperationFilters(ops, { ...ALL, search: 'alice' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  test('filters by subscription id search', () => {
    const result = applyOperationFilters(ops, { ...ALL, search: '20' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  test('filters by operation type', () => {
    const result = applyOperationFilters(ops, { ...ALL, types: ['CANCEL'] });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  test('filters by status', () => {
    const result = applyOperationFilters(ops, { ...ALL, statuses: ['FAILED'] });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  test('filters by created-date range (inclusive)', () => {
    const result = applyOperationFilters(ops, { ...ALL, dateFrom: '2026-08-12', dateTo: '2026-08-18' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  test('returns empty array when no types selected', () => {
    expect(applyOperationFilters(ops, { ...ALL, types: [] })).toHaveLength(0);
  });

  test('returns empty array when no statuses selected', () => {
    expect(applyOperationFilters(ops, { ...ALL, statuses: [] })).toHaveLength(0);
  });
});
