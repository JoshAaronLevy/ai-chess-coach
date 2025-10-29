/**
 * ChessCoachApiService - Chess AI Coach API Integration
 * 
 * Encapsulates all communication with the chess coach API, including:
 * - Position analysis and move grading
 * - Response parsing and validation
 * - Error handling and recovery
 * - Logging and debugging
 * 
 * This service is stateless and has no React dependencies, making it
 * easy to test and potentially swap AI providers in the future.
 */

import { postCoachGrade } from '../lib/coachApi';
import { parseDifyAnswer, type TutorInsights } from '../utils/difyParser';
import type { AnalysisRequest, AnalysisOptions } from '../types/api';
import { ErrorCode, APIError } from '../types/errors';
import { logError, isAPIError } from '../utils/errorHandler';

/**
 * Result of an analysis request
 */
export interface AnalysisResult {
  /** Whether the analysis was successful */
  success: boolean;
  /** Parsed insights from the AI coach */
  insights?: TutorInsights;
  /** Error message if analysis failed */
  error?: string;
  /** Whether insights were parsed from an error response */
  fromErrorResponse?: boolean;
}

/**
 * ChessCoachApiService - Service for analyzing chess positions with AI coach
 */
export class ChessCoachApiService {
  /**
   * Analyze a chess position and get AI coach insights
   * 
   * This method:
   * 1. Sends the position and move data to the AI coach API
   * 2. Parses the response into structured insights
   * 3. Handles errors gracefully, attempting to parse insights even from error responses
   * 4. Logs all API interactions for debugging
   * 
   * @param request - Complete analysis request with board state and move data
   * @param options - Optional configuration (query, user, timeout)
   * @returns Promise<TutorInsights> - Parsed insights from the AI coach
   * @throws APIError if the request fails and no insights can be extracted
   */
  static async analyzePosition(
    request: AnalysisRequest,
    options?: AnalysisOptions
  ): Promise<TutorInsights> {
    const startTime = Date.now();
    
    // Prepare the payload for the API
    const payload = {
      boardState: request.boardState,
      lastMove: request.lastMove,
      materialCount: request.materialCount,
      capturedPieces: request.capturedPieces,
      moveHistory: request.moveHistory,
      gameAnalysis: request.gameAnalysis,
    };

    console.log('[ChessCoachApiService] Analyzing position:', {
      fen: request.boardState.fen,
      lastMove: request.lastMove?.san,
      turn: request.boardState.turn,
      moveCount: request.moveHistory.totalMoves,
    });

    try {
      // Make API request
      const response = await postCoachGrade(
        payload,
        options?.query || 'Grade the last move and pick the best next move.',
        options?.user || 'web'
      );

      const duration = Date.now() - startTime;
      console.log(`[ChessCoachApiService] API call completed in ${duration}ms`);

      // Parse the response
      const insights = parseDifyAnswer(response);

      if (insights) {
        console.log('[ChessCoachApiService] Successfully parsed insights:', {
          hasGrade: !!insights.lastMove.grade,
          hasBestMove: !!insights.bestMove,
          hasNextMoves: !!insights.next_moves,
          alternativesCount: insights.alternatives.length,
        });
        return insights;
      } else {
        // Response was successful but couldn't parse insights
        const parseError = new APIError(
          'Failed to parse coach response',
          ErrorCode.API_INVALID_RESPONSE
        );
        logError(parseError, { response });
        throw parseError;
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(`[ChessCoachApiService] API call failed after ${duration}ms`);

      // If it's already an APIError from postCoachGrade, try to parse insights from it
      // This handles cases where the API returns an error but still includes insights
      if (error instanceof Error || isAPIError(error)) {
        const insightsFromError = parseDifyAnswer(error);
        
        if (insightsFromError) {
          console.log('[ChessCoachApiService] Parsed insights from error response:', {
            hasGrade: !!insightsFromError.lastMove.grade,
            hasBestMove: !!insightsFromError.bestMove,
            hasNextMoves: !!insightsFromError.next_moves,
          });
          return insightsFromError;
        }
      }

      // No insights could be extracted, log and re-throw
      logError(error, {
        request: {
          fen: request.boardState.fen,
          lastMove: request.lastMove?.san,
          moveCount: request.moveHistory.totalMoves,
        },
      });

      // Re-throw the error if it's already an APIError, otherwise wrap it
      if (isAPIError(error)) {
        throw error;
      }

      throw new APIError(
        error instanceof Error ? error.message : 'Chess coach API request failed',
        ErrorCode.API_SERVER_ERROR
      );
    }
  }

  /**
   * Analyze a position with detailed result metadata
   * 
   * This variant returns an AnalysisResult object with success/error information
   * instead of throwing errors. Useful for components that want to handle
   * success and failure cases differently.
   * 
   * @param request - Complete analysis request with board state and move data
   * @param options - Optional configuration (query, user, timeout)
   * @returns Promise<AnalysisResult> - Result object with insights or error
   */
  static async analyzePositionSafe(
    request: AnalysisRequest,
    options?: AnalysisOptions
  ): Promise<AnalysisResult> {
    try {
      const insights = await this.analyzePosition(request, options);
      return {
        success: true,
        insights,
        fromErrorResponse: false,
      };
    } catch (error) {
      // Try one more time to parse insights from the error
      const insightsFromError = parseDifyAnswer(error);
      
      if (insightsFromError) {
        return {
          success: true,
          insights: insightsFromError,
          fromErrorResponse: true,
        };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Analysis failed',
      };
    }
  }

  /**
   * Analyze a specific move in a position
   * 
   * Convenience method for analyzing a single move without full board state.
   * Primarily useful for move validation and grading.
   * 
   * @param fen - FEN string of the position
   * @param move - Move to analyze (SAN or UCI notation)
   * @param options - Optional configuration
   * @returns Promise<TutorInsights> - Parsed insights from the AI coach
   */
  static async analyzeMove(
    fen: string,
    move: string,
    options?: AnalysisOptions
  ): Promise<TutorInsights> {
    // This is a simplified version - in practice, the caller should construct
    // the full AnalysisRequest. This is mainly for future convenience.
    const request: AnalysisRequest = {
      boardState: {
        fen,
        turn: fen.split(' ')[1] as 'w' | 'b',
        pieces: [],
        inCheck: false,
        gameOver: false,
        positionId: '',
      },
      materialCount: {
        white: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 1 },
        black: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 1 },
      },
      capturedPieces: {
        white: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
        black: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
      },
      moveHistory: { san: [move], uci: [], totalMoves: 1, currentPly: 1 },
      gameAnalysis: { legalMoves: [], legalMovesCount: 0, attackedSquares: [], kingSquares: {} },
    };

    return this.analyzePosition(request, options);
  }
}
