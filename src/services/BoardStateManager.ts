import { Chess } from 'chess.js';
import type { 
  SavedGameData,
  SavedGameMetadata,
  SaveResult, 
  LoadResult, 
  CurrentGameState,
  StorageStats,
  ExportResult,
  ImportResult,
  SaveOptions,
  CleanupOptions,
  CleanupResult
} from '../types/persistence';
import { 
  ErrorCode, 
  AppError,
  createQuotaExceededError, 
  createStorageUnavailableError,
  createValidationError 
} from '../utils/errors';

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
   * @param options - Optional save options including metadata
   * @returns SaveResult with success status and storage key or error message
   */
  static saveGame(
    fen: string,
    historySan: string[],
    isAiMode: boolean,
    options?: SaveOptions
  ): SaveResult {
    try {
      if (historySan.length === 0) {
        const validationError = createValidationError(
          'Cannot save game with no moves',
          'historySan',
          historySan
        );
        return {
          success: false,
          error: validationError.message
        };
      }

      // Check storage quota before saving
      const stats = this.getStorageStats();
      if (stats.nearQuota) {
        console.warn('[BoardStateManager] Storage quota warning: near limit');
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
        currentTurn: game.turn(),
        metadata: options?.metadata
      };

      // Validate unless explicitly skipped
      if (!options?.skipValidation) {
        const validation = this.validateSavedGame(savedGameData);
        if (!validation.success) {
          const validationError = createValidationError(
            validation.error || 'Validation failed',
            'savedGameData'
          );
          return {
            success: false,
            error: validationError.message
          };
        }
      }

      const storageKey = `${this.STORAGE_KEY_PREFIX}${timestamp}`;
      
      try {
        localStorage.setItem(storageKey, JSON.stringify(savedGameData));
      } catch (storageError) {
        // Handle quota exceeded error
        if (storageError instanceof Error && storageError.name === 'QuotaExceededError') {
          const quotaError = createQuotaExceededError('save');
          return {
            success: false,
            error: quotaError.message
          };
        }
        throw storageError;
      }
      
      console.log('[BoardStateManager] Game saved successfully:', { 
        key: storageKey, 
        moveCount: savedGameData.moveCount,
        hasMetadata: !!savedGameData.metadata
      });
      
      return {
        success: true,
        key: storageKey
      };
    } catch (error) {
      const persistenceError = new AppError(
        error instanceof Error ? error.message : 'Failed to save game',
        ErrorCode.STORAGE_ERROR
      );
      console.error('[BoardStateManager] Failed to save game:', persistenceError.message);
      return {
        success: false,
        error: persistenceError.message
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
        const notFoundError = new AppError(
          'No saved games found',
          ErrorCode.STORAGE_ERROR
        );
        return {
          success: false,
          error: notFoundError.message
        };
      }

      // Find the most recent saved game (highest timestamp)
      const mostRecentSave = allSavedGames.sort((a, b) => b.timestamp - a.timestamp)[0];
      console.log('[BoardStateManager] Loading most recent save:', mostRecentSave.id);

      // Validate the saved game data
      const validationResult = this.validateSavedGame(mostRecentSave);
      if (!validationResult.success) {
        const corruptedError = new AppError(
          validationResult.error || 'Corrupted game data',
          ErrorCode.STORAGE_ERROR
        );
        return {
          success: false,
          error: corruptedError.message
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
      const loadError = new AppError(
        error instanceof Error ? error.message : 'Failed to load saved game',
        ErrorCode.STORAGE_ERROR
      );
      console.error('[BoardStateManager] Failed to load saved game:', loadError.message);
      return {
        success: false,
        error: loadError.message
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

  /**
   * Get storage usage statistics
   * 
   * @returns StorageStats object with detailed usage information
   */
  static getStorageStats(): StorageStats {
    try {
      let totalUsed = 0;
      let gamesUsed = 0;
      let gameCount = 0;
      let largestGameSize = 0;

      // Calculate total localStorage usage
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const value = localStorage.getItem(key) || '';
          const size = new Blob([value]).size;
          totalUsed += size;

          if (key.startsWith(this.STORAGE_KEY_PREFIX)) {
            gamesUsed += size;
            gameCount++;
            if (size > largestGameSize) {
              largestGameSize = size;
            }
          }
        }
      }

      // Estimate available space (typical limit is 5-10MB, we use 5MB as conservative estimate)
      const estimatedQuota = 5 * 1024 * 1024; // 5MB in bytes
      const availableSpace = Math.max(0, estimatedQuota - totalUsed);
      const nearQuota = totalUsed / estimatedQuota > 0.8; // >80% used

      return {
        totalUsed,
        gamesUsed,
        gameCount,
        availableSpace,
        nearQuota,
        largestGameSize
      };
    } catch (error) {
      console.error('[BoardStateManager] Error calculating storage stats:', error);
      return {
        totalUsed: 0,
        gamesUsed: 0,
        gameCount: 0,
        nearQuota: false,
        largestGameSize: 0
      };
    }
  }

  /**
   * Export a saved game to JSON string
   * 
   * @param gameId - ID of the game to export
   * @returns ExportResult with JSON data and filename
   */
  static exportGame(gameId: string): ExportResult {
    try {
      const allGames = this.getAllSavedGames();
      const game = allGames.find(g => g.id === gameId);

      if (!game) {
        return {
          success: false,
          error: `Game with ID ${gameId} not found`
        };
      }

      const data = JSON.stringify(game, null, 2);
      const timestamp = new Date(game.timestamp).toISOString().split('T')[0];
      const filename = `chess-game-${timestamp}-${game.moveCount}moves.json`;

      return {
        success: true,
        data,
        filename
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Export all saved games to JSON string
   * 
   * @returns ExportResult with JSON array of all games
   */
  static exportAllGames(): ExportResult {
    try {
      const allGames = this.getAllSavedGames();

      if (allGames.length === 0) {
        return {
          success: false,
          error: 'No saved games to export'
        };
      }

      const data = JSON.stringify(allGames, null, 2);
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `chess-games-export-${timestamp}-${allGames.length}games.json`;

      return {
        success: true,
        data,
        filename
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Import games from JSON string
   * 
   * @param jsonData - JSON string containing game data (single game or array)
   * @param overwriteExisting - Whether to overwrite existing games with same ID
   * @returns ImportResult with count of imported games and any failures
   */
  static importGames(jsonData: string, overwriteExisting = false): ImportResult {
    try {
      const parsed = JSON.parse(jsonData);
      const games: SavedGameData[] = Array.isArray(parsed) ? parsed : [parsed];

      let imported = 0;
      const failed: Array<{ id: string; error: string }> = [];

      for (const game of games) {
        // Validate game data structure
        const validation = this.validateSavedGame(game);
        if (!validation.success) {
          failed.push({ 
            id: game.id || 'unknown', 
            error: validation.error || 'Validation failed' 
          });
          continue;
        }

        // Check if game already exists
        const storageKey = `${this.STORAGE_KEY_PREFIX}${game.timestamp}`;
        const exists = localStorage.getItem(storageKey) !== null;

        if (exists && !overwriteExisting) {
          failed.push({ 
            id: game.id, 
            error: 'Game already exists (use overwriteExisting option)' 
          });
          continue;
        }

        try {
          localStorage.setItem(storageKey, JSON.stringify(game));
          imported++;
        } catch (storageError) {
          failed.push({ 
            id: game.id, 
            error: storageError instanceof Error ? storageError.message : 'Storage error' 
          });
        }
      }

      console.log('[BoardStateManager] Import completed:', { imported, failed: failed.length });

      return {
        success: true,
        imported,
        failed: failed.length > 0 ? failed : undefined
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Import failed: ${errorMessage}`
      };
    }
  }

  /**
   * Cleanup old saved games based on criteria
   * 
   * @param options - Cleanup options (maxSaves, olderThanDays, preserveFavorites, dryRun)
   * @returns CleanupResult with number deleted and space freed
   */
  static cleanupOldGames(options: CleanupOptions = {}): CleanupResult {
    try {
      const { maxSaves, olderThanDays, preserveFavorites = true, dryRun = false } = options;

      const allGames = this.getAllSavedGames();

      // Filter games to keep based on criteria
      const now = Date.now();
      const cutoffDate = olderThanDays ? now - (olderThanDays * 24 * 60 * 60 * 1000) : 0;

      // Separate favorites if preserving them
      const favorites = preserveFavorites 
        ? allGames.filter(g => g.metadata?.isFavorite) 
        : [];
      const nonFavorites = preserveFavorites 
        ? allGames.filter(g => !g.metadata?.isFavorite) 
        : allGames;

      let gamesToDelete: SavedGameData[] = [];

      // Apply age filter
      if (cutoffDate > 0) {
        gamesToDelete = nonFavorites.filter(g => g.timestamp < cutoffDate);
      }

      // Apply max saves limit (keep most recent N)
      if (maxSaves && nonFavorites.length > maxSaves) {
        const sorted = [...nonFavorites].sort((a, b) => b.timestamp - a.timestamp);
        const toKeep = sorted.slice(0, maxSaves);
        const toDelete = nonFavorites.filter(g => !toKeep.includes(g));
        gamesToDelete = [...new Set([...gamesToDelete, ...toDelete])];
      }

      // Calculate space to be freed
      let spaceFreed = 0;
      const deletedIds: string[] = [];

      for (const game of gamesToDelete) {
        const storageKey = `${this.STORAGE_KEY_PREFIX}${game.timestamp}`;
        const existingData = localStorage.getItem(storageKey);
        if (existingData) {
          spaceFreed += new Blob([existingData]).size;
          deletedIds.push(game.id);

          if (!dryRun) {
            localStorage.removeItem(storageKey);
          }
        }
      }

      const deleted = gamesToDelete.length;

      console.log('[BoardStateManager] Cleanup completed:', { 
        deleted, 
        spaceFreed, 
        dryRun,
        preservedFavorites: favorites.length 
      });

      return {
        success: true,
        deleted,
        spaceFreed,
        deletedIds: dryRun ? deletedIds : undefined
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[BoardStateManager] Cleanup failed:', errorMessage);
      return {
        success: false,
        deleted: 0,
        spaceFreed: 0,
        error: errorMessage
      };
    }
  }

  /**
   * Update metadata for a saved game
   * 
   * @param gameId - ID of the game to update
   * @param metadata - Metadata to merge with existing metadata
   * @returns SaveResult indicating success or failure
   */
  static updateGameMetadata(gameId: string, metadata: Partial<SavedGameMetadata>): SaveResult {
    try {
      const allGames = this.getAllSavedGames();
      const game = allGames.find(g => g.id === gameId);

      if (!game) {
        return {
          success: false,
          error: `Game with ID ${gameId} not found`
        };
      }

      // Merge new metadata with existing
      game.metadata = {
        ...game.metadata,
        ...metadata,
        lastModified: Date.now()
      };

      // Save updated game
      const storageKey = `${this.STORAGE_KEY_PREFIX}${game.timestamp}`;
      localStorage.setItem(storageKey, JSON.stringify(game));

      console.log('[BoardStateManager] Metadata updated:', { gameId, metadata });

      return {
        success: true,
        key: storageKey
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Check if localStorage is available and writable
   * 
   * @returns True if localStorage is available, false otherwise
   */
  static isStorageAvailable(): boolean {
    try {
      const testKey = '__storage_test__';
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
      return true;
    } catch {
      const unavailableError = createStorageUnavailableError();
      console.warn('[BoardStateManager]', unavailableError.message);
      return false;
    }
  }
}
