import { Chessboard } from 'react-chessboard';
import type { PieceDropHandlerArgs, SquareHandlerArgs, PieceHandlerArgs } from 'react-chessboard';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
// import { Tag } from 'primereact/tag';
import { useChess } from '../chess/useChess';
import { useSectionModals } from '../hooks/useSectionModals';
import { SectionButtons } from '../app/components/SectionButtons';
import { SectionModal } from '../app/components/modals/SectionModal';
import { CoachModalContent } from '../app/components/modals/CoachModalContent';
import { GameLogModalContent } from '../app/components/modals/GameLogModalContent';
import { MoveListModalContent } from '../app/components/modals/MoveListModalContent';
import { DifficultyModal } from '../app/components/modals/DifficultyModal';
import { useAiDifficultyStore, type AiDifficulty } from '../store/aiDifficultyStore';
import '../App.css';
import { useRef, useEffect, useMemo } from 'react';

export function GamePage() {
  const {
    fen,
    turn,
    historySan,
    lastSan,
    gameOver,
    gameResult,
    onPieceDrop,
    undo,
    reset,
    insights,
    hasNewInsights,
    isLoadingInsights,
    markInsightsAsViewed,
    // AI state and functions (AI is always on now)
    isAiThinking,
    // Save game functionality
    saveCurrentGame,
    loadSavedGame,
    isStateDifferentFromSaved,
    hasSavedGame
  } = useChess();

  // AI Difficulty Store
  const { difficulty, openDifficultyModal } = useAiDifficultyStore();

  // Modal state management
  const { openModal, closeModal, isModalOpen } = useSectionModals();

  // Toast reference for showing notifications
  const toast = useRef<Toast>(null);
  const previousHasNewInsights = useRef<boolean>(false);

  // Helper functions for difficulty display
  const getDifficultyLabel = (difficulty: AiDifficulty | null): string => {
    if (!difficulty) return 'Not Set';
    return difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
  };

  // const getDifficultySeverity = (difficulty: AiDifficulty | null) => {
  //   switch (difficulty) {
  //     case 'beginner': return 'success';
  //     case 'intermediate': return 'info';
  //     case 'advanced': return 'danger';
  //     default: return 'secondary';
  //   }
  // };

  // Auto-open modal on initial load if no difficulty set
  useEffect(() => {
    if (difficulty === null) {
      openDifficultyModal();
    }
  }, [difficulty, openDifficultyModal]);

  // Show toast notification when new insights arrive
  useEffect(() => {
    // Only show toast when hasNewInsights changes from false to true
    // This prevents showing toast on initial render or repeated notifications
    if (hasNewInsights && !previousHasNewInsights.current && insights) {
      toast.current?.show({
        severity: 'info',
        summary: 'New coach analysis ready',
        detail: 'Check the Coach Feedback for your move evaluation',
        life: 4000,
        icon: 'pi pi-lightbulb',
        className: 'coach-analysis-toast'
      });
    }
    
    // Update the previous state
    previousHasNewInsights.current = hasNewInsights;
  }, [hasNewInsights, insights]);

  // Handle save game button click
  const handleSaveGame = () => {
    const success = saveCurrentGame();
    if (success) {
      toast.current?.show({
        severity: 'success',
        summary: 'Game saved successfully',
        detail: 'Your current game has been saved to local storage',
        life: 3000,
        icon: 'pi pi-check'
      });
    } else {
      toast.current?.show({
        severity: 'error',
        summary: 'Failed to save game',
        detail: 'An error occurred while saving your game',
        life: 3000,
        icon: 'pi pi-times'
      });
    }
  };

  // Handle load last game button click
  const handleLoadLastGame = () => {
    const success = loadSavedGame();
    if (success) {
      toast.current?.show({
        severity: 'success',
        summary: 'Last game loaded successfully',
        detail: 'Your most recent saved game has been restored',
        life: 3000,
        icon: 'pi pi-check'
      });
    } else {
      toast.current?.show({
        severity: 'error',
        summary: 'Failed to load game',
        detail: 'Unable to load the saved game. It may be corrupted or missing.',
        life: 3000,
        icon: 'pi pi-times'
      });
    }
  };

  // Adapter function to match react-chessboard signature
  const handlePieceDrop = ({ piece, sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean => {
    console.log('[HANDLE_PIECE_DROP] Called with:', { piece, sourceSquare, targetSquare });
    if (targetSquare === null) {
      console.log('[HANDLE_PIECE_DROP] Rejected: targetSquare is null');
      return false;
    }
    console.log('[HANDLE_PIECE_DROP] Calling onPieceDrop:', { sourceSquare, targetSquare });
    const result = onPieceDrop(sourceSquare, targetSquare);
    console.log('[HANDLE_PIECE_DROP] Result:', result);
    return result;
  };

  // Calculate whether pieces can be dragged based on game state (AI is always on for black)
  const canDragPiece = useMemo(() => {
    return (): boolean => {
      const result = !(gameOver || isAiThinking || isLoadingInsights || turn === 'b');
      return result;
    };
  }, [gameOver, isAiThinking, isLoadingInsights, turn]);

  return (
    <div className="grid" role="main" aria-label="Chess game interface">
      {/* Toast component for notifications */}
      <Toast
        ref={toast}
        position="top-right"
        className="p-toast-top-right"
        style={{ zIndex: 9999 }}
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
      />
      
      {/* Left Column - Chessboard */}
      <div className="col-12 lg:col-9">
        <div className="flex flex-column align-items-center gap-4 p-3">
          {/* Enhanced turn display with AI thinking indicator */}
          <div className="mb-3">
            <div className="text-center">
              {gameOver ? (
                <div className="text-2xl font-bold text-red-600">
                  {gameResult}
                </div>
              ) : isAiThinking ? (
                <div className="flex align-items-center justify-content-center gap-2">
                  <i className="pi pi-spin pi-spinner mr-10"></i>
                  <span className="text-xl font-semibold text-orange-500">AI is thinking...</span>
                </div>
              ) : (
                <div className="text-xl font-semibold text-primary">
                  <strong>Turn:</strong> {turn === 'w' ? 'White' : 'Black'}
                  {turn === 'b' && !gameOver && (
                    <span className="ml-2 text-blue-500">(AI)</span>
                  )}
                </div>
              )}
            </div>
          </div>
          
          {/* Chessboard Container */}
          <div className="w-full max-w-35rem board-container relative">
            <Chessboard
              options={{
                id: "ChessGame",
                position: fen,
                onPieceDrop: handlePieceDrop,
                canDragPiece: canDragPiece,
                onSquareClick: ({ piece, square }: SquareHandlerArgs) => {
                  console.log('[SQUARE_CLICK] Square clicked:', { piece, square });
                },
                onPieceClick: ({ isSparePiece, piece, square }: PieceHandlerArgs) => {
                  console.log('[PIECE_CLICK] Piece clicked:', { piece: piece.pieceType, square, isSparePiece });
                }
              }}
            />
            
            {/* Coach Feedback Loading Overlay */}
            {isLoadingInsights && (
              <div
                className="absolute inset-0 flex-content-centered z-10 rounded"
                style={{ backgroundColor: '#222222', opacity: 0.8 }}
              >
                <div className="flex-content-centered">
                  <i className="pi pi-spin pi-spinner text-white text-xl mr-10"></i>
                  <span className="text-xl font-medium text-white">Getting feedback from AI coach...</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Column - Sidebar */}
      <div className="col-12 lg:col-3">
        <div className="flex flex-column gap-3 p-3 overflow-auto" style={{ minHeight: '100vh' }}>
          {/* AI Difficulty Display */}
          <div className="mb-3">
            <div className="text-sm font-semibold mb-2">AI Difficulty</div>
            <Button
              icon="pi pi-pencil"
              onClick={openDifficultyModal}
              className="w-full flex align-items-center gap-2"
              severity="secondary"
              outlined
              aria-label="Change AI difficulty"
              title="Click to change AI difficulty level"
            >
              <span className="difficulty-label">{getDifficultyLabel(difficulty)}</span>
            </Button>
          </div>

          {/* Control Buttons */}
          <div className="flex flex-column gap-2" role="group" aria-label="Game controls">
            <Button
              label="New Game"
              icon="pi pi-plus"
              onClick={() => {
                reset();
                openDifficultyModal();
              }}
              disabled={(historySan.length === 0 && !gameOver) || isAiThinking}
              className="w-full"
              severity="info"
              aria-label="Start a new chess game"
              title="Start a new chess game"
            />
            <Button
              label="Save Game"
              icon="pi pi-save"
              onClick={handleSaveGame}
              disabled={historySan.length === 0 || !isStateDifferentFromSaved}
              className="w-full"
              severity="secondary"
              aria-label="Save the current game state"
              title="Save the current game state to local storage"
            />
            <Button
              label="Load Last Game"
              icon="pi pi-upload"
              onClick={handleLoadLastGame}
              disabled={!hasSavedGame || historySan.length > 0}
              className="w-full"
              severity="secondary"
              aria-label="Load the most recently saved game"
              title="Load the most recently saved game from local storage"
            />
            <Button
              label="Undo Move"
              icon="pi pi-undo"
              onClick={undo}
              disabled={historySan.length === 0 || isAiThinking}
              className="w-full"
              severity="secondary"
              aria-label="Undo the last move"
              title="Undo the last move"
            />
          </div>

          {/* Section Buttons */}
          <SectionButtons
            onOpenCoach={() => openModal('coach')}
            onOpenGameLog={() => openModal('gamelog')}
            onOpenMoveList={() => openModal('movelist')}
            hasNewInsights={hasNewInsights}
            moveCount={historySan.length}
          />
        </div>
      </div>

      {/* Section Modals */}
      
      {/* Coach Feedback Modal */}
      <SectionModal
        visible={isModalOpen('coach')}
        onHide={closeModal}
        sectionType="coach"
        title="Coach Feedback"
        size="large"
      >
        <CoachModalContent
          lastSan={lastSan}
          gameOver={gameOver}
          gameResult={gameResult}
          insights={insights}
          hasNewInsights={hasNewInsights}
          isLoadingInsights={isLoadingInsights}
          onMarkInsightsViewed={markInsightsAsViewed}
        />
      </SectionModal>

      {/* Game Log Modal */}
      <SectionModal
        visible={isModalOpen('gamelog')}
        onHide={closeModal}
        sectionType="gamelog"
        title="Game Log Debug"
        size="medium"
      >
        <GameLogModalContent />
      </SectionModal>

      {/* Move History Modal */}
      <SectionModal
        visible={isModalOpen('movelist')}
        onHide={closeModal}
        sectionType="movelist"
        title="Move History"
        size="small"
      >
        <MoveListModalContent history={historySan} />
        </SectionModal>
  
        {/* AI Difficulty Modal */}
        <DifficultyModal />
      </div>
    );
  }