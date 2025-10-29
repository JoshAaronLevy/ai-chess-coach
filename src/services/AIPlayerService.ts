import type { Chess } from 'chess.js';
import type { TutorInsights } from '../utils/difyParser';
import type { AiDifficulty } from '../store/aiDifficultyStore';
import { applyUciMove } from '../utils/uci';

/**
 * Represents a move with both UCI and SAN notation
 */
export interface AiMove {
  uci: string;
  san: string;
}

/**
 * Result of AI move selection
 */
export interface MoveSelectionResult {
  move: AiMove;
  fallbackUsed: boolean;
  difficulty: AiDifficulty;
}

/**
 * Options for scheduling AI moves
 */
export interface ScheduleOptions {
  minDelay?: number;
  maxDelay?: number;
  timeout?: number;
}

/**
 * Service responsible for AI player logic including move selection,
 * difficulty management, and move execution coordination.
 * 
 * This service is stateless and delegates state management to the caller,
 * making it easily testable and reusable across different contexts.
 */
export class AIPlayerService {
  private static readonly DEFAULT_MIN_DELAY = 1000; // 1 second
  private static readonly DEFAULT_MAX_DELAY = 2000; // 2 seconds
  private static readonly DEFAULT_TIMEOUT = 10000; // 10 seconds

  /**
   * Select the best AI move based on difficulty level from tutor insights.
   * 
   * Priority order:
   * 1. Try to get move for specified difficulty from next_moves
   * 2. Fallback to other difficulty levels (advanced → intermediate → beginner)
   * 3. Fallback to bestMove if no difficulty-specific moves available
   * 
   * @param insights - Tutor insights from the coach API
   * @param difficulty - Current AI difficulty setting
   * @returns Selected move with metadata, or null if no valid move found
   */
  static selectMove(
    insights: TutorInsights,
    difficulty: AiDifficulty
  ): MoveSelectionResult | null {
    console.log('[AIPlayerService] Selecting move for difficulty:', difficulty);
    console.log('[AIPlayerService] Insights:', {
      hasNextMoves: !!insights.next_moves,
      hasBestMove: !!insights.bestMove
    });

    // Try difficulty-based selection first
    if (insights.next_moves) {
      const result = this.selectFromDifficultyMoves(insights.next_moves, difficulty);
      if (result) {
        console.log('[AIPlayerService] Selected difficulty-based move:', result);
        return result;
      }
    }

    // Fallback to bestMove
    if (insights.bestMove && this.isValidMove(insights.bestMove)) {
      console.log('[AIPlayerService] Using bestMove fallback:', insights.bestMove);
      return {
        move: insights.bestMove,
        fallbackUsed: true,
        difficulty
      };
    }

    console.warn('[AIPlayerService] No valid move found in insights');
    return null;
  }

  /**
   * Select move from difficulty-specific moves with fallback logic
   */
  private static selectFromDifficultyMoves(
    nextMoves: NonNullable<TutorInsights['next_moves']>,
    difficulty: AiDifficulty
  ): MoveSelectionResult | null {
    // Try primary difficulty first
    const primaryMove = this.normalizeMove(nextMoves[difficulty]);
    if (primaryMove) {
      return {
        move: primaryMove,
        fallbackUsed: false,
        difficulty
      };
    }

    // Fallback order: advanced → intermediate → beginner
    console.log('[AIPlayerService] Primary move not found, trying fallbacks...');
    const fallbackOrder: AiDifficulty[] = ['advanced', 'intermediate', 'beginner'];
    
    for (const fallbackDifficulty of fallbackOrder) {
      if (fallbackDifficulty === difficulty) continue; // Skip already tried
      
      const move = this.normalizeMove(nextMoves[fallbackDifficulty]);
      if (move) {
        console.log('[AIPlayerService] Using fallback difficulty:', fallbackDifficulty);
        return {
          move,
          fallbackUsed: true,
          difficulty: fallbackDifficulty
        };
      }
    }

    return null;
  }

