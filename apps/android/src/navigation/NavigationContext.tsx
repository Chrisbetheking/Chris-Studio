import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { ScreenName } from './routeRegistry';

interface NavigationState {
  currentScreen: ScreenName;
  previousScreen: ScreenName | null;
}

interface NavigationContextValue extends NavigationState {
  navigate: (screen: ScreenName) => void;
  goBack: () => void;
}

const NavigationCtx = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<NavigationState>({
    currentScreen: 'Home',
    previousScreen: null,
  });

  const navigate = useCallback((screen: ScreenName) => {
    setState(prev => ({ currentScreen: screen, previousScreen: prev.currentScreen }));
  }, []);

  const goBack = useCallback(() => {
    setState(prev => {
      if (prev.previousScreen) {
        return { currentScreen: prev.previousScreen, previousScreen: null };
      }
      return prev;
    });
  }, []);

  return (
    <NavigationCtx.Provider value={{ ...state, navigate, goBack }}>
      {children}
    </NavigationCtx.Provider>
  );
}

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationCtx);
  if (!ctx) throw new Error('useNavigation must be used within NavigationProvider');
  return ctx;
}