import { describe, expect, it } from 'vitest';
import { buildWireSteps, type StepNode } from '../../src/tools/flowStepTree.js';

describe('buildWireSteps', () => {
  it('numbers a simple linear chain of actions ending in end', () => {
    const steps: StepNode[] = [
      { kind: 'action', actionCode: 'TM_ST', des: 'Start Transaction' },
      { kind: 'action', actionCode: 'MY_VALIDATION' },
      { kind: 'end' },
    ];

    const wire = buildWireSteps(steps, 'MY_FLOW');

    expect(wire).toEqual([
      { stepId: 1, parentStepId: 0, actionCode: 'TM_ST', flowActionDes: 'Start Transaction' },
      { stepId: 2, parentStepId: 1, actionCode: 'MY_VALIDATION' },
      { stepId: 3, parentStepId: 2, actionCode: 'ES' },
    ]);
  });

  it('expands a subflow node into INFLOW + OUTFLOW with the right ymlConfig', () => {
    const steps: StepNode[] = [{ kind: 'subflow', flowCode: 'NOTIFY_FLOW' }, { kind: 'end' }];

    const wire = buildWireSteps(steps, 'MY_FLOW');

    expect(wire).toEqual([
      {
        stepId: 1,
        parentStepId: 0,
        actionCode: 'INFLOW',
        ymlConfig: { MY_FLOW: { FLOW_CODE: 'NOTIFY_FLOW', ENABLE_SWITCH_FLOW: 'false', VALIDATE_SWITCH_FLOW: 'false' } },
      },
      { stepId: 2, parentStepId: 1, actionCode: 'OUTFLOW', ymlConfig: { MY_FLOW: {} } },
      { stepId: 3, parentStepId: 2, actionCode: 'ES' },
    ]);
  });

  it('wires a binary decision with both branches sharing the decision step as parent', () => {
    const steps: StepNode[] = [
      {
        kind: 'decision',
        criteria: "binding.hasVariable('prepaidContract')",
        yes: [{ kind: 'end' }],
        no: [{ kind: 'action', actionCode: 'CSDELSUBSC' }, { kind: 'end' }],
      },
    ];

    const wire = buildWireSteps(steps, 'MY_FLOW');

    expect(wire).toEqual([
      {
        stepId: 1,
        parentStepId: 0,
        actionCode: 'INLINEDEC',
        ymlConfig: { MY_FLOW: { DECISION_CRITERIA: "binding.hasVariable('prepaidContract')" } },
      },
      { stepId: 2, parentStepId: 1, actionCode: 'ES', decision: 'Y' },
      { stepId: 3, parentStepId: 1, actionCode: 'CSDELSUBSC', decision: 'N' },
      { stepId: 4, parentStepId: 3, actionCode: 'ES' },
    ]);
  });

  it('a decision node sets flowActionDes from des, and carries it onto a goto clone of a ref-labeled decision', () => {
    const steps: StepNode[] = [
      { kind: 'action', actionCode: 'PRE' },
      { kind: 'decision', criteria: 'x=="A"', des: 'CS?', ref: 'csDecision', yes: [{ kind: 'end' }], no: [{ kind: 'end' }] },
    ];

    const wire = buildWireSteps(steps, 'MY_FLOW');

    expect(wire[1].flowActionDes).toBe('CS?');

    const gotoSteps: StepNode[] = [
      {
        kind: 'decision',
        criteria: 'y',
        yes: [{ kind: 'action', actionCode: 'PRE' }, { kind: 'decision', criteria: 'x', des: 'IL?', ref: 'il', yes: [{ kind: 'end' }], no: [{ kind: 'end' }] }],
        no: [{ kind: 'goto', ref: 'il' }],
      },
    ];
    const gotoWire = buildWireSteps(gotoSteps, 'MY_FLOW');
    const gotoRow = gotoWire.find((s) => s.decision === 'N' && s.actionCode === 'INLINEDEC');
    expect(gotoRow?.flowActionDes).toBe('IL?');
  });

  it('bypass/syncStep on action and decision nodes map to the underscore-prefixed _bypass/_syncStep wire fields as real booleans', () => {
    // Real wire contract confirmed from ROS's own Java source (FlowProcessor.saveFlowSteps):
    // `Boolean bypass = (Boolean) step.get("_bypass")` — a string here throws ClassCastException
    // (reproduced live against ROS DEV, 2026-09-22).
    const actionWire = buildWireSteps([{ kind: 'action', actionCode: 'TM_ST', bypass: true, syncStep: false }, { kind: 'end' }], 'MY_FLOW');
    expect(actionWire[0]._bypass).toBe(true);
    expect(actionWire[0]._syncStep).toBe(false);

    const decisionWire = buildWireSteps(
      [{ kind: 'decision', criteria: 'x', syncStep: true, yes: [{ kind: 'end' }], no: [{ kind: 'end' }] }],
      'MY_FLOW'
    );
    expect(decisionWire[0]._syncStep).toBe(true);
    expect(decisionWire[0]._bypass).toBeUndefined();
  });

  it('passes ymlConfig through on a plain action node only when provided', () => {
    const withConfig = buildWireSteps([{ kind: 'action', actionCode: 'TM_ST', ymlConfig: { contractPath: 'coCode' } }, { kind: 'end' }], 'MY_FLOW');
    expect(withConfig[0].ymlConfig).toEqual({ MY_FLOW: { contractPath: 'coCode' } });

    const withoutConfig = buildWireSteps([{ kind: 'action', actionCode: 'TM_ST' }, { kind: 'end' }], 'MY_FLOW');
    expect(withoutConfig[0].ymlConfig).toBeUndefined();
  });

  it('throws on an empty steps array', () => {
    expect(() => buildWireSteps([], 'MY_FLOW')).toThrow(/empty/i);
  });

  it('throws when the last step in a branch is not end or a fully-terminated decision', () => {
    expect(() => buildWireSteps([{ kind: 'action', actionCode: 'TM_ST' }], 'MY_FLOW')).toThrow(/must end/i);
    expect(() =>
      buildWireSteps(
        [{ kind: 'decision', criteria: 'true', yes: [{ kind: 'end' }], no: [{ kind: 'action', actionCode: 'X' }] }],
        'MY_FLOW'
      )
    ).toThrow(/must end/i);
  });

  it('throws when an action step follows an "end" step in a plain array', () => {
    expect(() =>
      buildWireSteps([{ kind: 'end' }, { kind: 'action', actionCode: 'A' }, { kind: 'end' }], 'MY_FLOW')
    ).toThrow(/nothing can follow a "end" step/i);
  });

  it('throws when an action step follows a fully-terminated decision step in a plain array', () => {
    expect(() =>
      buildWireSteps(
        [
          { kind: 'decision', criteria: 'x', yes: [{ kind: 'end' }], no: [{ kind: 'end' }] },
          { kind: 'action', actionCode: 'A' },
          { kind: 'end' },
        ],
        'MY_FLOW'
      )
    ).toThrow(/nothing can follow a "decision" step/i);
  });

  it('throws when a ref target is reached as the very first step on both branches of the same decision (would violate ROS_FLOW_STEP\'s (stepId,parentStepId) PK)', () => {
    const steps: StepNode[] = [
      {
        kind: 'decision',
        criteria: 'x=="A"',
        yes: [{ kind: 'action', actionCode: 'SHARED', ref: 'conv' }, { kind: 'end' }],
        no: [{ kind: 'goto', ref: 'conv' }],
      },
    ];

    expect(() => buildWireSteps(steps, 'MY_FLOW')).toThrow(/PK_ROS_FLOW_STEP|unique constraint|converge directly/i);
  });

  it('does NOT throw when the ref target is reached after at least one intervening step on one branch (matches every real convergence in flow 64506)', () => {
    const steps: StepNode[] = [
      {
        kind: 'decision',
        criteria: 'x=="A"',
        yes: [{ kind: 'action', actionCode: 'EXTRA' }, { kind: 'action', actionCode: 'SHARED', ref: 'conv' }, { kind: 'end' }],
        no: [{ kind: 'goto', ref: 'conv' }],
      },
    ];

    expect(() => buildWireSteps(steps, 'MY_FLOW')).not.toThrow();
  });

  it('throws on a self-recursive subflow call', () => {
    expect(() => buildWireSteps([{ kind: 'subflow', flowCode: 'MY_FLOW' }, { kind: 'end' }], 'MY_FLOW')).toThrow(/recursive/i);
  });

  it('expands a multiply-subflow node into INMLTPL + OUTMLTPL with multiplyArrProp and ARRAY/SAVE_PROPERTY_PATH', () => {
    const steps: StepNode[] = [
      { kind: 'multiply-subflow', flowCode: 'CS_UPDATE_OFFER', arrayProperty: 'baseCsOffers', saveProperty: 'csOffer' },
      { kind: 'end' },
    ];

    const wire = buildWireSteps(steps, 'MY_FLOW');

    expect(wire).toEqual([
      {
        stepId: 1,
        parentStepId: 0,
        actionCode: 'INMLTPL',
        multiplyArrProp: 'baseCsOffers',
        ymlConfig: { MY_FLOW: { FLOW_CODE: 'CS_UPDATE_OFFER', ARRAY_PROPERTY_PATH: 'baseCsOffers', SAVE_PROPERTY_PATH: 'csOffer' } },
      },
      { stepId: 2, parentStepId: 1, actionCode: 'OUTMLTPL', ymlConfig: { MY_FLOW: {} } },
      { stepId: 3, parentStepId: 2, actionCode: 'ES' },
    ]);
  });

  it('a multiply-subflow node omits SAVE_PROPERTY_PATH when saveProperty is not given', () => {
    const wire = buildWireSteps([{ kind: 'multiply-subflow', flowCode: 'OTHER', arrayProperty: 'items' }, { kind: 'end' }], 'MY_FLOW');

    expect(wire[0].ymlConfig).toEqual({ MY_FLOW: { FLOW_CODE: 'OTHER', ARRAY_PROPERTY_PATH: 'items' } });
  });

  it('throws on a self-recursive multiply-subflow call', () => {
    expect(() =>
      buildWireSteps([{ kind: 'multiply-subflow', flowCode: 'MY_FLOW', arrayProperty: 'x' }, { kind: 'end' }], 'MY_FLOW')
    ).toThrow(/recursive/i);
  });

  it('a goto to a multiply-subflow ref reconnects to the INMLTPL stepId, carries multiplyArrProp forward, but does NOT resend ymlConfig (regression: ROS_YML duplicate-key bug on flow 64506)', () => {
    const steps: StepNode[] = [
      {
        kind: 'decision',
        criteria: 'x',
        yes: [
          { kind: 'action', actionCode: 'PRE' },
          { kind: 'multiply-subflow', flowCode: 'CS_UPDATE_OFFER', arrayProperty: 'baseCsOffers', ref: 'mult' },
          { kind: 'end' },
        ],
        no: [{ kind: 'goto', ref: 'mult' }],
      },
    ];

    const wire = buildWireSteps(steps, 'MY_FLOW');

    // The real definition alone carries ymlConfig (FLOW_CODE + ARRAY_PROPERTY_PATH).
    expect(wire[2]).toEqual({
      stepId: 3,
      parentStepId: 2,
      actionCode: 'INMLTPL',
      multiplyArrProp: 'baseCsOffers',
      ymlConfig: { MY_FLOW: { FLOW_CODE: 'CS_UPDATE_OFFER', ARRAY_PROPERTY_PATH: 'baseCsOffers' } },
    });
    // The goto clone links the tree (stepId/parentStepId/actionCode/decision) and keeps
    // multiplyArrProp (a plain per-row column, safe to duplicate) but must NOT carry
    // ymlConfig — ROS_YML is keyed by stepId alone, so resending it here would insert a
    // second FLOW_CODE/ARRAY_PROPERTY_PATH row under the same stepId and blow up on read.
    const gotoRow = wire[wire.length - 1];
    expect(gotoRow).toEqual({
      stepId: 3,
      parentStepId: 1,
      actionCode: 'INMLTPL',
      decision: 'N',
      multiplyArrProp: 'baseCsOffers',
    });
    expect(gotoRow).not.toHaveProperty('ymlConfig');
  });

  it('a goto reconnects to an earlier ref-labeled node, cloning its identity into a new row with a new parent, without resending ymlConfig', () => {
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
    // ref-labeled decision "b" (still under Y, parentStepId 2) — this real definition
    // alone carries ymlConfig.DECISION_CRITERIA. stepId 4/5: its own Y/N ends. Then the
    // outer decision's N branch (goto) emits ONE more row: same stepId 3, but
    // parentStepId 1 (the outer decision) instead of 2 — no ymlConfig on this clone.
    expect(wire).toEqual([
      { stepId: 1, parentStepId: 0, actionCode: 'INLINEDEC', ymlConfig: { MY_FLOW: { DECISION_CRITERIA: "binding.hasVariable('a')" } } },
      { stepId: 2, parentStepId: 1, actionCode: 'LONG_PATH', decision: 'Y' },
      { stepId: 3, parentStepId: 2, actionCode: 'INLINEDEC', ymlConfig: { MY_FLOW: { DECISION_CRITERIA: "binding.hasVariable('b')" } } },
      { stepId: 4, parentStepId: 3, actionCode: 'ES', decision: 'Y' },
      { stepId: 5, parentStepId: 3, actionCode: 'ES', decision: 'N' },
      { stepId: 3, parentStepId: 1, actionCode: 'INLINEDEC', decision: 'N' },
    ]);
  });

  it('a goto to a subflow ref reconnects to the INFLOW stepId specifically, not the paired OUTFLOW', () => {
    // The ref'd subflow sits after an intervening action on the "yes" side — reaching
    // it as the immediate first step on BOTH sides (as a naive test would) collides on
    // ROS_FLOW_STEP's (stepId, parentStepId) PK, per assertNoDuplicateRows below.
    const steps: StepNode[] = [
      {
        kind: 'decision',
        criteria: 'x',
        yes: [{ kind: 'action', actionCode: 'PRE' }, { kind: 'subflow', flowCode: 'NOTIFY_FLOW', ref: 'notify' }, { kind: 'end' }],
        no: [{ kind: 'goto', ref: 'notify' }],
      },
    ];

    const wire = buildWireSteps(steps, 'MY_FLOW');

    expect(wire[2]).toEqual({
      stepId: 3,
      parentStepId: 2,
      actionCode: 'INFLOW',
      ymlConfig: { MY_FLOW: { FLOW_CODE: 'NOTIFY_FLOW', ENABLE_SWITCH_FLOW: 'false', VALIDATE_SWITCH_FLOW: 'false' } },
    });
    // the goto row clones stepId 3 (the INFLOW), not stepId 4 (its OUTFLOW) — and must
    // NOT resend FLOW_CODE/ENABLE_SWITCH_FLOW/VALIDATE_SWITCH_FLOW (regression: this
    // exact trio duplicated on flow 64506's goto-cloned SERVICE_ORDERING_PROVISIONING_NOTIF
    // subflow the same way DECISION_CRITERIA did on its "IL?" decision).
    const gotoRow = wire[wire.length - 1];
    expect(gotoRow.stepId).toBe(3);
    expect(gotoRow.actionCode).toBe('INFLOW');
    expect(gotoRow.decision).toBe('N');
    expect(gotoRow).not.toHaveProperty('ymlConfig');
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
        yes: [{ kind: 'action', actionCode: 'PRE' }, { kind: 'end', ref: 'e' }],
        no: [{ kind: 'goto', ref: 'e' }],
      },
    ];
    expect(() => buildWireSteps(steps, 'MY_FLOW')).not.toThrow();
  });

  it('a goto to a ref-labeled action clones flowActionDes onto the goto row', () => {
    const steps: StepNode[] = [
      {
        kind: 'decision',
        criteria: 'x',
        yes: [{ kind: 'action', actionCode: 'PRE' }, { kind: 'action', actionCode: 'A', des: 'My Description', ref: 'x' }, { kind: 'end' }],
        no: [{ kind: 'goto', ref: 'x' }],
      },
    ];

    const wire = buildWireSteps(steps, 'MY_FLOW');

    const gotoRow = wire[wire.length - 1];
    expect(gotoRow.actionCode).toBe('A');
    expect(gotoRow.flowActionDes).toBe('My Description');
  });

  it('multiple gotos to the same ref all omit ymlConfig — only the one real definition ever sends it', () => {
    // Three separate decisions each converge (via their own "no" branch) onto the same
    // ref'd action, which itself carries a non-empty ymlConfig. Regardless of how many
    // goto clones point at it, ROS_YML must only ever receive ONE write for that stepId.
    const steps: StepNode[] = [
      {
        kind: 'decision',
        criteria: 'a',
        yes: [
          {
            kind: 'decision',
            criteria: 'b',
            yes: [
              {
                kind: 'decision',
                criteria: 'c',
                yes: [
                  { kind: 'action', actionCode: 'PRE' },
                  { kind: 'action', actionCode: 'SHARED', ymlConfig: { foo: 'bar' }, ref: 'shared' },
                  { kind: 'end' },
                ],
                no: [{ kind: 'goto', ref: 'shared' }],
              },
            ],
            no: [{ kind: 'goto', ref: 'shared' }],
          },
        ],
        no: [{ kind: 'goto', ref: 'shared' }],
      },
    ];

    const wire = buildWireSteps(steps, 'MY_FLOW');

    const sharedStepId = wire.find((s) => s.actionCode === 'SHARED' && s.ymlConfig !== undefined)!.stepId;
    const rowsForSharedStep = wire.filter((s) => s.stepId === sharedStepId);

    // The real definition plus 3 goto clones = 4 rows sharing the stepId, but exactly
    // one of them (the real definition) carries ymlConfig.
    expect(rowsForSharedStep).toHaveLength(4);
    const rowsWithYmlConfig = rowsForSharedStep.filter((s) => s.ymlConfig !== undefined);
    expect(rowsWithYmlConfig).toHaveLength(1);
    expect(rowsWithYmlConfig[0].ymlConfig).toEqual({ MY_FLOW: { foo: 'bar' } });
  });

  it('invariant: no stepId ever has more than one wire row carrying ymlConfig, across arbitrarily shaped trees (regression guard for the ROS_YML duplicate-key bug)', () => {
    const trees: [string, StepNode[]][] = [
      [
        'decision + goto, decision has ymlConfig via DECISION_CRITERIA',
        [
          {
            kind: 'decision',
            criteria: 'x',
            ref: 'd',
            yes: [{ kind: 'end' }],
            no: [{ kind: 'action', actionCode: 'PRE' }, { kind: 'goto', ref: 'd' }],
          },
        ],
      ],
      [
        'subflow + goto',
        [
          {
            kind: 'decision',
            criteria: 'x',
            yes: [{ kind: 'action', actionCode: 'PRE' }, { kind: 'subflow', flowCode: 'F', ref: 's' }, { kind: 'end' }],
            no: [{ kind: 'goto', ref: 's' }],
          },
        ],
      ],
      [
        'multiply-subflow + goto',
        [
          {
            kind: 'decision',
            criteria: 'x',
            yes: [{ kind: 'action', actionCode: 'PRE' }, { kind: 'multiply-subflow', flowCode: 'F', arrayProperty: 'arr', ref: 'm' }, { kind: 'end' }],
            no: [{ kind: 'goto', ref: 'm' }],
          },
        ],
      ],
      [
        'action with custom ymlConfig + goto',
        [
          {
            kind: 'decision',
            criteria: 'x',
            yes: [{ kind: 'action', actionCode: 'PRE' }, { kind: 'action', actionCode: 'A', ymlConfig: { k: 'v' }, ref: 'a' }, { kind: 'end' }],
            no: [{ kind: 'goto', ref: 'a' }],
          },
        ],
      ],
    ];

    for (const [label, steps] of trees) {
      const wire = buildWireSteps(steps, 'MY_FLOW');
      const countByStepId = new Map<number, number>();
      for (const step of wire) {
        if (step.ymlConfig !== undefined) {
          countByStepId.set(step.stepId, (countByStepId.get(step.stepId) ?? 0) + 1);
        }
      }
      for (const [stepId, count] of countByStepId) {
        expect(count, `${label}: stepId ${stepId} has ${count} rows carrying ymlConfig, expected at most 1`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('round-trips through JSON (as the real MCP wire transport does) without duplicating ymlConfig keys', () => {
    const steps: StepNode[] = [
      {
        kind: 'decision',
        criteria: 'x',
        des: 'Gate',
        ref: 'gate',
        yes: [{ kind: 'action', actionCode: 'PRE' }, { kind: 'end' }],
        no: [{ kind: 'action', actionCode: 'OTHER' }, { kind: 'goto', ref: 'gate' }],
      },
    ];

    const wire = buildWireSteps(steps, 'MY_FLOW');
    const roundTripped = JSON.parse(JSON.stringify(wire));

    expect(roundTripped).toEqual(wire);
    const ymlConfigRows = roundTripped.filter((s: { ymlConfig?: unknown }) => s.ymlConfig !== undefined);
    expect(ymlConfigRows).toHaveLength(1);
  });

  it('two subflow blocks in sequence: only the first OUTFLOW keeps its empty ymlConfig, the second omits it entirely (regression: SK_OPTIMISTIC row multiplication on flow 64506)', () => {
    const steps: StepNode[] = [
      { kind: 'subflow', flowCode: 'FIRST_FLOW' },
      { kind: 'subflow', flowCode: 'SECOND_FLOW' },
      { kind: 'end' },
    ];

    const wire = buildWireSteps(steps, 'MY_FLOW');
    const outflowRows = wire.filter((s) => s.actionCode === 'OUTFLOW');

    expect(outflowRows).toHaveLength(2);
    expect(outflowRows[0].ymlConfig).toEqual({ MY_FLOW: {} });
    expect(outflowRows[1]).not.toHaveProperty('ymlConfig');
    // Structural fields survive the strip — only ymlConfig is removed.
    expect(outflowRows[1].stepId).toBeDefined();
    expect(outflowRows[1].parentStepId).toBeDefined();
    expect(outflowRows[1].actionCode).toBe('OUTFLOW');
  });

  it('mixing subflow and multiply-subflow blocks: at most one wire row across the WHOLE tree carries an empty ymlConfig, regardless of kind or count', () => {
    const steps: StepNode[] = [
      { kind: 'subflow', flowCode: 'FIRST_FLOW' },
      { kind: 'multiply-subflow', flowCode: 'SECOND_FLOW', arrayProperty: 'items' },
      { kind: 'subflow', flowCode: 'THIRD_FLOW' },
      { kind: 'end' },
    ];

    const wire = buildWireSteps(steps, 'MY_FLOW');
    const emptyYmlConfigRows = wire.filter((s) => {
      if (s.ymlConfig === undefined) return false;
      const inner = s.ymlConfig['MY_FLOW'];
      return inner !== undefined && Object.keys(inner).length === 0;
    });

    expect(emptyYmlConfigRows).toHaveLength(1);
    // The real INFLOW/INMLTPL rows (non-empty ymlConfig) are untouched.
    const realConfigRows = wire.filter((s) => s.ymlConfig !== undefined && Object.keys(s.ymlConfig['MY_FLOW'] ?? {}).length > 0);
    expect(realConfigRows).toHaveLength(3);
  });

  it('a tree with no subflow/multiply-subflow blocks never manufactures an empty ymlConfig row', () => {
    const steps: StepNode[] = [{ kind: 'action', actionCode: 'PRE' }, { kind: 'end' }];
    const wire = buildWireSteps(steps, 'MY_FLOW');
    expect(wire.some((s) => s.ymlConfig !== undefined)).toBe(false);
  });

  it('capping the sentinel ymlConfig does not disturb goto/ref resolution downstream of the capped OUTFLOW', () => {
    const steps: StepNode[] = [
      { kind: 'subflow', flowCode: 'FIRST_FLOW' },
      { kind: 'subflow', flowCode: 'SECOND_FLOW', ref: 'second' },
      { kind: 'decision', criteria: 'x', yes: [{ kind: 'end' }], no: [{ kind: 'goto', ref: 'second' }] },
    ];

    const wire = buildWireSteps(steps, 'MY_FLOW');
    const inflowRows = wire.filter((s) => s.actionCode === 'INFLOW');
    expect(inflowRows).toHaveLength(3); // 2 real definitions + 1 goto clone
    const secondInflowStepId = inflowRows[1].stepId;
    const gotoClone = inflowRows[2];
    expect(gotoClone.stepId).toBe(secondInflowStepId);
    expect(gotoClone).not.toHaveProperty('ymlConfig'); // goto clones never resend ymlConfig (prior fix)
  });

  it('throws when the same ref name is used on nodes in two different branches (not just two siblings)', () => {
    const steps: StepNode[] = [
      {
        kind: 'decision',
        criteria: 'x',
        yes: [{ kind: 'end', ref: 'dup' }],
        no: [{ kind: 'end', ref: 'dup' }],
      },
    ];
    expect(() => buildWireSteps(steps, 'MY_FLOW')).toThrow(/defined more than once/i);
  });
});
