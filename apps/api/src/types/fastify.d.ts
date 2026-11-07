import type {
  AnalyticsService,
  ApplicationPasswordService,
  ConsentService,
  AuthService,
  AutosaveService,
  ExportService,
  LinkCheckService,
  RedirectService,
  BackupService,
  BulkService,
  ContentService,
  HookRegistry,
  MailService,
  PasswordResetService,
  TwoFactorService,
  MediaService,
  NoteService,
  ScheduleService,
  TaxonomyService,
  UserAdminService,
} from '@mernpress/cms-core';
import type { DatabaseClient } from '@mernpress/database';

declare module 'fastify' {
  interface FastifyInstance {
    database: DatabaseClient;
    auth: AuthService;
    appPasswords: ApplicationPasswordService;
    mail: MailService;
    passwordResets: PasswordResetService;
    twoFactor: TwoFactorService;
    content: ContentService;
    taxonomy: TaxonomyService;
    contentHooks: HookRegistry;
    users: UserAdminService;
    schedule: ScheduleService;
    bulk: BulkService;
    media: MediaService;
    notes: NoteService;
    exports: ExportService;
    redirects: RedirectService;
    linkChecks: LinkCheckService;
    backups: BackupService;
    autosave: AutosaveService;
    analytics: AnalyticsService;
    consent: ConsentService;
  }
}
