import React from 'react';
import { Panel } from 'primereact/panel';
import { Divider } from 'primereact/divider';

interface CoachPanelProps {
  lastSan?: string;
  gameOver?: boolean;
  gameResult?: string;
}

export const CoachPanel: React.FC<CoachPanelProps> = ({
  lastSan,
  gameOver,
  gameResult
}) => {
  const headerTemplate = (
    <div className="flex align-items-center gap-2">
      <i className="pi pi-user text-primary" />
      <span className="font-semibold">Coach Panel</span>
    </div>
  );

  return (
    <Panel header={headerTemplate} className="h-full">
      <div className="flex flex-column gap-3">
        {/* Last Move Section */}
        <div>
          <div className="flex align-items-center gap-2 mb-2">
            <i className="pi pi-arrow-right text-primary" />
            <span className="font-medium">Last Move</span>
          </div>
          <div className="ml-4 text-700">
            {lastSan ?? '—'}
          </div>
        </div>

        <Divider />

        {/* Grade Section */}
        <div>
          <div className="flex align-items-center gap-2 mb-2">
            <i className="pi pi-star text-primary" />
            <span className="font-medium">Grade</span>
          </div>
          <div className="ml-4 text-700">
            —
          </div>
        </div>

        <Divider />

        {/* Explanation Section */}
        <div>
          <div className="flex align-items-center gap-2 mb-2">
            <i className="pi pi-lightbulb text-primary" />
            <span className="font-medium">Explanation</span>
          </div>
          <div className="ml-4 text-700">
            Engine not connected yet. This is a stub.
          </div>
        </div>

        {/* Game Status Section - Only show if game is over */}
        {gameOver && (
          <>
            <Divider />
            <div>
              <div className="flex align-items-center gap-2 mb-2">
                <i className="pi pi-flag text-primary" />
                <span className="font-medium">Game Status</span>
              </div>
              <div className="ml-4 text-700 font-semibold">
                {gameResult || 'Game Over'}
              </div>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
};

export default CoachPanel;