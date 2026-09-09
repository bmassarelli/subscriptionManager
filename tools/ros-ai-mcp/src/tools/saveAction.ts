// src/tools/saveAction.ts
import { getAction } from './getAction.js';
import type { RosClientLike } from '../rosClient/rosClient.js';
import type { RequestPaginationData, RosAction, SaveActionRequestBody } from '../rosClient/types.js';

// Mirrors the camelCase config fields this tool exposes to callers, one place
// shared by SaveActionInput, buildRequestBody's param type, and the
// current-state merge — instead of three independently-drifting copies.
export interface SaveActionConfig {
  readTimeoutMs?: number;
  connectTimeoutMs?: number;
  restHeaders?: Record<string, string>;
  circuitBreakerConfig?: unknown;
  topicKey?: string;
  system?: string;
  description?: string;
}

export interface SaveActionInput {
  actionId?: number;
  actionCode?: string;
  actionDes?: string;
  actionType?: string;
  commandType?: string;
  command?: string;
  domain?: string;
  protocol?: string;
  method?: string;
  contentType?: string;
  workerClass?: string;
  syncBy?: string;
  eager?: string;
  version?: string;
  config?: SaveActionConfig;
  confirm?: boolean;
}

export interface SaveActionResult {
  applied: boolean;
  mode: 'create' | 'update';
  preview: {
    summary: string;
    fieldDiffs?: Array<{ field: string; from: unknown; to: unknown }>;
    warnings: string[];
  };
  result?: { actionId: number; version: string; successMessage?: string };
  error?: { message: string };
}

const REQUIRED_ON_CREATE = ['actionCode', 'actionType', 'commandType', 'command'] as const;

interface MergedFields {
  actionCode: string;
  actionDes: string;
  actionType: string;
  commandType: string;
  command: string;
  // All optional and never defaulted to '' — see SaveActionRequestBody.actionData's
  // comment on domain/method: ROS's Java code checks "!= null", not isBlank(),
  // so an empty string is not a safe stand-in for "not set" for any of these.
  domain?: string;
  protocol?: string;
  method?: string;
  contentType?: string;
  workerClass?: string;
  syncBy?: string;
  eager: string;
}

// All of these names are shared verbatim across SaveActionInput, MergedFields,
// and RosAction, so a single key list drives both the merge diff and (below)
// the create-mode "everything that will be set" preview.
const ACTION_BODY_FIELDS: Array<keyof MergedFields> = [
  'actionCode',
  'actionDes',
  'actionType',
  'commandType',
  'command',
  'domain',
  'protocol',
  'method',
  'contentType',
  'workerClass',
  'syncBy',
  'eager',
];

// Maps the camelCase config keys this tool accepts to the UPPER_SNAKE keys
// ROS's saveAction endpoint actually reads at the top level of the wire body.
const CONFIG_KEY_MAP: Array<[keyof SaveActionConfig, string]> = [
  ['readTimeoutMs', 'READ_TIMEOUT'],
  ['connectTimeoutMs', 'CONNECT_TIMEOUT'],
  ['restHeaders', 'REST_HEADERS'],
  ['circuitBreakerConfig', 'CIRCUIT_BREAKER_CONFIG'],
  ['topicKey', 'TOPIC_KEY'],
  ['system', 'SYSTEM'],
  ['description', 'DESCRIPTION'],
];

function pick<T>(inputVal: T | undefined, currentVal: T): T {
  return inputVal !== undefined ? inputVal : currentVal;
}

function mergeAgainstCurrent(input: SaveActionInput, current: RosAction): MergedFields {
  return {
    actionCode: pick(input.actionCode, current.actionCode),
    actionDes: pick(input.actionDes, current.actionDes),
    actionType: pick(input.actionType, current.actionType),
    commandType: pick(input.commandType, current.commandType),
    command: pick(input.command, current.command),
    domain: pick(input.domain, current.domain),
    protocol: pick(input.protocol, current.protocol),
    method: pick(input.method, current.method),
    contentType: pick(input.contentType, current.contentType),
    workerClass: pick(input.workerClass, current.workerClass),
    syncBy: pick(input.syncBy, current.syncBy),
    eager: pick(input.eager, current.eager),
  };
}

