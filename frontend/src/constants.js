export const ALL_STATUSES = ['AC', 'TR', 'SU', 'EX', 'CA', 'ER'];

export const STATUS_LABELS = {
  AC: 'Active',
  TR: 'Trial',
  SU: 'Suspended',
  EX: 'Expired',
  CA: 'Cancelled',
  ER: 'Error',
};

// Single source of truth for the status -> visual token mapping.
// StatusBadge and the status-rail table/card accents both key off this.
export const STATUS_TOKEN = {
  AC: 'signal',
  TR: 'amber',
  SU: 'slate',
  EX: 'slate-muted',
  CA: 'graphite',
  ER: 'coral',
};

export function statusRailClassName(status) {
  return `status-rail status-rail--${STATUS_TOKEN[status] || 'slate'}`;
}

export const ALL_OPERATION_TYPES = ['CREATE', 'SUSPEND', 'RECONNECT', 'CANCEL', 'CHANGE_PLAN', 'CHANGE_MSISDN', 'CHANGE_SIM', 'MARK_EXPIRED', 'PAYMENT_RECEIVED'];

// Fixed categorical color per operation type — assigned once, in this order,
// so a type's color never changes just because a filter/sort reshuffles its
// rank (chart series identity must follow the entity, not its position).
export const OPERATION_TYPE_CHART_TOKEN = Object.fromEntries(
  ALL_OPERATION_TYPES.map((type, index) => [type, `cat-${index + 1}`])
);

export const OPERATION_TYPE_LABELS = {
  CREATE: 'Create',
  SUSPEND: 'Suspend',
  RECONNECT: 'Reconnect',
  CANCEL: 'Cancel',
  CHANGE_PLAN: 'Change Plan',
  CHANGE_MSISDN: 'Change MSISDN',
  CHANGE_SIM: 'Change SIM',
  MARK_EXPIRED: 'Mark Expired',
  PAYMENT_RECEIVED: 'Payment Received',
};

export const ALL_OPERATION_STATUSES = ['COMPLETED', 'FAILED'];

export const OPERATION_STATUS_LABELS = {
  COMPLETED: 'Completed',
  FAILED: 'Failed',
};

export const OPERATION_STATUS_TOKEN = {
  COMPLETED: 'signal',
  FAILED: 'coral',
};
