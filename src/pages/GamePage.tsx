import { Chessboard } from 'react-chessboard';
import { Button } from 'primereact/button';
import { useChess } from '../chess/useChess';
import { CoachPanel } from '../coach/CoachPanel';
import { GameLogPanel } from '../app/components/GameLogPanel';
import { MoveList } from '../app/components/MoveList';
import '../App.css';

export function GamePage() {
  const { fen, turn, historySan, lastSan, gameOver, gameResult, onPieceDrop, undo, reset } = useChess();

  // Adapter function to match react-chessboard signature
  const handlePieceDrop = ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) => {
    if (targetSquare === null) return false;
    return onPieceDrop(sourceSquare, targetSquare);
  };

  return (
    <div className="grid">
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
          <div className="flex flex-column gap-2">
            <Button
              label="Undo Move"
              icon="pi pi-undo"
              onClick={undo}
              disabled={historySan.length === 0}
              className="w-full"
              severity="secondary"
            />
            <Button
              label="New Game"
              icon="pi pi-refresh"
              onClick={reset}
              disabled={historySan.length === 0 && !gameOver}
              className="w-full"
              severity="info"
            />
          </div>

          {/* Coach Panel */}
          <CoachPanel
            lastSan={lastSan}
            gameOver={gameOver}
            gameResult={gameResult}
          />

          {/* Game Log Panel */}
          <GameLogPanel />

          {/* Move List */}
          <MoveList history={historySan} />
        </div>
      </div>
    </div>
  );
}