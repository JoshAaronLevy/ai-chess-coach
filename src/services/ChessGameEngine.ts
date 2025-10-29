/* eslint-disable @typescript-eslint/no-explicit-any */
import { Chess } from 'chess.js';
import type { LegalMoveDetailed, PieceType } from '../types/chess.js';
import { hashPositionId } from '../utils/hash.js';
import { ErrorCode, AppError, createInvalidMoveError, createInvalidFenError } from '../utils/errors';

/**
 * Type for chess piece colors
 */
type ChessColor = 'w' | 'b';

/**
 * Move result from making a move
 */
export interface MoveResult {
  success: boolean;
  move?: any; // chess.js move object
  error?: string;
}

/**
 * Comprehensive game state snapshot
 */
export interface GameState {
  fen: string;
  turn: ChessColor;
  history: string[];
  historyVerbose: any[];
  lastMove?: {
    san: string;
    from: string;
    to: string;
  };
  isGameOver: boolean;
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  isDraw: boolean;
  isThreefoldRepetition: boolean;
  isInsufficientMaterial: boolean;
  gameResult?: string;
  moveNumber: number;
  legalMoves: string[];
  legalMovesDetailed: LegalMoveDetailed[];
  positionId: string;
}

/**
 * ChessGameEngine - Core chess game logic service
 * 
 * Encapsulates all chess.js integration and game logic without React dependencies.
 * Provides a clean API for game operations including move validation, undo/redo,
 * and comprehensive game state management.
 * 
 * This service is stateful (maintains Chess.js instance) but has no React dependencies,
 * making it easy to test and reuse across different contexts.
 */
export class ChessGameEngine {
  private game: Chess;

  constructor(fen?: string) {
    if (fen) {
      this.game = new Chess(fen);
    } else {
      this.game = new Chess();
    }
  }

  /**
   * Make a move on the board
   * 
   * @param move - Move in SAN notation, UCI notation, or move object { from, to, promotion }
   * @returns MoveResult with success status and move details or error
   */
  makeMove(move: string | { from: string; to: string; promotion?: string }): MoveResult {
    try {
      const result = this.game.move(move);
      
      if (result) {
        return {
          success: true,
          move: result
        };
      } else {
        const moveStr = typeof move === 'string' ? move : `${move.from}${move.to}`;
        const invalidMoveError = createInvalidMoveError(moveStr, this.game.fen());
        return {
          success: false,
          error: invalidMoveError.message
        };
      }
    } catch (error) {
      const moveStr = typeof move === 'string' ? move : `${move.from}${move.to}`;
      const gameError = new AppError(
        error instanceof Error ? error.message : 'Invalid move',
        ErrorCode.GAME_ERROR,
        { move: moveStr, fen: this.game.fen() }
      );
      return {
        success: false,
        error: gameError.message
      };
    }
  }

  /**
   * Undo the last move
   * 
   * @returns The move that was undone, or null if no moves to undo
   */
  undo(): any | null {
    return this.game.undo();
  }

  /**
   * Reset the game to the starting position
   */
  reset(): void {
    this.game.reset();
  }

  /**
   * Load a position from FEN string
   * 
   * @param fen - FEN string to load
   * @returns True if successful, false if invalid FEN
   */
  load(fen: string): boolean {
    try {
      this.game.load(fen);
      return true;
    } catch (error) {
      const fenError = createInvalidFenError(
        fen,
        error instanceof Error ? error.message : undefined
      );
      console.error('[ChessGameEngine]', fenError.message);
      return false;
    }
  }

  /**
   * Get the current FEN string
   */
  fen(): string {
    return this.game.fen();
  }

  /**
   * Get the current turn
   */
  turn(): ChessColor {
    return this.game.turn();
  }

  /**
   * Get move history in SAN notation
   */
  history(): string[] {
    return this.game.history();
  }

  /**
   * Get verbose move history
   */
  historyVerbose(): any[] {
    return this.game.history({ verbose: true });
  }

  /**
   * Get legal moves in verbose format
   */
  movesVerbose(): any[] {
    return this.game.moves({ verbose: true });
  }

  /**
   * Check if the game is over
   */
  isGameOver(): boolean {
    return this.game.isGameOver();
  }

  /**
   * Check if the current position is in check
   */
  inCheck(): boolean {
    return this.game.inCheck();
  }

  /**
   * Check if the current position is checkmate
   */
  isCheckmate(): boolean {
    return this.game.isCheckmate();
  }

