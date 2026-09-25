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
