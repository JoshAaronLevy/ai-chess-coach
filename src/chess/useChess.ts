import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Chess } from 'chess.js';
import { useGameLog } from './useGameLog.js';
import { boardToPieces, countMaterial, capturedFromMaterial, toMoveInfo } from './serializers.js';
import type { LegalMoveDetailed, PieceType, MoveInsights } from '../types/chess.js';
import { hashPositionId } from '../utils/hash.js';
import { type TutorInsights } from '../utils/difyParser';
import { useAiDifficultyStore } from '../store/aiDifficultyStore';
import { BoardStateManager } from '../services/BoardStateManager.js';
import { ChessGameEngine } from '../services/ChessGameEngine.js';
import { ChessCoachApiService } from '../services/ChessCoachApiService.js';
import { AIPlayerService } from '../services/AIPlayerService.js';
import type { AnalysisRequest } from '../types/api.js';

type ChessColor = 'w' | 'b';

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

function computePositionId(fen: string, turn: 'w'|'b'): string {
  return hashPositionId(`${fen}|${turn}`);
}

function buildAnalysisPayload(game: Chess, lastMove?: any): AnalysisRequest {
  const currentPieces = boardToPieces(game);
  const materialCount = countMaterial(currentPieces);
  
  // Calculate captured pieces by comparing to starting position
  const startingMaterial = {
    white: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 },
    black: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 }
  };
  const capturedPieces = capturedFromMaterial(startingMaterial, materialCount);
  
  const boardState = {
    pieces: currentPieces,
    fen: game.fen(),
    turn: game.turn(),
    moveNumber: game.moveNumber(),
    halfmoveClock: game.fen().split(' ')[4],
    fullmoveNumber: game.fen().split(' ')[5],
    inCheck: game.inCheck(),
    gameOver: game.isGameOver(),
    checkmate: game.isCheckmate(),
    stalemate: game.isStalemate(),
    draw: game.isDraw(),
    threefoldRepetition: game.isThreefoldRepetition(),
    insufficientMaterial: game.isInsufficientMaterial(),
    positionId: computePositionId(game.fen(), game.turn()),
    legalMovesDetailed: computeLegalMovesDetailed(game)
  };

  return {
    boardState,
    lastMove: lastMove ? toMoveInfo(lastMove) : undefined,
    materialCount,
    capturedPieces,
    moveHistory: {
      san: game.history(),
      uci: game.history({ verbose: true }).map(m => toMoveInfo(m).uci),
      totalMoves: game.history().length,
      currentPly: game.history().length
    },
    gameAnalysis: {
      legalMoves: game.moves(),
      legalMovesCount: game.moves().length,
      attackedSquares: game.moves({ verbose: true }).map(m => m.to),
      kingSquares: {
        white: currentPieces.find(p => p.type === 'k' && p.color === 'w')?.square,
        black: currentPieces.find(p => p.type === 'k' && p.color === 'b')?.square
      }
    }
  };
}

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

