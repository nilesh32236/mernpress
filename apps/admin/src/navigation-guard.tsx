import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

type Guard = () => boolean;

interface NavigationGuardContextValue {
  registerGuard: (guard: Guard | null) => void;
  confirmNavigation: () => boolean;
}

const NavigationGuardContext = createContext<NavigationGuardContextValue | null>(null);

export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const guardRef = useRef<Guard | null>(null);
  const restoringRef = useRef(false);

  const registerGuard = useCallback((guard: Guard | null) => {
    guardRef.current = guard;
  }, []);

  const confirmNavigation = useCallback(() => {
    return guardRef.current ? guardRef.current() : true;
  }, []);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      if (restoringRef.current) {
        restoringRef.current = false;
        return;
      }
      if (!guardRef.current || guardRef.current()) {
        return;
      }
      // Capture phase runs before the router's popstate listener. Stop the
      // route update, then move forward to the editor entry instead of
      // pushing a duplicate history entry. The forward popstate is ignored.
      event.stopImmediatePropagation();
      restoringRef.current = true;
      window.history.forward();
    };
    window.addEventListener('popstate', onPopState, true);
    return () => window.removeEventListener('popstate', onPopState, true);
  }, []);

  const value = useMemo(
    () => ({ registerGuard, confirmNavigation }),
    [confirmNavigation, registerGuard],
  );

  return (
    <NavigationGuardContext.Provider value={value}>{children}</NavigationGuardContext.Provider>
  );
}

export function useNavigationGuard(): NavigationGuardContextValue {
  const value = useContext(NavigationGuardContext);
  if (!value) {
    throw new Error('useNavigationGuard must be used inside NavigationGuardProvider');
  }
  return value;
}

/**
 * Warn before browser-level navigation when `active` is true, and register an
 * in-app guard so header/list links also ask before discarding edits.
 */
export function useUnsavedChanges(active: boolean, message: string): void {
  const { registerGuard } = useNavigationGuard();

  useEffect(() => {
    if (!active) {
      registerGuard(null);
      return;
    }

    const guard = () => window.confirm(message);
    registerGuard(guard);

    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);

    return () => {
      registerGuard(null);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [active, message, registerGuard]);
}
