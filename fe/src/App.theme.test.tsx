/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Feature: kid-friendly-ui-improvements, Task 4.2
// Unit tests for the Theme_Engine behavior wired into App.tsx (task 4.1):
//  - Default theme is 'light' when there is no stored value, and a stored value
//    is restored (validated through resolveInitialTheme).
//  - Toggling the theme persists the choice to localStorage('app_theme'). (Req 3.5)
//  - When persistence throws (storage disabled/full), the app does not crash and
//    keeps running. (Req 3.7)
//
// Requirements: 3.5, 3.7

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import App from './App';
import { resolveInitialTheme } from './lib/ui/presentation';

describe('resolveInitialTheme — default and persistence restore', () => {
  it("defaults to 'light' when no theme has been stored", () => {
    // Req 3.1/3.5: a fresh launch (no stored value) starts in light mode.
    expect(resolveInitialTheme(null)).toBe('light');
    expect(resolveInitialTheme(undefined)).toBe('light');
  });

  it('restores a previously stored theme value', () => {
    // Req 3.2: a stored value is restored instead of using the default.
    expect(resolveInitialTheme('dark')).toBe('dark');
    expect(resolveInitialTheme('light')).toBe('light');
  });
});

describe('App theme — default, persistence, and safe fallback', () => {
  beforeEach(() => {
    localStorage.clear();
    // The app issues network calls in effects on mount; those are out of scope
    // here, so stub fetch to a rejecting promise (App already guards them with
    // try/catch). This keeps the test focused on theme behavior.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network disabled in test'))),
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.body.removeAttribute('data-theme');
  });

  it("initializes with the light theme when nothing is stored (Req 3.5 default)", () => {
    render(<App />);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it("persists the toggled theme to localStorage('app_theme') (Req 3.5)", () => {
    render(<App />);

    // Default theme is light + default lang is 'en' => toggle title is the EN
    // "switch to dark mode" label.
    const toggle = screen.getByTitle('Switch to dark mode');
    fireEvent.click(toggle);

    expect(localStorage.getItem('app_theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('does not crash and keeps running when persisting the theme fails (Req 3.7)', () => {
    const originalSetItem = Storage.prototype.setItem;
    // Only fail for the theme key so unrelated writes keep working.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === 'app_theme') {
        throw new Error('storage disabled');
      }
      return originalSetItem.call(this, key, value);
    });

    render(<App />);
    const toggle = screen.getByTitle('Switch to dark mode');

    // Toggling must not propagate the storage error.
    expect(() => fireEvent.click(toggle)).not.toThrow();

    // The app keeps running: the toggle control is still mounted and the theme
    // engine still applied a theme to the document.
    expect(toggle).toBeInTheDocument();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    // Persistence silently failed, so nothing was stored under the theme key.
    expect(localStorage.getItem('app_theme')).toBeNull();
  });
});
