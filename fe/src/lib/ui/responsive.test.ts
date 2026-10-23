// Feature: responsive-speaking-ui
// Property-based tests for the pure responsive helpers in `responsive.ts`.

import {describe, expect, it} from 'vitest';
import fc from 'fast-check';
import {BREAKPOINTS, classifyBreakpoint, type Layout} from './responsive';

const NUM_RUNS = 25;

describe('classifyBreakpoint', () => {
  // Feature: responsive-speaking-ui, Property 1: Breakpoint classification is a
  // correct total partition of width.
  // Validates: Requirements 2.1, 2.2, 2.3
  it('Property 1: returns exactly one layout with correct boundary mapping for any non-negative width', () => {
    // Generate arbitrary non-negative widths, with extra emphasis on the
    // boundary values 767 / 768 / 1024 / 1025 (and their fractional neighbours).
    const widthArb = fc.oneof(
      // Broad coverage across the full plausible viewport range and beyond.
      fc.double({min: 0, max: 10000, noNaN: true}),
      fc.integer({min: 0, max: 10000}),
      // Boundary-focused values.
      fc.constantFrom(
        0,
        319,
        320,
        766,
        767,
        767.5,
        767.999,
        768,
        768.001,
        769,
        1023,
        1023.999,
        1024,
        1024.001,
        1025,
        1920,
      ),
    );

    fc.assert(
      fc.property(widthArb, (width) => {
        const layout = classifyBreakpoint(width);

        // Exactly one of the three valid layouts is returned.
        const valid: Layout[] = ['mobile', 'tablet', 'desktop'];
        expect(valid).toContain(layout);

        // The classification is a correct total partition of width.
        let expected: Layout;
        if (width < BREAKPOINTS.tablet) {
          expected = 'mobile';
        } else if (width <= BREAKPOINTS.desktop) {
          expected = 'tablet';
        } else {
          expected = 'desktop';
        }
        expect(layout).toBe(expected);
      }),
      {numRuns: NUM_RUNS},
    );
  });

  it('Property 1: honors the exact boundary values 767/768/1024/1025', () => {
    expect(classifyBreakpoint(767)).toBe('mobile');
    expect(classifyBreakpoint(768)).toBe('tablet');
    expect(classifyBreakpoint(1024)).toBe('tablet');
    expect(classifyBreakpoint(1025)).toBe('desktop');
  });
});
