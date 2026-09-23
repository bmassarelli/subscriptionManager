# ros-ai-mcp — `update_flow_steps` + `ref`/`goto` DSL primitive — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **STANDING PROJECT RULE:** do not commit in `ros-ai-mcp` as an automatic step of whatever skill executes this plan, even though tasks below end with a "Commit" step. Ask the user explicitly how they want commits handled before dispatching the first implementer — this has been a recurring point on this project (see `[[feedback_no-autonomous-commits-ros-ai-mcp]]`), a past "yes" does not carry forward.
>
> **This plan writes code only** (Tasks 1-5). Task 6 (live verification against a throwaway flow) and Task 7 (real use against flow 64506) are **not** code-writing tasks — they're real ROS writes gated by explicit user `confirm:true` approval at each step, executed by the main assistant directly, never by an autonomous subagent. Do not let `subagent-driven-development` touch Tasks 6-7.

**Goal:** Add a `ref`/`goto` primitive to `flowStepTree.ts`'s step DSL (so real convergence points — two branches reconnecting to the same downstream step — can be expressed), and a new `update_flow_steps` MCP tool for editing an existing flow's step tree (`save_flow_steps` deliberately refuses this). Per the approved design in `docs/superpowers/specs/2026-09-21-ros-ai-mcp-update-flow-steps-goto-primitive-design.md`.

**Architecture:** `ref`/`goto` extends the existing single-pass DFS in `flowStepTree.ts` with a `Map<string, RefTarget>` on the build cursor — a node with a `ref` records its entry stepId there; a `goto` node clones that target's `{stepId, actionCode, ymlConfig}` into a new row with its own `parentStepId`, never revisiting the target's children (already correctly wired via the shared `stepId`). `update_flow_steps` reuses `buildWireSteps` as-is, resolves `version`/`modDate` automatically from the flow's live current steps, and refuses to apply if a live structural diff shows anything besides pure additions.

**Tech Stack:** TypeScript, Vitest, same conventions as every prior phase — no new dependencies.

## Global Constraints

- `save_flow_steps`'s existing create-only behavior and guardrail are **not modified** — `update_flow_steps` is a separate tool/file.
- `goto` only resolves **backward** references (target already visited earlier in DFS order) — a forward reference throws a clear error naming the ref, it does not attempt a two-pass resolution.
- `update_flow_steps` **always** re-fetches the flow's live current steps (never trusts a value read earlier in the same call or a prior tool call) for both the pre-condition check and the diff safety check.
- The diff safety check (added/unexpectedlyChanged/unexpectedlyMissing) blocks `confirm:true` entirely if anything besides pure additions is detected — this is not a warning, it's a hard refusal.
- No live ROS write happens until: all of Tasks 1-5 pass `npm test`/`npm run build`, the throwaway-flow live test in Task 6 passes, and the user explicitly approves proceeding to Task 7 (flow 64506).

---

## File Structure

```
src/
  tools/
    flowStepTree.ts            # MODIFY — add ref/goto to StepNode, Cursor.refs, appendNode/isTerminated/assertValid changes
    resolveStepReferences.ts   # NEW — extracted from saveFlowSteps.ts: findUnresolvedCodes/collectReferencedCodes, shared by both tools
    saveFlowSteps.ts            # MODIFY — import findUnresolvedCodes from the new shared file instead of defining it locally
    updateFlowSteps.ts          # NEW — update_flow_steps tool
  server.ts                     # MODIFY — register update_flow_steps
test/
  tools/
    flowStepTree.test.ts        # MODIFY — add ref/goto test cases
    resolveStepReferences.test.ts  # NEW — moved tests for findUnresolvedCodes (if any existed inline in saveFlowSteps.test.ts, split out)
    updateFlowSteps.test.ts     # NEW
  server.test.ts                 # MODIFY
README.md                        # MODIFY — document the new tool under Scope
```

---

### Task 1: `ref`/`goto` primitive in `flowStepTree.ts`