  /**
   * Normalize and validate a move object
   */
  private static normalizeMove(
    move?: { uci?: string | null; san?: string | null } | null
  ): AiMove | null {
    if (!move) return null;

    const uci = move.uci?.trim();
    const san = move.san?.trim();

    // Need at least one valid notation
    if (!uci && !san) return null;

    return {
      uci: uci || '',
      san: san || ''
    };
  }

  /**
   * Check if a move object has valid notation
   */
  private static isValidMove(move: { uci: string; san: string } | null): move is AiMove {
    return !!(move && (move.uci || move.san));
  }

  /**
   * Validate and execute a move on the chess board.
   * 
   * This method attempts to apply the move using UCI notation first,
   * then falls back to SAN notation if needed.
   * 
   * @param game - Chess.js instance
   * @param move - Move to execute
   * @returns Move result from chess.js, or null if move is invalid
   */
  static executeMove(game: Chess, move: AiMove): ReturnType<typeof applyUciMove> {
    console.log('[AIPlayerService] Executing move:', move);

    // Validate game state
    if (game.isGameOver()) {
      console.warn('[AIPlayerService] Cannot execute move: game is over');
      return null;
    }

    // Try UCI notation first
    if (move.uci) {
      const result = applyUciMove(game, move.uci);
      if (result) {
        console.log('[AIPlayerService] Move executed via UCI:', result);
        return result;
      }
      console.warn('[AIPlayerService] Failed to execute via UCI, trying SAN...');
    }

    // Fallback to SAN notation
    if (move.san) {
      try {
        const result = game.move(move.san);
        if (result) {
          console.log('[AIPlayerService] Move executed via SAN:', result);
          return result;
        }
      } catch (error) {
        console.error('[AIPlayerService] Failed to execute via SAN:', error);
      }
    }

    console.error('[AIPlayerService] Invalid move:', move);
    return null;
  }

  /**
   * Schedule an AI move with natural delay and timeout protection.
   * 
   * Returns a timeout ID that can be used to cancel the scheduled move.
   * The onExecute callback will be called after the delay, and onTimeout
   * will be called if the move isn't executed within the timeout period.
   * 
   * @param move - Move to schedule
   * @param onExecute - Callback to execute when delay completes
   * @param onTimeout - Callback to execute if timeout occurs
   * @param options - Scheduling options (delays, timeout)
   * @returns Object with delay timeout ID and timeout protection ID
   */
  static scheduleMove(
    move: AiMove,
    onExecute: (move: AiMove) => void,
    onTimeout: () => void,
    options: ScheduleOptions = {}
  ): { delayTimeoutId: number; protectionTimeoutId: number } {
    const minDelay = options.minDelay ?? this.DEFAULT_MIN_DELAY;
    const maxDelay = options.maxDelay ?? this.DEFAULT_MAX_DELAY;
    const timeout = options.timeout ?? this.DEFAULT_TIMEOUT;

    console.log('[AIPlayerService] Scheduling move:', {
      move,
      delay: `${minDelay}-${maxDelay}ms`,
      timeout: `${timeout}ms`
    });

    // Calculate random delay
    const delay = minDelay + Math.random() * (maxDelay - minDelay);

    // Set up timeout protection
    const protectionTimeoutId = window.setTimeout(() => {
      console.warn('[AIPlayerService] Move execution timed out');
      onTimeout();
    }, timeout);

    // Schedule the move execution
    const delayTimeoutId = window.setTimeout(() => {
      onExecute(move);
    }, delay);

    return { delayTimeoutId, protectionTimeoutId };
  }

  /**
   * Validate if it's the AI's turn to move.
   * 
   * @param game - Chess.js instance
   * @param aiColor - The color the AI is playing
   * @returns True if it's AI's turn and game is not over
   */
  static isAiTurn(game: Chess, aiColor: 'w' | 'b'): boolean {
    return !game.isGameOver() && game.turn() === aiColor;
  }
}
