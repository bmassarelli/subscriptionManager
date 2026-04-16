export function applyFilters(data, filters) {
  const { search, statuses, platform, dateFrom, dateTo } = filters;
  return data.filter(item => {
    if (search) {
      const q = search.toLowerCase();
      const matches =
        (item.clientName || '').toLowerCase().includes(q) ||
        (item.email || '').toLowerCase().includes(q) ||
        (item.msisdn || '').includes(q);
      if (!matches) return false;
    }
    if (statuses.length === 0) return false;
    if (!statuses.includes(item.status)) return false;
    if (platform !== 'All' && item.platform !== platform) return false;
    if (dateFrom && item.entryDate < dateFrom) return false;
    if (dateTo && item.entryDate > dateTo) return false;
    return true;
  });
}

export function applySort(data, sort) {
  const { column, direction } = sort;
  return [...data].sort((a, b) => {
    let aVal = a[column];
    let bVal = b[column];
    if (typeof aVal === 'string') aVal = aVal.toLowerCase();
    if (typeof bVal === 'string') bVal = bVal.toLowerCase();
    if (aVal < bVal) return direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return direction === 'asc' ? 1 : -1;
    return 0;
  });
}

export function paginate(data, page, rowsPerPage) {
  const total = data.length;
  const start = (page - 1) * rowsPerPage;
  const rows = data.slice(start, start + rowsPerPage);
  return { rows, total };
}
