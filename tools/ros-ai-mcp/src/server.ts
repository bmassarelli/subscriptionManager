// src/server.ts
import { z } from 'zod';
import type { RosClientLike } from './rosClient/rosClient.js';
import { RosError } from './errors.js';
import { getFlow } from './tools/getFlow.js';
import { getFlowSteps } from './tools/getFlowSteps.js';
import { searchFlows } from './tools/searchFlows.js';
import { searchActions } from './tools/searchActions.js';
import { getAction } from './tools/getAction.js';
import { getActionCommand } from './tools/getActionCommand.js';
import { getActionTemplate } from './tools/getActionTemplate.js';
import { getItemInfo } from './tools/getItemInfo.js';
import { searchRosItems } from './tools/searchRosItems.js';
import { findSimilarFlows } from './tools/findSimilarFlows.js';
import { findSimilarActions } from './tools/findSimilarActions.js';
import { analyzeFlow } from './tools/analyzeFlow.js';
import { analyzeItem } from './tools/analyzeItem.js';
import { summarizeFlowSkeleton } from './tools/summarizeFlowSkeleton.js';
import { saveAction, type SaveActionInput } from './tools/saveAction.js';
import { executeFlow, type ExecuteFlowDeps, type ExecuteFlowInput } from './tools/executeFlow.js';
import { createFlow, type CreateFlowInput } from './tools/createFlow.js';
import { saveFlowSteps, type SaveFlowStepsInput } from './tools/saveFlowSteps.js';
import { getJobStatus } from './tools/getJobStatus.js';

export interface McpToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export interface McpServerLike {
  tool(
    name: string,
    description: string,
    schema: Record<string, z.ZodTypeAny>,
    handler: (args: Record<string, unknown>) => Promise<McpToolResult>
  ): void;
}

function ok(data: unknown): McpToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

// fetch()'s own top-level error (e.g. "fetch failed") is a generic wrapper —
// the actionable detail (ECONNRESET, socket hang up, etc.) lives one or two
// levels down in .cause, which RosError already carries but which callers
// otherwise never see.
function describeCause(cause: unknown): string {
  if (cause instanceof Error) {
    const inner = (cause as { cause?: unknown }).cause;
    const nested = inner instanceof Error ? ` (${inner.message})` : '';
    return ` — caused by: ${cause.message}${nested}`;
  }
  return '';
}

function fail(err: unknown): McpToolResult {
  const message =
    err instanceof RosError
      ? `${err.message}${describeCause(err.cause)}`
      : `Unexpected error: ${(err as Error).message}`;
  return { content: [{ type: 'text', text: message }], isError: true };
}

export interface RegisterToolsOptions {
  enableWrite?: boolean;
  restDeps?: ExecuteFlowDeps;
}

