import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Chess } from 'chess.js';
import { useGameLog } from './useGameLog.js';
import { boardToPieces, countMaterial, capturedFromMaterial, toMoveInfo } from './serializers.js';
import type { LegalMoveDetailed, PieceType } from '../types/chess.js';
import { hashPositionId } from '../utils/hash.js';
import { postCoachGrade } from '../lib/coachApi';
import { parseDifyAnswer, type TutorInsights } from '../utils/difyParser';
import { applyUciMove } from '../utils/uciUtils.js';
import { useAiDifficultyStore } from '../store/aiDifficultyStore';

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
  gameOver: boolean;
  gameResult?: string;
  // AI game mode state
  isAiMode: boolean;
  isAiThinking: boolean;
  aiColor: 'b';
  pendingAiMove: string | null;
}

/**
 * Interface for saved game data
 */
interface SavedGameData {
  id: string;
  timestamp: number;
  fen: string;
  historySan: string[];
  isAiMode: boolean;
  moveCount: number;
  currentTurn: 'w' | 'b';
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
 * Uses chess.js for game logic and state management
 */
export const useChess = (): UseChessReturn => {
  // Persistent chess.js instance using useRef
  const gameRef = useRef(new Chess());
  
  // Initialize game log hook
  const gameLog = useGameLog();
  
  // Get difficulty setting from store
  const { difficulty } = useAiDifficultyStore();
  
  // Game state derived from gameRef.current
  const [fen, setFen] = useState<string>(gameRef.current.fen());
  const [turn, setTurn] = useState<ChessColor>(gameRef.current.turn());
  const [historySan, setHistorySan] = useState<string[]>([]);
  const [lastSan, setLastSan] = useState<string | undefined>(undefined);
  const [gameOver, setGameOver] = useState<boolean>(false);
  const [gameResult, setGameResult] = useState<string | undefined>(undefined);

  // Coach insights state
  const [insights, setInsights] = useState<TutorInsights | null>(null);
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
    try {
      // Check localStorage for any saved games
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('acc_saved_game_')) {
          try {
            const data = JSON.parse(localStorage.getItem(key) || '{}');
            if (data.timestamp) {
              setHasSavedGame(true);
              return true;
            }
          } catch {
            // Skip invalid entries
          }
        }
      }
      setHasSavedGame(false);
      return false;
    } catch (error) {
      console.error('[CHECK_SAVED_GAME] Error checking for saved games:', error);
      setHasSavedGame(false);
      return false;
    }
  }, []);

  // Initialize game log on first mount if no current log exists
  useEffect(() => {
    if (gameLog.snapshots.length === 0) {
      gameLog.startNew(gameRef.current.fen());
    }
    // Check for saved games on component initialization
    checkHasSavedGame();
  }, [checkHasSavedGame]);

  /**
   * Check if current game state differs from the most recently saved state
   */
  const checkStateDifference = useCallback(() => {
    try {
      // Get all saved games from localStorage
      const allSavedGames: SavedGameData[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('acc_saved_game_')) {
          try {
            const data = JSON.parse(localStorage.getItem(key) || '{}');
            if (data.timestamp) {
              allSavedGames.push(data);
            }
          } catch {
            // Skip invalid entries
          }
        }
      }

      if (allSavedGames.length === 0) {
        // No saved games, so current state is always different
        setIsStateDifferentFromSaved(true);
        return;
      }

      // Get the most recent saved game
      const mostRecentSave = allSavedGames.sort((a, b) => b.timestamp - a.timestamp)[0];
      
      // Compare current state with saved state
      const currentState = {
        fen: gameRef.current.fen(),
        historySan: [...gameRef.current.history()],
        isAiMode: isAiMode
      };

      const isDifferent = (
        currentState.fen !== mostRecentSave.fen ||
        currentState.historySan.length !== mostRecentSave.historySan.length ||
        currentState.isAiMode !== mostRecentSave.isAiMode ||
        !currentState.historySan.every((move, index) => move === mostRecentSave.historySan[index])
      );

      setIsStateDifferentFromSaved(isDifferent);
    } catch (error) {
      console.error('[STATE_COMPARISON] Error checking state difference:', error);
      // On error, assume state is different
      setIsStateDifferentFromSaved(true);
    }
  }, [isAiMode]);

  /**
   * Updates all state variables based on current chess.js instance
   */
  const updateGameState = useCallback(() => {
    setFen(gameRef.current.fen());
    setTurn(gameRef.current.turn());
    setHistorySan([...gameRef.current.history()]);
    
    // Get the last move if any
    const history = gameRef.current.history();
    setLastSan(history.length > 0 ? history[history.length - 1] : undefined);
    
    // Check game over conditions
    const isOver = gameRef.current.isGameOver();
    setGameOver(isOver);
    
    if (isOver) {
      let result = '';
      if (gameRef.current.isCheckmate()) {
        result = gameRef.current.turn() === 'w' ? 'Black wins by checkmate' : 'White wins by checkmate';
      } else if (gameRef.current.isStalemate()) {
        result = 'Draw by stalemate';
      } else if (gameRef.current.isThreefoldRepetition()) {
        result = 'Draw by threefold repetition';
      } else if (gameRef.current.isInsufficientMaterial()) {
        result = 'Draw by insufficient material';
      } else if (gameRef.current.isDraw()) {
        result = 'Draw';
      }
      setGameResult(result);
    } else {
      setGameResult(undefined);
    }

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
    const move = gameRef.current.move({ from, to, promotion: 'q' }); // promotion default is fine
    console.log('[DROP]', { from, to, move, fen: gameRef.current.fen() });
    if (move == null) return false;
    
    // DEBUG: Log turn state before move
    console.log('[TURN_DEBUG] Before move - Chess.js turn:', gameRef.current.turn(), 'React turn state:', turn);
    
    // Update UI state (but NOT turn yet - wait for API completion)
    setFen(gameRef.current.fen());
    setLastSan(move.san);
    setHistorySan(gameRef.current.history());
    setGameOver(gameRef.current.isGameOver());
    
    // Update game state to trigger save button state check
    updateGameState();
    
    // DEBUG: Turn will be updated after API call completes
    console.log('[TURN_DEBUG] Move applied, waiting for API completion to update turn display');
    
    // Record move in game log
    gameLog.recordAfterMove(gameRef.current, move);
    
    // Comprehensive board state logging for LLM analysis
    const currentPieces = boardToPieces(gameRef.current);
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
      fen: gameRef.current.fen(),
      turn: gameRef.current.turn(),
      moveNumber: gameRef.current.moveNumber(),
      halfmoveClock: gameRef.current.fen().split(' ')[4], // Extract halfmove clock from FEN
      fullmoveNumber: gameRef.current.fen().split(' ')[5], // Extract fullmove number from FEN
      inCheck: gameRef.current.inCheck(),
      gameOver: gameRef.current.isGameOver(),
      checkmate: gameRef.current.isCheckmate(),
      stalemate: gameRef.current.isStalemate(),
      draw: gameRef.current.isDraw(),
      threefoldRepetition: gameRef.current.isThreefoldRepetition(),
      insufficientMaterial: gameRef.current.isInsufficientMaterial(),
      positionId: computePositionId(gameRef.current.fen(), gameRef.current.turn()),
      legalMovesDetailed: computeLegalMovesDetailed(gameRef.current)
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
        san: gameRef.current.history(),
        uci: gameRef.current.history({ verbose: true }).map(m => toMoveInfo(m).uci),
        totalMoves: gameRef.current.history().length,
        currentPly: gameRef.current.history().length
      },
      gameAnalysis: {
        legalMoves: gameRef.current.moves(),
        legalMovesCount: gameRef.current.moves().length,
        attackedSquares: gameRef.current.moves({ verbose: true }).map(m => m.to),
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
    if (isAiMode && gameRef.current.turn() === aiColor) {
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
          
          // Update turn state now that API call completed successfully
          setTurn(gameRef.current.turn());
          console.log('[TURN_DEBUG] API call succeeded - Turn updated to:', gameRef.current.turn());
          
          // Enhanced AI move validation and side checking with difficulty-based selection
          if (isAiMode && gameRef.current.turn() === aiColor && !gameRef.current.isGameOver()) {
            console.log('[AI Auto-Move]', {
              turn: gameRef.current.turn(),
              aiColor,
              difficulty: difficulty,
              gameOver: gameRef.current.isGameOver()
            });
            
            // Validate that the move is for the correct side
            const expectedSide = gameRef.current.turn(); // Should be 'b' for AI
            if (expectedSide !== aiColor) {
              console.warn('[AI] Move returned for wrong side. Expected:', aiColor, 'Current turn:', expectedSide);
              setIsAiThinking(false);
              return;
            }
            
            // Double-check game state before proceeding
            if (gameRef.current.isGameOver()) {
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
                const moveResult = applyUciOrSan(gameRef.current, moveSelection.move);
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
                  gameRef.current.undo();
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
          setTurn(gameRef.current.turn());
          console.log('[TURN_DEBUG] API call failed but insights parsed - Turn updated to:', gameRef.current.turn());
          
          // Enhanced AI move validation and side checking with difficulty-based selection (error case)
          if (isAiMode && gameRef.current.turn() === aiColor && !gameRef.current.isGameOver()) {
            // Validate that the move is for the correct side
            const expectedSide = gameRef.current.turn(); // Should be 'b' for AI
            if (expectedSide !== aiColor) {
              console.warn('[AI] Move returned for wrong side. Expected:', aiColor, 'Current turn:', expectedSide);
              setIsAiThinking(false);
              return;
            }
            
            // Double-check game state before proceeding
            if (gameRef.current.isGameOver()) {
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
                const moveResult = applyUciOrSan(gameRef.current, moveSelection.move);
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
                  gameRef.current.undo();
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
          setTurn(gameRef.current.turn());
          console.log('[TURN_DEBUG] API call failed completely - Turn updated to:', gameRef.current.turn());
          
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
    const undoMove = gameRef.current.undo();
    if (undoMove) {
      updateGameState();
      gameLog.undoLast();
      
      // Enhanced board state logging after undo
      const currentPieces = boardToPieces(gameRef.current);
      const materialCount = countMaterial(currentPieces);
      
      const startingMaterial = {
        white: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 },
        black: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 }
      };
      const capturedPieces = capturedFromMaterial(startingMaterial, materialCount);
      
      const boardState = {
        pieces: currentPieces,
        fen: gameRef.current.fen(),
        turn: gameRef.current.turn(),
        moveNumber: gameRef.current.moveNumber(),
        halfmoveClock: gameRef.current.fen().split(' ')[4],
        fullmoveNumber: gameRef.current.fen().split(' ')[5],
        inCheck: gameRef.current.inCheck(),
        gameOver: gameRef.current.isGameOver(),
        checkmate: gameRef.current.isCheckmate(),
        stalemate: gameRef.current.isStalemate(),
        draw: gameRef.current.isDraw(),
        threefoldRepetition: gameRef.current.isThreefoldRepetition(),
        insufficientMaterial: gameRef.current.isInsufficientMaterial(),
        positionId: computePositionId(gameRef.current.fen(), gameRef.current.turn()),
        legalMovesDetailed: computeLegalMovesDetailed(gameRef.current)
      };

      console.log('Complete Chess Board State for LLM (After Undo):', JSON.stringify({
        boardState,
        materialCount,
        capturedPieces,
        moveHistory: {
          san: gameRef.current.history(),
          uci: gameRef.current.history({ verbose: true }).map(m => toMoveInfo(m).uci),
          totalMoves: gameRef.current.history().length,
          currentPly: gameRef.current.history().length
        },
        gameAnalysis: {
          legalMoves: gameRef.current.moves(),
          legalMovesCount: gameRef.current.moves().length,
          attackedSquares: gameRef.current.moves({ verbose: true }).map(m => m.to),
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
    gameRef.current.reset();
    updateGameState();
    gameLog.resetAll(gameRef.current.fen());
    clearInsights(); // Clear insights when starting a new game
    
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
    const currentPieces = boardToPieces(gameRef.current);
    const materialCount = countMaterial(currentPieces);
    
    const startingMaterial = {
      white: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 },
      black: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 }
    };
    const capturedPieces = capturedFromMaterial(startingMaterial, materialCount);
    
    const boardState = {
      pieces: currentPieces,
      fen: gameRef.current.fen(),
      turn: gameRef.current.turn(),
      moveNumber: gameRef.current.moveNumber(),
      halfmoveClock: gameRef.current.fen().split(' ')[4],
      fullmoveNumber: gameRef.current.fen().split(' ')[5],
      inCheck: gameRef.current.inCheck(),
      gameOver: gameRef.current.isGameOver(),
      checkmate: gameRef.current.isCheckmate(),
      stalemate: gameRef.current.isStalemate(),
      draw: gameRef.current.isDraw(),
      threefoldRepetition: gameRef.current.isThreefoldRepetition(),
      insufficientMaterial: gameRef.current.isInsufficientMaterial(),
      positionId: computePositionId(gameRef.current.fen(), gameRef.current.turn()),
      legalMovesDetailed: computeLegalMovesDetailed(gameRef.current)
    };

    console.log('Complete Chess Board State for LLM (After Reset):', JSON.stringify({
      boardState,
      materialCount,
      capturedPieces,
      moveHistory: {
        san: gameRef.current.history(),
        uci: gameRef.current.history({ verbose: true }).map(m => toMoveInfo(m).uci),
        totalMoves: gameRef.current.history().length,
        currentPly: gameRef.current.history().length
      },
      gameAnalysis: {
        legalMoves: gameRef.current.moves(),
        legalMovesCount: gameRef.current.moves().length,
        attackedSquares: gameRef.current.moves({ verbose: true }).map(m => m.to),
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
    return gameRef.current.isGameOver();
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
    if (!isAiMode || gameRef.current.isGameOver()) {
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
    if (!gameRef.current || gameRef.current.isGameOver()) {
      console.warn('[AI] Cannot execute AI move: game ended or invalid state');
      setIsAiThinking(false);
      return false;
    }

    // Validate it's still AI's turn
    if (gameRef.current.turn() !== aiColor) {
      console.warn('[AI] Cannot execute AI move: not AI\'s turn');
      setIsAiThinking(false);
      return false;
    }

    try {
      console.log('[AI] Attempting to execute move:', uciMove);

      const moveResult = applyUciMove(gameRef.current, uciMove);
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
        gameLog.recordAfterMove(gameRef.current, moveResult);
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
      if (gameRef.current.isGameOver()) {
        console.log('[AI] Game ended after AI move:', {
          isCheckmate: gameRef.current.isCheckmate(),
          isStalemate: gameRef.current.isStalemate(),
          isDraw: gameRef.current.isDraw(),
          isThreefoldRepetition: gameRef.current.isThreefoldRepetition(),
          isInsufficientMaterial: gameRef.current.isInsufficientMaterial()
        });
        // No further AI processing needed
        return true;
      }
      
      // Call coaching API after AI move to continue analysis cycle
      const gradeRequest = {
        chess_position: gameRef.current.fen(),
        previous_move_uci: moveResult.uci || null,
        previous_move_san: moveResult.san || null
      };
      
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
    try {
      if (historySan.length === 0) {
        console.warn('[SAVE_GAME] Cannot save game with no moves');
        return false;
      }

      const timestamp = Date.now();
      const savedGameData: SavedGameData = {
        id: `saved_game_${timestamp}`,
        timestamp,
        fen: gameRef.current.fen(),
        historySan: [...historySan],
        isAiMode,
        moveCount: historySan.length,
        currentTurn: gameRef.current.turn()
      };

      const storageKey = `acc_saved_game_${timestamp}`;
      localStorage.setItem(storageKey, JSON.stringify(savedGameData));
      
      console.log('[SAVE_GAME] Game saved successfully:', { key: storageKey, data: savedGameData });
      
      // Update state difference check after saving
      checkStateDifference();
      
      // Update hasSavedGame state after successful save
      setHasSavedGame(true);
      
      return true;
    } catch (error) {
      console.error('[SAVE_GAME] Failed to save game:', error);
      return false;
    }
  }, [historySan, isAiMode, checkStateDifference]);

  /**
   * Load the most recent saved game from localStorage
   * Returns true if successful, false if failed
   */
  const loadSavedGame = useCallback((): boolean => {
    try {
      console.log('[LOAD_GAME] Starting load process...');
      
      // Find all saved games from localStorage
      const allSavedGames: SavedGameData[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('acc_saved_game_')) {
          try {
            const data = JSON.parse(localStorage.getItem(key) || '{}');
            if (data.timestamp && data.fen && data.historySan) {
              allSavedGames.push(data);
            }
          } catch (parseError) {
            console.warn('[LOAD_GAME] Skipping corrupted save data:', key, parseError);
          }
        }
      }

      if (allSavedGames.length === 0) {
        console.warn('[LOAD_GAME] No saved games found');
        return false;
      }

      // Find the most recent saved game (highest timestamp)
      const mostRecentSave = allSavedGames.sort((a, b) => b.timestamp - a.timestamp)[0];
      console.log('[LOAD_GAME] Loading most recent save:', mostRecentSave);

      // Validate the saved game data
      if (!mostRecentSave.fen || !Array.isArray(mostRecentSave.historySan)) {
        console.error('[LOAD_GAME] Invalid saved game data structure');
        return false;
      }

      // Clear any pending AI state before loading
      setIsAiThinking(false);
      setPendingAiMove(null);
      if (aiMoveTimeout) {
        clearTimeout(aiMoveTimeout);
        setAiMoveTimeout(null);
      }

      // Clear insights before loading new game
      clearInsights();

      try {
        // Create a new chess instance to validate the saved state
        const testGame = new Chess();
        
        // Load the FEN position to validate it
        testGame.load(mostRecentSave.fen);
        
        // Validate move history by replaying it
        const replayGame = new Chess();
        for (const move of mostRecentSave.historySan) {
          const moveResult = replayGame.move(move);
          if (!moveResult) {
            console.error('[LOAD_GAME] Invalid move in history:', move);
            return false;
          }
        }
        
        // Verify the replayed game matches the saved FEN
        if (replayGame.fen() !== mostRecentSave.fen) {
          console.error('[LOAD_GAME] Move history does not match saved FEN');
          return false;
        }

        // All validation passed, now load the game state
        gameRef.current.load(mostRecentSave.fen);
        
        // Restore AI mode state
        setIsAiMode(mostRecentSave.isAiMode);
        
        // Update all game state to reflect the loaded position
        updateGameState();
        
        // Initialize game log with the loaded state
        gameLog.resetAll(mostRecentSave.fen);
        
        console.log('[LOAD_GAME] Game loaded successfully:', {
          fen: mostRecentSave.fen,
          moveCount: mostRecentSave.historySan.length,
          isAiMode: mostRecentSave.isAiMode,
          currentTurn: mostRecentSave.currentTurn
        });
        
        return true;
        
      } catch (chessError) {
        console.error('[LOAD_GAME] Chess.js error loading saved state:', chessError);
        return false;
      }
      
    } catch (error) {
      console.error('[LOAD_GAME] Failed to load saved game:', error);
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
    gameOver,
    gameResult,
    // AI game mode state
    isAiMode,
    isAiThinking,
    aiColor,
    pendingAiMove,
    // Coach insights state
    insights,
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
    gameOver,
    gameResult,
    isAiMode,
    isAiThinking,
    aiColor,
    pendingAiMove,
    insights,
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