import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SpeculationRules from '../components/SpeculationRules';

const vitals = (samples: number, lcpRating: 'good' | 'poor', inpRating: 'good' | 'poor') => [
  { metric: 'lcp', label: 'LCP', p75: 2000, rating: lcpRating, samples },
  { metric: 'inp', label: 'INP', p75: 200, rating: inpRating, samples },
];

describe('speculation rules', () => {
  it('renders nothing when off', () => {
    expect(
      renderToStaticMarkup(<SpeculationRules mode="off" vitals={vitals(200, 'poor', 'poor')} />),
    ).toBe('');
    expect(renderToStaticMarkup(<SpeculationRules mode={undefined} />)).toBe('');
  });

  it('renders prefetch rules without field data', () => {
    const html = renderToStaticMarkup(<SpeculationRules mode="prefetch" vitals={[]} />);
    expect(html).toContain('type="speculationrules"');
    expect(html).toContain('prefetch');
    expect(html).toContain('moderate');
    expect(html).not.toContain('prerender');
  });

  it('gates prerender until the field-data threshold is met', () => {
    const thin = renderToStaticMarkup(
      <SpeculationRules mode="prerender" vitals={vitals(2, 'poor', 'poor')} />,
    );
    expect(thin).toContain('prefetch');
    expect(thin).not.toContain('prerender');

    const ready = renderToStaticMarkup(
      <SpeculationRules mode="prerender" vitals={vitals(150, 'poor', 'good')} />,
    );
    expect(ready).toContain('prerender');
    expect(ready).toContain('/posts/');
    expect(ready).toContain('conservative');
    expect(ready).not.toContain('prefetch');
  });
});
