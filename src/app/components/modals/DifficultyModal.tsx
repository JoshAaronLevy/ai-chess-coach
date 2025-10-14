import React, { useState, useEffect } from 'react';
import { Dialog } from 'primereact/dialog';
import { SelectButton } from 'primereact/selectbutton';
import { Button } from 'primereact/button';
import { Tag } from 'primereact/tag';
import { useAiDifficultyStore, type AiDifficulty } from '@/store/aiDifficultyStore';

interface DifficultyOption {
  label: string;
  value: AiDifficulty;
  color: 'success' | 'info' | 'warning';
}

const difficultyOptions: DifficultyOption[] = [
  { label: 'Beginner', value: 'beginner', color: 'success' },
  { label: 'Intermediate', value: 'intermediate', color: 'info' },
  { label: 'Advanced', value: 'advanced', color: 'warning' }
];

const optionTemplate = (option: DifficultyOption) => {
  return (
    <div className="flex align-items-center gap-2">
      <Tag 
        value={option.label.charAt(0)} 
        severity={option.color}
        style={{ minWidth: '1.5rem', height: '1.5rem' }}
        className="text-xs font-bold"
      />
      <span>{option.label}</span>
    </div>
  );
};

export const DifficultyModal: React.FC = () => {
  const { 
    difficulty, 
    showDifficultyModal, 
    setDifficulty, 
    closeDifficultyModal 
  } = useAiDifficultyStore();

  const [selectedDifficulty, setSelectedDifficulty] = useState<AiDifficulty | null>(
    difficulty
  );

  // Update local state when store difficulty changes
  useEffect(() => {
    setSelectedDifficulty(difficulty);
  }, [difficulty]);

  const handleSubmit = () => {
    if (selectedDifficulty) {
      setDifficulty(selectedDifficulty);
      closeDifficultyModal();
    }
  };

  const handleDialogHide = () => {
    // Only allow closing if difficulty already exists in store
    if (difficulty !== null) {
      closeDifficultyModal();
    }
  };

  const isClosable = difficulty !== null;
  const canSubmit = selectedDifficulty !== null;

  const footerContent = (
    <div className="flex justify-content-end w-full">
      <Button
        label={difficulty === null ? "Start Game" : "Confirm"}
        icon="pi pi-check"
        onClick={handleSubmit}
        disabled={!canSubmit}
        severity="success"
        autoFocus
        aria-label={`${difficulty === null ? 'Start game' : 'Confirm'} with ${selectedDifficulty || 'selected'} difficulty`}
        className="transition-all transition-duration-150"
      />
    </div>
  );

  return (
    <Dialog
      header="Choose AI Difficulty"
      visible={showDifficultyModal}
      onHide={handleDialogHide}
      footer={footerContent}
      modal={true}
      closable={isClosable}
      draggable={false}
      resizable={false}
      style={{ width: '450px' }}
      breakpoints={{ '960px': '75vw', '640px': '90vw' }}
      className="difficulty-modal"
      contentStyle={{ padding: '2rem' }}
      aria-labelledby="difficulty-modal-header"
      aria-describedby="difficulty-modal-content"
      focusOnShow={true}
      closeOnEscape={isClosable}
      dismissableMask={isClosable}
    >
      <div 
        id="difficulty-modal-content"
        className="flex flex-column gap-4"
        role="main"
      >
        <div className="flex flex-column gap-3">
          <SelectButton
            id="difficulty-selector"
            value={selectedDifficulty}
            onChange={(e) => setSelectedDifficulty(e.value)}
            options={difficultyOptions}
            optionLabel="label"
            optionValue="value"
            itemTemplate={optionTemplate}
            className="w-full"
            style={{ display: 'flex' }}
            aria-label="Choose AI difficulty level"
            unselectable={false}
          />
        </div>

        {!canSubmit && difficulty === null && (
          <div className="text-center mt-2">
            <small className="text-orange-600 font-medium">
              <i className="pi pi-info-circle mr-1"></i>
              Please select a difficulty to continue
            </small>
          </div>
        )}
      </div>
    </Dialog>
  );
};

export default DifficultyModal;