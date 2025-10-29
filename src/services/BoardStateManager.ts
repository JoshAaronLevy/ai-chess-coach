import { logger } from '../utils/logger';
import { createQuotaExceededError } from '../utils/errors';

/**
 * Simple game data structure for localStorage
 */
export interface SavedGame {
  id: string;
  timestamp: number;
  fen: string;
  historySan: string[];
  isAiMode: boolean;
}

/**
 * BoardStateManager - Simple localStorage wrapper for chess game persistence
 * 
 * Provides basic save/load operations without complex validation or features.
 * Serialization/deserialization is handled by ChessGameEngine.
 */
export class BoardStateManager {
  private static readonly STORAGE_KEY_PREFIX = 'acc_saved_game_';

  /**
   * Save game data to localStorage
   * 
   * @param data - Game data to save
   * @returns True if successful, false otherwise
   */
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

  /**
   * Load the most recent saved game from localStorage
   * 
   * @returns Saved game data, or null if none found
   */
  static loadMostRecentGame(): SavedGame | null {
    try {
      const games = this.getAllGames();
      if (games.length === 0) {
        return null;
      }
      
      // Return most recent (highest timestamp)
      return games.sort((a, b) => b.timestamp - a.timestamp)[0];
    } catch (error) {
      logger.error('[BoardStateManager] Load failed:', error);
      return null;
    }
  }

  /**
   * Get all saved games from localStorage
   * 
   * @returns Array of saved games, sorted by timestamp (newest first)
   */
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
          } catch (parseError) {
            logger.warn('[BoardStateManager] Skipping corrupted save:', key);
          }
        }
      }
    } catch (error) {
      logger.error('[BoardStateManager] Error reading localStorage:', error);
    }

    return games.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Check if any saved games exist
   * 
   * @returns True if at least one saved game exists
   */
  static hasSavedGames(): boolean {
    return this.getAllGames().length > 0;
  }

  /**
   * Check if current game state differs from most recent save
   * 
   * @param currentFen - Current FEN
   * @param currentHistory - Current move history
   * @param currentIsAiMode - Current AI mode
   * @returns True if different from saved state
   */
  static isStateDifferent(
    currentFen: string,
    currentHistory: string[],
    currentIsAiMode: boolean
  ): boolean {
    const mostRecent = this.loadMostRecentGame();
    if (!mostRecent) {
      return true; // No saved game, so always different
    }

    return (
      currentFen !== mostRecent.fen ||
      currentHistory.length !== mostRecent.historySan.length ||
      currentIsAiMode !== mostRecent.isAiMode ||
      !currentHistory.every((move, i) => move === mostRecent.historySan[i])
    );
  }

  /**
   * Delete a specific saved game
   * 
   * @param timestamp - Timestamp of the game to delete
   * @returns True if deleted, false if not found
   */
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

  /**
   * Delete all saved games
   * 
   * @returns Number of games deleted
   */
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
