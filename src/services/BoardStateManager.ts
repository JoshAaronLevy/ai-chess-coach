import { Chess } from 'chess.js';
import type { SavedGameData, SaveResult, LoadResult, CurrentGameState } from '../types/persistence';

/**
 * BoardStateManager - Service for managing chess game persistence
 * 
 * Handles serialization, deserialization, validation, and storage of chess game states.
 * Uses localStorage as the default storage mechanism with the key prefix 'acc_saved_game_'.
 * 
 * This service is stateless and has no React dependencies, making it easy to test
 * and potentially swap storage backends in the future.
 */
export class BoardStateManager {
  private static readonly STORAGE_KEY_PREFIX = 'acc_saved_game_';

  /**
   * Save a chess game state to localStorage
   * 
   * @param fen - Current FEN position
   * @param historySan - Move history in SAN notation
   * @param isAiMode - Whether the game is in AI mode
   * @returns SaveResult with success status and storage key or error message
   */
  static saveGame(
    fen: string,
    historySan: string[],
    isAiMode: boolean
  ): SaveResult {
    try {
      if (historySan.length === 0) {
        return {
          success: false,
          error: 'Cannot save game with no moves'
        };
      }

      const timestamp = Date.now();
      const game = new Chess(fen);
      
      const savedGameData: SavedGameData = {
        id: `saved_game_${timestamp}`,
        timestamp,
        fen,
        historySan: [...historySan],
        isAiMode,
        moveCount: historySan.length,
        currentTurn: game.turn()
      };

      const storageKey = `${this.STORAGE_KEY_PREFIX}${timestamp}`;
      localStorage.setItem(storageKey, JSON.stringify(savedGameData));
      
      console.log('[BoardStateManager] Game saved successfully:', { 
        key: storageKey, 
        moveCount: savedGameData.moveCount 
      });
      
      return {
        success: true,
        key: storageKey
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[BoardStateManager] Failed to save game:', errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Load the most recent saved game from localStorage
   * 
   * @returns LoadResult with success status and game data or error message
   */
  static loadMostRecentGame(): LoadResult {
    try {
      console.log('[BoardStateManager] Starting load process...');
      
      const allSavedGames = this.getAllSavedGames();

      if (allSavedGames.length === 0) {
        return {
          success: false,
          error: 'No saved games found'
        };
      }

      // Find the most recent saved game (highest timestamp)
      const mostRecentSave = allSavedGames.sort((a, b) => b.timestamp - a.timestamp)[0];
      console.log('[BoardStateManager] Loading most recent save:', mostRecentSave.id);

      // Validate the saved game data
      const validationResult = this.validateSavedGame(mostRecentSave);
      if (!validationResult.success) {
        return {
          success: false,
          error: validationResult.error
        };
      }

      console.log('[BoardStateManager] Game loaded successfully:', {
        id: mostRecentSave.id,
        moveCount: mostRecentSave.historySan.length,
        isAiMode: mostRecentSave.isAiMode,
        currentTurn: mostRecentSave.currentTurn
      });

      return {
        success: true,
        data: mostRecentSave
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[BoardStateManager] Failed to load saved game:', errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Get all saved games from localStorage
   * 
   * @returns Array of SavedGameData, sorted by timestamp (newest first)
   */
  static getAllSavedGames(): SavedGameData[] {
    const allSavedGames: SavedGameData[] = [];
    
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.STORAGE_KEY_PREFIX)) {
          try {
            const data = JSON.parse(localStorage.getItem(key) || '{}');
            if (data.timestamp && data.fen && data.historySan) {
              allSavedGames.push(data);
            }
          } catch (parseError) {
            console.warn('[BoardStateManager] Skipping corrupted save data:', key, parseError);
          }
        }
      }
    } catch (error) {
      console.error('[BoardStateManager] Error reading from localStorage:', error);
    }

    return allSavedGames.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Check if any saved games exist in localStorage
   * 
   * @returns True if at least one valid saved game exists
   */
  static hasSavedGames(): boolean {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.STORAGE_KEY_PREFIX)) {
          try {
            const data = JSON.parse(localStorage.getItem(key) || '{}');
            // Check for required fields to ensure it's a valid save
            if (data.timestamp && data.fen && data.historySan) {
              return true;
            }
          } catch {
            // Skip invalid entries
            continue;
          }
        }
      }
      return false;
    } catch (error) {
      console.error('[BoardStateManager] Error checking for saved games:', error);
      return false;
    }
  }

  /**
   * Compare current game state with the most recent saved state
   * 
   * @param currentState - Current game state to compare
   * @returns True if current state differs from most recent save, false if identical
   */
  static isStateDifferent(currentState: CurrentGameState): boolean {
    try {
      const allSavedGames = this.getAllSavedGames();

      if (allSavedGames.length === 0) {
        // No saved games, so current state is always different
        return true;
      }

      // Get the most recent saved game
      const mostRecentSave = allSavedGames[0]; // Already sorted by timestamp desc

      // Compare current state with saved state
      const isDifferent = (
        currentState.fen !== mostRecentSave.fen ||
        currentState.historySan.length !== mostRecentSave.historySan.length ||
        currentState.isAiMode !== mostRecentSave.isAiMode ||
        !currentState.historySan.every((move, index) => move === mostRecentSave.historySan[index])
      );

      return isDifferent;
    } catch (error) {
      console.error('[BoardStateManager] Error checking state difference:', error);
      // On error, assume state is different
      return true;
    }
  }

  /**
   * Validate a saved game data structure
   * 
   * Performs comprehensive validation including:
   * - Data structure validation
   * - FEN validation
   * - Move history replay validation
   * - FEN/history consistency check
   * 
   * @param savedGame - Saved game data to validate
   * @returns Object with success status and optional error message
   */
  static validateSavedGame(savedGame: SavedGameData): { success: boolean; error?: string } {
    try {
      // Validate data structure
      if (!savedGame.fen || !Array.isArray(savedGame.historySan)) {
        return {
          success: false,
          error: 'Invalid saved game data structure'
        };
      }

      // Create a new chess instance to validate the saved state
      const testGame = new Chess();
      
      try {
        // Load the FEN position to validate it
        testGame.load(savedGame.fen);
      } catch (fenError) {
        return {
          success: false,
          error: `Invalid FEN: ${fenError instanceof Error ? fenError.message : 'Unknown error'}`
        };
      }
      
      // Validate move history by replaying it
      const replayGame = new Chess();
      for (const move of savedGame.historySan) {
        const moveResult = replayGame.move(move);
        if (!moveResult) {
          return {
            success: false,
            error: `Invalid move in history: ${move}`
          };
        }
      }
      
      // Verify the replayed game matches the saved FEN
      if (replayGame.fen() !== savedGame.fen) {
        return {
          success: false,
          error: 'Move history does not match saved FEN'
        };
      }

      return { success: true };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Validation error: ${errorMessage}`
      };
    }
  }

  /**
   * Delete a specific saved game by storage key
   * 
   * @param key - The localStorage key of the game to delete
   * @returns True if successfully deleted, false otherwise
   */
  static deleteSavedGame(key: string): boolean {
    try {
      if (key.startsWith(this.STORAGE_KEY_PREFIX)) {
        localStorage.removeItem(key);
        console.log('[BoardStateManager] Deleted saved game:', key);
        return true;
      }
      return false;
    } catch (error) {
      console.error('[BoardStateManager] Error deleting saved game:', error);
      return false;
    }
  }

  /**
   * Delete all saved games from localStorage
   * 
   * @returns Number of games deleted
   */
  static deleteAllSavedGames(): number {
    try {
      const keysToDelete: string[] = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.STORAGE_KEY_PREFIX)) {
          keysToDelete.push(key);
        }
      }

      keysToDelete.forEach(key => localStorage.removeItem(key));
      
      console.log('[BoardStateManager] Deleted all saved games:', keysToDelete.length);
      return keysToDelete.length;
    } catch (error) {
      console.error('[BoardStateManager] Error deleting all saved games:', error);
      return 0;
    }
  }
}
