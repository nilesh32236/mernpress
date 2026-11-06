/** Job type names shared by the scheduler, handlers and tests. */
export const JOB_TYPES = {
  notesRetention: 'notes.retention',
  analyticsRetention: 'analytics.retention',
  jobsCleanup: 'jobs.cleanup',
  backupCreate: 'backup.create',
  mediaRegenerate: 'media.regenerate',
  mailSend: 'mail.send',
} as const;

export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];
