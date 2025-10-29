/**
 * API Type Definitions
 * 
 * Type definitions for chess coach API requests and responses.
 */

import type { 
  PieceType, 
  MaterialCount, 
  MoveInfo,
  Color as ChessColor 
} from './gameLog';

/**
 * Board state representation for API
 */
export interface BoardStatePayload {
  /** FEN string representing current position */
  fen: string;
  /** Current side to move */
  turn: ChessColor;
  /** Array of pieces on the board */
  pieces: Array<{
    type: PieceType;
    color: ChessColor;
    square: string;
  }>;
  /** Whether the current side is in check */
  inCheck: boolean;
  /** Whether the game is over */
  gameOver: boolean;
  /** Position identifier hash */
  positionId: string;
  /** Move number */
  moveNumber?: number;
  /** Half-move clock (for 50-move rule) */
  halfmoveClock?: string;
  /** Full-move number */
  fullmoveNumber?: string;
  /** Whether position is checkmate */
  checkmate?: boolean;
  /** Whether position is stalemate */
  stalemate?: boolean;
  /** Whether position is a draw */
  draw?: boolean;
  /** Whether position has threefold repetition */
  threefoldRepetition?: boolean;
  /** Whether position has insufficient material */
  insufficientMaterial?: boolean;
  /** Detailed legal moves */
  legalMovesDetailed?: unknown[];
}

/**
 * Move history information
 */
export interface MoveHistory {
  /** Move history in SAN notation */
  san: string[];
  /** Move history in UCI notation */
  uci: string[];
  /** Total number of moves made */
  totalMoves: number;
  /** Current ply (half-move) number */
  currentPly: number;
}

/**
 * Game analysis data
 */
export interface GameAnalysis {
  /** Array of legal moves in SAN notation */
  legalMoves: string[];
  /** Number of legal moves available */
  legalMovesCount: number;
  /** Squares that are under attack */
  attackedSquares: string[];
  /** King positions */
  kingSquares: {
    white?: string;
    black?: string;
  };
}

/**
 * Complete analysis request to the chess coach API
 */
export interface AnalysisRequest {
  /** Current board state */
  boardState: BoardStatePayload;
  /** Last move made (if any) */
  lastMove?: MoveInfo;
  /** Material count for both sides */
  materialCount: MaterialCount;
  /** Captured pieces */
  capturedPieces: MaterialCount;
  /** Move history */
  moveHistory: MoveHistory;
  /** Game analysis data */
  gameAnalysis: GameAnalysis;
}

/**
 * Options for analysis requests
 */
export interface AnalysisOptions {
  /** Custom query to send to the AI */
  query?: string;
  /** User identifier */
  user?: string;
  /** Timeout in milliseconds (overrides default) */
  timeout?: number;
}
