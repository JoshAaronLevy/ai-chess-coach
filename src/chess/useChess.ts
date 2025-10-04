import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Chess } from 'chess.js';
import { useGameLog } from './useGameLog.js';
import { boardToPieces, countMaterial, capturedFromMaterial, toMoveInfo } from './serializers.js';
import type { LegalMoveDetailed, PieceType } from '../types/chess.js';
import { hashPositionId } from '../utils/hash.js';
import { postCoachGrade } from '../lib/coachApi';
import { parseDifyAnswer, type TutorInsights } from '../utils/difyParser';
import { applyUciMove } from '../utils/uciUtils.js';

console.info('[USE_CHESS_INIT]');

/**
 * Type for chess piece colors
 */
type ChessColor = 'w' | 'b';

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
  const [isAiMode, setIsAiMode] = useState<boolean>(false);
  const [isAiThinking, setIsAiThinking] = useState<boolean>(false);
  const [pendingAiMove, setPendingAiMove] = useState<string | null>(null);
  const [aiMoveTimeout, setAiMoveTimeout] = useState<number | null>(null);
  const aiColor = 'b' as const; // AI always plays black

  // Initialize game log on first mount if no current log exists
  useEffect(() => {
    if (gameLog.snapshots.length === 0) {
      gameLog.startNew(gameRef.current.fen());
    }
  }, []); // Empty dependency array - only run on mount

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
  }, []);

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
    
    // Update UI state
    setFen(gameRef.current.fen());
    setLastSan(move.san);
    setHistorySan(gameRef.current.history());
    setGameOver(gameRef.current.isGameOver());
    
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
        // Keep existing log exactly as is
        console.log('[COACH] API call completed successfully:', JSON.stringify(resp));
        
        // Parse and store insights in state
        const parsedInsights = parseDifyAnswer(resp);
        console.log('[AI Tutor Insights]', JSON.stringify(parsedInsights));
        
        if (parsedInsights) {
          setInsights(parsedInsights);
          setHasNewInsights(true);
          setInsightsError(null);
          
          // Enhanced AI move validation and side checking
          if (isAiMode && gameRef.current.turn() === aiColor && !gameRef.current.isGameOver()) {
            const bestMove = parsedInsights.bestMove?.uci;
            if (bestMove) {
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
              
              if (parsedInsights.bestMove) {
                handleAiMoveResponse(parsedInsights.bestMove);
              }
            } else {
              console.warn('[AI] AI mode enabled but no bestMove found in API response');
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
          
          // Enhanced AI move validation and side checking
          if (isAiMode && gameRef.current.turn() === aiColor && !gameRef.current.isGameOver()) {
            const bestMove = parsedInsights.bestMove?.uci;
            if (bestMove) {
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
              
              if (parsedInsights.bestMove) {
                handleAiMoveResponse(parsedInsights.bestMove);
              }
            } else {
              console.warn('[AI] AI mode enabled but no bestMove found in API response');
              setIsAiThinking(false);
            }
          }
        } else {
          setInsightsError(err instanceof Error ? err.message : 'Coach API call failed');
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
      gameLog.recordAfterMove(gameRef.current, moveResult);
      
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
    executeAiMove
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
    executeAiMove
  ]);

  return returnValue;
};

export default useChess;