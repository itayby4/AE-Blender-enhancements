import type { TaskId, TaskStatus, Step, PlanRef, SubAgentHandle } from './types.js';

// ── Task lifecycle events ─────────────────────────────────────────────────

export interface BrainTaskStartedEvent {
  type: 'brain.task.started';
  taskId: TaskId;
  sessionId: string;
  description: string;
  timestamp: number;
}

export interface BrainTaskStepEvent {
  type: 'brain.task.step';
  taskId: TaskId;
  sessionId: string;
  step: Step;
  timestamp: number;
}

export interface BrainTaskFinishedEvent {
  type: 'brain.task.finished';
  taskId: TaskId;
  sessionId: string;
  status: TaskStatus;
  durationMs: number;
  timestamp: number;
}

// ── Plan lifecycle events ─────────────────────────────────────────────────

export interface BrainPlanRequestedEvent {
  type: 'brain.plan.requested';
  planRef: PlanRef;
  sessionId: string;
  taskId: TaskId;
  planText: string;
  timestamp: number;
}

export interface BrainPlanApprovedEvent {
  type: 'brain.plan.approved';
  planRef: PlanRef;
  sessionId: string;
  taskId: TaskId;
  timestamp: number;
}

export interface BrainPlanRejectedEvent {
  type: 'brain.plan.rejected';
  planRef: PlanRef;
  sessionId: string;
  taskId: TaskId;
  feedback?: string;
  timestamp: number;
}

// ── Sub-agent lifecycle events ────────────────────────────────────────────

export interface BrainSubAgentForkedEvent {
  type: 'brain.subagent.forked';
  handle: SubAgentHandle;
  parentTaskId: TaskId;
  timestamp: number;
}

export interface BrainSubAgentResumedEvent {
  type: 'brain.subagent.resumed';
  handle: SubAgentHandle;
  timestamp: number;
}

export interface BrainSubAgentCompletedEvent {
  type: 'brain.subagent.completed';
  handle: SubAgentHandle;
  status: 'completed' | 'failed' | 'killed';
  timestamp: number;
}

// ── Union ─────────────────────────────────────────────────────────────────

export type BrainTaskEvent =
  | BrainTaskStartedEvent
  | BrainTaskStepEvent
  | BrainTaskFinishedEvent;

export type BrainPlanEvent =
  | BrainPlanRequestedEvent
  | BrainPlanApprovedEvent
  | BrainPlanRejectedEvent;

export type BrainSubAgentEvent =
  | BrainSubAgentForkedEvent
  | BrainSubAgentResumedEvent
  | BrainSubAgentCompletedEvent;

export type BrainEvent = BrainTaskEvent | BrainPlanEvent | BrainSubAgentEvent;
