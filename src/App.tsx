/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { TacticalFpsEngine } from './game/engine';
import {
  ALL_MAP_ORDER,
  buildMapQueue,
  createInitialWeaponsState,
  getGraphicsPreset,
  MAX_WAVES,
  WEAPON_ORDER,
} from './game/rules';
import type {
  AABB2D,
  DifficultyMode,
  GraphicsSettings,
  HudSnapshot,
  MapId,
  QualityMode,
  RendererBackendPref,
  WeaponId,
} from './game/types';
import { TitleOverlay } from './components/TitleOverlay';
import { CombatHud } from './components/CombatHud';
import { StatusModal } from './components/StatusModal';
import { OfflineIndicator } from './components/PWAInstallButton';

const DEFAULT_GRAPHICS: GraphicsSettings = getGraphicsPreset('balanced');

const INITIAL_HUD: HudSnapshot = {
  phase: 'title',
  gameMode: 'combat',
  outcome: 'none',
  hp: 100,
  maxHp: 100,
  armor: 50,
  maxArmor: 50,
  stamina: 100,
  activeWeapon: 'rifle',
  weapons: createInitialWeaponsState(),
  isReloading: false,
  reloadProgress: 0,
  isAds: false,
  grenades: 3,
  wave: 1,
  maxWaves: MAX_WAVES,
  enemiesRemaining: 0,
  waveBanner: null,
  score: 0,
  kills: 0,
  headshots: 0,
  shotsFired: 0,
  shotsHit: 0,
  elapsedSeconds: 0,
  hitmarkerKind: 'none',
  damageFlash: 0,
  damageAngle: null,
  pointerLocked: false,
  muted: false,
  musicMuted: false,
  musicVolume: 0.55,
  crosshairSpread: 0.026,
  killFeed: [],
  playerX: 0,
  playerZ: 23,
  playerYaw: 0,
  radarBlips: [],
  difficulty: 'standard',
  mapId: 'ironclad',
  nextMapId: 'harbor',
  mapQueue: buildMapQueue('ironclad'),
  autoQueueMaps: true,
  activeBackendLabel: 'Initializing...',
  qualityMode: DEFAULT_GRAPHICS.preset,
  graphics: DEFAULT_GRAPHICS,
  fps: 0,
  aimTraining: {
    drill: 'static',
    timeRemaining: 30,
    challengeActive: false,
    challengeComplete: false,
    kills: 0,
    headshots: 0,
    shotsFired: 0,
    shotsHit: 0,
    streak: 0,
    bestStreak: 0,
    kpm: 0,
    avgTtkMs: 0,
    bestSpeedKills: 0,
    headshotOnly: false,
    strafeEnabled: false,
  },
};

interface ErrorBoundaryState {
  error: Error | null;
}

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Operation Ironclad UI error:', error);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="w-screen h-screen bg-[#0b0e12] text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#12171e] border border-red-500/40 rounded-md p-6 space-y-4">
            <div className="text-xs font-mono-num uppercase tracking-widest text-amber-400">
              Viewport Recovery
            </div>
            <h1 className="font-display text-2xl font-bold text-slate-50">
              Graphics Session Interrupted
            </h1>
            <p className="text-sm text-slate-300">
              {this.state.error.message || 'An unexpected rendering error occurred.'}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold uppercase tracking-wider cursor-pointer"
            >
              Reload Session
            </button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <AppErrorBoundary>
      <TacticalFpsApp />
    </AppErrorBoundary>
  );
}

