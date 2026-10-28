import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NavigationGuardProvider, useUnsavedChanges } from './navigation-guard.js';

function DirtyEditor() {
  useUnsavedChanges(true, 'You have unsaved changes. Leave this page without saving?');
  return <p>dirty editor</p>;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('unsaved navigation guard', () => {
  it('cancels browser Back by moving forward and prompting once', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const forward = vi.spyOn(window.history, 'forward').mockImplementation(() => undefined);

    render(
      <NavigationGuardProvider>
        <DirtyEditor />
      </NavigationGuardProvider>,
    );

    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(confirm).toHaveBeenCalledWith(
      'You have unsaved changes. Leave this page without saving?',
    );
    expect(forward).toHaveBeenCalledTimes(1);

    // The forward navigation we initiated also emits popstate; it must not
    // prompt again or trigger another forward.
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(forward).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('allows browser Back after confirmation', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const forward = vi.spyOn(window.history, 'forward').mockImplementation(() => undefined);

    render(
      <NavigationGuardProvider>
        <DirtyEditor />
      </NavigationGuardProvider>,
    );

    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(forward).not.toHaveBeenCalled();
  });
});
