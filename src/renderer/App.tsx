import { DropZone } from './components/DropZone';
import { MonitorDock } from './components/MonitorDock';
import { Toolbar } from './components/Toolbar';
import { useQueueStore } from './store/queueStore';

import React, { useEffect } from 'react';

export default function App() {
  const { loadBlenders } = useQueueStore();

  useEffect(() => {
    loadBlenders();
  }, [loadBlenders]);

  return (
    <div className="flex h-screen flex-col bg-rn-bg text-rn-text antialiased font-sans overflow-hidden">
      {/* Top Application Toolbar */}
      <Toolbar />

      {/* Main Queue & Drop Area */}
      <DropZone />

      {/* Bottom Monitor Dock */}
      <MonitorDock />
    </div>
  );
}
