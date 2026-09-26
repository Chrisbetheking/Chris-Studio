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
          if (!cancelled) {
            setIsMaximized(maximized);
            console.log("[window] init: isMaximized=" + maximized);
          }
          unlisten = await win.onResized(async () => {
            if (!cancelled) {
              try {
                const m = await win.isMaximized();
                console.log("[window] resized: isMaximized=" + m);
                setIsMaximized(m);
              } catch (e) {
                console.error("[window] Failed to read maximized state after resize:", e);
              }
            }
          });
        } catch (e) {
          console.error("[window] Tauri window API unavailable:", e);
        }
      })
      .catch((e) => { console.error("[window] Failed to load window API:", e); });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  /* ---- drag handler ---- */
  const handleStartDragging = async (event: React.MouseEvent) => {
    if (event.button !== 0) return;
    console.log("[window] drag start");
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().startDragging();
    } catch (e) {
      console.error("[window] Failed to start dragging:", e);
    }
  };

  /* ---- window button handlers ---- */
  const handleMinimize = async () => {
    console.log("[window] minimize clicked");
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().minimize();
    } catch (e) {
      console.error("[window] Failed to minimize:", e);
    }
  };

  const handleToggleMaximize = async () => {
    console.log("[window] maximize clicked (isMaximized=" + isMaximized + ")");
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      const maximized = await win.isMaximized();
      if (maximized) {
        await win.unmaximize();
        console.log("[window] unmaximized");
      } else {
        await win.maximize();
        console.log("[window] maximized");
      }
      setIsMaximized(!maximized);
    } catch (e) {
      console.error("[window] Failed to toggle maximize:", e);
    }
  };

  const handleClose = async () => {
    console.log("[window] close clicked");
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().close();
    } catch (e) {
      console.error("[window] Failed to close:", e);
    }
  };

  return (
    <div className="app-titlebar">
      <div
        className="app-titlebar-brand"
        data-tauri-drag-region
        onMouseDown={handleStartDragging}
      >
        <span className="app-titlebar-icon">TF</span>
        <span className="app-titlebar-text">TokenFence Studio</span>
      </div>
      <div
        className="app-titlebar-spacer"
        data-tauri-drag-region
        onMouseDown={handleStartDragging}
      />
      <div className="app-titlebar-controls">
        <button
          className="app-titlebar-btn"
          onClick={handleMinimize}
          title="Minimize"
          aria-label="Minimize"
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <rect x="1" y="5.5" width="10" height="1" fill="currentColor" />
          </svg>
        </button>
        <button
          className="app-titlebar-btn"
          onClick={handleToggleMaximize}
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
          onClick={handleClose}
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
