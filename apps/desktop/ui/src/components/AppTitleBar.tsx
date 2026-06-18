import { useState, useEffect } from "react";

type TitlebarButton = "minimize" | "maximize" | "close";

export function AppTitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    import("@tauri-apps/api/window")
      .then(async ({ getCurrentWindow }) => {
        if (cancelled) return;
        try {
          const win = getCurrentWindow();
          const maximized = await win.isMaximized();
          if (!cancelled) setIsMaximized(maximized);
          unlisten = await win.onResized(async () => {
            if (!cancelled) {
              try { setIsMaximized(await win.isMaximized()); } catch (e) { console.error("Failed to read maximized state:", e); }
            }
          });
        } catch (e) {
          console.error("Tauri window API unavailable:", e);
        }
      })
      .catch((e) => { console.error("Failed to load window API:", e); });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  async function handleAction(action: TitlebarButton) {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      switch (action) {
        case "minimize":
          await win.minimize();
          break;
        case "maximize":
          await win.toggleMaximize();
          setIsMaximized(await win.isMaximized());
          break;
        case "close":
          await win.close();
          break;
      }
    } catch (e) {
      console.error(`Window action "${action}" failed:`, e);
    }
  }

  return (
    <div className="app-titlebar">
      <div className="app-titlebar-brand" data-tauri-drag-region>
        <span className="app-titlebar-icon">TF</span>
        <span className="app-titlebar-text">TokenFence Studio</span>
      </div>
      <div className="app-titlebar-spacer" data-tauri-drag-region />
      <div className="app-titlebar-controls">
        <button
          className="app-titlebar-btn"
          onClick={() => handleAction("minimize")}
          title="Minimize"
          aria-label="Minimize"
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <rect x="1" y="5.5" width="10" height="1" fill="currentColor" />
          </svg>
        </button>
        <button
          className="app-titlebar-btn"
          onClick={() => handleAction("maximize")}
          title={isMaximized ? "Restore" : "Maximize"}
          aria-label={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? (
            <svg width="12" height="12" viewBox="0 0 12 12">
              <rect x="3" y="0.5" width="8" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1" />
              <rect x="0.5" y="3.5" width="8" height="8" rx="1" fill="var(--tf-sidebar-bg)" stroke="currentColor" strokeWidth="1" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12">
              <rect x="1" y="1" width="10" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          )}
        </button>
        <button
          className="app-titlebar-btn app-titlebar-btn-close"
          onClick={() => handleAction("close")}
          title="Close"
          aria-label="Close"
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
