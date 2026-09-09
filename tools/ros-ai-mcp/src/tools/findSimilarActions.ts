import type { RosClientLike } from '../rosClient/rosClient.js';
import type { RosAction } from '../rosClient/types.js';
import { searchActions } from './searchActions.js';
import { scoreByKeywordOverlap, tokenize } from './similarity.js';

export interface FindSimilarActionsInput {
  requirement: string;
  limit?: number;
}

export interface ScoredAction {
  action: RosAction;
  score: number;
}

export async function findSimilarActions(client: RosClientLike, input: FindSimilarActionsInput): Promise<ScoredAction[]> {
  const actions = await searchActions(client, {});
  const keywords = tokenize(input.requirement);
  const limit = input.limit ?? 10;

  return scoreByKeywordOverlap(keywords, actions, (action) => `${action.actionCode} ${action.actionDes}`)
    .filter((scored) => scored.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((scored) => ({ action: scored.item, score: scored.score }));
}
