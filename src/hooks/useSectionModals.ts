import { useState, useCallback } from 'react';

export type SectionType = 'coach' | 'gamelog' | 'movelist' | 'info' | null;

export interface UseSectionModalsReturn {
  activeModal: SectionType;
  openModal: (section: SectionType) => void;
  closeModal: () => void;
  isModalOpen: (section: SectionType) => boolean;
}

export function useSectionModals(): UseSectionModalsReturn {
  const [activeModal, setActiveModal] = useState<SectionType>(null);

  const openModal = useCallback((section: SectionType) => {
    setActiveModal(section);
  }, []);

  const closeModal = useCallback(() => {
    setActiveModal(null);
  }, []);

  const isModalOpen = useCallback((section: SectionType) => {
    return activeModal === section;
  }, [activeModal]);

  return {
    activeModal,
    openModal,
    closeModal,
    isModalOpen
  };
}