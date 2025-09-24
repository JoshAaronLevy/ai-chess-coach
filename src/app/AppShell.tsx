import { useRef } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Menubar } from 'primereact/menubar';
import { Toast } from 'primereact/toast';
import type { MenuItem } from 'primereact/menuitem';

export function AppShell() {
  const toast = useRef<Toast>(null);
  const navigate = useNavigate();

  const menuItems: MenuItem[] = [
    {
      label: 'Home',
      icon: 'pi pi-home',
      command: () => navigate('/')
    },
    {
      label: 'Play',
      icon: 'pi pi-play',
      command: () => navigate('/play')
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
        className="border-none border-round-0"
      />
      <Toast ref={toast} />
      <main className="p-4">
        <Outlet />
      </main>
    </div>
  );
}