function TacticalFpsApp() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<TacticalFpsEngine | null>(null);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [obstacles, setObstacles] = useState<AABB2D[]>([]);
  const [difficulty, setDifficulty] = useState<DifficultyMode>('standard');
  const [selectedWeapon, setSelectedWeapon] = useState<WeaponId>('rifle');
  const [selectedMap, setSelectedMap] = useState<MapId>('ironclad');
  const [qualityMode, setQualityMode] = useState<QualityMode>(DEFAULT_GRAPHICS.preset);
  const [graphics, setGraphics] = useState<GraphicsSettings>(DEFAULT_GRAPHICS);
  const [backendPref, setBackendPref] = useState<RendererBackendPref>('webgl2');
  const [autoQueueMaps, setAutoQueueMaps] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    document.body.dataset.state = 'title';
    const mount = canvasMountRef.current;
    if (!mount) return;

    const params = new URLSearchParams(window.location.search);
    const mapParam = params.get('map') as MapId | null;
    const weaponParam = params.get('weapon') as WeaponId | null;
    const qualityParam = params.get('quality') as QualityMode | null;
    const backendParam = params.get('backend') as RendererBackendPref | null;

    const initialMap: MapId = mapParam && ALL_MAP_ORDER.includes(mapParam) ? mapParam : 'ironclad';
    const initialWeapon: WeaponId = weaponParam && WEAPON_ORDER.includes(weaponParam) ? weaponParam : 'rifle';
    const initialQuality: QualityMode | null =
      qualityParam &&
      (qualityParam === 'performance' ||
        qualityParam === 'balanced' ||
        qualityParam === 'high' ||
        qualityParam === 'ultra')
        ? qualityParam
        : null;
    const initialBackend: RendererBackendPref =
      backendParam && (backendParam === 'auto' || backendParam === 'webgl2') ? backendParam : 'webgl2';

    setSelectedMap(initialMap);
    setSelectedWeapon(initialWeapon);
    setBackendPref(initialBackend);

    let engine: TacticalFpsEngine | null = null;
    try {
      engine = new TacticalFpsEngine(mount, {
        onHudUpdate: (snapshot) => {
          setHud(snapshot);
          setQualityMode(snapshot.qualityMode);
          setGraphics(snapshot.graphics);
        },
        onPhaseChange: (phase) => {
          document.body.dataset.state = phase;
        },
      });
      engineRef.current = engine;

      if (initialQuality) {
        engine.setQualityMode(initialQuality);
      } else {
        const saved = engine.getGraphicsSettings();
        setGraphics(saved);
        setQualityMode(saved.preset);
      }

      if (initialBackend !== 'webgl2') {
        void engine.setRendererBackendPref(initialBackend);
      }
      if (initialMap !== 'ironclad') {
        engine.loadMap(initialMap);
      }

      if (params.get('autostart') === '1') {
        engine.startNewRun('standard', initialWeapon, initialMap);
      }
    } catch (err) {
      console.error('Failed to initialize 3D engine:', err);
      setInitError(err instanceof Error ? err.message : 'Unable to initialize 3D graphics context.');
    }

    return () => {
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  // Sync radar obstacle geometry whenever active map changes or engine completes async init
  useEffect(() => {
    if (engineRef.current) {
      setObstacles(engineRef.current.getObstaclesForRadar());
      setSelectedMap(hud.mapId);
    }
  }, [hud.mapId, hud.phase]);

  const handleSelectMap = (mapId: MapId) => {
    setSelectedMap(mapId);
    engineRef.current?.loadMap(mapId);
  };

  const handleQualityChange = (q: QualityMode) => {
    setQualityMode(q);
    engineRef.current?.setQualityMode(q);
  };

  const handleGraphicsPatch = (patch: Partial<Omit<GraphicsSettings, 'preset'>>) => {
    engineRef.current?.setGraphicsSettings(patch);
  };

  const handleBackendChange = (b: RendererBackendPref) => {
    setBackendPref(b);
    void engineRef.current?.setRendererBackendPref(b);
  };

  const handleToggleAutoQueue = (enabled: boolean) => {
    setAutoQueueMaps(enabled);
    engineRef.current?.setAutoQueueMaps(enabled);
  };

  const handleDeploy = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    engineRef.current?.startNewRun(difficulty, selectedWeapon, selectedMap);
  };

  const handleDeployTraining = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setSelectedMap('range');
    engineRef.current?.startNewRun(difficulty, selectedWeapon, 'range');
  };

  const handleRestart = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    engineRef.current?.startNewRun(difficulty, selectedWeapon, hud.mapId);
  };

  const handleDeployNextMap = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    engineRef.current?.deployNextMap();
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#0b0e12]">
      {/* Isolated WebGPU (Vulkan) / WebGL2 Mount Container */}
      <div
        ref={canvasMountRef}
        className="absolute inset-0 w-full h-full bg-[#0b0e12]"
        aria-label="3D Tactical Combat Viewport"
      />

      {initError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b0e12]/95 p-6">
          <div className="max-w-md w-full bg-[#12171e] border border-red-500/40 rounded-md p-6 space-y-3">
            <div className="text-xs font-mono-num uppercase tracking-widest text-amber-400">
              Graphics Fallback Notice
            </div>
            <p className="text-sm text-slate-200">{initError}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold uppercase text-sm cursor-pointer"
            >
              Retry WebGL2
            </button>
          </div>
        </div>
      )}

      {hud.phase === 'title' && (
        <TitleOverlay
          difficulty={difficulty}
          onSelectDifficulty={setDifficulty}
          selectedWeapon={selectedWeapon}
          onSelectWeapon={setSelectedWeapon}
          selectedMap={selectedMap}
          onSelectMap={handleSelectMap}
          qualityMode={qualityMode}
          onSelectQuality={handleQualityChange}
          graphics={graphics}
          onGraphicsChange={handleGraphicsPatch}
          backendPref={backendPref}
          onSelectBackend={handleBackendChange}
          activeBackendLabel={hud.activeBackendLabel}
          autoQueueMaps={autoQueueMaps}
          onToggleAutoQueue={handleToggleAutoQueue}
          musicMuted={hud.musicMuted}
          onToggleMusic={() => engineRef.current?.toggleMusic()}
          onDeploy={handleDeploy}
          onDeployTraining={handleDeployTraining}
        />
      )}

      {hud.phase === 'playing' && (
        <CombatHud
          hud={hud}
          obstacles={obstacles}
          onSwitchWeapon={(w) => engineRef.current?.switchWeapon(w)}
          onToggleMute={() => engineRef.current?.toggleMute()}
          onToggleMusic={() => engineRef.current?.toggleMusic()}
          onPause={() => engineRef.current?.pauseGame()}
          onRestart={handleRestart}
          onSetAimDrill={(d) => engineRef.current?.setAimDrill(d)}
          onToggleHeadshotOnly={() => engineRef.current?.toggleAimHeadshotOnly()}
          onToggleStrafe={() => engineRef.current?.toggleAimStrafe()}
          onRestartAimDrill={() => engineRef.current?.restartAimDrill()}
        />
      )}

      {(hud.phase === 'paused' || hud.phase === 'gameover') && (
        <StatusModal
          hud={hud}
          qualityMode={qualityMode}
          onQualityChange={handleQualityChange}
          graphics={graphics}
          onGraphicsChange={handleGraphicsPatch}
          backendPref={backendPref}
          onBackendChange={handleBackendChange}
          onResume={() => engineRef.current?.resumeGame()}
          onRestart={handleRestart}
          onDeployNextMap={handleDeployNextMap}
          onMainMenu={() => engineRef.current?.returnToTitle()}
          onSensitivityChange={(v) => engineRef.current?.setSensitivity(v)}
          onToggleMusic={() => engineRef.current?.toggleMusic()}
          onMusicVolumeChange={(v) => engineRef.current?.setMusicVolume(v)}
        />
      )}
      <OfflineIndicator />
    </main>
  );
}
