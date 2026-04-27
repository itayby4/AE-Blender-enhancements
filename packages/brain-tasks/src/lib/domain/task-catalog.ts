import type { TaskType, TaskTypeMetadata } from '@pipefx/brain-contracts';

const TASK_TYPES: TaskTypeMetadata[] = [
  {
    type: 'local_agent',
    label: 'Local agent',
    whenToUse:
      'Scoped sub-agent that runs in this process. Use for research, scouting a project/comp structure, or any focused subtask whose result should return as a summary (not pollute the parent context).',
    allowedTools: 'inherit',
  },
  {
    type: 'local_workflow',
    label: 'Local workflow',
    whenToUse:
      'Deterministic local pipeline (subtitle generation, batch export, macro sequence). No model-in-the-loop.',
    allowedTools: [],
  },
  {
    type: 'monitor_mcp',
    label: 'MCP monitor',
    whenToUse:
      'Long-running watcher on a connector (e.g. poll render queue status). Emits events until stopped.',
    allowedTools: 'inherit',
  },
  {
    type: 'remote_agent',
    label: 'Remote agent',
    whenToUse:
      'Agent that runs on a remote host. Reserved — not yet wired in PipeFX.',
    allowedTools: 'inherit',
  },
  {
    type: 'in_process_teammate',
    label: 'In-process teammate',
    whenToUse:
      'Persistent specialist agent sharing this session. Reserved — not yet wired.',
    allowedTools: 'inherit',
  },
  {
    type: 'local_bash',
    label: 'Local bash',
    whenToUse:
      'Shell command task. Reserved — PipeFX does not expose a bash tool today.',
    allowedTools: [],
  },
  {
    type: 'dream',
    label: 'Dream (speculative)',
    whenToUse:
      'Low-priority speculative/background exploration. Reserved — not yet wired.',
    allowedTools: 'inherit',
  },
];

export function getAllTaskTypes(): TaskTypeMetadata[] {
  return TASK_TYPES.filter(
    (t) =>
      t.type === 'local_agent' ||
      t.type === 'local_workflow' ||
      t.type === 'monitor_mcp'
  );
}

export function getTaskTypeMetadata(type: TaskType): TaskTypeMetadata | undefined {
  return TASK_TYPES.find((t) => t.type === type);
}
