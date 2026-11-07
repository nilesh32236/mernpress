/**
 * Isomorphic contracts and URL rules shared by the API, the admin and the
 * public site.
 *
 * Nothing here may import Node built-ins, React or the database: both the
 * Next.js edge middleware and the Fastify process evaluate this module.
 */
export * from './permalink.js';
export * from './admin-colors.js';
export * from './screen-options.js';
export * from './consent.js';
export * from './languages.js';
export * from './theme-strings.js';
export * from './retention.js';

export {
  WEB_VITALS,
  WEB_VITAL_METRICS,
  WEB_VITAL_ORDER,
  formatWebVital,
  histogramP75,
  webVitalBucket,
  webVitalRating,
  type WebVitalDefinition,
  type WebVitalMetric,
  type WebVitalRating,
  type WebVitalTemplate,
  WEB_VITAL_TEMPLATES,
  WEB_VITAL_TEMPLATE_LABELS,
  templateForPath,
} from './web-vitals.js';

export {
  SPECULATION_MIN_SAMPLES,
  shouldPrerender,
  speculationRules,
  type SpeculationMode,
  type SpeculationRules,
  type SpeculationVitalsEntry,
} from './speculation.js';

export { checkExternalUrl, isPublicResolution, type ExternalUrlVerdict } from './external-link.js';
