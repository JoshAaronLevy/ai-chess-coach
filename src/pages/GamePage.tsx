import { Chessboard } from 'react-chessboard';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { useChess } from '../chess/useChess';
import { useSectionModals } from '../hooks/useSectionModals';
import { SectionButtons } from '../app/components/SectionButtons';
import { SectionModal } from '../app/components/modals/SectionModal';
import { CoachModalContent } from '../app/components/modals/CoachModalContent';
import { GameLogModalContent } from '../app/components/modals/GameLogModalContent';
import { MoveListModalContent } from '../app/components/modals/MoveListModalContent';
import '../App.css';
import { useRef, useEffect } from 'react';

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
    markInsightsAsViewed
  } = useChess();

  // Modal state management
  const { openModal, closeModal, isModalOpen } = useSectionModals();

  // Toast reference for showing notifications
  const toast = useRef<Toast>(null);
  const previousHasNewInsights = useRef<boolean>(false);

  // Show toast notification when new insights arrive
  useEffect(() => {
    // Only show toast when hasNewInsights changes from false to true
    // This prevents showing toast on initial render or repeated notifications
    if (hasNewInsights && !previousHasNewInsights.current && insights) {
      toast.current?.show({
        severity: 'info',
        summary: 'New coach analysis ready',
        detail: 'Check the Coach Panel for your move evaluation',
        life: 4000,
        icon: 'pi pi-lightbulb',
        className: 'coach-analysis-toast'
      });
    }
    
    // Update the previous state
    previousHasNewInsights.current = hasNewInsights;
  }, [hasNewInsights, insights]);

  // Adapter function to match react-chessboard signature
  const handlePieceDrop = ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) => {
    if (targetSquare === null) return false;
    return onPieceDrop(sourceSquare, targetSquare);
  };

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
          {/* Current Turn / Game Status */}
          <div className="text-center">
            {gameOver ? (
              <div className="text-2xl font-bold text-red-600">
                {gameResult}
              </div>
            ) : (
              <div className="text-xl font-semibold text-primary">
                {turn === 'w' ? 'White to move' : 'Black to move'}
              </div>
            )}
          </div>
          
          {/* Chessboard Container */}
          <div className="w-full max-w-35rem board-container">
            <Chessboard
              options={{
                id: "ChessGame",
                position: fen,
                onPieceDrop: handlePieceDrop,
                allowDragging: !gameOver
              }}
            />
          </div>
        </div>
      </div>

      {/* Right Column - Sidebar */}
      <div className="col-12 lg:col-3">
        <div className="flex flex-column gap-3 p-3 overflow-auto" style={{ maxHeight: '100vh' }}>
          {/* Control Buttons */}
          <div className="flex flex-column gap-2" role="group" aria-label="Game controls">
            <Button
              label="Undo Move"
              icon="pi pi-undo"
              onClick={undo}
              disabled={historySan.length === 0}
              className="w-full"
              severity="secondary"
              aria-label="Undo the last move"
              title="Undo the last move"
            />
            <Button
              label="New Game"
              icon="pi pi-refresh"
              onClick={reset}
              disabled={historySan.length === 0 && !gameOver}
              className="w-full"
              severity="info"
              aria-label="Start a new chess game"
              title="Start a new chess game"
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
      
      {/* Coach Panel Modal */}
      <SectionModal
        visible={isModalOpen('coach')}
        onHide={closeModal}
        sectionType="coach"
        title="Coach Panel"
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

      {/* Move List Modal */}
      <SectionModal
        visible={isModalOpen('movelist')}
        onHide={closeModal}
        sectionType="movelist"
        title="Move List"
        size="small"
      >
        <MoveListModalContent history={historySan} />
      </SectionModal>
    </div>
  );
}