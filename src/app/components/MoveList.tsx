import React from 'react';
import { Panel } from 'primereact/panel';

interface MoveListProps {
  history: string[];
}

export const MoveList: React.FC<MoveListProps> = ({ history }) => {
  const headerTemplate = (
    <div className="flex align-items-center gap-2">
      <i className="pi pi-list text-primary" />
      <span className="font-semibold">Move List</span>
    </div>
  );

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
    <Panel header={headerTemplate} className="h-full">
      <div className="flex flex-column">
        {history.length === 0 ? (
          <div className="text-center text-500 p-4">
            <i className="pi pi-info-circle mr-2" />
            No moves played
          </div>
        ) : (
          <div className="max-h-20rem overflow-auto">
            {movePairs.map((pair) => (
              <div 
                key={pair.moveNumber}
                className="flex align-items-center py-1 px-2 hover:bg-gray-50 border-round"
              >
                <div className="w-2rem text-right mr-3 text-500 font-medium">
                  {pair.moveNumber}.
                </div>
                <div className="flex gap-3 font-mono text-sm">
                  <span className="w-4rem text-left">
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
        )}
      </div>
    </Panel>
  );
};

export default MoveList;