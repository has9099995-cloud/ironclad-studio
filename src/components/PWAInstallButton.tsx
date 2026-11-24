import React, { useState } from 'react';
import { MonitorDown, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      const ok = await install();
      if (!ok) {
        setShowGuide(true);
      }
      return;
    }
    setShowGuide(true);
  };

  return (
    <>
      <button
        type="button"
        data-testid="install-app-btn"
        onClick={() => void handleClick()}
        className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded text-xs font-semibold border border-emerald-500/80 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 transition-colors cursor-pointer whitespace-nowrap"
      >
        <MonitorDown className="w-3.5 h-3.5 text-emerald-300" />
        Install App
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-guide-title"
            className="w-full max-w-md bg-[#11151b] border border-slate-700 rounded-md p-5 space-y-3.5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 id="install-guide-title" className="font-display text-lg font-bold text-slate-50 uppercase">
                Install Operation: Ironclad as an App
              </h2>
              <button
                type="button"
                aria-label="Close install guide"
                onClick={() => setShowGuide(false)}
                className="p-1 rounded text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <div className="space-y-2 text-sm text-slate-300">
                <p>To install this game onto your Home Screen (plays full-screen with no browser bar):</p>
                <ol className="list-decimal list-inside space-y-1 text-slate-200">
                  <li>Tap the <strong>Share</strong> button in Safari.</li>
                  <li>Tap <strong>Add to Home Screen</strong>.</li>
                  <li>Open the new <strong>Ironclad</strong> app icon from your Home Screen.</li>
                </ol>
              </div>
            ) : (
              <div className="space-y-2.5 text-sm text-slate-300">
                <p>Two easy ways to install and play outside the browser:</p>
                <div className="bg-[#0b0e12] border border-slate-800 rounded p-3 space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                    Option 1 — Instant Desktop App (Chrome / Edge)
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Open the game in its own tab, then click the <strong>Install icon</strong> in the top-right of the address bar (or menu → <strong>Cast, save, and share → Install Operation: Ironclad</strong>). It creates a Desktop shortcut and opens in its own game window.
                  </p>
                  <a
                    href={typeof window !== 'undefined' ? window.location.href : './'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-1.5 px-3 py-1.5 rounded bg-emerald-500/20 border border-emerald-400/70 text-emerald-200 text-xs font-semibold hover:bg-emerald-500/30"
                  >
                    Open Full Window to Install
                  </a>
                </div>
                <div className="bg-[#0b0e12] border border-slate-800 rounded p-3 space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                    Option 2 — Windows .exe / Mac .dmg (via GitHub)
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Export this project to GitHub, open your GitHub repository, and click <strong>Releases</strong> on the right side to download the <strong>.exe</strong> (Windows) or <strong>.dmg</strong> (Mac) installer built automatically.
                  </p>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold uppercase tracking-wider cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed bottom-3 right-4 z-40 flex items-center gap-2 rounded bg-amber-500/95 px-2.5 py-1 text-[11px] font-semibold text-slate-950 shadow-lg">
      <span className="h-2 w-2 rounded-full bg-slate-950 animate-pulse" />
      Offline Mode Ready
    </div>
  );
};
