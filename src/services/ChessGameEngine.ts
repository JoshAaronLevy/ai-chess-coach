/* eslint-disable @typescript-eslint/no-explicit-any */
import { Chess } from 'chess.js';
import type { LegalMoveDetailed, PieceType } from '../types/chess.js';
import { hashPositionId } from '../utils/hash.js';
import { ErrorCode, AppError, createInvalidMoveError, createInvalidFenError } from '../utils/errors';
import { logger } from '../utils/logger';

type ChessColor = 'w' | 'b';

export interface MoveResult {
  success: boolean;
  move?: any;
  error?: string;
}

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

export class ChessGameEngine {
  private game: Chess;

  constructor(fen?: string) {
    if (fen) {
      this.game = new Chess(fen);
    } else {
      this.game = new Chess();
    }
  }

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

  undo(): any | null {
    return this.game.undo();
  }

  reset(): void {
    this.game.reset();
  }

  load(fen: string): boolean {
    try {
      this.game.load(fen);
      return true;
    } catch (error) {
      const fenError = createInvalidFenError(
        fen,
        error instanceof Error ? error.message : undefined
      );
      logger.error('[ChessGameEngine]', fenError.message);
      return false;
    }
  }

  fen(): string {
    return this.game.fen();
  }

  turn(): ChessColor {
    return this.game.turn();
  }

  history(): string[] {
    return this.game.history();
  }

  historyVerbose(): any[] {
    return this.game.history({ verbose: true });
  }

  movesVerbose(): any[] {
    return this.game.moves({ verbose: true });
  }

  isGameOver(): boolean {
    return this.game.isGameOver();
  }

  inCheck(): boolean {
    return this.game.inCheck();
  }

  isCheckmate(): boolean {
    return this.game.isCheckmate();
  }

  isStalemate(): boolean {
    return this.game.isStalemate();
  }

  isDraw(): boolean {
    return this.game.isDraw();
  }

  isThreefoldRepetition(): boolean {
    return this.game.isThreefoldRepetition();
  }

  isInsufficientMaterial(): boolean {
    return this.game.isInsufficientMaterial();
  }

  moveNumber(): number {
    return this.game.moveNumber();
  }

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

  getChessInstance(): Chess {
    return this.game;
  }

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

  static computePositionId(fen: string, turn: 'w' | 'b'): string {
    return hashPositionId(`${fen}|${turn}`);
  }

  toJSON(isAiMode: boolean = false): {
    id: string;
    timestamp: number;
    fen: string;
    historySan: string[];
    isAiMode: boolean;
    moveCount: number;
    currentTurn: ChessColor;
  } {
    const timestamp = Date.now();
    return {
      id: `saved_game_${timestamp}`,
      timestamp,
      fen: this.game.fen(),
      historySan: this.game.history(),
      isAiMode,
      moveCount: this.game.history().length,
      currentTurn: this.game.turn()
    };
  }

  fromJSON(data: {
    fen: string;
    historySan: string[];
    isAiMode?: boolean;
  }): boolean {
    try {
      const testGame = new Chess();
      for (const move of data.historySan) {
        const result = testGame.move(move);
        if (!result) {
          logger.error('[ChessGameEngine] Invalid move in history:', move);
          return false;
        }
      }

      if (testGame.fen() !== data.fen) {
        logger.error('[ChessGameEngine] History does not match FEN');
        return false;
      }

      this.game.load(data.fen);
      return true;
    } catch (error) {
      logger.error('[ChessGameEngine] Failed to restore from JSON:', error);
      return false;
    }
  }
}
