import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Chess } from 'chess.js';
import { useGameLog } from './useGameLog.js';
import { boardToPieces, countMaterial, capturedFromMaterial, toMoveInfo } from './serializers.js';
import type { LegalMoveDetailed, PieceType, MoveInsights } from '../types/chess.js';
import { hashPositionId } from '../utils/hash.js';
import { postCoachGrade } from '../lib/coachApi';
import { parseDifyAnswer, type TutorInsights } from '../utils/difyParser';
import { applyUciMove } from '../utils/uci.js';
import { useAiDifficultyStore } from '../store/aiDifficultyStore';
import { BoardStateManager } from '../services/BoardStateManager.js';
import { ChessGameEngine } from '../services/ChessGameEngine.js';

console.info('[USE_CHESS_INIT]');

/**
 * Type for chess piece colors
 */
type ChessColor = 'w' | 'b';

/**
 * Type for AI difficulty levels
 */
type Difficulty = 'beginner' | 'intermediate' | 'advanced';

/**
 * Helper function to pick AI move based on difficulty setting
 */
function pickAiMoveForDifficulty(
  difficulty: Difficulty,
  nextMoves?: {
    beginner?: { uci?: string | null; san?: string | null };
    intermediate?: { uci?: string | null; san?: string | null };
    advanced?: { uci?: string | null; san?: string | null };
  }
) {
  console.log('[DEBUG] pickAiMoveForDifficulty called with:', { difficulty, nextMoves });
  
  if (!nextMoves) {
    console.log('[DEBUG] pickAiMoveForDifficulty: no nextMoves provided');
    return null;
  }

  const normalize = (m?: { uci?: string | null; san?: string | null } | null) => {
    const result = m && ((m.uci && m.uci.trim()) || (m.san && m.san.trim())) ? m : null;
    console.log('[DEBUG] normalize called with:', m, 'result:', result);
    return result;
  };

  console.log('[DEBUG] Looking for primary move for difficulty:', difficulty);
  const primary =
    difficulty === 'beginner' ? normalize(nextMoves.beginner) :
    difficulty === 'intermediate' ? normalize(nextMoves.intermediate) :
    normalize(nextMoves.advanced);

  console.log('[DEBUG] Primary move found:', primary);
  if (primary) return { move: primary, fallbackUsed: false };

  // Fallback order: advanced → intermediate → beginner
  console.log('[DEBUG] Primary move not found, trying fallbacks...');
  const order: Difficulty[] = ['advanced', 'intermediate', 'beginner'];
  for (const key of order) {
    const difficultyMoves = nextMoves[key];
    console.log('[DEBUG] Trying fallback difficulty:', key, 'moves:', difficultyMoves);
    const m = normalize(difficultyMoves);
    if (m) {
      console.log('[DEBUG] Fallback move found:', m, 'for difficulty:', key);
      return { move: m, fallbackUsed: true };
    }
  }
  console.log('[DEBUG] No moves found in any difficulty level');
  return null;
}

/**
 * Helper function to apply UCI or SAN move to the game
 */
function applyUciOrSan(game: Chess, m: { uci?: string | null; san?: string | null }) {
  if (m.uci && m.uci.length >= 4) {
    const from = m.uci.slice(0, 2);
    const to = m.uci.slice(2, 4);
    const promotion = m.uci.length === 5 ? m.uci[4] : undefined;
    return game.move({ from, to, promotion });
  }
  if (m.san) {
    return game.move(m.san);
  }
  return null;
}

/**
 * Compute detailed legal moves with check detection
 */