export function registerTools(server: McpServerLike, client: RosClientLike, options: RegisterToolsOptions = {}): void {
  server.tool('get_flow', 'Get a ROS flow by flowId, including groups, routing, and schema info.', { flowId: z.number() }, async (args) => {
    try {
      return ok(await getFlow(client, { flowId: args.flowId as number }));
    } catch (err) {
      return fail(err);
    }
  });

  server.tool(
    'get_flow_steps',
    'Get the steps of a ROS flow (parent/child tree, actions, decisions, bypass) to reconstruct its graph.',
    { flowId: z.number(), rfsVersion: z.number().optional() },
    async (args) => {
      try {
        return ok(await getFlowSteps(client, { flowId: args.flowId as number, rfsVersion: args.rfsVersion as number | undefined }));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'search_flows',
    'Search ROS flows visible to the configured user, optionally filtered by a text query and flags.',
    {
      query: z.string().optional(),
      isActive: z.boolean().optional(),
      isMassFlag: z.boolean().optional(),
      isRosFlag: z.boolean().optional(),
      hasInputSchema: z.boolean().optional(),
      permission: z.enum(['EDIT', 'READ']).optional(),
    },
    async (args) => {
      try {
        return ok(await searchFlows(client, args));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'search_actions',
    'Search ROS actions, optionally filtered by a text query, actionType, commandType, or admin scope.',
    {
      query: z.string().optional(),
      actionType: z.array(z.string()).optional(),
      commandType: z.array(z.string()).optional(),
      scope: z.enum(['user', 'admin']).optional(),
    },
    async (args) => {
      try {
        return ok(await searchActions(client, args));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'get_action',
    'Get the full configuration of a ROS action (identity, command/code, and protocol-specific config).',
    { actionId: z.number(), actionVersion: z.number().optional() },
    async (args) => {
      try {
        return ok(await getAction(client, { actionId: args.actionId as number, actionVersion: args.actionVersion as number | undefined }));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool('get_action_command', 'Get the raw command/code (e.g. Groovy) of a ROS action.', { actionId: z.number() }, async (args) => {
    try {
      return ok(await getActionCommand(client, { actionId: args.actionId as number }));
    } catch (err) {
      return fail(err);
    }
  });

  server.tool(
    'get_action_template',
    'Get available Groovy or Python code templates for building new ROS actions.',
    { commandType: z.enum(['GROOVY', 'PYTHON']) },
    async (args) => {
      try {
        return ok(await getActionTemplate(client, { commandType: args.commandType as 'GROOVY' | 'PYTHON' }));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'get_item_info',
    'Get everything needed to diagnose a ROS item: current state, flow step topology, and recent step history with previous-step linkage.',
    { itemId: z.string() },
    async (args) => {
      try {
        return ok(await getItemInfo(client, { itemId: args.itemId as string }));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'search_ros_items',
    'Search ROS items by flow, status, action, customer, error code, and other criteria.',
    {
      flowId: z.number().optional(),
      statusId: z.number().optional(),
      actionId: z.number().optional(),
      customerId: z.string().optional(),
      contractId: z.string().optional(),
      errorCode: z.string().optional(),
      errorMessage: z.string().optional(),
      externalId: z.string().optional(),
      externalType: z.string().optional(),
      orderno: z.string().optional(),
      origin: z.string().optional(),
      messageId: z.string().optional(),
      step: z.number().optional(),
      initialExecutionDate: z.string().optional(),
      finalExecutionDate: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      searchHistory: z.boolean().optional(),
      searchInMemory: z.boolean().optional(),
      searchInRos: z.boolean().optional(),
      searchInMass: z.boolean().optional(),
      searchSubItems: z.boolean().optional(),
      noSearchSubItems: z.boolean().optional(),
      pageNumber: z.number().optional(),
      pageSize: z.number().optional(),
    },
    async (args) => {
      try {
        return ok(await searchRosItems(client, args));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'find_similar_flows',
    'Find existing ROS flows similar to a natural-language requirement, ranked by keyword overlap.',
    { requirement: z.string(), limit: z.number().optional() },
    async (args) => {
      try {
        return ok(await findSimilarFlows(client, { requirement: args.requirement as string, limit: args.limit as number | undefined }));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'find_similar_actions',
    'Find existing ROS actions similar to a natural-language requirement, ranked by keyword overlap.',
    { requirement: z.string(), limit: z.number().optional() },
    async (args) => {
      try {
        return ok(await findSimilarActions(client, { requirement: args.requirement as string, limit: args.limit as number | undefined }));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'analyze_flow',
    'Reconstruct a ROS flow as a step tree (parent/child, decisions, actions) for easy explanation.',
    { flowId: z.number() },
    async (args) => {
      try {
        return ok(await analyzeFlow(client, { flowId: args.flowId as number }));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'analyze_item',
    'Diagnose a ROS item: current/previous step with resolved actions, and related items (group/parent/split/subprocess).',
    { itemId: z.string() },
    async (args) => {
      try {
        return ok(await analyzeItem(client, { itemId: args.itemId as string }));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'summarize_flow_skeleton',
    'Classify a ROS flow\'s step tree into technical roles (subflow, decision, end, external_call, custom_code, flow_control, other) to see its reusable pattern at a glance.',
    { flowId: z.number() },
    async (args) => {
      try {
        return ok(await summarizeFlowSkeleton(client, { flowId: args.flowId as number }));
      } catch (err) {
        return fail(err);
      }
    }
  );

  if (options.enableWrite) {
    server.tool(
      'save_action',
      'Create or update a ROS action, with mandatory human-approval preview. Without confirm:true, returns a diff/summary and never writes to ROS; call again with confirm:true only after the user has approved the preview.',
      {
        actionId: z.number().optional(),
        actionCode: z.string().optional(),
        actionDes: z.string().optional(),
        actionType: z.string().optional(),
        commandType: z.string().optional(),
        command: z.string().optional(),
        domain: z.string().optional(),
        protocol: z.string().optional(),
        method: z.string().optional(),
        contentType: z.string().optional(),
        workerClass: z.string().optional(),
        syncBy: z.string().optional(),
        eager: z.string().optional(),
        version: z.string().optional(),
        config: z
          .object({
            readTimeoutMs: z.number().optional(),
            connectTimeoutMs: z.number().optional(),
            restHeaders: z.record(z.string()).optional(),
            circuitBreakerConfig: z.unknown().optional(),
            topicKey: z.string().optional(),
            system: z.string().optional(),
            description: z.string().optional(),
          })
          .optional(),
        confirm: z.boolean().optional(),
      },
      async (args) => {
        try {
          return ok(await saveAction(client, args as SaveActionInput));
        } catch (err) {
          return fail(err);
        }
      }
    );

    server.tool(
      'execute_flow',
      'Schedule a ROS flow for execution via ros-rest (creates a mass-scheduler job), with mandatory human-approval preview. Without confirm:true, returns a preview and never calls ros-rest; call again with confirm:true only after the user has approved the preview.',
      {
        flowId: z.number().optional(),
        flowCode: z.string().optional(),
        emails: z.array(z.string()).optional(),
        confirm: z.boolean().optional(),
      },
      async (args) => {
        try {
          return ok(await executeFlow(client, options.restDeps, args as ExecuteFlowInput));
        } catch (err) {
          return fail(err);
        }
      }
    );

    server.tool(
      'create_flow',
      'Create a new ROS flow header (not its steps — use save_flow_steps afterward), with mandatory human-approval preview. Without confirm:true, returns a preview and never writes to ROS; call again with confirm:true only after the user has approved the preview.',
      {
        flowCode: z.string(),
        flowDes: z.string(),
        massFlag: z.boolean().optional(),
        rosFlag: z.boolean().optional(),
        activeFlag: z.boolean().optional(),
        eagerFlag: z.boolean().optional(),
        inMemory: z.boolean().optional(),
        dbReprocessFlag: z.boolean().optional(),
        flowGroups: z.array(z.number()).optional(),
        onCancelAction: z.object({ actionId: z.number(), force: z.boolean().optional() }).optional(),
        onCancelAllAction: z.object({ actionId: z.number(), force: z.boolean().optional() }).optional(),
        emailNotification: z.string().optional(),
        confirm: z.boolean().optional(),
      },
      async (args) => {
        try {
          return ok(await createFlow(client, args as unknown as CreateFlowInput));
        } catch (err) {
          return fail(err);
        }
      }
    );

    const stepNodeSchema: z.ZodTypeAny = z.lazy(() =>
      z.union([
        z.object({ kind: z.literal('action'), actionCode: z.string(), des: z.string().optional(), ymlConfig: z.record(z.unknown()).optional() }),
        z.object({ kind: z.literal('decision'), criteria: z.string(), yes: z.array(stepNodeSchema), no: z.array(stepNodeSchema) }),
        z.object({ kind: z.literal('subflow'), flowCode: z.string(), ymlConfig: z.record(z.unknown()).optional() }),
        z.object({ kind: z.literal('end') }),
      ])
    );

    server.tool(
      'save_flow_steps',
      "Assemble the step tree for a brand-new ROS flow (one with zero existing steps) from a simplified DSL (action/decision/subflow/end), with mandatory human-approval preview. Refuses to run against a flow that already has steps. Without confirm:true, returns the fully-resolved step tree as a preview and never writes to ROS; call again with confirm:true only after the user has approved the preview.",
      {
        flowId: z.number(),
        steps: z.array(stepNodeSchema),
        confirm: z.boolean().optional(),
      },
      async (args) => {
        try {
          return ok(await saveFlowSteps(client, args as unknown as SaveFlowStepsInput));
        } catch (err) {
          return fail(err);
        }
      }
    );
  }

  if (options.enableWrite && options.restDeps) {
    // Captured into a local const so it narrows to ExecuteFlowDeps (not
    // ExecuteFlowDeps | undefined) inside the handler closure below — an
    // optional property read directly off `options` doesn't stay narrowed
    // across a nested function boundary.
    const restDeps = options.restDeps;
    server.tool(
      'get_job_status',
      "Get the status/progress of a ROS mass-scheduler job (e.g. one created by execute_flow): current status, item progress, per-step monitor counts, status-change history, and error breakdown when available. Returns found:false if the jobId doesn't exist.",
      { jobId: z.number() },
      async (args) => {
        try {
          return ok(await getJobStatus(restDeps, { jobId: args.jobId as number }));
        } catch (err) {
          return fail(err);
        }
      }
    );
  }
}
