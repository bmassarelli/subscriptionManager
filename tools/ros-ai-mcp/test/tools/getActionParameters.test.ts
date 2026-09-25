import { afterEach, describe, expect, it, vi } from 'vitest';
import { getActionParameters, summarizeProcedureSignature } from '../../src/tools/getActionParameters.js';
import type { RosClientLike } from '../../src/rosClient/rosClient.js';
import type { RosActionParser } from '../../src/rosClient/types.js';

function fakeClient(overrides: Partial<RosClientLike> = {}): RosClientLike {
  return {
    getJson: vi.fn(),
    postJson: vi.fn(),
    postForm: vi.fn(),
    ...overrides,
  };
}

// Real rows for RESERVAR_LINEA_INVE (actionId 88138), captured live 2026-09-21
// against ROS DEV via POST /rosActionParserExecute.
const RESERVAR_LINEA_INVE_ROWS: RosActionParser[] = [
  { parserId: 91065, actionId: 88138, parserTarget: 'STORE_PARAM', seqId: 5, parserType: null, parserValue: null, propertyPath: 'OUT_MSJ_RESPUESTA', schemaDefId: 1, propertyType: null, version: 4, modDate: 1789139263000, userName: 'C27898' },
  { parserId: 91066, actionId: 88138, parserTarget: 'STORE_PARAM', seqId: 4, parserType: null, parserValue: null, propertyPath: 'OUT_COD_RESPUESTA', schemaDefId: 1, propertyType: null, version: 4, modDate: 1789139263000, userName: 'C27898' },
  { parserId: 90964, actionId: 88138, parserTarget: 'INPUT_PARAM', seqId: 1, parserType: null, parserValue: null, propertyPath: 'typeRecurso', schemaDefId: 2, propertyType: null, version: 4, modDate: 1789139263000, userName: 'C27898' },
  { parserId: 90965, actionId: 88138, parserTarget: 'INPUT_PARAM', seqId: 2, parserType: null, parserValue: null, propertyPath: 'xIdUsuarioHeaderRequest', schemaDefId: 1, propertyType: null, version: 4, modDate: 1789139263000, userName: 'C27898' },
  { parserId: 90966, actionId: 88138, parserTarget: 'OUTPUT_PARAM_TYPE', seqId: 3, parserType: null, parserValue: 'VARCHAR', propertyPath: null, schemaDefId: null, propertyType: null, version: 4, modDate: 1789139263000, userName: 'C27898' },
  { parserId: 90967, actionId: 88138, parserTarget: 'OUTPUT_PARAM_TYPE', seqId: 4, parserType: null, parserValue: 'NUMBER', propertyPath: null, schemaDefId: null, propertyType: null, version: 4, modDate: 1789139263000, userName: 'C27898' },
  { parserId: 90968, actionId: 88138, parserTarget: 'OUTPUT_PARAM_TYPE', seqId: 5, parserType: null, parserValue: 'VARCHAR', propertyPath: null, schemaDefId: null, propertyType: null, version: 4, modDate: 1789139263000, userName: 'C27898' },
  { parserId: 90974, actionId: 88138, parserTarget: 'STORE_PARAM', seqId: 3, parserType: null, parserValue: null, propertyPath: 'XMSISDN', schemaDefId: 1, propertyType: null, version: 4, modDate: 1789139263000, userName: 'C27898' },
];

describe('getActionParameters', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts a search to /rosActionParserExecute filtered by actionId, with every other field empty', async () => {
    const postForm = vi.fn().mockResolvedValue({ requestData: [] });
    const client = fakeClient({ postForm });

    await getActionParameters(client, { actionId: 88138 });

    expect(postForm).toHaveBeenCalledWith('/rosActionParserExecute', {
      action: 'search',
      "fields['parserTarget'].value": '',
      "fields['seqId'].value": '',
      "fields['parserType'].value": '',
      "fields['propertyPath'].value": '',
      "fields['parserValue'].value": '',
      "fields['propertyType'].value": '',
      "fields['schemaDefId'].value": '',
      "fields['actionId'].value": 88138,
      pageNumber: 1,
      pageSize: 100,
    });
  });

  it('returns the raw parser rows for a real PROCEDURE action', async () => {
    const client = fakeClient({ postForm: vi.fn().mockResolvedValue({ requestData: RESERVAR_LINEA_INVE_ROWS }) });

    const rows = await getActionParameters(client, { actionId: 88138 });

    expect(rows).toHaveLength(8);
    expect(rows).toEqual(RESERVAR_LINEA_INVE_ROWS);
  });

  it('returns an empty array for an action with no configured parsers (e.g. OBTIENE_CM_IMSI_HRLUD, actionId 86538)', async () => {
    const client = fakeClient({ postForm: vi.fn().mockResolvedValue({ requestData: [] }) });

    const rows = await getActionParameters(client, { actionId: 86538 });

    expect(rows).toEqual([]);
  });
});

describe('summarizeProcedureSignature', () => {
  it('joins OUTPUT_PARAM_TYPE and STORE_PARAM rows by seqId, and sorts inputs/outputs by seqId', () => {
    const signature = summarizeProcedureSignature(RESERVAR_LINEA_INVE_ROWS);

    expect(signature.inputs).toEqual([
      { seqId: 1, propertyPath: 'typeRecurso', schemaType: 'Number' },
      { seqId: 2, propertyPath: 'xIdUsuarioHeaderRequest', schemaType: 'String' },
    ]);
    expect(signature.outputs).toEqual([
      { seqId: 3, sqlType: 'VARCHAR', storedAs: 'XMSISDN' },
      { seqId: 4, sqlType: 'NUMBER', storedAs: 'OUT_COD_RESPUESTA' },
      { seqId: 5, sqlType: 'VARCHAR', storedAs: 'OUT_MSJ_RESPUESTA' },
    ]);
  });

  it('reports an OUTPUT_PARAM_TYPE row with no matching STORE_PARAM as storedAs:null, rather than dropping it', () => {
    const orphanOutput: RosActionParser[] = [
      { parserId: 1, actionId: 1, parserTarget: 'OUTPUT_PARAM_TYPE', seqId: 1, parserType: null, parserValue: 'CURSOR', propertyPath: null, schemaDefId: null, propertyType: null, version: 1, modDate: 0, userName: 'x' },
    ];

    expect(summarizeProcedureSignature(orphanOutput).outputs).toEqual([{ seqId: 1, sqlType: 'CURSOR', storedAs: null }]);
  });

  it('returns empty inputs/outputs for an action with no parsers at all', () => {
    expect(summarizeProcedureSignature([])).toEqual({ inputs: [], outputs: [] });
  });
});