function diffChangedInputFields(
  input: SaveActionInput,
  merged: MergedFields,
  current: RosAction
): Array<{ field: string; from: unknown; to: unknown }> {
  const diffs: Array<{ field: string; from: unknown; to: unknown }> = [];
  for (const key of ACTION_BODY_FIELDS) {
    if (input[key] === undefined) continue;
    if (merged[key] !== current[key]) {
      diffs.push({ field: key, from: current[key], to: merged[key] });
    }
  }
  return diffs;
}

// Diffs the config keys the caller actually specified against the current
// wire-shaped config for this action, so config-only edits (e.g. only
// `config.system` changing) still show up in the update preview.
function diffConfigFields(
  inputConfig: SaveActionConfig | undefined,
  currentWireConfig: Record<string, unknown>
): Array<{ field: string; from: unknown; to: unknown }> {
  if (!inputConfig) return [];
  const diffs: Array<{ field: string; from: unknown; to: unknown }> = [];
  for (const [inputKey, wireKey] of CONFIG_KEY_MAP) {
    const value = inputConfig[inputKey];
    if (value === undefined) continue;
    const currentValue = currentWireConfig[wireKey];
    if (JSON.stringify(value) !== JSON.stringify(currentValue)) {
      diffs.push({ field: `config.${inputKey}`, from: currentValue, to: value });
    }
  }
  return diffs;
}

// Lists every non-empty field (action-body + config) that create mode will
// actually send, so the human approving a create sees the full picture, not
// just the three identity fields named in the summary sentence.
function buildCreateFieldDiffs(
  fields: MergedFields,
  config: SaveActionConfig | undefined
): Array<{ field: string; from: unknown; to: unknown }> {
  const diffs: Array<{ field: string; from: unknown; to: unknown }> = [];
  for (const key of ACTION_BODY_FIELDS) {
    const value = fields[key];
    if (value !== undefined && value !== '') {
      diffs.push({ field: key, from: undefined, to: value });
    }
  }
  if (config) {
    for (const [inputKey] of CONFIG_KEY_MAP) {
      const value = config[inputKey];
      if (value !== undefined) {
        diffs.push({ field: `config.${inputKey}`, from: undefined, to: value });
      }
    }
  }
  return diffs;
}

function buildWarnings(
  commandType: string,
  commandChanged: boolean,
  staleVersion: { supplied: string; current: string } | null
): string[] {
  const warnings: string[] = [];
  if (staleVersion !== null) {
    warnings.push(
      `La versión enviada (${staleVersion.supplied}) ya no es la vigente (actual: ${staleVersion.current}) — releé con get_action antes de guardar, o el guardado será rechazado por ROS.`
    );
  }
  if (commandChanged && (commandType === 'GROOVY' || commandType === 'PYTHON')) {
    warnings.push(
      'ROS compilará este script de forma sincrónica al guardar; si falla la compilación, el guardado completo se revierte.'
    );
  }
  warnings.push('Este guardado se propaga de forma sincrónica al caché de otros nodos del cluster ROS.');
  return warnings;
}

// Converts the tool's camelCase config input into the UPPER_SNAKE wire shape.
// Only emits keys the caller actually specified.
function toWireConfig(config: SaveActionConfig | undefined): Record<string, unknown> {
  const wire: Record<string, unknown> = {};
  if (!config) return wire;
  for (const [inputKey, wireKey] of CONFIG_KEY_MAP) {
    const value = config[inputKey];
    if (value !== undefined) {
      wire[wireKey] = value;
    }
  }
  return wire;
}

function buildRequestBody(
  actionId: number,
  fields: MergedFields,
  version: string,
  wireConfig: Record<string, unknown> = {}
): SaveActionRequestBody {
  return {
    actionData: {
      actionId,
      actionCode: fields.actionCode,
      actionDes: fields.actionDes,
      actionSync: fields.syncBy,
      actionType: fields.actionType,
      commandType: fields.commandType,
      actionCommands: fields.command,
      domain: fields.domain,
      protocol: fields.protocol,
      method: fields.method,
      contentType: fields.contentType,
      workerClass: fields.workerClass,
      version,
      eager: fields.eager,
    },
    ...wireConfig,
  };
}

