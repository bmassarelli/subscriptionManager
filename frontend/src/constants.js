export const ALL_STATUSES = ['AC', 'TR', 'SU', 'EX', 'CA', 'ER'];

export const STATUS_LABELS = {
  AC: 'Active',
  TR: 'Trial',
  SU: 'Suspended',
  EX: 'Expired',
  CA: 'Cancelled',
  ER: 'Error',
};

export const STATUS_BADGE_CLASSES = {
  AC: 'badge bg-success',
  TR: 'badge bg-info text-dark',
  SU: 'badge bg-warning text-dark',
  EX: 'badge bg-secondary',
  CA: 'badge bg-dark',
  ER: 'badge bg-danger',
};

export const ALL_OPERATION_TYPES = ['CREATE', 'SUSPEND', 'RECONNECT', 'CANCEL', 'CHANGE_PLAN', 'CHANGE_MSISDN', 'CHANGE_SIM'];

export const OPERATION_TYPE_LABELS = {
  CREATE: 'Create',
  SUSPEND: 'Suspend',
  RECONNECT: 'Reconnect',
  CANCEL: 'Cancel',
  CHANGE_PLAN: 'Change Plan',
  CHANGE_MSISDN: 'Change MSISDN',
  CHANGE_SIM: 'Change SIM',
};

export const ALL_OPERATION_STATUSES = ['COMPLETED', 'FAILED'];

export const OPERATION_STATUS_LABELS = {
  COMPLETED: 'Completed',
  FAILED: 'Failed',
};
