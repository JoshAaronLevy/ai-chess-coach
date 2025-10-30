/**
 * Interface for saved game data structure
 * Used for persisting chess games to localStorage
 */
export interface SavedGameData {
  /** Unique identifier for the saved game */
  id: string;
  /** Unix timestamp (milliseconds) when the game was saved */
  timestamp: number;
  /** FEN string representing the current board position */
  fen: string;
  /** Array of moves in Standard Algebraic Notation (SAN) */
  historySan: string[];
  /** Whether the game was played in AI mode */
  isAiMode: boolean;
  /** Total number of moves made in the game */
  moveCount: number;
  /** Current turn ('w' for white, 'b' for black) */
  currentTurn: 'w' | 'b';
  /** Optional metadata for enhanced game management */
  metadata?: SavedGameMetadata;
}

/**
 * Optional metadata for saved games
 * Provides additional context and organization features
 */
export interface SavedGameMetadata {
  /** User-provided title for the game */
  title?: string;
  /** User-provided description or notes */
  description?: string;
  /** Tags for categorization (e.g., 'opening-practice', 'endgame') */
  tags?: string[];
  /** Whether this game is marked as a favorite */
  isFavorite?: boolean;
  /** User notes about specific positions or moves */
  notes?: string;
  /** Last modified timestamp (for tracking edits to metadata) */
  lastModified?: number;
}

/**
 * Result of a save operation
 */
export interface SaveResult {
  /** Whether the save was successful */
  success: boolean;
  /** Storage key used for the saved game (if successful) */
  key?: string;
  /** Error message (if failed) */
  error?: string;
}

/**
 * Result of a load operation
 */
export interface LoadResult {
  /** Whether the load was successful */
  success: boolean;
  /** Loaded game data (if successful) */
  data?: SavedGameData;
  /** Error message (if failed) */
  error?: string;
}

/**
 * Current game state for comparison/serialization
 */
export interface CurrentGameState {
  /** Current FEN position */
  fen: string;
  /** Current move history in SAN notation */
  historySan: string[];
  /** Whether currently in AI mode */
  isAiMode: boolean;
}

/**
 * Storage usage statistics
 */
export interface StorageStats {
  /** Total localStorage usage in bytes */
  totalUsed: number;
  /** Usage by saved games in bytes */
  gamesUsed: number;
  /** Number of saved games */
  gameCount: number;
  /** Estimated available space in bytes (if detectable) */
  availableSpace?: number;
  /** Whether approaching quota limit (>80% used) */
  nearQuota: boolean;
  /** Largest saved game size in bytes */
  largestGameSize: number;
}

/**
 * Result of an export operation
 */
export interface ExportResult {
  /** Whether the export was successful */
  success: boolean;
  /** Exported data as JSON string (if successful) */
  data?: string;
  /** Filename suggestion for download */
  filename?: string;
  /** Error message (if failed) */
  error?: string;
}

/**
 * Result of an import operation
 */
export interface ImportResult {
  /** Whether the import was successful */
  success: boolean;
  /** Number of games imported */
  imported?: number;
  /** Games that failed to import */
  failed?: Array<{ id: string; error: string }>;
  /** Error message (if failed) */
  error?: string;
}

/**
 * Options for saving a game
 */
export interface SaveOptions {
  /** Optional metadata to attach to the save */
  metadata?: SavedGameMetadata;
  /** Whether to overwrite existing save with same ID */
  overwrite?: boolean;
  /** Whether to skip validation checks (use with caution) */
  skipValidation?: boolean;
}

/**
 * Options for cleanup operations
 */
export interface CleanupOptions {
  /** Maximum number of saves to keep (oldest deleted first) */
  maxSaves?: number;
  /** Delete saves older than this many days */
  olderThanDays?: number;
  /** Whether to preserve favorites during cleanup */
  preserveFavorites?: boolean;
  /** Dry run mode - return what would be deleted without deleting */
  dryRun?: boolean;
}

/**
 * Result of a cleanup operation
 */
export interface CleanupResult {
  /** Whether the cleanup was successful */
  success: boolean;
  /** Number of saves deleted */
  deleted: number;
  /** Space freed in bytes */
  spaceFreed: number;
  /** IDs of deleted saves */
  deletedIds?: string[];
  /** Error message (if failed) */
  error?: string;
}
