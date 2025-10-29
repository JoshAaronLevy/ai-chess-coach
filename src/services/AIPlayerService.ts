import type { Chess } from 'chess.js';
import type { TutorInsights } from '../utils/difyParser';
import type { AiDifficulty } from '../store/aiDifficultyStore';
import { applyUciMove } from '../utils/uci';
import { logger } from '../utils/logger';

export interface AiMove {
  uci: string;
  san: string;
}

export interface MoveSelectionResult {
  move: AiMove;
  fallbackUsed: boolean;
  difficulty: AiDifficulty;
}

export interface ScheduleOptions {
  minDelay?: number;
  maxDelay?: number;
  timeout?: number;
}

export class AIPlayerService {
  private static readonly DEFAULT_MIN_DELAY = 1000;
  private static readonly DEFAULT_MAX_DELAY = 2000;
  private static readonly DEFAULT_TIMEOUT = 10000;

  static selectMove(
    insights: TutorInsights,
    difficulty: AiDifficulty
  ): MoveSelectionResult | null {
    logger.info('[AIPlayerService] Selecting move for difficulty:', difficulty);
    logger.info('[AIPlayerService] Insights:', {
      hasNextMoves: !!insights.next_moves,
      hasBestMove: !!insights.bestMove
    });

    if (insights.next_moves) {
      const result = this.selectFromDifficultyMoves(insights.next_moves, difficulty);
      if (result) {
        logger.info('[AIPlayerService] Selected difficulty-based move:', result);
        return result;
      }
    }

    if (insights.bestMove && this.isValidMove(insights.bestMove)) {
      logger.info('[AIPlayerService] Using bestMove fallback:', insights.bestMove);
      return {
        move: insights.bestMove,
        fallbackUsed: true,
        difficulty
      };
    }

    logger.warn('[AIPlayerService] No valid move found in insights');
    return null;
  }

  private static selectFromDifficultyMoves(
    nextMoves: NonNullable<TutorInsights['next_moves']>,
    difficulty: AiDifficulty
  ): MoveSelectionResult | null {
    const primaryMove = this.normalizeMove(nextMoves[difficulty]);
    if (primaryMove) {
      return {
        move: primaryMove,
        fallbackUsed: false,
        difficulty
      };
    }

    logger.info('[AIPlayerService] Primary move not found, trying fallbacks...');
    const fallbackOrder: AiDifficulty[] = ['advanced', 'intermediate', 'beginner'];
    
    for (const fallbackDifficulty of fallbackOrder) {
      if (fallbackDifficulty === difficulty) continue;
      
      const move = this.normalizeMove(nextMoves[fallbackDifficulty]);
      if (move) {
        logger.info('[AIPlayerService] Using fallback difficulty:', fallbackDifficulty);
        return {
          move,
          fallbackUsed: true,
          difficulty: fallbackDifficulty
        };
      }
    }

    return null;
  }

  private static normalizeMove(
    move?: { uci?: string | null; san?: string | null } | null
  ): AiMove | null {
    if (!move) return null;

    const uci = move.uci?.trim();
    const san = move.san?.trim();

    if (!uci && !san) return null;

    return {
      uci: uci || '',
      san: san || ''
    };
  }

  private static isValidMove(move: { uci: string; san: string } | null): move is AiMove {
    return !!(move && (move.uci || move.san));
  }

  static executeMove(game: Chess, move: AiMove): ReturnType<typeof applyUciMove> {
    logger.info('[AIPlayerService] Executing move:', move);

    if (game.isGameOver()) {
      logger.warn('[AIPlayerService] Cannot execute move: game is over');
      return null;
    }

    if (move.uci) {
      const result = applyUciMove(game, move.uci);
      if (result) {
        logger.info('[AIPlayerService] Move executed via UCI:', result);
        return result;
      }
      logger.warn('[AIPlayerService] Failed to execute via UCI, trying SAN...');
    }

    if (move.san) {
      try {
        const result = game.move(move.san);
        if (result) {
          logger.info('[AIPlayerService] Move executed via SAN:', result);
          return result;
        }
      } catch (error) {
        logger.error('[AIPlayerService] Failed to execute via SAN:', error);
      }
    }

    logger.error('[AIPlayerService] Invalid move:', move);
    return null;
  }

  static scheduleMove(
    move: AiMove,
    onExecute: (move: AiMove) => void,
    onTimeout: () => void,
    options: ScheduleOptions = {}
  ): { delayTimeoutId: number; protectionTimeoutId: number } {
    const minDelay = options.minDelay ?? this.DEFAULT_MIN_DELAY;
    const maxDelay = options.maxDelay ?? this.DEFAULT_MAX_DELAY;
    const timeout = options.timeout ?? this.DEFAULT_TIMEOUT;

    logger.info('[AIPlayerService] Scheduling move:', {
      move,
      delay: `${minDelay}-${maxDelay}ms`,
      timeout: `${timeout}ms`
    });

    const delay = minDelay + Math.random() * (maxDelay - minDelay);

    const protectionTimeoutId = window.setTimeout(() => {
      logger.warn('[AIPlayerService] Move execution timed out');
      onTimeout();
    }, timeout);

    const delayTimeoutId = window.setTimeout(() => {
      onExecute(move);
    }, delay);

    return { delayTimeoutId, protectionTimeoutId };
  }

  static isAiTurn(game: Chess, aiColor: 'w' | 'b'): boolean {
    return !game.isGameOver() && game.turn() === aiColor;
  }
}
