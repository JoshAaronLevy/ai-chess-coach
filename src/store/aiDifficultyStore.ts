import { create } from 'zustand';

export type AiDifficulty = 'beginner' | 'intermediate' | 'advanced';

interface AiDifficultyStore {
  aiAlwaysOn: true;
  difficulty: AiDifficulty;
  showDifficultyModal: boolean;
  setDifficulty: (difficulty: AiDifficulty) => void;
  openDifficultyModal: () => void;
  closeDifficultyModal: () => void;
}

const LOCALSTORAGE_KEY = 'AI_CHESS_COACH_DIFFICULTY';

function readDifficultyFromStorage(): AiDifficulty {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      console.log('[AI Difficulty Store] localStorage unavailable, using default: beginner');
      return 'beginner';
    }
    
    const stored = localStorage.getItem(LOCALSTORAGE_KEY);
    if (!stored) {
      console.log('[AI Difficulty Store] No stored difficulty found, using default: beginner');
      return 'beginner';
    }
    
    const validDifficulties: AiDifficulty[] = ['beginner', 'intermediate', 'advanced'];
    if (validDifficulties.includes(stored as AiDifficulty)) {
      console.log('[AI Difficulty Store] Loaded difficulty from storage:', stored);
      return stored as AiDifficulty;
    }
    
    localStorage.removeItem(LOCALSTORAGE_KEY);
    console.warn('[AI Difficulty Store] Invalid difficulty value found, using default: beginner');
    return 'beginner';
  } catch (error) {
    console.warn('[AI Difficulty Store] Failed to read from localStorage:', error, 'using default: beginner');
    return 'beginner';
  }
}

function writeDifficultyToStorage(difficulty: AiDifficulty): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    
    localStorage.setItem(LOCALSTORAGE_KEY, difficulty);
  } catch (error) {
    console.warn('[AI Difficulty Store] Failed to write to localStorage:', error);
  }
}

export const useAiDifficultyStore = create<AiDifficultyStore>((set) => ({
  aiAlwaysOn: true,
  difficulty: readDifficultyFromStorage(),
  showDifficultyModal: false,
  
  setDifficulty: (difficulty: AiDifficulty) => {
    console.log(`[AI Difficulty] ${difficulty}`);
    writeDifficultyToStorage(difficulty);
    set({ difficulty });
  },
  
  openDifficultyModal: () => {
    set({ showDifficultyModal: true });
  },
  
  closeDifficultyModal: () => {
    set({ showDifficultyModal: false });
  },
}));

// Default export for convenience
export default useAiDifficultyStore;