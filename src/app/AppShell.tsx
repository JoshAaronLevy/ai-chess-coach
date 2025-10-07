import { useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menubar } from 'primereact/menubar';
import { Toast } from 'primereact/toast';
import type { MenuItem } from 'primereact/menuitem';
import { SectionModal } from './components/modals/SectionModal';
import { InfoModalContent } from './components/modals/InfoModalContent';

export function AppShell() {
  const toast = useRef<Toast>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);

  const menuItems: MenuItem[] = [
    {
      label: 'Info',
      icon: 'pi pi-info-circle',
      command: () => setShowInfoModal(true)
    }
  ];

  const start = (
    <div className="flex align-items-center gap-2">
      <i className="pi pi-chess-king text-2xl"></i>
      <span className="font-bold text-xl">AI Chess Coach</span>
    </div>
  );

  return (
    <div className="min-h-screen">
      <Menubar
        model={menuItems}
        start={start}
        className="border-none border-round-0 space-between"
      />
      <Toast ref={toast} />
      <main className="p-4">
        <Outlet />
      </main>

      {/* Info Modal */}
      <SectionModal
        visible={showInfoModal}
        onHide={() => setShowInfoModal(false)}
        sectionType="info"
        title="About AI Chess Coach"
        size="large"
      >
        <InfoModalContent />
      </SectionModal>
    </div>
  );
}