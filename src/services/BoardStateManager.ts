import { logger } from '../utils/logger';
import { createQuotaExceededError } from '../utils/errors';

export interface SavedGame {
  id: string;
  timestamp: number;
  fen: string;
  historySan: string[];
  isAiMode: boolean;
}

export class BoardStateManager {
  private static readonly STORAGE_KEY_PREFIX = 'acc_saved_game_';

  static saveGame(data: SavedGame): boolean {
    try {
      const storageKey = `${this.STORAGE_KEY_PREFIX}${data.timestamp}`;
      localStorage.setItem(storageKey, JSON.stringify(data));
      logger.info('[BoardStateManager] Game saved:', storageKey);
      return true;
    } catch (error) {
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        const quotaError = createQuotaExceededError('save');
        logger.error('[BoardStateManager]', quotaError.message);
      } else {
        logger.error('[BoardStateManager] Save failed:', error);
      }
      return false;
    }
  }

  static loadMostRecentGame(): SavedGame | null {
    try {
      const games = this.getAllGames();
      if (games.length === 0) {
        return null;
      }
      
      return games.sort((a, b) => b.timestamp - a.timestamp)[0];
    } catch (error) {
      logger.error('[BoardStateManager] Load failed:', error);
      return null;
    }
  }

  static getAllGames(): SavedGame[] {
    const games: SavedGame[] = [];
    
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.STORAGE_KEY_PREFIX)) {
          try {
            const data = JSON.parse(localStorage.getItem(key) || '{}');
            if (data.timestamp && data.fen && data.historySan) {
              games.push(data);
            }
          } catch {
            logger.warn('[BoardStateManager] Skipping corrupted save:', key);
          }
        }
      }
    } catch (error) {
      logger.error('[BoardStateManager] Error reading localStorage:', error);
    }

    return games.sort((a, b) => b.timestamp - a.timestamp);
  }

  static hasSavedGames(): boolean {
    return this.getAllGames().length > 0;
  }

  static isStateDifferent(
    currentFen: string,
    currentHistory: string[],
    currentIsAiMode: boolean
  ): boolean {
    const mostRecent = this.loadMostRecentGame();
    if (!mostRecent) {
      return true;
    }

    return (
      currentFen !== mostRecent.fen ||
      currentHistory.length !== mostRecent.historySan.length ||
      currentIsAiMode !== mostRecent.isAiMode ||
      !currentHistory.every((move, i) => move === mostRecent.historySan[i])
    );
  }

  static deleteGame(timestamp: number): boolean {
    try {
      const key = `${this.STORAGE_KEY_PREFIX}${timestamp}`;
      if (localStorage.getItem(key)) {
        localStorage.removeItem(key);
        logger.info('[BoardStateManager] Deleted game:', key);
        return true;
      }
      return false;
    } catch (error) {
      logger.error('[BoardStateManager] Delete failed:', error);
      return false;
    }
  }

  static deleteAllGames(): number {
    try {
      const keysToDelete: string[] = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.STORAGE_KEY_PREFIX)) {
          keysToDelete.push(key);
        }
      }

      keysToDelete.forEach(key => localStorage.removeItem(key));
      logger.info('[BoardStateManager] Deleted all games:', keysToDelete.length);
      return keysToDelete.length;
    } catch (error) {
      logger.error('[BoardStateManager] Delete all failed:', error);
      return 0;
    }
  }
}
