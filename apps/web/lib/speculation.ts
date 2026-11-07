import {
  speculationRules,
  type SpeculationMode,
  type SpeculationRules,
  type SpeculationVitalsEntry,
} from '@mernpress/contracts';

/**
 * Server-side speculation-rules decision (ADR 0060).
 *
 * Returns the rules document to embed, or null when the feature is off.
 * `prerender` mode without enough field data falls back to prefetch rules.
 */
export function speculationFor(
  mode: SpeculationMode | string | null | undefined,
  vitals: readonly SpeculationVitalsEntry[] = [],
): { rules: SpeculationRules; json: string } | null {
  const rules = speculationRules(mode, vitals);
  if (!rules) return null;
  return { rules, json: JSON.stringify(rules) };
}
