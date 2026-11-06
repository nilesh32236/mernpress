import type { DatabaseClient } from '@mernpress/database';
import type { Principal } from '../content/types.js';
import type { Paged } from '../content/types.js';

export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface JobDto {
  id: string;
  type: string;
  payload: unknown;
  status: JobStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  scheduledAt: string;
  lockedAt: string | null;
  lockedBy: string | null;
  startedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EnqueueJobInput {
  type: string;
  payload?: Record<string, unknown> | undefined;
  runAt?: Date | undefined;
  maxAttempts?: number | undefined;
  priority?: number | undefined;
}

export interface JobListQuery {
  status?: JobStatus | undefined;
  search?: string | undefined;
  page: number;
  perPage: number;
}

/** A claimed row handed to the worker; `attempts` already includes this run. */
export interface ClaimedJob {
  id: string;
  type: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
}

export type JobHandler = (payload: unknown) => Promise<void>;

export interface JobQueueServiceOptions {
  prisma: DatabaseClient;
  now?: (() => Date) | undefined;
  logger?: ((message: string, meta?: Record<string, unknown>) => void) | undefined;
}

export interface JobQueueService {
  enqueue(input: EnqueueJobInput): Promise<JobDto>;
  get(principal: Principal, id: string): Promise<JobDto>;
  list(principal: Principal, query: JobListQuery): Promise<Paged<JobDto>>;
  reschedule(principal: Principal, id: string): Promise<JobDto>;
  cancel(principal: Principal, id: string): Promise<JobDto>;
  hasActive(type: string): Promise<boolean>;
  claimDue(limit: number, workerId: string): Promise<ClaimedJob[]>;
  complete(id: string): Promise<void>;
  fail(job: ClaimedJob, error: string): Promise<void>;
  recoverStuck(olderThan: Date): Promise<number>;
  /** Delete old COMPLETED/CANCELLED (7d) and FAILED (30d) rows. */
  pruneHistory(completedDays?: number, failedDays?: number): Promise<number>;
}