function computeLegalMovesDetailed(game: Chess): LegalMoveDetailed[] {
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

    // compute givesCheck by applying on a clone
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
 * Compute deterministic position ID from FEN and turn
 */
function computePositionId(fen: string, turn: 'w'|'b'): string {
  return hashPositionId(`${fen}|${turn}`);
}

/**
 * Interface for the chess game state
 */
interface ChessGameState {
  fen: string;
  turn: ChessColor;
  historySan: string[];
  lastSan?: string;
  lastMoveFrom?: string;
  lastMoveTo?: string;
  gameOver: boolean;
  gameResult?: string;
  // AI game mode state
  isAiMode: boolean;
  isAiThinking: boolean;
  aiColor: 'b';
  pendingAiMove: string | null;
}

/**
 * Interface for the useChess hook return value
 */
interface UseChessReturn extends ChessGameState {
  onPieceDrop: (from: string, to: string) => boolean;
  undo: () => void;
  reset: () => void;
  isGameOver: () => boolean;
  // Coach insights state
  insights: TutorInsights | null;
  insightsHistory: MoveInsights[];
  hasNewInsights: boolean;
  isLoadingInsights: boolean;
  insightsError: string | null;
  // Coach insights actions
  markInsightsAsViewed: () => void;
  clearInsights: () => void;
  // AI game mode actions
  toggleAiMode: () => void;
  setAiThinking: (thinking: boolean) => void;
  isAiTurn: () => boolean;
  handleAiMoveResponse: (bestMove: { uci: string, san: string }) => void;
  executeAiMove: (uciMove: string) => void;
  // Save game functionality
  saveCurrentGame: () => boolean;
  loadSavedGame: () => boolean;
  isStateDifferentFromSaved: boolean;
  hasSavedGame: boolean;
  checkHasSavedGame: () => boolean;
}

/**
 * Custom React hook for managing chess game state and operations
 * Uses ChessGameEngine for game logic and state management
 */
export const useChess = (): UseChessReturn => {
  // Persistent chess game engine using useRef
  const gameEngineRef = useRef(new ChessGameEngine());
  
  // Initialize game log hook
  const gameLog = useGameLog();
  
  // Get difficulty setting from store
  const { difficulty } = useAiDifficultyStore();
  
  // Game state derived from gameEngineRef.current
  const [fen, setFen] = useState<string>(gameEngineRef.current.fen());
  const [turn, setTurn] = useState<ChessColor>(gameEngineRef.current.turn());
  const [historySan, setHistorySan] = useState<string[]>([]);
  const [lastSan, setLastSan] = useState<string | undefined>(undefined);
  const [lastMoveFrom, setLastMoveFrom] = useState<string | undefined>(undefined);
  const [lastMoveTo, setLastMoveTo] = useState<string | undefined>(undefined);
  const [gameOver, setGameOver] = useState<boolean>(false);
  const [gameResult, setGameResult] = useState<string | undefined>(undefined);

  // Coach insights state
  const [insights, setInsights] = useState<TutorInsights | null>(null);
  const [insightsHistory, setInsightsHistory] = useState<MoveInsights[]>([]);
  const [hasNewInsights, setHasNewInsights] = useState<boolean>(false);
  const [isLoadingInsights, setIsLoadingInsights] = useState<boolean>(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  // AI game mode state
  const [isAiMode, setIsAiMode] = useState<boolean>(true);
  const [isAiThinking, setIsAiThinking] = useState<boolean>(false);
  const [pendingAiMove, setPendingAiMove] = useState<string | null>(null);
  const [aiMoveTimeout, setAiMoveTimeout] = useState<number | null>(null);
  const aiColor = 'b' as const; // AI always plays black

  // Save game state tracking
  const [isStateDifferentFromSaved, setIsStateDifferentFromSaved] = useState<boolean>(false);
  const [hasSavedGame, setHasSavedGame] = useState<boolean>(false);

  /**
   * Check if any saved game exists in localStorage
   */
  const checkHasSavedGame = useCallback((): boolean => {
    const hasGames = BoardStateManager.hasSavedGames();
    setHasSavedGame(hasGames);
    return hasGames;
  }, []);  // Initialize game log on first mount if no current log exists
  useEffect(() => {
    if (gameLog.snapshots.length === 0) {
      gameLog.startNew(gameEngineRef.current.fen());
    }
    // Check for saved games on component initialization
    checkHasSavedGame();
  }, [checkHasSavedGame, gameLog]);

  /**
   * Check if current game state differs from the most recently saved state
   */
  const checkStateDifference = useCallback(() => {
    const currentState = {
      fen: gameEngineRef.current.fen(),
      historySan: gameEngineRef.current.history(),
      isAiMode: isAiMode
    };

    const isDifferent = BoardStateManager.isStateDifferent(currentState);
    setIsStateDifferentFromSaved(isDifferent);
  }, [isAiMode]);

  /**
   * Updates all state variables based on current chess game engine
   */
  const updateGameState = useCallback(() => {
    const state = gameEngineRef.current.getGameState();
    
    setFen(state.fen);
    setTurn(state.turn);
    setHistorySan(state.history);
    setLastSan(state.lastMove?.san);
    setLastMoveFrom(state.lastMove?.from);
    setLastMoveTo(state.lastMove?.to);
    setGameOver(state.isGameOver);
    setGameResult(state.gameResult);

    // Check if current state differs from saved state
    checkStateDifference();
  }, [checkStateDifference]);

  /**
   * Handle piece drops from react-chessboard
   * Validates move legality and updates game state if valid
   * Auto-promotes to queen for simplicity
   * IMPORTANT: Must be synchronous and return boolean
   */
  const onPieceDrop = useCallback((from: string, to: string): boolean => {
    // IMPORTANT: must be sync and return boolean
    const move = gameEngineRef.current.getChessInstance().move({ from, to, promotion: 'q' }); // promotion default is fine
    console.log('[DROP]', { from, to, move, fen: gameEngineRef.current.getChessInstance().fen() });
    if (move == null) return false;
    
    // DEBUG: Log turn state before move
    console.log('[TURN_DEBUG] Before move - Chess.js turn:', gameEngineRef.current.getChessInstance().turn(), 'React turn state:', turn);
    
    // Update UI state (but NOT turn yet - wait for API completion)
    setFen(gameEngineRef.current.getChessInstance().fen());
    setLastSan(move.san);
    setLastMoveFrom(move.from);
    setLastMoveTo(move.to);
    setHistorySan(gameEngineRef.current.getChessInstance().history());
    setGameOver(gameEngineRef.current.getChessInstance().isGameOver());
    
    // Update game state to trigger save button state check
    updateGameState();
    
    // DEBUG: Turn will be updated after API call completes
    console.log('[TURN_DEBUG] Move applied, waiting for API completion to update turn display');
    
    // Record move in game log
    gameLog.recordAfterMove(gameEngineRef.current.getChessInstance(), move);
    
    // Comprehensive board state logging for LLM analysis
    const currentPieces = boardToPieces(gameEngineRef.current.getChessInstance());
    const materialCount = countMaterial(currentPieces);
    
    // Calculate captured pieces by comparing to starting position
    const startingMaterial = {
      white: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 },
      black: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 }
    };
    const capturedPieces = capturedFromMaterial(startingMaterial, materialCount);
    
    // Convert move to comprehensive format
    const moveInfo = toMoveInfo(move);
    
    const boardState = {
      pieces: currentPieces,
      fen: gameEngineRef.current.getChessInstance().fen(),
      turn: gameEngineRef.current.getChessInstance().turn(),
      moveNumber: gameEngineRef.current.getChessInstance().moveNumber(),
      halfmoveClock: gameEngineRef.current.getChessInstance().fen().split(' ')[4], // Extract halfmove clock from FEN
      fullmoveNumber: gameEngineRef.current.getChessInstance().fen().split(' ')[5], // Extract fullmove number from FEN
      inCheck: gameEngineRef.current.getChessInstance().inCheck(),
      gameOver: gameEngineRef.current.getChessInstance().isGameOver(),
      checkmate: gameEngineRef.current.getChessInstance().isCheckmate(),
      stalemate: gameEngineRef.current.getChessInstance().isStalemate(),
      draw: gameEngineRef.current.getChessInstance().isDraw(),
      threefoldRepetition: gameEngineRef.current.getChessInstance().isThreefoldRepetition(),
      insufficientMaterial: gameEngineRef.current.getChessInstance().isInsufficientMaterial(),
      positionId: computePositionId(gameEngineRef.current.getChessInstance().fen(), gameEngineRef.current.getChessInstance().turn()),
      legalMovesDetailed: computeLegalMovesDetailed(gameEngineRef.current.getChessInstance())
    };

    const payload = {
      boardState,
      lastMove: {
        san: moveInfo.san,
        uci: moveInfo.uci,
        from: moveInfo.from,
        to: moveInfo.to,
        piece: moveInfo.piece,
        color: moveInfo.color,
        captured: moveInfo.captured,
        promotion: moveInfo.promotion,
        flags: moveInfo.flags
      },
      materialCount,
      capturedPieces,
      moveHistory: {
        san: gameEngineRef.current.getChessInstance().history(),
        uci: gameEngineRef.current.getChessInstance().history({ verbose: true }).map(m => toMoveInfo(m).uci),
        totalMoves: gameEngineRef.current.getChessInstance().history().length,
        currentPly: gameEngineRef.current.getChessInstance().history().length
      },
      gameAnalysis: {
        legalMoves: gameEngineRef.current.getChessInstance().moves(),
        legalMovesCount: gameEngineRef.current.getChessInstance().moves().length,
        attackedSquares: gameEngineRef.current.getChessInstance().moves({ verbose: true }).map(m => m.to),
        kingSquares: {
          white: currentPieces.find(p => p.type === 'k' && p.color === 'w')?.square,
          black: currentPieces.find(p => p.type === 'k' && p.color === 'b')?.square
        }
      }
    };

    // Comprehensive board state logging for LLM analysis
    console.log('Complete Chess Board State for LLM:', JSON.stringify(payload));

    // Send board state to coach API for analysis
    console.log('[COACH] API call takes flight with payload:', payload);
    setIsLoadingInsights(true);
    setInsightsError(null);
    
    // Set AI thinking state before API call when in AI mode
    if (isAiMode && gameEngineRef.current.getChessInstance().turn() === aiColor) {
      setIsAiThinking(true);
    }
    
    postCoachGrade(payload)
      .then(resp => {
        // Parse and store insights in state
        const parsedInsights = parseDifyAnswer(resp);
        console.log('[AI Tutor Insights]', JSON.stringify(parsedInsights));
        
        if (parsedInsights) {
          setInsights(parsedInsights);
          setHasNewInsights(true);
          setInsightsError(null);
          
          // Create and add move insight to history
          const moveInsight: MoveInsights = {
            moveNumber: historySan.length, // Current move count after the move
            san: lastSan || '',
            fromSquare: lastMoveFrom || '',
            toSquare: lastMoveTo || '',
            insights: parsedInsights,
            timestamp: Date.now()
          };
          setInsightsHistory(prev => [...prev, moveInsight]);
          
          // Update turn state now that API call completed successfully
          setTurn(gameEngineRef.current.getChessInstance().turn());
          console.log('[TURN_DEBUG] API call succeeded - Turn updated to:', gameEngineRef.current.getChessInstance().turn());
          
          // Enhanced AI move validation and side checking with difficulty-based selection
          if (isAiMode && gameEngineRef.current.getChessInstance().turn() === aiColor && !gameEngineRef.current.getChessInstance().isGameOver()) {
            console.log('[AI Auto-Move]', {
              turn: gameEngineRef.current.getChessInstance().turn(),
              aiColor,
              difficulty: difficulty,
              gameOver: gameEngineRef.current.getChessInstance().isGameOver()
            });
            
            // Validate that the move is for the correct side
            const expectedSide = gameEngineRef.current.getChessInstance().turn(); // Should be 'b' for AI
            if (expectedSide !== aiColor) {
              console.warn('[AI] Move returned for wrong side. Expected:', aiColor, 'Current turn:', expectedSide);
              setIsAiThinking(false);
              return;
            }
            
            // Double-check game state before proceeding
            if (gameEngineRef.current.getChessInstance().isGameOver()) {
              console.log('[AI] Game ended before AI could move');
              setIsAiThinking(false);
              return;
            }
            
            // DEBUG: Log difficulty and next_moves availability
            console.log('[DEBUG] Difficulty check - difficulty:', difficulty, 'next_moves available:', !!parsedInsights.next_moves, 'bestMove available:', !!parsedInsights.bestMove);
            if (parsedInsights.next_moves) {
              console.log('[DEBUG] Next moves structure:', JSON.stringify(parsedInsights.next_moves));
            }
            
            // Use difficulty-based move selection if available, fallback to bestMove
            if (parsedInsights.next_moves) {
              console.log('[DEBUG] Using difficulty-based move selection with difficulty:', difficulty);
              const moveSelection = pickAiMoveForDifficulty(difficulty, parsedInsights.next_moves);
              if (moveSelection) {
                // Try to apply the selected move
                const moveResult = applyUciOrSan(gameEngineRef.current.getChessInstance(), moveSelection.move);
                if (moveResult) {
                  console.log('[AI Move Selected]', {
                    difficulty,
                    move: { uci: moveSelection.move.uci, san: moveSelection.move.san },
                    usedFallback: moveSelection.fallbackUsed
                  });
                  
                  // Convert to the format expected by handleAiMoveResponse
                  const aiMove = {
                    uci: moveSelection.move.uci || '',
                    san: moveSelection.move.san || moveResult.san
                  };
                  
                  // Undo the test move and let handleAiMoveResponse apply it properly
                  gameEngineRef.current.getChessInstance().undo();
                  handleAiMoveResponse(aiMove);
                } else {
                  console.warn('[AI] Selected difficulty-based move is illegal, trying fallback to bestMove');
                  if (parsedInsights.bestMove) {
                    handleAiMoveResponse(parsedInsights.bestMove);
                  } else {
                    console.warn('[AI] No legal moves available');
                    setIsAiThinking(false);
                  }
                }
              } else {
                console.warn('[AI] No moves found for difficulty level, trying fallback to bestMove');
                if (parsedInsights.bestMove) {
                  handleAiMoveResponse(parsedInsights.bestMove);
                } else {
                  console.warn('[AI] No bestMove fallback available');
                  setIsAiThinking(false);
                }
              }
            } else if (parsedInsights.bestMove) {
              // Fallback to original bestMove logic when difficulty not set or next_moves not available
              handleAiMoveResponse(parsedInsights.bestMove);
            } else {
              console.warn('[AI] AI mode enabled but no moves found in API response');
              setIsAiThinking(false);
            }
          }
        } else {
          setInsightsError('Failed to parse coach response');
        }
      })
      .catch(err => {
        // Keep existing error log
        console.log('[COACH] API call completed with error:', JSON.stringify(err));
        
        // Try to parse insights from error response
        const parsedInsights = parseDifyAnswer(err);
        console.log('[AI Tutor Insights]', parsedInsights);
        
        if (parsedInsights) {
          setInsights(parsedInsights);
          setHasNewInsights(true);
          setInsightsError(null);
          
          // Update turn state even if parsed from error response
          setTurn(gameEngineRef.current.getChessInstance().turn());
          console.log('[TURN_DEBUG] API call failed but insights parsed - Turn updated to:', gameEngineRef.current.getChessInstance().turn());
          
          // Enhanced AI move validation and side checking with difficulty-based selection (error case)
          if (isAiMode && gameEngineRef.current.getChessInstance().turn() === aiColor && !gameEngineRef.current.getChessInstance().isGameOver()) {
            // Validate that the move is for the correct side
            const expectedSide = gameEngineRef.current.getChessInstance().turn(); // Should be 'b' for AI
            if (expectedSide !== aiColor) {
              console.warn('[AI] Move returned for wrong side. Expected:', aiColor, 'Current turn:', expectedSide);
              setIsAiThinking(false);
              return;
            }
            
            // Double-check game state before proceeding
            if (gameEngineRef.current.getChessInstance().isGameOver()) {
              console.log('[AI] Game ended before AI could move');
              setIsAiThinking(false);
              return;
            }
            
            // Use difficulty-based move selection if available, fallback to bestMove
            if (parsedInsights.next_moves) {
              console.log('[DEBUG] Calling pickAiMoveForDifficulty with:', { difficulty, next_moves: parsedInsights.next_moves });
              const moveSelection = pickAiMoveForDifficulty(difficulty, parsedInsights.next_moves);
              console.log('[DEBUG] pickAiMoveForDifficulty returned:', moveSelection);
              
              if (moveSelection) {
                console.log('[DEBUG] Attempting to apply selected move:', moveSelection.move);
                // Try to apply the selected move
                const moveResult = applyUciOrSan(gameEngineRef.current.getChessInstance(), moveSelection.move);
                console.log('[DEBUG] applyUciOrSan result:', moveResult);
                
                if (moveResult) {
                  console.log('[AI Move] difficulty=', difficulty, 'selected=', moveSelection.move, 'fallbackUsed=', moveSelection.fallbackUsed);
                  
                  // Convert to the format expected by handleAiMoveResponse
                  const aiMove = {
                    uci: moveSelection.move.uci || '',
                    san: moveSelection.move.san || moveResult.san
                  };
                  
                  console.log('[DEBUG] Converted aiMove for handleAiMoveResponse:', aiMove);
                  // Undo the test move and let handleAiMoveResponse apply it properly
                  gameEngineRef.current.getChessInstance().undo();
                  handleAiMoveResponse(aiMove);
                } else {
                  console.warn('[AI] Selected difficulty-based move is illegal, trying fallback to bestMove');
                  if (parsedInsights.bestMove) {
                    console.log('[DEBUG] Using bestMove fallback:', parsedInsights.bestMove);
                    handleAiMoveResponse(parsedInsights.bestMove);
                  } else {
                    console.warn('[AI] No legal moves available');
                    setIsAiThinking(false);
                  }
                }
              } else {
                console.warn('[AI] No moves found for difficulty level, trying fallback to bestMove');
                if (parsedInsights.bestMove) {
                  console.log('[DEBUG] Using bestMove fallback after difficulty selection failed:', parsedInsights.bestMove);
                  handleAiMoveResponse(parsedInsights.bestMove);
                } else {
                  console.warn('[AI] No bestMove fallback available');
                  setIsAiThinking(false);
                }
              }
            } else if (parsedInsights.bestMove) {
              // Fallback to original bestMove logic when difficulty not set or next_moves not available
              console.log('[DEBUG] Using bestMove because difficulty is null or next_moves unavailable:', parsedInsights.bestMove);
              handleAiMoveResponse(parsedInsights.bestMove);
            } else {
              console.warn('[AI] AI mode enabled but no moves found in API response');
              console.log('[DEBUG] Final state - difficulty:', difficulty, 'next_moves:', !!parsedInsights.next_moves, 'bestMove:', !!parsedInsights.bestMove);
              setIsAiThinking(false);
            }
          }
        } else {
          setInsightsError(err instanceof Error ? err.message : 'Coach API call failed');
          
          // Update turn state even on complete API failure
          setTurn(gameEngineRef.current.getChessInstance().turn());
          console.log('[TURN_DEBUG] API call failed completely - Turn updated to:', gameEngineRef.current.getChessInstance().turn());
          
          // Enhanced AI-specific error cleanup
          if (isAiMode) {
            console.log('[AI] Clearing AI state due to API error');
            setIsAiThinking(false);
            setPendingAiMove(null);
            
            // Clear any pending timeouts
            if (aiMoveTimeout) {
              clearTimeout(aiMoveTimeout);
              setAiMoveTimeout(null);
            }
          }
        }
      })
      .finally(() => {
        setIsLoadingInsights(false);
      });
    
    // Compact debug logging
    console.debug('[BOARD_STATE+]', { pid: boardState.positionId, lm: boardState.legalMovesDetailed.length });
    
    return true;
  }, [gameLog, isAiMode]);

  /**
   * Undo the last move
   * Reverts to previous position and updates state
   */
  const undo = useCallback(() => {
    const undoMove = gameEngineRef.current.undo();
    if (undoMove) {
      updateGameState();
      gameLog.undoLast();
      // Remove last insight from history when undoing a move
      setInsightsHistory(prev => prev.slice(0, -1));
      
      // Enhanced board state logging after undo
      const currentPieces = boardToPieces(gameEngineRef.current.getChessInstance());
      const materialCount = countMaterial(currentPieces);
      
      const startingMaterial = {
        white: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 },
        black: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 }
      };
      const capturedPieces = capturedFromMaterial(startingMaterial, materialCount);
      
      const boardState = {
        pieces: currentPieces,
        fen: gameEngineRef.current.getChessInstance().fen(),
        turn: gameEngineRef.current.getChessInstance().turn(),
        moveNumber: gameEngineRef.current.getChessInstance().moveNumber(),
        halfmoveClock: gameEngineRef.current.getChessInstance().fen().split(' ')[4],
        fullmoveNumber: gameEngineRef.current.getChessInstance().fen().split(' ')[5],
        inCheck: gameEngineRef.current.getChessInstance().inCheck(),
        gameOver: gameEngineRef.current.getChessInstance().isGameOver(),
        checkmate: gameEngineRef.current.getChessInstance().isCheckmate(),
        stalemate: gameEngineRef.current.getChessInstance().isStalemate(),
        draw: gameEngineRef.current.getChessInstance().isDraw(),
        threefoldRepetition: gameEngineRef.current.getChessInstance().isThreefoldRepetition(),
        insufficientMaterial: gameEngineRef.current.getChessInstance().isInsufficientMaterial(),
        positionId: computePositionId(gameEngineRef.current.getChessInstance().fen(), gameEngineRef.current.getChessInstance().turn()),
        legalMovesDetailed: computeLegalMovesDetailed(gameEngineRef.current.getChessInstance())
      };

      console.log('Complete Chess Board State for LLM (After Undo):', JSON.stringify({
        boardState,
        materialCount,
        capturedPieces,
        moveHistory: {
          san: gameEngineRef.current.getChessInstance().history(),
          uci: gameEngineRef.current.getChessInstance().history({ verbose: true }).map(m => toMoveInfo(m).uci),
          totalMoves: gameEngineRef.current.getChessInstance().history().length,
          currentPly: gameEngineRef.current.getChessInstance().history().length
        },
        gameAnalysis: {
          legalMoves: gameEngineRef.current.getChessInstance().moves(),
          legalMovesCount: gameEngineRef.current.getChessInstance().moves().length,
          attackedSquares: gameEngineRef.current.getChessInstance().moves({ verbose: true }).map(m => m.to),
          kingSquares: {
            white: currentPieces.find(p => p.type === 'k' && p.color === 'w')?.square,
            black: currentPieces.find(p => p.type === 'k' && p.color === 'b')?.square
          }
        }
      }));

      console.debug('[BOARD_STATE+]', { pid: boardState.positionId, lm: boardState.legalMovesDetailed.length });
    }
  }, [updateGameState, gameLog]);

  /**
   * Reset the game to starting position
   * Clears all move history and resets state
   */
  const reset = useCallback(() => {
    gameEngineRef.current.reset();
    updateGameState();
    gameLog.resetAll(gameEngineRef.current.fen());
    clearInsights(); // Clear insights when starting a new game
    setInsightsHistory([]); // Clear insights history when starting a new game
    
    // Re-check for saved games after reset
    checkHasSavedGame();
    
    // Comprehensive AI state cleanup
    setIsAiThinking(false);
    setPendingAiMove(null);
    
    // Clear any pending timeouts
    if (aiMoveTimeout) {
      clearTimeout(aiMoveTimeout);
      setAiMoveTimeout(null);
    }
    
    console.log('[AI] AI state cleared during game reset');
    // Note: Don't reset isAiMode so user's preference persists
    
    // Enhanced board state logging after reset
    const currentPieces = boardToPieces(gameEngineRef.current.getChessInstance());
    const materialCount = countMaterial(currentPieces);
    
    const startingMaterial = {
      white: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 },
      black: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 }
    };
    const capturedPieces = capturedFromMaterial(startingMaterial, materialCount);
    
    const boardState = {
      pieces: currentPieces,
      fen: gameEngineRef.current.getChessInstance().fen(),
      turn: gameEngineRef.current.getChessInstance().turn(),
      moveNumber: gameEngineRef.current.getChessInstance().moveNumber(),
      halfmoveClock: gameEngineRef.current.getChessInstance().fen().split(' ')[4],
      fullmoveNumber: gameEngineRef.current.getChessInstance().fen().split(' ')[5],
      inCheck: gameEngineRef.current.getChessInstance().inCheck(),
      gameOver: gameEngineRef.current.getChessInstance().isGameOver(),
      checkmate: gameEngineRef.current.getChessInstance().isCheckmate(),
      stalemate: gameEngineRef.current.getChessInstance().isStalemate(),
      draw: gameEngineRef.current.getChessInstance().isDraw(),
      threefoldRepetition: gameEngineRef.current.getChessInstance().isThreefoldRepetition(),
      insufficientMaterial: gameEngineRef.current.getChessInstance().isInsufficientMaterial(),
      positionId: computePositionId(gameEngineRef.current.getChessInstance().fen(), gameEngineRef.current.getChessInstance().turn()),
      legalMovesDetailed: computeLegalMovesDetailed(gameEngineRef.current.getChessInstance())
    };

    console.log('Complete Chess Board State for LLM (After Reset):', JSON.stringify({
      boardState,
      materialCount,
      capturedPieces,
      moveHistory: {
        san: gameEngineRef.current.getChessInstance().history(),
        uci: gameEngineRef.current.getChessInstance().history({ verbose: true }).map(m => toMoveInfo(m).uci),
        totalMoves: gameEngineRef.current.getChessInstance().history().length,
        currentPly: gameEngineRef.current.getChessInstance().history().length
      },
      gameAnalysis: {
        legalMoves: gameEngineRef.current.getChessInstance().moves(),
        legalMovesCount: gameEngineRef.current.getChessInstance().moves().length,
        attackedSquares: gameEngineRef.current.getChessInstance().moves({ verbose: true }).map(m => m.to),
        kingSquares: {
          white: currentPieces.find(p => p.type === 'k' && p.color === 'w')?.square,
          black: currentPieces.find(p => p.type === 'k' && p.color === 'b')?.square
        }
      }
    }));

    console.debug('[BOARD_STATE+]', { pid: boardState.positionId, lm: boardState.legalMovesDetailed.length });
  }, [updateGameState, gameLog]);

  /**
   * Check if the game has ended
   * Returns true for checkmate, stalemate, or any draw condition
   */
  const isGameOver = useCallback((): boolean => {
    return gameEngineRef.current.isGameOver();
  }, []);

  /**
   * Mark insights as viewed, clearing the "new insights" flag
   */
  const markInsightsAsViewed = useCallback(() => {
    setHasNewInsights(false);
  }, []);

  /**
   * Clear insights state (for new games)
   */
  const clearInsights = useCallback(() => {
    setInsights(null);
    setHasNewInsights(false);
    setIsLoadingInsights(false);
    setInsightsError(null);
  }, []);

  /**
   * Toggle AI mode on/off (only allowed when no moves have been made)
   * @deprecated AI mode is now always enabled. This function is kept for compatibility but has no effect.
   */
  const toggleAiMode = useCallback(() => {
    // Enhanced validation
    if (historySan.length === 0) {
      // Clear any pending AI state when toggling
      if (isAiThinking) {
        console.log('[AI] Clearing AI thinking state during mode toggle');
        setIsAiThinking(false);
        setPendingAiMove(null);
        
        // Clear any pending timeouts
        if (aiMoveTimeout) {
          clearTimeout(aiMoveTimeout);
          setAiMoveTimeout(null);
        }
      }
      
      setIsAiMode(prev => {
        const newMode = !prev;
        console.log('[AI] Mode toggled:', newMode ? 'ON' : 'OFF');
        return newMode;
      });
    } else {
      console.warn('[AI] Cannot change AI mode after game has started');
    }
  }, [historySan.length, isAiThinking, aiMoveTimeout]);

  /**
   * Set AI thinking state
   */
  const setAiThinking = useCallback((thinking: boolean) => {
    setIsAiThinking(thinking);
  }, []);

  /**
   * Check if it's the AI's turn to move
   */
  const isAiTurn = useCallback(() => {
    return isAiMode && turn === aiColor && !gameOver;
  }, [isAiMode, turn, aiColor, gameOver]);

  /**
   * Handle AI move response with natural delay and timeout protection
   */
  const handleAiMoveResponse = useCallback((bestMove: { uci: string, san: string }) => {
    if (!isAiMode || gameEngineRef.current.getChessInstance().isGameOver()) {
      return;
    }

    console.log('[AI] Processing move response:', bestMove);
    setIsAiThinking(true);
    setPendingAiMove(bestMove.uci);
    
    // Add timeout handling
    const timeoutId = setTimeout(() => {
      console.warn('[AI] AI move execution timed out');
      setIsAiThinking(false);
      setPendingAiMove(null);
    }, 10000); // 10 second timeout

    setAiMoveTimeout(timeoutId);
    
    // Natural delay: 1-2 seconds
    const delay = 1000 + Math.random() * 1000;
    setTimeout(() => {
      executeAiMove(bestMove.uci);
    }, delay);
  }, [isAiMode]);

  /**
   * Execute AI move and update game state with race condition protection
   */
  const executeAiMove = useCallback((uciMove: string) => {
    // Prevent multiple simultaneous AI moves
    if (isAiThinking && pendingAiMove) {
      console.warn('[AI] AI move already in progress, ignoring duplicate request');
      return false;
    }

    // Validate game state hasn't changed
    if (!gameEngineRef.current.getChessInstance() || gameEngineRef.current.getChessInstance().isGameOver()) {
      console.warn('[AI] Cannot execute AI move: game ended or invalid state');
      setIsAiThinking(false);
      return false;
    }

    // Validate it's still AI's turn
    if (gameEngineRef.current.getChessInstance().turn() !== aiColor) {
      console.warn('[AI] Cannot execute AI move: not AI\'s turn');
      setIsAiThinking(false);
      return false;
    }

    try {
      console.log('[AI] Attempting to execute move:', uciMove);

      const moveResult = applyUciMove(gameEngineRef.current.getChessInstance(), uciMove);
      if (!moveResult) {
        console.error('[AI] Invalid UCI move:', uciMove);
        setIsAiThinking(false);
        setPendingAiMove(null);
        return false;
      }
      
      console.log('[AI] Move executed successfully:', { uci: uciMove, san: moveResult.san });
      
      // Update game state
      updateGameState();
      
      // Record move in game log if initialized
      if (gameLog.snapshots.length > 0) {
        gameLog.recordAfterMove(gameEngineRef.current.getChessInstance(), moveResult);
      }
      
      // Clear timeout if it exists
      if (aiMoveTimeout) {
        clearTimeout(aiMoveTimeout);
        setAiMoveTimeout(null);
      }
      
      // Clear AI state
      setIsAiThinking(false);
      setPendingAiMove(null);
      
      // Enhanced game over detection after AI move
      if (gameEngineRef.current.getChessInstance().isGameOver()) {
        console.log('[AI] Game ended after AI move:', {
          isCheckmate: gameEngineRef.current.getChessInstance().isCheckmate(),
          isStalemate: gameEngineRef.current.getChessInstance().isStalemate(),
          isDraw: gameEngineRef.current.getChessInstance().isDraw(),
          isThreefoldRepetition: gameEngineRef.current.getChessInstance().isThreefoldRepetition(),
          isInsufficientMaterial: gameEngineRef.current.getChessInstance().isInsufficientMaterial()
        });
        // No further AI processing needed
        return true;
      }
      
      // Call coaching API after AI move to continue analysis cycle
      const moveInfo = toMoveInfo(moveResult);
      const gradeRequest = {
        chess_position: gameEngineRef.current.getChessInstance().fen(),
        previous_move_uci: moveInfo.uci,
        previous_move_san: moveInfo.san
      };
      
      // Set loading state before API call (matching normal user move flow)
      setIsLoadingInsights(true);
      setInsightsError(null);
      
      postCoachGrade(gradeRequest)
        .then(response => {
          console.log('[AI] Coach analysis completed after AI move');
          // Parse and potentially use insights, but don't trigger another AI move
          const parsedInsights = parseDifyAnswer(response);
          if (parsedInsights) {
            setInsights(parsedInsights);
            setHasNewInsights(true);
            setInsightsError(null);
          }
        })
        .catch(err => {
          console.log('[AI] Coach analysis failed after AI move:', err);
          // Try to parse insights from error response
          const parsedInsights = parseDifyAnswer(err);
          if (parsedInsights) {
            setInsights(parsedInsights);
            setHasNewInsights(true);
            setInsightsError(null);
          } else {
            setInsightsError('Failed to get coaching analysis after AI move');
          }
        })
        .finally(() => {
          setIsLoadingInsights(false);
        });
      
      return true;
    } catch (error) {
      console.error('[AI] Move execution failed:', error);
      setIsAiThinking(false);
      setPendingAiMove(null);
      
      // Clear timeout on error
      if (aiMoveTimeout) {
        clearTimeout(aiMoveTimeout);
        setAiMoveTimeout(null);
      }
      
      return false;
    }
  }, [updateGameState, gameLog, isAiThinking, pendingAiMove, aiColor, aiMoveTimeout]);

  /**
   * Save the current game state to localStorage
   * Returns true if successful, false if failed
   */
  const saveCurrentGame = useCallback((): boolean => {
    const result = BoardStateManager.saveGame(
      gameEngineRef.current.fen(),
      historySan,
      isAiMode
    );

    if (result.success) {
      // Update state difference check after saving
      checkStateDifference();
      
      // Update hasSavedGame state after successful save
      setHasSavedGame(true);
    }

    return result.success;
  }, [historySan, isAiMode, checkStateDifference]);

  /**
   * Load the most recent saved game from localStorage
   * Returns true if successful, false if failed
   */
  const loadSavedGame = useCallback((): boolean => {
    // Clear any pending AI state before loading
    setIsAiThinking(false);
    setPendingAiMove(null);
    if (aiMoveTimeout) {
      clearTimeout(aiMoveTimeout);
      setAiMoveTimeout(null);
    }

    // Clear insights before loading new game
    clearInsights();

    const result = BoardStateManager.loadMostRecentGame();

    if (!result.success || !result.data) {
      console.warn('[LOAD_GAME]', result.error || 'Failed to load game');
      return false;
    }

    const mostRecentSave = result.data;

    try {
      // Load the game state
      gameEngineRef.current.load(mostRecentSave.fen);
      
      // Restore AI mode state
      setIsAiMode(mostRecentSave.isAiMode);
      
      // Update all game state to reflect the loaded position
      updateGameState();
      
      // Initialize game log with the loaded state
      gameLog.resetAll(mostRecentSave.fen);
      
      // Clear insights history when loading a saved game
      setInsightsHistory([]);
      
      return true;
      
    } catch (error) {
      console.error('[LOAD_GAME] Error applying loaded game state:', error);
      return false;
    }
  }, [updateGameState, gameLog, clearInsights, aiMoveTimeout]);

  // Memoize the return object to prevent unnecessary re-renders
  const returnValue = useMemo<UseChessReturn>(() => ({
    // State
    fen,
    turn,
    historySan,
    lastSan,
    lastMoveFrom,
    lastMoveTo,
    gameOver,
    gameResult,
    // AI game mode state
    isAiMode,
    isAiThinking,
    aiColor,
    pendingAiMove,
    // Coach insights state
    insights,
    insightsHistory,
    hasNewInsights,
    isLoadingInsights,
    insightsError,
    // Methods
    onPieceDrop,
    undo,
    reset,
    isGameOver,
    // Coach insights actions
    markInsightsAsViewed,
    clearInsights,
    // AI game mode actions
    toggleAiMode,
    setAiThinking,
    isAiTurn,
    handleAiMoveResponse,
    executeAiMove,
    // Save game functionality
    saveCurrentGame,
    loadSavedGame,
    isStateDifferentFromSaved,
    hasSavedGame,
    checkHasSavedGame
  }), [
    fen,
    turn,
    historySan,
    lastSan,
    lastMoveFrom,
    lastMoveTo,
    gameOver,
    gameResult,
    isAiMode,
    isAiThinking,
    aiColor,
    pendingAiMove,
    insights,
    insightsHistory,
    hasNewInsights,
    isLoadingInsights,
    insightsError,
    onPieceDrop,
    undo,
    reset,
    isGameOver,
    markInsightsAsViewed,
    clearInsights,
    toggleAiMode,
    setAiThinking,
    isAiTurn,
    handleAiMoveResponse,
    executeAiMove,
    saveCurrentGame,
    loadSavedGame,
    isStateDifferentFromSaved,
    hasSavedGame,
    checkHasSavedGame
  ]);

  return returnValue;
};

export default useChess;