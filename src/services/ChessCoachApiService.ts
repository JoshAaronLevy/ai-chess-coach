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
import { APIError, logError, isAPIError } from '../utils/errors';

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
          'Failed to parse coach response'
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
        error instanceof Error ? error.message : 'Chess coach API request failed'
      );
    }
  }
}
