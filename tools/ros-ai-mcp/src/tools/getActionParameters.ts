import type { RosClientLike } from '../rosClient/rosClient.js';
import type { RequestPaginationData, RosActionParser } from '../rosClient/types.js';
import { SCHEMA_DEF_ID_NAMES } from '../rosClient/types.js';

export interface GetActionParametersInput {
  actionId: number;
}

// Every non-hidden, non-readonly field of RosActionParser's CRUD form
// (populateForm in ActionParserController.java) — a search must send all of
// them, empty or not, mirroring the real UI's request (confirmed live
// against ROS DEV, 2026-09-21). version/modDate/userName are display-only
// (showInform(false)) and are never part of the search body.
const SEARCH_FIELDS = ['parserTarget', 'seqId', 'parserType', 'propertyPath', 'parserValue', 'propertyType', 'schemaDefId'];

export async function getActionParameters(client: RosClientLike, input: GetActionParametersInput): Promise<RosActionParser[]> {
  const form: Record<string, string | number> = { action: 'search' };
  for (const field of SEARCH_FIELDS) {
    form[`fields['${field}'].value`] = '';
  }
  form["fields['actionId'].value"] = input.actionId;
  form.pageNumber = 1;
  form.pageSize = 100;

  const response = await client.postForm<RequestPaginationData<RosActionParser[]>>('/rosActionParserExecute', form);
  return response.requestData ?? [];
}

export interface ProcedureInputParameter {
  seqId: number;
  propertyPath: string;
  schemaType: string;
}

export interface ProcedureOutputParameter {
  seqId: number;
  sqlType: string;
  storedAs: string | null;
}

export interface ProcedureParameterSignature {
  inputs: ProcedureInputParameter[];
  outputs: ProcedureOutputParameter[];
}

// A PROCEDURE action's real IN/OUT signature is split across two parser rows
// per output position (OUTPUT_PARAM_TYPE declares the PL/SQL type,
// STORE_PARAM declares where it lands on the item) that only correlate via
// a shared seqId — this joins them into one shape per parameter.
export function summarizeProcedureSignature(parsers: RosActionParser[]): ProcedureParameterSignature {
  const inputs = parsers
    .filter((p) => p.parserTarget === 'INPUT_PARAM')
    .map((p) => ({
      seqId: p.seqId as number,
      propertyPath: p.propertyPath as string,
      schemaType: SCHEMA_DEF_ID_NAMES[p.schemaDefId ?? -1] ?? 'Unknown',
    }))
    .sort((a, b) => a.seqId - b.seqId);

  const storedPathBySeqId = new Map(
    parsers.filter((p) => p.parserTarget === 'STORE_PARAM').map((p) => [p.seqId, p.propertyPath as string])
  );

  const outputs = parsers
    .filter((p) => p.parserTarget === 'OUTPUT_PARAM_TYPE')
    .map((p) => ({
      seqId: p.seqId as number,
      sqlType: p.parserValue as string,
      storedAs: storedPathBySeqId.get(p.seqId) ?? null,
    }))
    .sort((a, b) => a.seqId - b.seqId);

  return { inputs, outputs };
}
