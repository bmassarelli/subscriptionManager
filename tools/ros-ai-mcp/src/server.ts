// src/server.ts
import { z } from 'zod';
import type { RosClientLike } from './rosClient/rosClient.js';
import { RosError } from './errors.js';
import { getFlow } from './tools/getFlow.js';
import { getFlowSteps } from './tools/getFlowSteps.js';
import { searchFlows } from './tools/searchFlows.js';
import { searchActions } from './tools/searchActions.js';
import { getAction } from './tools/getAction.js';
import { getActionParameters, summarizeProcedureSignature } from './tools/getActionParameters.js';
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
import { updateFlowSteps, type UpdateFlowStepsInput } from './tools/updateFlowSteps.js';
import { repairFlowSteps, type RepairFlowStepsInput } from './tools/repairFlowSteps.js';
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

  server.tool(
    'get_action_parameters',
    "Get a ROS action's real IN/OUT parameter signature (the RosActionParser rows behind its 'Parsers' tab in masros-gui) — the only place a PROCEDURE-type action's stored-procedure parameter bindings live; /actionDBConfig and get_action never expose them. Returns both the raw parser rows and a summarized {inputs, outputs} signature with OUTPUT_PARAM_TYPE/STORE_PARAM rows joined by seqId.",
    { actionId: z.number() },
    async (args) => {
      try {
        const parsers = await getActionParameters(client, { actionId: args.actionId as number });
        return ok({ parsers, signature: summarizeProcedureSignature(parsers) });
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
    'Search ROS items by flow, status, action, customer, error code, and other criteria. ' +
      'To search completed/historical items, pass searchHistory:true — this requires EITHER at least one of ' +
      'customerId, contractId, externalId, orderno, messageId, OR both statusStartDate and statusEndDate ' +
      '("YYYY/MM/DD HH:mm:ss", max ~31 day span); flowId/statusId/actionId/step alone are never enough for a ' +
      'history search in ROS.',
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
      statusStartDate: z.string().optional(),
      statusEndDate: z.string().optional(),
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
        z.object({
          kind: z.literal('action'),
          actionCode: z.string(),
          des: z.string().optional(),
          ymlConfig: z.record(z.unknown()).optional(),
          bypass: z.boolean().optional(),
          syncStep: z.boolean().optional(),
          ref: z.string().optional(),
        }),
        z.object({
          kind: z.literal('decision'),
          criteria: z.string(),
          des: z.string().optional(),
          bypass: z.boolean().optional(),
          syncStep: z.boolean().optional(),
          yes: z.array(stepNodeSchema),
          no: z.array(stepNodeSchema),
          ref: z.string().optional(),
        }),
        z.object({ kind: z.literal('subflow'), flowCode: z.string(), ymlConfig: z.record(z.unknown()).optional(), ref: z.string().optional() }),
        z.object({
          kind: z.literal('multiply-subflow'),
          flowCode: z.string(),
          arrayProperty: z.string(),
          saveProperty: z.string().optional(),
          ref: z.string().optional(),
        }),
        z.object({ kind: z.literal('end'), ref: z.string().optional() }),
        z.object({ kind: z.literal('goto'), ref: z.string() }),
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

    server.tool(
      'update_flow_steps',
      "Replace the step tree of an existing ROS flow (one that already has steps) from a simplified DSL (action/decision/subflow/end), with mandatory human-approval preview. Refuses to run if the rebuilt tree would alter or remove any existing step not covered by the DSL — only pure additions are allowed, unless force:true is also passed. Without confirm:true, returns a preview (including an added/unexpectedlyChanged/unexpectedlyMissing diff against the current steps) and never writes to ROS; call again with confirm:true only after the user has approved the preview. If the diff shows non-empty unexpectedlyChanged/unexpectedlyMissing, the call is aborted with no write unless force:true is set — force:true only lifts the abort (the preview/confirm gate still applies), so a forced call still requires confirm:true to actually write, and the returned preview/warnings make explicit which existing steps will be altered or removed. Only pass force:true after the user has reviewed that diff and explicitly confirmed the change/removal is intentional.",
      {
        flowId: z.number(),
        steps: z.array(stepNodeSchema),
        confirm: z.boolean().optional(),
        force: z.boolean().optional(),
      },
      async (args) => {
        try {
          return ok(await updateFlowSteps(client, args as unknown as UpdateFlowStepsInput));
        } catch (err) {
          return fail(err);
        }
      }
    );

    server.tool(
      'repair_flow_steps',
      "RESTRICTED recovery-only mechanism for a flow whose normal read fails with ROS's known 'Repeated key ... of children of yml config STEP:<flowCode> step <N>' duplicate-key error (a distinct condition from update_flow_steps' normal use — do not use this for ordinary edits). Requires recoveryMode:true, expectedFlowCode, expectedCurrentVersion, expectedModDate (read via SQL, never inferred), a non-empty baseline of the known-good physical rows (from SQL), and a confirmationPhrase equal to REPAIR_FLOW_<flowId>_VERSION_<expectedCurrentVersion> — checked even in preview mode. Verifies the flow exists, its flowCode and active version match exactly, and the normal read genuinely fails with the known duplicate-key pattern (calling the raw endpoint directly to inspect the real error text) before doing anything else; any mismatch aborts with no write. The rebuilt payload's structural shape must reproduce the supplied baseline exactly on every field it carries — stepId, parentStepId, the actionId resolved from actionCode (including framework actionCodes INFLOW/OUTFLOW/INLINEDEC/INMLTPL/OUTMLTPL/ES), decision, flowActionDes, bypass, syncStep, and functional ymlConfig content per stepId — with exactly one allowed divergence: a row may drop ymlConfig content that, in the baseline, was already duplicated byte-for-byte on another row of the same stepId (a different parentStepId) — i.e. the goto-clone duplication this tool exists to fix. Any other deviation aborts with no write, so this tool can fix known ymlConfig duplication/SK_OPTIMISTIC-sentinel bugs but can never introduce a functional change. Has no force parameter. Without confirm:true, returns a preview (resolvedSteps plus baselineMatch diagnostics) and never writes; call again with confirm:true only after the user has reviewed and approved that preview. Writes through the same official /saveFlowStep endpoint ROS's own GUI uses — never raw SQL.",
      {
        flowId: z.number(),
        expectedFlowCode: z.string(),
        expectedCurrentVersion: z.number(),
        expectedModDate: z.number(),
        recoveryMode: z.literal(true),
        confirmationPhrase: z.string(),
        baseline: z.array(
          z.object({
            stepId: z.number(),
            parentStepId: z.number(),
            actionId: z.number(),
            decision: z.union([z.literal('Y'), z.literal('N')]).nullable().optional(),
            flowActionDes: z.string().nullable().optional(),
            bypass: z.boolean().nullable().optional(),
            syncStep: z.boolean().nullable().optional(),
            ymlConfig: z.record(z.unknown()).nullable().optional(),
          })
        ),
        steps: z.array(stepNodeSchema),
        confirm: z.boolean().optional(),
      },
      async (args) => {
        try {
          return ok(await repairFlowSteps(client, args as unknown as RepairFlowStepsInput));
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
