import React from 'react';
import { Button } from 'primereact/button';
import { Badge } from 'primereact/badge';

export interface SectionButtonsProps {
  onOpenCoach: () => void;
  hasNewInsights?: boolean;
  moveCount: number;
}

export const SectionButtons: React.FC<SectionButtonsProps> = ({
  onOpenCoach,
  hasNewInsights = false
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
    </div>
  );
};

export default SectionButtons;