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
