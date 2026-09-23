import type { RosClientLike } from '../rosClient/rosClient.js';
import type { UserFlowSummary } from '../rosClient/types.js';
import { searchFlows } from './searchFlows.js';
import { scoreByKeywordOverlap, tokenize } from './similarity.js';

export interface FindSimilarFlowsInput {
  requirement: string;
  limit?: number;
}

export interface ScoredFlow {
  flow: UserFlowSummary;
  score: number;
}

export async function findSimilarFlows(client: RosClientLike, input: FindSimilarFlowsInput): Promise<ScoredFlow[]> {
  const flows = await searchFlows(client, {});
  const keywords = tokenize(input.requirement);
  const limit = input.limit ?? 10;

  return scoreByKeywordOverlap(keywords, flows, (flow) => `${flow.flowCode} ${flow.flowDes}`)
    .filter((scored) => scored.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((scored) => ({ flow: scored.item, score: scored.score }));
}