  /**
   * Check if the current position is stalemate
   */
  isStalemate(): boolean {
    return this.game.isStalemate();
  }

  /**
   * Check if the current position is a draw
   */
  isDraw(): boolean {
    return this.game.isDraw();
  }

  /**
   * Check if the current position is a threefold repetition
   */
  isThreefoldRepetition(): boolean {
    return this.game.isThreefoldRepetition();
  }

  /**
   * Check if the current position has insufficient material
   */
  isInsufficientMaterial(): boolean {
    return this.game.isInsufficientMaterial();
  }

  /**
   * Get the current move number
   */
  moveNumber(): number {
    return this.game.moveNumber();
  }

  /**
   * Get a comprehensive snapshot of the current game state
   * 
   * @returns GameState object with all relevant game information
   */
  getGameState(): GameState {
    const history = this.game.history();
    const historyVerbose = this.game.history({ verbose: true });
    const lastMoveVerbose = historyVerbose.length > 0 
      ? historyVerbose[historyVerbose.length - 1] 
      : null;

    const isOver = this.game.isGameOver();
    let gameResult: string | undefined;

    if (isOver) {
      if (this.game.isCheckmate()) {
        gameResult = this.game.turn() === 'w' ? 'Black wins by checkmate' : 'White wins by checkmate';
      } else if (this.game.isStalemate()) {
        gameResult = 'Draw by stalemate';
      } else if (this.game.isThreefoldRepetition()) {
        gameResult = 'Draw by threefold repetition';
      } else if (this.game.isInsufficientMaterial()) {
        gameResult = 'Draw by insufficient material';
      } else if (this.game.isDraw()) {
        gameResult = 'Draw';
      }
    }

    return {
      fen: this.game.fen(),
      turn: this.game.turn(),
      history,
      historyVerbose,
      lastMove: lastMoveVerbose ? {
        san: lastMoveVerbose.san,
        from: lastMoveVerbose.from,
        to: lastMoveVerbose.to
      } : undefined,
      isGameOver: isOver,
      isCheck: this.game.inCheck(),
      isCheckmate: this.game.isCheckmate(),
      isStalemate: this.game.isStalemate(),
      isDraw: this.game.isDraw(),
      isThreefoldRepetition: this.game.isThreefoldRepetition(),
      isInsufficientMaterial: this.game.isInsufficientMaterial(),
      gameResult,
      moveNumber: this.game.moveNumber(),
      legalMoves: this.game.moves(),
      legalMovesDetailed: ChessGameEngine.computeLegalMovesDetailed(this.game),
      positionId: ChessGameEngine.computePositionId(this.game.fen(), this.game.turn())
    };
  }

  /**
   * Get the underlying Chess.js instance
   * 
   * Use sparingly - prefer using ChessGameEngine methods when possible
   */
  getChessInstance(): Chess {
    return this.game;
  }

  /**
   * Static helper: Compute detailed legal moves with check detection
   * 
   * @param game - Chess.js instance
   * @returns Array of detailed legal moves
   */
  static computeLegalMovesDetailed(game: Chess): LegalMoveDetailed[] {
    const verbose = game.moves({ verbose: true }) as Array<{
      san: string;
      from: string;
      to: string;
      piece: string;
      color: string;
      captured?: string;
      promotion?: string;
      flags: string;
    }>;

    return verbose.map(m => {
      const uci = (m.from && m.to) ? (m.from + m.to + (m.promotion ? m.promotion : '')) : null;

      // Compute givesCheck by applying on a clone
      const clone = new Chess(game.fen());
      clone.move({ from: m.from, to: m.to, promotion: m.promotion });
      const givesCheck = clone.inCheck();

      return {
        san: m.san,
        uci,
        from: m.from,
        to: m.to,
        piece: m.piece as PieceType,
        color: m.color as ChessColor,
        captured: m.captured ? (m.captured as PieceType) : undefined,
        promotion: m.promotion ? (m.promotion as PieceType) : undefined,
        flags: m.flags,
        givesCheck
      };
    });
  }

  /**
   * Static helper: Compute deterministic position ID from FEN and turn
   * 
   * @param fen - FEN string
   * @param turn - Current turn ('w' or 'b')
   * @returns Hashed position ID
   */
  static computePositionId(fen: string, turn: 'w' | 'b'): string {
    return hashPositionId(`${fen}|${turn}`);
  }
}