**Files:**
- Modify: `src/tools/flowStepTree.ts`
- Test: `test/tools/flowStepTree.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `StepNode` gains `ref?: string` on `action`/`decision`/`subflow`/`end`, and a new `{ kind: 'goto'; ref: string }` variant. `buildWireSteps`'s signature is unchanged (`(steps: StepNode[], ownFlowCode: string) => WireFlowStep[]`) — existing callers (`saveFlowSteps.ts`) need zero changes for this task.

- [ ] **Step 1: Write the failing tests**

Add to `test/tools/flowStepTree.test.ts` (append to the existing `describe('buildWireSteps', ...)` block):

```typescript
  it('a goto reconnects to an earlier ref-labeled node, cloning its identity into a new row with a new parent', () => {
    const steps: StepNode[] = [
      {
        kind: 'decision',
        criteria: "binding.hasVariable('a')",
        yes: [
          { kind: 'action', actionCode: 'LONG_PATH' },
          { kind: 'decision', criteria: "binding.hasVariable('b')", ref: 'shared', yes: [{ kind: 'end' }], no: [{ kind: 'end' }] },
        ],
        no: [{ kind: 'goto', ref: 'shared' }],
      },
    ];

    const wire = buildWireSteps(steps, 'MY_FLOW');

    // stepId 1: outer decision "a". stepId 2: LONG_PATH (Y branch). stepId 3: the
    // ref-labeled decision "b" (still under Y, parentStepId 2). stepId 4/5: its own
    // Y/N ends. Then the outer decision's N branch (goto) emits ONE more row: same
    // stepId 3, but parentStepId 1 (the outer decision) instead of 2.
    expect(wire).toEqual([
      { stepId: 1, parentStepId: 0, actionCode: 'INLINEDEC', ymlConfig: { MY_FLOW: { DECISION_CRITERIA: "binding.hasVariable('a')" } } },
      { stepId: 2, parentStepId: 1, actionCode: 'LONG_PATH', decision: 'Y' },
      { stepId: 3, parentStepId: 2, actionCode: 'INLINEDEC', ymlConfig: { MY_FLOW: { DECISION_CRITERIA: "binding.hasVariable('b')" } } },
      { stepId: 4, parentStepId: 3, actionCode: 'ES', decision: 'Y' },
      { stepId: 5, parentStepId: 3, actionCode: 'ES', decision: 'N' },
      { stepId: 3, parentStepId: 1, actionCode: 'INLINEDEC', decision: 'N', ymlConfig: { MY_FLOW: { DECISION_CRITERIA: "binding.hasVariable('b')" } } },
    ]);
  });

  it('a goto to a subflow ref reconnects to the INFLOW stepId specifically, not the paired OUTFLOW', () => {
    const steps: StepNode[] = [
      {
        kind: 'decision',
        criteria: 'x',
        yes: [{ kind: 'subflow', flowCode: 'NOTIFY_FLOW', ref: 'notify' }, { kind: 'end' }],
        no: [{ kind: 'goto', ref: 'notify' }],
      },
    ];

    const wire = buildWireSteps(steps, 'MY_FLOW');

    expect(wire[1]).toEqual({
      stepId: 2,
      parentStepId: 1,
      actionCode: 'INFLOW',
      decision: 'Y',
      ymlConfig: { MY_FLOW: { FLOW_CODE: 'NOTIFY_FLOW', ENABLE_SWITCH_FLOW: 'false', VALIDATE_SWITCH_FLOW: 'false' } },
    });
    // the goto row clones stepId 2 (the INFLOW), not stepId 3 (its OUTFLOW)
    const gotoRow = wire[wire.length - 1];
    expect(gotoRow.stepId).toBe(2);
    expect(gotoRow.actionCode).toBe('INFLOW');
    expect(gotoRow.decision).toBe('N');
  });

  it('throws when a goto references a ref that is never defined anywhere in the tree', () => {
    const steps: StepNode[] = [{ kind: 'goto', ref: 'nowhere' }];
    expect(() => buildWireSteps(steps, 'MY_FLOW')).toThrow(/no node in the tree defines.*ref.*nowhere/i);
  });

  it('throws when a goto references a ref not yet visited (forward reference)', () => {
    const steps: StepNode[] = [
      {
        kind: 'decision',
        criteria: 'x',
        yes: [{ kind: 'goto', ref: 'later' }],
        no: [{ kind: 'action', actionCode: 'A', ref: 'later' }, { kind: 'end' }],
      },
    ];
    expect(() => buildWireSteps(steps, 'MY_FLOW')).toThrow(/forward reference|not been defined yet/i);
  });

  it('throws when the same ref name is used on two different nodes', () => {
    const steps: StepNode[] = [
      { kind: 'action', actionCode: 'A', ref: 'dup' },
      { kind: 'action', actionCode: 'B', ref: 'dup' },
      { kind: 'end' },
    ];
    expect(() => buildWireSteps(steps, 'MY_FLOW')).toThrow(/defined more than once/i);
  });

  it('throws when goto is not the last step in its branch', () => {
    const steps: StepNode[] = [
      { kind: 'action', actionCode: 'A', ref: 'x' },
      { kind: 'goto', ref: 'x' },
      { kind: 'end' },
    ];
    expect(() => buildWireSteps(steps, 'MY_FLOW')).toThrow(/nothing can follow a "goto" step/i);
  });

  it('a branch ending in goto counts as terminated (no "must end in an end step" error)', () => {
    const steps: StepNode[] = [
      {
        kind: 'decision',
        criteria: 'x',
        yes: [{ kind: 'end', ref: 'e' }],
        no: [{ kind: 'goto', ref: 'e' }],
      },
    ];
    expect(() => buildWireSteps(steps, 'MY_FLOW')).not.toThrow();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- flowStepTree.test.ts`
Expected: FAIL — `ref`/`goto` not yet part of the `StepNode` type, `assertValid`/`appendNode` don't handle them.

- [ ] **Step 3: Implement the changes**

Replace the full contents of `src/tools/flowStepTree.ts` with:

```typescript
import type { WireFlowStep } from '../rosClient/types.js';

export type StepNode =
  | { kind: 'action'; actionCode: string; des?: string; ymlConfig?: Record<string, unknown>; ref?: string }
  | { kind: 'decision'; criteria: string; yes: StepNode[]; no: StepNode[]; ref?: string }
  | { kind: 'subflow'; flowCode: string; ymlConfig?: Record<string, unknown>; ref?: string }
  | { kind: 'end'; ref?: string }
  | { kind: 'goto'; ref: string };

function isTerminated(nodes: StepNode[]): boolean {
  if (nodes.length === 0) return false;
  const last = nodes[nodes.length - 1];
  if (last.kind === 'end') return true;
  // Trusts that the ref-labeled node this goto points at was already validated as
  // sitting on a properly-terminated path at its own point of definition — a goto
  // never introduces new unterminated paths, it only reconnects to one that exists.
  if (last.kind === 'goto') return true;
  if (last.kind === 'decision') return isTerminated(last.yes) && isTerminated(last.no);
  return false;
}

function collectRefs(nodes: StepNode[]): Set<string> {
  const refs = new Set<string>();
  const visit = (list: StepNode[]) => {
    for (const node of list) {
      if (node.kind !== 'goto' && node.ref !== undefined) {
        if (refs.has(node.ref)) {
          throw new Error(`ref "${node.ref}" is defined more than once — ref names must be unique across the whole tree.`);
        }
        refs.add(node.ref);
      }
      if (node.kind === 'decision') {
        visit(node.yes);
        visit(node.no);
      }
    }
  };
  visit(nodes);
  return refs;
}

function assertGotosResolvable(nodes: StepNode[], definedRefs: Set<string>): void {
  const visit = (list: StepNode[]) => {
    for (const node of list) {
      if (node.kind === 'goto' && !definedRefs.has(node.ref)) {
        throw new Error(`goto references "${node.ref}", but no node in the tree defines a ref "${node.ref}" — check for a typo or a ref that was removed.`);
      }
      if (node.kind === 'decision') {
        visit(node.yes);
        visit(node.no);
      }
    }
  };
  visit(nodes);
}

function assertValid(nodes: StepNode[], ownFlowCode: string, branchLabel: string): void {
  if (nodes.length === 0) {
    throw new Error(`${branchLabel} is empty — every branch needs at least one step.`);
  }
  if (!isTerminated(nodes)) {
    throw new Error(`${branchLabel} must end in an "end" step (directly, via a decision whose own branches all end, or via a "goto" to an already-terminated node).`);
  }
  nodes.forEach((node, i) => {
    if (i < nodes.length - 1 && (node.kind === 'end' || node.kind === 'decision' || node.kind === 'goto')) {
      throw new Error(
        `${branchLabel}: nothing can follow a "${node.kind}" step (found at position ${i + 1} of ${nodes.length}) — every path after a decision/goto must be written inside its own yes/no branch, or must itself be the branch's last step.`
      );
    }
  });
  for (const node of nodes) {
    if (node.kind === 'subflow' && node.flowCode === ownFlowCode) {
      throw new Error(`${branchLabel} calls subflow "${node.flowCode}" recursively — a flow cannot call itself.`);
    }
    if (node.kind === 'decision') {
      assertValid(node.yes, ownFlowCode, `${branchLabel} > decision "yes" branch`);
      assertValid(node.no, ownFlowCode, `${branchLabel} > decision "no" branch`);
    }
  }
}

interface RefTarget {
  stepId: number;
  actionCode: string;
  ymlConfig?: Record<string, Record<string, unknown>>;
}

interface Cursor {
  nextStepId: number;
  refs: Map<string, RefTarget>;
}

function appendNode(wire: WireFlowStep[], node: StepNode, parentStepId: number, ownFlowCode: string, cursor: Cursor, decision?: 'Y' | 'N'): number {
  if (node.kind === 'goto') {
    const target = cursor.refs.get(node.ref);
    if (!target) {
      throw new Error(
        `goto reference "${node.ref}" has not been defined yet at this point in the tree — forward references aren't supported. The node with ref "${node.ref}" must appear earlier in traversal order (remember: "yes" branches are visited before "no" branches at every decision).`
      );
    }
    wire.push({
      stepId: target.stepId,
      parentStepId,
      actionCode: target.actionCode,
      ...(decision !== undefined ? { decision } : {}),
      ...(target.ymlConfig !== undefined ? { ymlConfig: target.ymlConfig } : {}),
    });
    return target.stepId;
  }

  if (node.kind === 'action') {
    const stepId = cursor.nextStepId++;
    const ymlConfig = node.ymlConfig !== undefined ? { [ownFlowCode]: node.ymlConfig } : undefined;
    wire.push({
      stepId,
      parentStepId,
      actionCode: node.actionCode,
      ...(node.des !== undefined ? { flowActionDes: node.des } : {}),
      ...(decision !== undefined ? { decision } : {}),
      ...(ymlConfig !== undefined ? { ymlConfig } : {}),
    });
    if (node.ref !== undefined) cursor.refs.set(node.ref, { stepId, actionCode: node.actionCode, ymlConfig });
    return stepId;
  }

  if (node.kind === 'end') {
    const stepId = cursor.nextStepId++;
    wire.push({ stepId, parentStepId, actionCode: 'ES', ...(decision !== undefined ? { decision } : {}) });
    if (node.ref !== undefined) cursor.refs.set(node.ref, { stepId, actionCode: 'ES' });
    return stepId;
  }

  if (node.kind === 'subflow') {
    const inStepId = cursor.nextStepId++;
    const inYmlConfig = { [ownFlowCode]: { FLOW_CODE: node.flowCode, ENABLE_SWITCH_FLOW: 'false', VALIDATE_SWITCH_FLOW: 'false' } };
    wire.push({
      stepId: inStepId,
      parentStepId,
      actionCode: 'INFLOW',
      ...(decision !== undefined ? { decision } : {}),
      ymlConfig: inYmlConfig,
    });
    if (node.ref !== undefined) cursor.refs.set(node.ref, { stepId: inStepId, actionCode: 'INFLOW', ymlConfig: inYmlConfig });
    const outStepId = cursor.nextStepId++;
    wire.push({ stepId: outStepId, parentStepId: inStepId, actionCode: 'OUTFLOW', ymlConfig: { [ownFlowCode]: {} } });
    return outStepId;
  }

  // 'decision' is the only StepNode kind left after the checks above.
  const decStepId = cursor.nextStepId++;
  const decYmlConfig = { [ownFlowCode]: { DECISION_CRITERIA: node.criteria } };
  wire.push({
    stepId: decStepId,
    parentStepId,
    actionCode: 'INLINEDEC',
    ...(decision !== undefined ? { decision } : {}),
    ymlConfig: decYmlConfig,
  });
  if (node.ref !== undefined) cursor.refs.set(node.ref, { stepId: decStepId, actionCode: 'INLINEDEC', ymlConfig: decYmlConfig });
  appendChain(wire, node.yes, decStepId, ownFlowCode, cursor, 'Y');
  appendChain(wire, node.no, decStepId, ownFlowCode, cursor, 'N');
  return decStepId;
}

function appendChain(wire: WireFlowStep[], nodes: StepNode[], parentStepId: number, ownFlowCode: string, cursor: Cursor, firstDecision?: 'Y' | 'N'): void {
  let currentParent = parentStepId;
  for (let i = 0; i < nodes.length; i++) {
    currentParent = appendNode(wire, nodes[i], currentParent, ownFlowCode, cursor, i === 0 ? firstDecision : undefined);
  }
}

export function buildWireSteps(steps: StepNode[], ownFlowCode: string): WireFlowStep[] {
  assertValid(steps, ownFlowCode, 'steps');
  const definedRefs = collectRefs(steps);
  assertGotosResolvable(steps, definedRefs);
  const wire: WireFlowStep[] = [];
  const cursor: Cursor = { nextStepId: 1, refs: new Map() };
  appendChain(wire, steps, 0, ownFlowCode, cursor);
  return wire;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- flowStepTree.test.ts`
Expected: PASS (all original 9 cases plus the 7 new ones — 16 total).

- [ ] **Step 5: Commit**

```bash
git add src/tools/flowStepTree.ts test/tools/flowStepTree.test.ts
git commit -m "feat(flowStepTree): add ref/goto primitive for step convergence"
```

---

### Task 2: Extract `findUnresolvedCodes` into a shared file

**Files:**
- Create: `src/tools/resolveStepReferences.ts`
- Modify: `src/tools/saveFlowSteps.ts` (import instead of defining locally)
- Test: `test/tools/resolveStepReferences.test.ts`

**Interfaces:**
- Produces: `findUnresolvedCodes(client: RosClientLike, steps: StepNode[]): Promise<string[]>` — same signature/behavior as the function currently private to `saveFlowSteps.ts`, moved verbatim.
- Consumes (by `saveFlowSteps.ts` and, in Task 3, `updateFlowSteps.ts`): the above.

- [ ] **Step 1: Write the failing test** (this is a pure move — the test just needs to import from the new location)

Create `test/tools/resolveStepReferences.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest';
import { findUnresolvedCodes } from '../../src/tools/resolveStepReferences.js';
import type { RosClientLike } from '../../src/rosClient/rosClient.js';
import type { StepNode } from '../../src/tools/flowStepTree.js';

function fakeClient(overrides: Partial<RosClientLike> = {}): RosClientLike {
  return { getJson: vi.fn(), postJson: vi.fn(), postForm: vi.fn(), ...overrides };
}

describe('findUnresolvedCodes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports unresolved actionCode and flowCode references', async () => {
    const client = fakeClient({
      postJson: vi.fn().mockImplementation((path: string) => {
        if (path === '/getRosActions') return Promise.resolve({ requestData: [] });
        if (path === '/getUserFlows') return Promise.resolve({ requestData: [] });
        return Promise.resolve({});
      }),
    });
    const steps: StepNode[] = [{ kind: 'action', actionCode: 'GHOST' }, { kind: 'subflow', flowCode: 'GHOST_FLOW' }, { kind: 'end' }];

    const problems = await findUnresolvedCodes(client, steps);

    expect(problems).toEqual(expect.arrayContaining([expect.stringContaining('GHOST'), expect.stringContaining('GHOST_FLOW')]));
  });

  it('returns an empty array when every referenced code resolves', async () => {
    const client = fakeClient({
      postJson: vi.fn().mockImplementation((path: string) => {
        if (path === '/getRosActions') return Promise.resolve({ requestData: [{ actionCode: 'TM_ST' }] });
        return Promise.resolve({ requestData: [] });
      }),
    });
    const steps: StepNode[] = [{ kind: 'action', actionCode: 'TM_ST' }, { kind: 'end' }];

    expect(await findUnresolvedCodes(client, steps)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- resolveStepReferences.test.ts`
Expected: FAIL — `src/tools/resolveStepReferences.ts` doesn't exist yet.

- [ ] **Step 3: Create the shared file and update `saveFlowSteps.ts`**

Create `src/tools/resolveStepReferences.ts`:

```typescript
import { searchActions } from './searchActions.js';
import { searchFlows } from './searchFlows.js';
import type { StepNode } from './flowStepTree.js';
import type { RosClientLike } from '../rosClient/rosClient.js';

function collectReferencedCodes(steps: StepNode[]): { actionCodes: Set<string>; flowCodes: Set<string> } {
  const actionCodes = new Set<string>();
  const flowCodes = new Set<string>();
  const visit = (nodes: StepNode[]) => {
    for (const node of nodes) {
      if (node.kind === 'action') actionCodes.add(node.actionCode);
      if (node.kind === 'subflow') flowCodes.add(node.flowCode);
      if (node.kind === 'decision') {
        visit(node.yes);
        visit(node.no);
      }
    }
  };
  visit(steps);
  return { actionCodes, flowCodes };
}

// Walks the original DSL input rather than buildWireSteps's wire-format output on
// purpose: buildWireSteps auto-injects the framework/scaffolding action codes
// (INFLOW/OUTFLOW/INLINEDEC/ES), and those must never be existence-checked via
// search_actions (see this project's Global Constraints) since they aren't
// real user-facing actions a caller would ever reference in the DSL.
export async function findUnresolvedCodes(client: RosClientLike, steps: StepNode[]): Promise<string[]> {
  const { actionCodes, flowCodes } = collectReferencedCodes(steps);
  const problems: string[] = [];

  if (actionCodes.size > 0) {
    const allActions = await searchActions(client, {});
    const knownActionCodes = new Set(allActions.map((action) => action.actionCode));
    for (const code of actionCodes) {
      if (!knownActionCodes.has(code)) problems.push(`actionCode "${code}" not found`);
    }
  }

  if (flowCodes.size > 0) {
    const allFlows = await searchFlows(client, {});
    const knownFlowCodes = new Set(allFlows.map((flow) => flow.flowCode));
    for (const code of flowCodes) {
      if (!knownFlowCodes.has(code)) problems.push(`flowCode "${code}" not found`);
    }
  }

  return problems;
}
```

In `src/tools/saveFlowSteps.ts`: delete the local `collectReferencedCodes`/`findUnresolvedCodes` functions and their now-unused imports (`searchActions`, `searchFlows`), and add `import { findUnresolvedCodes } from './resolveStepReferences.js';` at the top. Nothing else in the file changes — `findUnresolvedCodes(client, input.steps)` is still called the same way.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- resolveStepReferences.test.ts saveFlowSteps.test.ts`
Expected: PASS (2 new tests, all of `saveFlowSteps.test.ts`'s existing tests unaffected since the function's behavior didn't change, only its location).

Then run the full suite once: `npm test` — expect all still-green (no regressions from the extraction).

- [ ] **Step 5: Commit**

```bash
git add src/tools/resolveStepReferences.ts src/tools/saveFlowSteps.ts test/tools/resolveStepReferences.test.ts
git commit -m "refactor(tools): extract findUnresolvedCodes into a shared file"
```

---

### Task 3: `update_flow_steps` tool

**Files:**
- Create: `src/tools/updateFlowSteps.ts`
- Test: `test/tools/updateFlowSteps.test.ts`

**Interfaces:**
- Consumes: `buildWireSteps(steps, ownFlowCode)` (Task 1). `findUnresolvedCodes(client, steps)` (Task 2). `getFlow`, `getFlowSteps` (existing). `StepOptimistic`, `WireFlowStep`, `SaveFlowStepBody`, `RequestPaginationData` (existing types).
- Produces: `UpdateFlowStepsInput`, `UpdateFlowStepsResult`, `FlowStepsDiff`, `updateFlowSteps(client: RosClientLike, input: UpdateFlowStepsInput): Promise<UpdateFlowStepsResult>` — all from `src/tools/updateFlowSteps.ts`. Task 4 imports these.

- [ ] **Step 1: Write the failing tests**

Create `test/tools/updateFlowSteps.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest';
import { updateFlowSteps } from '../../src/tools/updateFlowSteps.js';
import type { RosClientLike } from '../../src/rosClient/rosClient.js';
import type { FlowInfo, StepOptimistic } from '../../src/rosClient/types.js';

function fakeClient(overrides: Partial<RosClientLike> = {}): RosClientLike {
  return { getJson: vi.fn(), postJson: vi.fn(), postForm: vi.fn(), ...overrides };
}

const flowInfoFixture: FlowInfo = {
  flow: {
    flowId: 64506, flowCode: 'MY_FLOW', flowDes: 'My Flow', priority: 10, activeFlag: 'Y', massFlag: 'Y',
    rosFlag: 'Y', inMemoryFlag: 'N', dbReprocessFlag: 'N', syncBy: 'NONE', version: 4,
    modDate: '2026-09-21T00:00:00Z', userName: 'jyanez', eagerFlag: 'N',
  },
  flowNotification: null, allAvailableRoutes: [], availableFlowGroup: [], selectFlowGroup: [],
  allFlowSchemaDatasPath: {}, flowActionError: null, actionErrorDetail: null, businessInfo: null,
  isInMemory: false, jobProcessedAction: null, jobFinishedAction: null,
  onCancelAction: { actionId: null, force: null }, onCancelAllAction: { actionId: null, force: null }, description: null,
};

function existingStep(overrides: Partial<StepOptimistic>): StepOptimistic {
  return {
    flowId: 64506, stepId: 1, parentStepId: 0, actionId: 1,
    action: { actionCode: 'TM_ST' } as StepOptimistic['action'],
    flowActionDes: null, preActionId: null, preAction: null, flow: null,
    multiplyArrProp: null, decisionCriteria: null, decision: null,
    version: 3, modDate: '2026-09-21T00:00:00Z', userName: 'jyanez',
    bypass: null, switchPropertyPath: null, sizeRos: '', sizeMass: '', syncStep: null,
    modDateYmls: 0, ymlConfig: null, alerts: null,
    ...overrides,
  };
}

describe('updateFlowSteps', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refuses when the flow has zero existing steps, pointing the caller at save_flow_steps instead', async () => {
    const client = fakeClient({
      getJson: vi.fn().mockResolvedValue({ requestData: flowInfoFixture }),
      postForm: vi.fn().mockResolvedValue({ requestData: [] }),
    });

    const result = await updateFlowSteps(client, { flowId: 64506, steps: [{ kind: 'end' }] });

    expect(result.applied).toBe(false);
    expect(result.error?.message).toMatch(/save_flow_steps/i);
  });

  it('refuses when existing steps do not share one uniform version', async () => {
    const client = fakeClient({
      getJson: vi.fn().mockResolvedValue({ requestData: flowInfoFixture }),
      postForm: vi.fn().mockResolvedValue({
        requestData: [existingStep({ stepId: 1, version: 3, modDateYmls: 123 }), existingStep({ stepId: 2, parentStepId: 1, version: 4 })],
      }),
    });

    const result = await updateFlowSteps(client, { flowId: 64506, steps: [{ kind: 'end' }] });

    expect(result.applied).toBe(false);
    expect(result.error?.message).toMatch(/uniform version/i);
  });

  it('preview mode: pure additions produce a clean diff and never call postJson(\'/saveFlowStep\', ...)', async () => {
    const existing = [
      existingStep({ stepId: 1, parentStepId: 0, actionId: 1, action: { actionCode: 'TM_ST' } as StepOptimistic['action'], version: 3, modDateYmls: 123 }),
      existingStep({ stepId: 2, parentStepId: 1, actionId: 100, action: { actionCode: 'ES' } as StepOptimistic['action'], version: 3 }),
    ];
    const client = fakeClient({
      getJson: vi.fn().mockResolvedValue({ requestData: flowInfoFixture }),
      postForm: vi.fn().mockResolvedValue({ requestData: existing }),
    });

    const result = await updateFlowSteps(client, {
      flowId: 64506,
      steps: [{ kind: 'action', actionCode: 'TM_ST' }, { kind: 'action', actionCode: 'NEW_ACTION' }, { kind: 'end' }],
    });

    expect(result.applied).toBe(false); // preview, not confirmed
    expect(result.error).toBeUndefined();
    expect(result.preview.diff?.unexpectedlyChanged).toEqual([]);
    expect(result.preview.diff?.unexpectedlyMissing).toEqual([]);
    expect(result.preview.diff?.added).toHaveLength(1); // the NEW_ACTION row
    expect(client.postJson).not.toHaveBeenCalled();
  });

  it('refuses (even with confirm:true) when the rebuilt tree would change an existing untouched step', async () => {
    const existing = [
      existingStep({ stepId: 1, parentStepId: 0, actionId: 1, action: { actionCode: 'TM_ST' } as StepOptimistic['action'], version: 3, modDateYmls: 123 }),
      existingStep({ stepId: 2, parentStepId: 1, actionId: 100, action: { actionCode: 'ES' } as StepOptimistic['action'], version: 3 }),
    ];
    const client = fakeClient({
      getJson: vi.fn().mockResolvedValue({ requestData: flowInfoFixture }),
      postForm: vi.fn().mockResolvedValue({ requestData: existing }),
    });

    // Caller's DSL renames the first action — same position (stepId 1, parentStepId 0)
    // but a different actionCode than what's really there today.
    const result = await updateFlowSteps(client, {
      flowId: 64506,
      steps: [{ kind: 'action', actionCode: 'SOMETHING_ELSE' }, { kind: 'end' }],
      confirm: true,
    });

    expect(result.applied).toBe(false);
    expect(result.preview.diff?.unexpectedlyChanged.length).toBeGreaterThan(0);
    expect(client.postJson).not.toHaveBeenCalled();
  });

  it('confirm:true with a clean (additions-only) diff posts the resolved tree with the real version/modDate', async () => {
    const existing = [
      existingStep({ stepId: 1, parentStepId: 0, actionId: 1, action: { actionCode: 'TM_ST' } as StepOptimistic['action'], version: 3, modDateYmls: 123456 }),
      existingStep({ stepId: 2, parentStepId: 1, actionId: 100, action: { actionCode: 'ES' } as StepOptimistic['action'], version: 3 }),
    ];
    const postJson = vi.fn().mockImplementation((path: string) => {
      if (path === '/saveFlowStep') return Promise.resolve({ successMessage: 'flow.step.successSave' });
      return Promise.resolve({});
    });
    const client = fakeClient({
      getJson: vi.fn().mockResolvedValue({ requestData: flowInfoFixture }),
      postForm: vi.fn().mockResolvedValue({ requestData: existing }),
      postJson,
    });

    const result = await updateFlowSteps(client, {
      flowId: 64506,
      steps: [{ kind: 'action', actionCode: 'TM_ST' }, { kind: 'end' }],
      confirm: true,
    });

    expect(result.applied).toBe(true);
    expect(postJson).toHaveBeenCalledWith('/saveFlowStep', { flowId: 64506, version: 3, modDate: 123456, flowSteps: expect.any(Array) });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- updateFlowSteps.test.ts`
Expected: FAIL — `src/tools/updateFlowSteps.ts` doesn't exist yet.

- [ ] **Step 3: Implement `updateFlowSteps.ts`**

Create `src/tools/updateFlowSteps.ts`:

```typescript
import { buildWireSteps, type StepNode } from './flowStepTree.js';
import { findUnresolvedCodes } from './resolveStepReferences.js';
import { getFlow } from './getFlow.js';
import { getFlowSteps } from './getFlowSteps.js';
import type { RosClientLike } from '../rosClient/rosClient.js';
import type { RequestPaginationData, SaveFlowStepBody, StepOptimistic, WireFlowStep } from '../rosClient/types.js';

export interface UpdateFlowStepsInput {
  flowId: number;
  steps: StepNode[];
  confirm?: boolean;
}

export interface FlowStepsDiff {
  added: WireFlowStep[];
  unexpectedlyChanged: WireFlowStep[];
  unexpectedlyMissing: WireFlowStep[];
}

export interface UpdateFlowStepsResult {
  applied: boolean;
  preview: {
    summary: string;
    resolvedSteps?: WireFlowStep[];
    diff?: FlowStepsDiff;
    warnings: string[];
  };
  result?: { successMessage?: string };
  error?: { message: string };
}

interface ComparableStep {
  stepId: number;
  parentStepId: number;
  actionCode: string;
  decisionCriteria: string | null;
  decision: string | null;
}

function normalizeExisting(steps: StepOptimistic[]): ComparableStep[] {
  return steps.map((s) => ({
    stepId: s.stepId,
    parentStepId: s.parentStepId,
    actionCode: s.action.actionCode,
    decisionCriteria: s.decisionCriteria,
    decision: s.decision,
  }));
}

function existingToWire(s: StepOptimistic): WireFlowStep {
  return {
    stepId: s.stepId,
    parentStepId: s.parentStepId,
    actionCode: s.action.actionCode,
    ...(s.decision !== null ? { decision: s.decision as 'Y' | 'N' } : {}),
  };
}

function normalizeNew(steps: WireFlowStep[], ownFlowCode: string): ComparableStep[] {
  return steps.map((s) => ({
    stepId: s.stepId,
    parentStepId: s.parentStepId,
    actionCode: s.actionCode,
    decisionCriteria: (s.ymlConfig?.[ownFlowCode] as { DECISION_CRITERIA?: string } | undefined)?.DECISION_CRITERIA ?? null,
    decision: s.decision ?? null,
  }));
}

function diffSteps(
  oldWire: WireFlowStep[],
  oldComparable: ComparableStep[],
  newWire: WireFlowStep[],
  newComparable: ComparableStep[]
): FlowStepsDiff {
  const key = (s: ComparableStep) => `${s.stepId}:${s.parentStepId}`;
  const oldIndex = new Map(oldComparable.map((s, i) => [key(s), i]));
  const newIndex = new Map(newComparable.map((s, i) => [key(s), i]));

  const added: WireFlowStep[] = [];
  const unexpectedlyChanged: WireFlowStep[] = [];
  newComparable.forEach((newRow, i) => {
    const oldI = oldIndex.get(key(newRow));
    if (oldI === undefined) {
      added.push(newWire[i]);
    } else {
      const oldRow = oldComparable[oldI];
      if (oldRow.actionCode !== newRow.actionCode || oldRow.decisionCriteria !== newRow.decisionCriteria || oldRow.decision !== newRow.decision) {
        unexpectedlyChanged.push(newWire[i]);
      }
    }
  });

  const unexpectedlyMissing: WireFlowStep[] = [];
  oldComparable.forEach((oldRow, i) => {
    if (!newIndex.has(key(oldRow))) unexpectedlyMissing.push(oldWire[i]);
  });

  return { added, unexpectedlyChanged, unexpectedlyMissing };
}

const WARNINGS = [
  'update_flow_steps reemplaza el árbol COMPLETO del flow en cada guardado — cualquier fila que no esté en el DSL enviado desaparece.',
  'Los stepId son reasignados desde cero en cada guardado — no son estables entre llamadas.',
];

export async function updateFlowSteps(client: RosClientLike, input: UpdateFlowStepsInput): Promise<UpdateFlowStepsResult> {
  const flowInfo = await getFlow(client, { flowId: input.flowId });
  if (!flowInfo?.flow) {
    return { applied: false, preview: { summary: '', warnings: [] }, error: { message: `flowId ${input.flowId} not found.` } };
  }

  const existingSteps = await getFlowSteps(client, { flowId: input.flowId });
  if (existingSteps.length === 0) {
    return {
      applied: false,
      preview: { summary: '', warnings: [] },
      error: { message: `flowId ${input.flowId} has no existing steps — use save_flow_steps for a brand-new flow instead.` },
    };
  }

  const versions = new Set(existingSteps.map((s) => s.version));
  if (versions.size !== 1) {
    return {
      applied: false,
      preview: { summary: '', warnings: [] },
      error: { message: `flowId ${input.flowId}'s existing steps don't share one uniform version (found: ${[...versions].join(', ')}) — update_flow_steps doesn't know which to send.` },
    };
  }
  const version = existingSteps[0].version;
  const firstStep = existingSteps.reduce((min, s) => (s.stepId < min.stepId ? s : min), existingSteps[0]);
  const modDate = firstStep.modDateYmls ?? 0;

  const unresolved = await findUnresolvedCodes(client, input.steps);
  if (unresolved.length > 0) {
    return { applied: false, preview: { summary: '', warnings: [] }, error: { message: `Unresolved references — ${unresolved.join('; ')}.` } };
  }

  let wireSteps: WireFlowStep[];
  try {
    wireSteps = buildWireSteps(input.steps, flowInfo.flow.flowCode);
  } catch (err) {
    return { applied: false, preview: { summary: '', warnings: [] }, error: { message: err instanceof Error ? err.message : String(err) } };
  }

  const oldWire = existingSteps.map(existingToWire);
  const oldComparable = normalizeExisting(existingSteps);
  const newComparable = normalizeNew(wireSteps, flowInfo.flow.flowCode);
  const diff = diffSteps(oldWire, oldComparable, wireSteps, newComparable);

  if (diff.unexpectedlyChanged.length > 0 || diff.unexpectedlyMissing.length > 0) {
    return {
      applied: false,
      preview: {
        summary: `ABORTADO — el árbol nuevo altera o elimina ${diff.unexpectedlyChanged.length + diff.unexpectedlyMissing.length} step(s) existentes que no deberían tocarse.`,
        resolvedSteps: wireSteps,
        diff,
        warnings: WARNINGS,
      },
      error: { message: 'La reconstrucción del árbol difiere de lo esperado en steps no marcados como nuevos — revisar el DSL antes de reintentar.' },
    };
  }

  const preview = {
    summary: `Agregará ${diff.added.length} step(s) nuevo(s) al flow ${input.flowId} (${flowInfo.flow.flowCode}); ${existingSteps.length} step(s) existentes quedan intactos.`,
    resolvedSteps: wireSteps,
    diff,
    warnings: WARNINGS,
  };

  if (!input.confirm) {
    return { applied: false, preview };
  }

  const body: SaveFlowStepBody = { flowId: input.flowId, version, modDate, flowSteps: wireSteps };
  const response = await client.postJson<RequestPaginationData<unknown>>('/saveFlowStep', body);

  if (response.errorMessage) {
    return { applied: false, preview, error: { message: response.errorMessage } };
  }
  if (!response.successMessage) {
    return { applied: false, preview, error: { message: 'ROS did not confirm the step save (no successMessage returned).' } };
  }

  return { applied: true, preview, result: { successMessage: response.successMessage } };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- updateFlowSteps.test.ts`
Expected: PASS (all 5 cases).

Then run the full suite: `npm test` — expect all green.

- [ ] **Step 5: Commit**

```bash
git add src/tools/updateFlowSteps.ts test/tools/updateFlowSteps.test.ts
git commit -m "feat(tools): add update_flow_steps for editing an existing flow's steps"
```

---

### Task 4: Register `update_flow_steps` in `server.ts`

**Files:**
- Modify: `src/server.ts`
- Modify: `test/server.test.ts`

**Interfaces:**
- Consumes: `updateFlowSteps(client, input): Promise<UpdateFlowStepsResult>` (Task 3). Same `stepNodeSchema` zod lazy-union already defined in `server.ts` for `save_flow_steps` — extend it to include the `goto` variant and `ref` fields, reused by both tools.

- [ ] **Step 1: Write the failing tests**

Add to `test/server.test.ts` (near the existing `save_flow_steps` registration tests):

```typescript
it('registers update_flow_steps when enableWrite is true', () => {
  const server = new FakeMcpServer();
  registerTools(server, fakeClient(), { enableWrite: true });
  expect(server.registered.some((tool) => tool.name === 'update_flow_steps')).toBe(true);
});

it('does NOT register update_flow_steps when enableWrite is false or omitted', () => {
  const server = new FakeMcpServer();
  registerTools(server, fakeClient());
  expect(server.registered.some((tool) => tool.name === 'update_flow_steps')).toBe(false);
});

it('update_flow_steps handler returns MCP text content on a rejected preview (flow not found)', async () => {
  const client = fakeClient();
  vi.spyOn(client, 'getJson').mockResolvedValue({ requestData: { flow: null } });
  const server = new FakeMcpServer();
  registerTools(server, client, { enableWrite: true });

  const tool = server.registered.find((t) => t.name === 'update_flow_steps')!;
  const result = await tool.handler({ flowId: 1, steps: [{ kind: 'end' }] });

  expect(result.isError).toBeFalsy();
  const parsed = JSON.parse(result.content[0].text);
  expect(parsed.applied).toBe(false);
  expect(parsed.error.message).toMatch(/not found/i);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- server.test.ts`
Expected: FAIL — `update_flow_steps` not yet registered.

- [ ] **Step 3: Register the tool**

In `src/server.ts`, add the import alongside the other tool imports:

```typescript
import { updateFlowSteps, type UpdateFlowStepsInput } from './tools/updateFlowSteps.js';
```

Find the existing `stepNodeSchema` (defined for `save_flow_steps`, a `z.lazy(() => z.union([...]))` over action/decision/subflow/end) and extend each object variant with `ref: z.string().optional()`, and add a new union member for `goto`:

```typescript
    const stepNodeSchema: z.ZodTypeAny = z.lazy(() =>
      z.union([
        z.object({ kind: z.literal('action'), actionCode: z.string(), des: z.string().optional(), ymlConfig: z.record(z.unknown()).optional(), ref: z.string().optional() }),
        z.object({ kind: z.literal('decision'), criteria: z.string(), yes: z.array(stepNodeSchema), no: z.array(stepNodeSchema), ref: z.string().optional() }),
        z.object({ kind: z.literal('subflow'), flowCode: z.string(), ymlConfig: z.record(z.unknown()).optional(), ref: z.string().optional() }),
        z.object({ kind: z.literal('end'), ref: z.string().optional() }),
        z.object({ kind: z.literal('goto'), ref: z.string() }),
      ])
    );
```

(This is the same schema object `save_flow_steps` already uses — extending it in place means both tools automatically get `ref`/`goto` support, no duplicate schema needed.)

Immediately after the existing `save_flow_steps` `server.tool(...)` block, inside the same `if (options.enableWrite) { ... }` block, add:

```typescript
    server.tool(
      'update_flow_steps',
      'Edit the step tree of a ROS flow that already has steps (save_flow_steps refuses this). Reconstructs the FULL intended tree via the same DSL as save_flow_steps (now supporting ref/goto for real convergence points), resolves version/modDate automatically from the flow\'s live current steps, and refuses to apply (even with confirm:true) unless a live structural diff shows only additions — nothing existing may be changed or removed. Without confirm:true, returns the diff/preview and never writes to ROS.',
      {
        flowId: z.number(),
        steps: z.array(stepNodeSchema),
        confirm: z.boolean().optional(),
      },
      async (args) => {
        try {
          return ok(await updateFlowSteps(client, args as UpdateFlowStepsInput));
        } catch (err) {
          return fail(err);
        }
      }
    );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- server.test.ts`
Expected: PASS (all existing tests still pass, all new tests pass).

Then run the full suite and the build:

Run: `npm test` — expect all green.
Run: `npm run build` — expect clean (this project's own Phase 8 lesson: `npm test` alone doesn't catch TypeScript errors).

- [ ] **Step 5: Commit**

```bash
git add src/server.ts test/server.test.ts
git commit -m "feat(server): register update_flow_steps, extend stepNodeSchema with ref/goto"
```

---

### Task 5: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the Scope section**

Read the current README's Scope section (already documents Phases 1-9 per prior updates) and add an entry for this capability — match the existing list-item style exactly:

```markdown
- `update_flow_steps`: edit the step tree of a flow that already has steps (`save_flow_steps` is create-only). Same DSL, now with a `ref`/`goto` primitive for real convergence points. Resolves `version`/`modDate` automatically; refuses to apply unless a live structural diff against the flow's current steps shows only additions.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(ros-ai-mcp): document update_flow_steps and the ref/goto primitive"
```

---

### Task 6: Live verification against a throwaway flow (NOT a coding task — real ROS writes, main assistant only)

**Do not delegate this task to a subagent.** Every write below needs the user's explicit `confirm:true` approval, shown one preview at a time, exactly like Tasks 1-3 of the gap-remediation plan.

- [ ] **Step 1:** Create a new throwaway test flow via `create_flow` (`confirm:true` after user approval) — e.g. `ZTEST_JYANEZ_GOTO_PRIMITIVE`.
- [ ] **Step 2:** Assemble an initial tree via `save_flow_steps` (create-only, unchanged) with a shape that will need a *second* pass to introduce convergence — e.g. a single decision with two independent tails (no goto yet, since `save_flow_steps` can't express it either).
- [ ] **Step 3:** Call `update_flow_steps` (preview first) with a DSL that **introduces** a `goto` reconnecting one of the two tails to the other's shared continuation — review the diff (should show only additions, zero changed/missing), get user approval, then `confirm:true`.
- [ ] **Step 4:** Call `get_flow_steps` on the throwaway flow and confirm the live result shows the expected `stepId`-duplication pattern (same `stepId` on two rows with different `parentStepId`) — the same shape documented for flow 64506's real steps 18/21.
- [ ] **Step 5:** Report the result to the user. Only after this passes does Task 7 (real flow 64506) proceed.

---

### Task 7: Apply to flow 64506 (NOT part of this plan's automated scope — cross-reference)

This is Task 4 of `docs/superpowers/plans/2026-09-21-so-movil-activate-contract-gap-remediation.md`, now unblocked once Tasks 1-6 above are done. Do not execute it as part of this plan's own completion — return to that plan's Task 4 and use `update_flow_steps` there instead of the manual masros-gui checklist.
