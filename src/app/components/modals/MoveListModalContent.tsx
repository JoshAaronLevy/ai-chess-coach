import React from 'react';
import { Divider } from 'primereact/divider';

interface MoveListModalContentProps {
  history: string[];
}

export const MoveListModalContent: React.FC<MoveListModalContentProps> = ({ history }) => {
  // Group moves into pairs (white, black)
  const movePairs: Array<{ moveNumber: number; white: string; black?: string }> = [];
  
  for (let i = 0; i < history.length; i += 2) {
    const moveNumber = Math.floor(i / 2) + 1;
    const whiteMove = history[i];
    const blackMove = history[i + 1];
    
    movePairs.push({
      moveNumber,
      white: whiteMove,
      black: blackMove
    });
  }

  return (
    <div className="flex flex-column">
      {/* Move Count Header */}
      <div className="flex align-items-center gap-2 mb-3">
        <i className="pi pi-info-circle text-primary" />
        <span className="font-medium">
          {history.length === 0 
            ? 'No moves played' 
            : `${history.length} move${history.length === 1 ? '' : 's'} played`
          }
        </span>
      </div>

      {history.length === 0 ? (
        <div className="text-center text-500 p-4">
          <i className="pi pi-info-circle mr-2" />
          No moves played yet. Make your first move to see the move history.
        </div>
      ) : (
        <>
          <Divider />
          <div className="max-h-30rem overflow-auto">
            {movePairs.map((pair) => (
              <div 
                key={pair.moveNumber}
                className="flex align-items-center py-2 px-2 hover:bg-gray-50 border-round"
              >
                <div className="w-2rem text-right mr-3 text-500 font-medium">
                  {pair.moveNumber}.
                </div>
                <div className="flex gap-4 font-mono text-sm">
                  <span className="w-4rem text-left font-semibold">
                    {pair.white}
                  </span>
                  {pair.black && (
                    <span className="w-4rem text-left">
                      {pair.black}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          {/* Summary Footer */}
          <Divider />
          <div className="text-center text-500 text-sm p-2">
            <i className="pi pi-clock mr-2" />
            Game in progress • {Math.ceil(history.length / 2)} move pairs
          </div>
        </>
      )}
    </div>
  );
};

export default MoveListModalContent;