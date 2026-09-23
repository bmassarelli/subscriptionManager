import type { RosClientLike } from '../rosClient/rosClient.js';
import type { MemberItem, RelatedItem, RosAction, SearchRosItem, SplitMemberItem, SubprocessMemberItem } from '../rosClient/types.js';
import { getItemInfo } from './getItemInfo.js';

export interface AnalyzeItemInput {
  itemId: string;
}

export interface ResolvedStep {
  stepId: number;
  action: RosAction;
}

export interface AnalyzeItemRelatedItems {
  groupMembers: MemberItem[];
  cloneMembers: MemberItem[];
  parentMembers: MemberItem[];
  splitMembers: SplitMemberItem[];
  subprocessMembers: SubprocessMemberItem[];
  flowItem: RelatedItem | null;
}

export interface AnalyzeItemResult {
  item: SearchRosItem;
  currentStep: ResolvedStep | null;
  previousStep: (ResolvedStep & { elapsedMillis: number | null }) | null;
  relatedItems: AnalyzeItemRelatedItems;
}

export async function analyzeItem(client: RosClientLike, input: AnalyzeItemInput): Promise<AnalyzeItemResult> {
  const { item, flowSteps, recentHistory } = await getItemInfo(client, { itemId: input.itemId });

  const stepById = new Map(flowSteps.map((step) => [step.stepId, step]));

  const currentStepMatch = stepById.get(item.stepId);
  const currentStep: ResolvedStep | null = currentStepMatch
    ? { stepId: currentStepMatch.stepId, action: currentStepMatch.action }
    : null;

  const latestHistory = recentHistory[0];
  const previousStepMatch = latestHistory ? stepById.get(latestHistory.PREV_STEP_ID ?? -1) : undefined;
  const previousStep =
    latestHistory && previousStepMatch
      ? {
          stepId: previousStepMatch.stepId,
          action: previousStepMatch.action,
          elapsedMillis: latestHistory.PREV_ACTION_ELAPSED_MILLIS,
        }
      : null;

  return {
    item,
    currentStep,
    previousStep,
    relatedItems: {
      groupMembers: item.groupMembers?.member ?? [],
      cloneMembers: item.cloneMembers?.member ?? [],
      parentMembers: item.parentMembers?.member ?? [],
      splitMembers: item.splitMembers?.member ?? [],
      subprocessMembers: item.subprocessMembers?.member ?? [],
      flowItem: item.flowItem ?? null,
    },
  };
}
