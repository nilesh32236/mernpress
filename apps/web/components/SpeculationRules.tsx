import type { SpeculationMode, SpeculationVitalsEntry } from '@mernpress/contracts';
import { speculationFor } from '@/lib/speculation';

/**
 * Browser speculation rules (ADR 0060). Rendered only on the public site:
 * Next already prefetches, and prerender stays gated by field data.
 */
export default function SpeculationRules({
  mode,
  vitals,
}: {
  mode: SpeculationMode | string | null | undefined;
  vitals?: readonly SpeculationVitalsEntry[];
}) {
  const found = speculationFor(mode, vitals ?? []);
  if (!found) return null;
  return <script type="speculationrules" dangerouslySetInnerHTML={{ __html: found.json }} />;
}
