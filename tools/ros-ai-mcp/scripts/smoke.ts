// scripts/smoke.ts
import 'dotenv/config';
import { loadRosConfig } from '../src/config.js';
import { RosClient } from '../src/rosClient/rosClient.js';
import { getFlow } from '../src/tools/getFlow.js';
import { getItemInfo } from '../src/tools/getItemInfo.js';
import { findSimilarFlows } from '../src/tools/findSimilarFlows.js';
import { findSimilarActions } from '../src/tools/findSimilarActions.js';
import { analyzeFlow } from '../src/tools/analyzeFlow.js';
import { analyzeItem } from '../src/tools/analyzeItem.js';
import { summarizeFlowSkeleton } from '../src/tools/summarizeFlowSkeleton.js';

async function main(): Promise<void> {
  if (process.env.RUN_SMOKE_TESTS !== 'true') {
    console.log('Skipping smoke test — set RUN_SMOKE_TESTS=true (and connect to the VPN) to run it.');
    return;
  }

  const config = loadRosConfig();
  const client = new RosClient(config);

  const flowId = Number(process.env.ROS_SMOKE_FLOW_ID ?? '34606');
  const itemId = process.env.ROS_SMOKE_ITEM_ID ?? '24378914';

  console.log(`Fetching flow ${flowId}...`);
  const flow = await getFlow(client, { flowId });
  console.log(`OK — flow ${flow.flow.flowCode} (${flow.flow.flowDes}), active=${flow.flow.activeFlag}`);

  console.log(`Fetching item ${itemId}...`);
  const itemInfo = await getItemInfo(client, { itemId });
  console.log(
    `OK — item ${itemInfo.item.itemId} is at step ${itemInfo.item.stepId} (${itemInfo.item.actionDes}), status ${itemInfo.item.statusDes}` +
      (itemInfo.item.errorMessage ? `, error: ${itemInfo.item.errorMessage}` : '')
  );

  console.log('Running analyze_flow...');
  const analyzedFlow = await analyzeFlow(client, { flowId });
  console.log(`OK — graph has ${analyzedFlow.graph.length} root node(s), droppedStepIds=${JSON.stringify(analyzedFlow.droppedStepIds)}`);

  console.log('Running analyze_item...');
  const analyzedItem = await analyzeItem(client, { itemId });
  console.log(`OK — currentStep=${JSON.stringify(analyzedItem.currentStep?.stepId ?? null)}, previousStep=${JSON.stringify(analyzedItem.previousStep?.stepId ?? null)}`);

  console.log('Running summarize_flow_skeleton...');
  const skeleton = await summarizeFlowSkeleton(client, { flowId });
  console.log(`OK — skeleton has ${skeleton.skeleton.length} root node(s), droppedStepIds=${JSON.stringify(skeleton.droppedStepIds)}`);

  console.log('Running find_similar_flows...');
  const similarFlows = await findSimilarFlows(client, { requirement: 'alta de servicio' });
  console.log(`OK — ${similarFlows.length} flow(s) matched`);

  console.log('Running find_similar_actions...');
  const similarActions = await findSimilarActions(client, { requirement: 'consulta de cliente' });
  console.log(
    `OK — ${similarActions.length} action(s) matched` +
      (similarActions.length === 0
        ? ' — WARNING: 0 results may mean POST /getRosActions with an empty filter body returns no actions rather than "all actions"; verify against ROS before trusting this tool in production'
        : '')
  );
}

main().catch((err) => {
  console.error('Smoke test failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
