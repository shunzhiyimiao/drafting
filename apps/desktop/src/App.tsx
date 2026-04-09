import { useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { MainContent } from "./components/MainContent";
import { RightPanel } from "./components/RightPanel";
import { BottomPanel } from "./components/BottomPanel";
import { useLayoutStore } from "./stores/layout-store";

function TooSmallScreen() {
  return (
    <div className="flex items-center justify-center h-screen bg-bg-primary p-8 text-center">
      <div>
        <p className="text-lg font-medium text-text-primary mb-2">
          Window too small
        </p>
        <p className="text-sm text-text-muted">
          Drafting requires a minimum window width of 768px.
        </p>
      </div>
    </div>
  );
}

function App() {
  const { sidebarCollapsed, zenMode } = useLayoutStore();
  const [windowTooSmall, setWindowTooSmall] = useState(false);

  useEffect(() => {
    const check = () => setWindowTooSmall(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (windowTooSmall) {
    return <TooSmallScreen />;
  }

  return (
    <div className="flex h-screen bg-bg-primary">
      {!sidebarCollapsed && !zenMode && <Sidebar />}
      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex flex-1 min-h-0">
          <MainContent />
          {!zenMode && <RightPanel />}
        </div>
        {!zenMode && <BottomPanel />}
      </div>
    </div>
  );
}

export default App;
