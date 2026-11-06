/** Job type names shared by the scheduler, handlers and tests. */
export const JOB_TYPES = {
  notesRetention: 'notes.retention',
  analyticsRetention: 'analytics.retention',
  jobsCleanup: 'jobs.cleanup',
} as const;

export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];
