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

  it('throws on a self-recursive subflow call', () => {
    expect(() => buildWireSteps([{ kind: 'subflow', flowCode: 'MY_FLOW' }, { kind: 'end' }], 'MY_FLOW')).toThrow(/recursive/i);
  });
});
