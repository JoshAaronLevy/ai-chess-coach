import React from 'react';
import { Button } from 'primereact/button';
import { Badge } from 'primereact/badge';

export interface SectionButtonsProps {
  onOpenCoach: () => void;
  onOpenGameLog: () => void;
  onOpenMoveList: () => void;
  hasNewInsights?: boolean;
  moveCount: number;
}

export const SectionButtons: React.FC<SectionButtonsProps> = ({
  onOpenCoach,
  onOpenGameLog,
  onOpenMoveList,
  hasNewInsights = false,
  moveCount
}) => {
  return (
    <div className="flex flex-column gap-2" role="group" aria-label="Section controls">
      {/* Coach Feedback Button */}
      <div className="relative">
        <Button
          label="Coach Feedback"
          icon="pi pi-user"
          onClick={onOpenCoach}
          className="w-full"
          severity="secondary"
          aria-label="Open coach feedback with move analysis"
          title="View coach analysis and move insights"
        />
        {hasNewInsights && (
          <Badge
            value="New"
            severity="info"
            className="absolute"
            style={{
              top: '-8px',
              right: '-8px',
              animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                ? 'none'
                : 'pulse 2s infinite',
              fontSize: '0.75rem',
              zIndex: 1
            }}
            aria-label="New coach insights available"
          />
        )}
      </div>

      {/* Game Log Button */}
      <Button
        label="Game Log"
        icon="pi pi-code"
        onClick={onOpenGameLog}
        className="w-full"
        severity="secondary"
        aria-label="Open game log with debug information"
        title="View game state, FEN, and captured pieces"
      />

      {/* Move History Button */}
      <div className="relative">
        <Button
          label="Move History"
          icon="pi pi-list"
          onClick={onOpenMoveList}
          className="w-full"
          severity="secondary"
          aria-label={`Open move history${moveCount > 0 ? ` with ${moveCount} moves` : ''}`}
          title="View complete move history"
        />
        {moveCount > 0 && (
          <Badge
            value={moveCount.toString()}
            severity="secondary"
            className="absolute"
            style={{
              top: '-8px',
              right: '-8px',
              fontSize: '0.75rem',
              zIndex: 1
            }}
            aria-label={`${moveCount} moves played`}
          />
        )}
      </div>
    </div>
  );
};

export default SectionButtons;