import type { RosClientLike } from '../rosClient/rosClient.js';
import type { ActionTemplateResponse } from '../rosClient/types.js';

export interface GetActionTemplateInput {
  commandType: 'GROOVY' | 'PYTHON';
}

export async function getActionTemplate(
  client: RosClientLike,
  input: GetActionTemplateInput
): Promise<ActionTemplateResponse['availableCodes']> {
  const response = await client.getJson<ActionTemplateResponse>(`/actionTemplate/${input.commandType}`);
  return response.availableCodes;
}