async function executeSave(
  client: RosClientLike,
  actionId: number,
  fields: MergedFields,
  version: string,
  wireConfig: Record<string, unknown>
): Promise<{ applied: true; result: SaveActionResult['result'] } | { applied: false; error: { message: string } }> {
  const body = buildRequestBody(actionId, fields, version, wireConfig);
  const response = await client.postJson<RequestPaginationData<RosAction>>('/actionDetail/saveAction', body);

  // A populated requestData.actionId is not sufficient on its own — ROS can
  // return both an echoed requestData AND an errorMessage on rejection, so a
  // non-empty errorMessage always means failure regardless of requestData.
  if (response.errorMessage || response.requestData?.actionId === undefined) {
    return { applied: false, error: { message: response.errorMessage ?? 'ROS rejected the save (no error message returned).' } };
  }

  return {
    applied: true,
    result: {
      actionId: response.requestData.actionId,
      version: String(response.requestData.version),
      successMessage: response.successMessage,
    },
  };
}

export async function saveAction(client: RosClientLike, input: SaveActionInput): Promise<SaveActionResult> {
  const isUpdate = input.actionId !== undefined;

  if (!isUpdate) {
    const missing = REQUIRED_ON_CREATE.filter((field) => input[field] === undefined);
    if (missing.length > 0) {
      return {
        applied: false,
        mode: 'create',
        preview: { summary: '', warnings: [] },
        error: { message: `Missing required fields to create a new action: ${missing.join(', ')}` },
      };
    }

    const fields: MergedFields = {
      actionCode: input.actionCode as string,
      actionDes: input.actionDes ?? '',
      actionType: input.actionType as string,
      commandType: input.commandType as string,
      command: input.command as string,
      domain: input.domain,
      protocol: input.protocol,
      method: input.method,
      contentType: input.contentType,
      workerClass: input.workerClass,
      syncBy: input.syncBy,
      eager: input.eager ?? 'N',
    };
    const warnings = buildWarnings(input.commandType as string, true, null);
    const preview = {
      summary: `Creará una nueva action "${input.actionCode}" (${input.actionType}/${input.commandType}).`,
      fieldDiffs: buildCreateFieldDiffs(fields, input.config),
      warnings,
    };

    if (!input.confirm) {
      return { applied: false, mode: 'create', preview };
    }

    const outcome = await executeSave(client, -1, fields, '1', toWireConfig(input.config));
    return outcome.applied
      ? { applied: true, mode: 'create', preview, result: outcome.result }
      : { applied: false, mode: 'create', preview, error: outcome.error };
  }

  const actionId = input.actionId as number;

  // version is the optimistic-lock token. If it's silently defaulted to
  // whatever get_action just fetched, ROS's stale-version rejection can never
  // fire and concurrent edits silently last-write-win. Require it up front —
  // before spending a read on getAction — exactly like create's four
  // required fields.
  if (input.version === undefined) {
    return {
      applied: false,
      mode: 'update',
      preview: { summary: '', warnings: [] },
      error: { message: 'version is required when updating an existing action — call get_action first and pass its current version.' },
    };
  }
  const version = input.version;

  const { action: current, config: currentConfig } = await getAction(client, { actionId });
  if (!current || current.actionCode === undefined) {
    return {
      applied: false,
      mode: 'update',
      preview: { summary: '', warnings: [] },
      error: { message: `actionId ${actionId} not found` },
    };
  }

  const merged = mergeAgainstCurrent(input, current);
  const currentWireConfig: Record<string, unknown> = currentConfig.config[current.actionCode] ?? {};
  const fieldDiffs = [...diffChangedInputFields(input, merged, current), ...diffConfigFields(input.config, currentWireConfig)];

  const currentVersionStr = String(current.version);
  const staleVersion = version !== currentVersionStr ? { supplied: version, current: currentVersionStr } : null;
  const commandChanged = fieldDiffs.some((d) => d.field === 'command');
  const warnings = buildWarnings(merged.commandType, commandChanged, staleVersion);

  const preview = {
    summary: `Actualizará actionId ${actionId} (${merged.actionCode}) — ${fieldDiffs.length} campo(s) cambiado(s).`,
    fieldDiffs,
    warnings,
  };

  if (!input.confirm) {
    return { applied: false, mode: 'update', preview };
  }

  // Overlay only the keys the caller specified onto the ENTIRE current config
  // object — not a field-by-field allowlist — so any key ROS already had
  // (KPI, or anything added to ActionDBConfig's open-ended value type later)
  // survives untouched instead of being silently dropped from the write.
  const mergedWireConfig: Record<string, unknown> = { ...currentWireConfig, ...toWireConfig(input.config) };

  const outcome = await executeSave(client, actionId, merged, version, mergedWireConfig);
  return outcome.applied
    ? { applied: true, mode: 'update', preview, result: outcome.result }
    : { applied: false, mode: 'update', preview, error: outcome.error };
}
