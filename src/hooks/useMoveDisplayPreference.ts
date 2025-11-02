import { useState, useEffect } from 'react';

/**
 * Hook to manage user preference for move display format.
 * Persists preference to localStorage.
 * 
 * @returns Object with showSymbols state and toggle function
 */
export function useMoveDisplayPreference() {
  const STORAGE_KEY = 'chess-move-display-preference';
  
  // Default to showing symbols (enhanced experience)
  const [showSymbols, setShowSymbols] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored !== null ? JSON.parse(stored) : true;
    } catch {
      return true;
    }
  });
  
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(showSymbols));
    } catch (error) {
      console.warn('Failed to save move display preference:', error);
    }
  }, [showSymbols]);
  
  const toggleSymbols = () => {
    setShowSymbols(prev => !prev);
  };
  
  return {
    showSymbols,
    toggleSymbols,
  };
}