export const useChess = (): UseChessReturn => {
  const gameEngineRef = useRef(new ChessGameEngine());
  
  const gameLog = useGameLog();
  
  const { difficulty } = useAiDifficultyStore();
  
  const [engineVersion, setEngineVersion] = useState(0);
  
  // Derive all game-related state from the engine (single source of truth)
  const fen = useMemo(() => gameEngineRef.current.fen(), [engineVersion]);
  const turn = useMemo(() => gameEngineRef.current.turn(), [engineVersion]);
  const historySan = useMemo(() => gameEngineRef.current.history(), [engineVersion]);
  const gameState = useMemo(() => gameEngineRef.current.getGameState(), [engineVersion]);
  const lastSan = gameState.lastMove?.san;
  const lastMoveFrom = gameState.lastMove?.from;
  const lastMoveTo = gameState.lastMove?.to;
  const gameOver = gameState.isGameOver;
  const gameResult = gameState.gameResult;

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

  const refreshGameState = useCallback(() => {
    setEngineVersion(v => v + 1);
    // Check if current state differs from saved state
    const isDifferent = BoardStateManager.isStateDifferent(
      gameEngineRef.current.fen(),
      gameEngineRef.current.history(),
      isAiMode
    );
    setIsStateDifferentFromSaved(isDifferent);
  }, [isAiMode]);

  const updateGameState = refreshGameState;

  const onPieceDrop = useCallback((from: string, to: string): boolean => {
    const game = gameEngineRef.current.getChessInstance();
    const move = game.move({ from, to, promotion: 'q' });
    console.log('[DROP]', { from, to, move, fen: game.fen() });
    if (move == null) return false;
    
    // Trigger re-render to reflect the move
    refreshGameState();
    
    // Record move in game log
    gameLog.recordAfterMove(game, move);
    
    // Build analysis request payload
    const analysisRequest = buildAnalysisPayload(game, move);

    // Comprehensive board state logging for LLM analysis
    console.log('Complete Chess Board State for LLM:', JSON.stringify(analysisRequest));

    // Send board state to coach API for analysis
    console.log('[COACH] API call takes flight with payload:', analysisRequest);
    setIsLoadingInsights(true);
    setInsightsError(null);
    
    // Set AI thinking state before API call when in AI mode
    if (isAiMode && game.turn() === aiColor) {
      setIsAiThinking(true);
    }
    
    ChessCoachApiService.analyzePosition(analysisRequest)
      .then(resp => {
        // Service returns parsed insights directly (TutorInsights)
        const parsedInsights = resp;
        console.log('[AI Tutor Insights]', JSON.stringify(parsedInsights));
        
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
          
          // Enhanced AI move validation and side checking with difficulty-based selection
          if (isAiMode && game.turn() === aiColor && !game.isGameOver()) {
            console.log('[AI Auto-Move]', {
              turn: game.turn(),
              aiColor,
              difficulty: difficulty,
              gameOver: game.isGameOver()
            });
            
            // Validate that the move is for the correct side
            const expectedSide = game.turn(); // Should be 'b' for AI
            if (expectedSide !== aiColor) {
              console.warn('[AI] Move returned for wrong side. Expected:', aiColor, 'Current turn:', expectedSide);
              setIsAiThinking(false);
              return;
            }
            
            // Double-check game state before proceeding
            if (game.isGameOver()) {
              console.log('[AI] Game ended before AI could move');
              setIsAiThinking(false);
              return;
            }
            
            // Use AIPlayerService to select the best move based on difficulty
            const moveSelection = AIPlayerService.selectMove(parsedInsights, difficulty);
            
            if (moveSelection) {
              console.log('[AI Move Selected]', {
                difficulty: moveSelection.difficulty,
                move: moveSelection.move,
                usedFallback: moveSelection.fallbackUsed
              });
              handleAiMoveResponse(moveSelection.move);
            } else {
              console.warn('[AI] No valid moves found in API response');
              setIsAiThinking(false);
            }
          }
      })
      .catch(err => {
        // Service already attempted to parse insights from error response
        // If we're here, the API call failed and no insights could be extracted
        console.log('[COACH] API call failed:', err instanceof Error ? err.message : String(err));
        
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
      })
      .finally(() => {
        setIsLoadingInsights(false);
      });
    
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    gameLog,
    isAiMode,
    refreshGameState,
    aiMoveTimeout,
    difficulty,
    lastSan,
    lastMoveFrom,
    lastMoveTo,
    historySan
  ]); 

  const undo = useCallback(() => {
    const undoMove = gameEngineRef.current.undo();
    if (undoMove) {
      updateGameState();
      gameLog.undoLast();
      setInsightsHistory(prev => prev.slice(0, -1));
      
      const game = gameEngineRef.current.getChessInstance();
      const analysisPayload = buildAnalysisPayload(game);
      console.log('Complete Chess Board State for LLM (After Undo):', JSON.stringify(analysisPayload));
    }
  }, [updateGameState, gameLog]);

  const reset = useCallback(() => {
    gameEngineRef.current.reset();
    updateGameState();
    gameLog.resetAll(gameEngineRef.current.fen());
    clearInsights();
    setInsightsHistory([]);
    
    checkHasSavedGame();
    
    setIsAiThinking(false);
    setPendingAiMove(null);
    
    if (aiMoveTimeout) {
      clearTimeout(aiMoveTimeout);
      setAiMoveTimeout(null);
    }
    
    console.log('[AI] AI state cleared during game reset');
    
    const game = gameEngineRef.current.getChessInstance();
    const analysisPayload = buildAnalysisPayload(game);
    console.log('Complete Chess Board State for LLM (After Reset):', JSON.stringify(analysisPayload));
  }, [updateGameState, gameLog, checkHasSavedGame, aiMoveTimeout]);

  const isGameOver = useCallback((): boolean => {
    return gameEngineRef.current.isGameOver();
  }, []);

  const markInsightsAsViewed = useCallback(() => {
    setHasNewInsights(false);
  }, []);

  const clearInsights = useCallback(() => {
    setInsights(null);
    setHasNewInsights(false);
    setIsLoadingInsights(false);
    setInsightsError(null);
  }, []);

  const toggleAiMode = useCallback(() => {
    if (historySan.length === 0) {
      if (isAiThinking) {
        console.log('[AI] Clearing AI thinking state during mode toggle');
        setIsAiThinking(false);
        setPendingAiMove(null);
        
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

  const setAiThinking = useCallback((thinking: boolean) => {
    setIsAiThinking(thinking);
  }, []);

  const isAiTurn = useCallback(() => {
    return isAiMode && turn === aiColor && !gameOver;
  }, [isAiMode, turn, aiColor, gameOver]);

  const handleAiMoveResponse = useCallback((bestMove: { uci: string, san: string }) => {
    const game = gameEngineRef.current.getChessInstance();
    if (!isAiMode || game.isGameOver()) {
      return;
    }

    console.log('[AI] Processing move response:', bestMove);
    setIsAiThinking(true);
    setPendingAiMove(bestMove.uci);
    
    // Use AIPlayerService to schedule the move with timeout protection
    const { protectionTimeoutId } = AIPlayerService.scheduleMove(
      bestMove,
      (move) => executeAiMove(move.uci),
      () => {
        console.warn('[AI] AI move execution timed out');
        setIsAiThinking(false);
        setPendingAiMove(null);
        setAiMoveTimeout(null);
      }
    );

    // Store the protection timeout ID for cleanup
    setAiMoveTimeout(protectionTimeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAiMode]); 

  const executeAiMove = useCallback((uciMove: string) => {
    if (isAiThinking && pendingAiMove) {
      console.warn('[AI] AI move already in progress, ignoring duplicate request');
      return false;
    }

    const game = gameEngineRef.current.getChessInstance();
    
    if (!game || !AIPlayerService.isAiTurn(game, aiColor)) {
      console.warn('[AI] Cannot execute AI move: invalid game state or not AI turn');
      setIsAiThinking(false);
      return false;
    }

    try {
      console.log('[AI] Attempting to execute move:', uciMove);

      const moveResult = AIPlayerService.executeMove(game, { uci: uciMove, san: '' });
      if (!moveResult) {
        console.error('[AI] Invalid move:', uciMove);
        setIsAiThinking(false);
        setPendingAiMove(null);
        return false;
      }
      
      console.log('[AI] Move executed successfully:', { uci: uciMove, san: moveResult.san });
      
      // Update game state
      updateGameState();
      
      // Record move in game log if initialized
      if (gameLog.snapshots.length > 0) {
        gameLog.recordAfterMove(game, moveResult);
      }
      
      // Clear timeout if it exists
      if (aiMoveTimeout) {
        clearTimeout(aiMoveTimeout);
        setAiMoveTimeout(null);
      }
      
      // Clear AI state
      setIsAiThinking(false);
      setPendingAiMove(null);
      
      // Check for game over
      if (game.isGameOver()) {
        console.log('[AI] Game ended after AI move');
        // No further AI processing needed
        return true;
      }
      
      // Call coaching API after AI move to continue analysis cycle
      const gradeRequest = buildAnalysisPayload(game, moveResult);
      
      // Set loading state before API call (matching normal user move flow)
      setIsLoadingInsights(true);
      setInsightsError(null);
      
      ChessCoachApiService.analyzePosition(gradeRequest)
        .then(parsedInsights => {
          console.log('[AI] Coach analysis completed after AI move');
          // Service returns parsed insights directly
          setInsights(parsedInsights);
          setHasNewInsights(true);
          setInsightsError(null);
        })
        .catch(err => {
          console.log('[AI] Coach analysis failed after AI move:', err);
          setInsightsError('Failed to get coaching analysis after AI move');
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

  const saveCurrentGame = useCallback((): boolean => {
    const gameData = gameEngineRef.current.toJSON(isAiMode);
    const success = BoardStateManager.saveGame(gameData);

    if (success) {
      refreshGameState();
      
      setHasSavedGame(true);
    }

    return success;
  }, [isAiMode, refreshGameState]);

  const loadSavedGame = useCallback((): boolean => {
    setIsAiThinking(false);
    setPendingAiMove(null);
    if (aiMoveTimeout) {
      clearTimeout(aiMoveTimeout);
      setAiMoveTimeout(null);
    }

    clearInsights();

    const savedGame = BoardStateManager.loadMostRecentGame();

    if (!savedGame) {
      console.warn('[LOAD_GAME] No saved game found');
      return false;
    }

    try {
      const success = gameEngineRef.current.fromJSON(savedGame);
      if (!success) {
        console.error('[LOAD_GAME] Failed to restore game state');
        return false;
      }
      
      // Restore AI mode state
      setIsAiMode(savedGame.isAiMode);
      
      // Update all game state to reflect the loaded position
      refreshGameState();
      
      // Initialize game log with the loaded state
      gameLog.resetAll(savedGame.fen);
      
      // Clear insights history when loading a saved game
      setInsightsHistory([]);
      
      return true;
      
    } catch (error) {
      console.error('[LOAD_GAME] Error applying loaded game state:', error);
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameLog, aiMoveTimeout]); // refreshGameState and clearInsights create circular dependencies

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