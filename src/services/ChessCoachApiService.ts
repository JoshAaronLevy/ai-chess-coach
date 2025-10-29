import { postCoachGrade } from '../lib/coachApi';
import { parseDifyAnswer, type TutorInsights } from '../utils/difyParser';
import type { AnalysisRequest, AnalysisOptions } from '../types/api';
import { APIError, logError, isAPIError } from '../utils/errors';
import { logger } from '../utils/logger';

export class ChessCoachApiService {
  static async analyzePosition(
    request: AnalysisRequest,
    options?: AnalysisOptions
  ): Promise<TutorInsights> {
    const startTime = Date.now();
    
    const payload = {
      boardState: request.boardState,
      lastMove: request.lastMove,
      materialCount: request.materialCount,
      capturedPieces: request.capturedPieces,
      moveHistory: request.moveHistory,
      gameAnalysis: request.gameAnalysis,
    };

    logger.info('[ChessCoachApiService] Analyzing position:', {
      fen: request.boardState.fen,
      lastMove: request.lastMove?.san,
      turn: request.boardState.turn,
      moveCount: request.moveHistory.totalMoves,
    });

    try {
      const response = await postCoachGrade(
        payload,
        options?.query || 'Grade the last move and pick the best next move.',
        options?.user || 'web'
      );

      const duration = Date.now() - startTime;
      logger.info(`[ChessCoachApiService] API call completed in ${duration}ms`);

      const insights = parseDifyAnswer(response);

      if (insights) {
        logger.info('[ChessCoachApiService] Successfully parsed insights:', {
          hasGrade: !!insights.lastMove.grade,
          hasBestMove: !!insights.bestMove,
          hasNextMoves: !!insights.next_moves,
          alternativesCount: insights.alternatives.length,
        });
        return insights;
      } else {
        const parseError = new APIError(
          'Failed to parse coach response'
        );
        logError(parseError, { response });
        throw parseError;
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.info(`[ChessCoachApiService] API call failed after ${duration}ms`);

      if (error instanceof Error || isAPIError(error)) {
        const insightsFromError = parseDifyAnswer(error);
        
        if (insightsFromError) {
          logger.info('[ChessCoachApiService] Parsed insights from error response:', {
            hasGrade: !!insightsFromError.lastMove.grade,
            hasBestMove: !!insightsFromError.bestMove,
            hasNextMoves: !!insightsFromError.next_moves,
          });
          return insightsFromError;
        }
      }

      logError(error, {
        request: {
          fen: request.boardState.fen,
          lastMove: request.lastMove?.san,
          moveCount: request.moveHistory.totalMoves,
        },
      });

      if (isAPIError(error)) {
        throw error;
      }

      throw new APIError(
        error instanceof Error ? error.message : 'Chess coach API request failed'
      );
    }
  }
}
