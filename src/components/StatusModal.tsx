import React, { useState } from 'react';
import { computeAccuracyPercent, computeHeadshotPercent, MAP_CATALOG } from '../game/rules';
import type {
  AntiAliasingMode,
  AoQuality,
  GraphicsSettings,
  HudSnapshot,
  PostFxMode,
  QualityMode,
  RendererBackendPref,
  RenderScaleOption,
  ShadowQuality,
} from '../game/types';

interface StatusModalProps {
  hud: HudSnapshot;
  qualityMode: QualityMode;
  onQualityChange: (q: QualityMode) => void;
  graphics: GraphicsSettings;
  onGraphicsChange: (patch: Partial<Omit<GraphicsSettings, 'preset'>>) => void;
  backendPref: RendererBackendPref;
  onBackendChange: (b: RendererBackendPref) => void;
  onResume: () => void;
  onRestart: () => void;
  onDeployNextMap: () => void;
  onMainMenu: () => void;
  onSensitivityChange: (val: number) => void;
  onToggleMusic: () => void;
  onMusicVolumeChange: (val: number) => void;
}

export const StatusModal: React.FC<StatusModalProps> = ({
  hud,
  qualityMode,
  onQualityChange,
  graphics,
  onGraphicsChange,
  backendPref,
  onBackendChange,
  onResume,
  onRestart,
  onDeployNextMap,
  onMainMenu,
  onSensitivityChange,
  onToggleMusic,
  onMusicVolumeChange,
}) => {
  const [sens, setSens] = useState(1.0);
  const isPaused = hud.phase === 'paused';
  const isTraining = hud.gameMode === 'training';
  const isVictory = hud.phase === 'gameover' && hud.outcome === 'victory';

  const accuracy = isTraining
    ? computeAccuracyPercent(hud.aimTraining.shotsFired, hud.aimTraining.shotsHit)
    : computeAccuracyPercent(hud.shotsFired, hud.shotsHit);
  const hsPercent = computeHeadshotPercent(hud.aimTraining.kills, hud.aimTraining.headshots);
  const mins = Math.floor(hud.elapsedSeconds / 60);
  const secs = Math.floor(hud.elapsedSeconds % 60);
  const timeFormatted = `${mins}:${secs.toString().padStart(2, '0')}`;
  const currentMap = MAP_CATALOG[hud.mapId];
  const nextMap = MAP_CATALOG[hud.nextMapId];

  const pipelineSummary = `${Math.round(graphics.renderScale * 100)}% Scale · Shadows ${graphics.shadowQuality.toUpperCase()} · AO ${graphics.aoQuality.toUpperCase()} · ${graphics.antiAliasing.toUpperCase()} · Post ${graphics.postFx.toUpperCase()}`;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/72 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="status-modal-title"
        className="w-full max-w-lg max-h-[92vh] overflow-y-auto bg-[#11151b] border border-slate-700/80 rounded-md p-5 md:p-6 space-y-4 shadow-2xl"
      >
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-widest text-amber-400">
            <span>
              {isPaused
                ? isTraining
                  ? 'Range Paused'
                  : 'Operation Paused'
                : isVictory
                  ? 'Mission Accomplished'
                  : 'Operator Down'}
            </span>
            <span className="text-slate-400">
              {currentMap.name}
              {!isTraining && (
                <>
                  {' '}
                  ·{' '}
                  <span className={hud.difficulty === 'impossible' ? 'text-rose-400' : 'text-amber-400'}>
                    {hud.difficulty.toUpperCase()}
                  </span>
                </>
              )}
            </span>
          </div>
          <h2 id="status-modal-title" className="font-display text-2xl md:text-3xl font-bold text-slate-50">
            {isPaused
              ? isTraining
                ? 'Aim Training Ground'
                : 'Tactical Pause'
              : isVictory
                ? `${currentMap.name} Secured`
                : `KIA — Wave ${hud.wave}`}
          </h2>
          <div className="text-[11px] text-slate-400 space-y-0.5">
            <div>
              Renderer: <span className="text-slate-200 font-medium">{hud.activeBackendLabel}</span>
            </div>
            <div className="font-mono-num text-[10px] text-amber-400/90">{pipelineSummary}</div>
          </div>
        </div>

        {/* 2x2 Tabular Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="bg-[#0b0e12] border border-slate-800 rounded p-2.5">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">
              {isTraining ? 'KPM' : 'Score'}
            </div>
            <div className="font-mono-num text-xl font-bold text-amber-400 mt-0.5">
              {isTraining ? hud.aimTraining.kpm : hud.score}
            </div>
          </div>
          <div className="bg-[#0b0e12] border border-slate-800 rounded p-2.5">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Kills</div>
            <div className="font-mono-num text-xl font-bold text-slate-100 mt-0.5">
              {isTraining ? hud.aimTraining.kills : hud.kills}{' '}
              <span className="text-[11px] text-slate-400 font-normal">
                ({isTraining ? `${hsPercent}%` : `${hud.headshots} HS`})
              </span>
            </div>
          </div>
          <div className="bg-[#0b0e12] border border-slate-800 rounded p-2.5">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Accuracy</div>
            <div className="font-mono-num text-xl font-bold text-slate-100 mt-0.5">{accuracy}%</div>
          </div>
          <div className="bg-[#0b0e12] border border-slate-800 rounded p-2.5">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">
              {isTraining ? 'Avg TTK' : isVictory ? 'Clear Time' : 'Wave'}
            </div>
            <div className="font-mono-num text-xl font-bold text-slate-100 mt-0.5">
              {isTraining
                ? hud.aimTraining.avgTtkMs > 0
                  ? `${hud.aimTraining.avgTtkMs}ms`
                  : '--'
                : isVictory
                  ? timeFormatted
                  : `${hud.wave}/${hud.maxWaves}`}
            </div>
          </div>
        </div>

        {isPaused && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <label htmlFor="aim-sens-slider" className="font-medium">
                    Mouse Sensitivity
                  </label>
                  <span className="font-mono-num text-amber-400">{sens.toFixed(1)}x</span>
                </div>
                <input
                  id="aim-sens-slider"
                  type="range"
                  min="0.4"
                  max="2.0"
                  step="0.1"
                  value={sens}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setSens(v);
                    onSensitivityChange(v);
                  }}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <label htmlFor="music-vol-slider" className="font-medium">
                    Soundtrack [N]
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      data-testid="modal-music-toggle"
                      onClick={onToggleMusic}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border cursor-pointer transition-colors ${
                        hud.musicMuted
                          ? 'bg-slate-900 border-slate-700 text-slate-400'
                          : 'bg-amber-500/20 border-amber-400 text-amber-300'
                      }`}
                    >
                      {hud.musicMuted ? 'Muted' : 'On'}
                    </button>
                    <span className="font-mono-num text-amber-400 w-8 text-right">
                      {Math.round(hud.musicVolume * 100)}%
                    </span>
                  </div>
                </div>
                <input
                  id="music-vol-slider"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={hud.musicVolume}
                  onChange={(e) => onMusicVolumeChange(parseFloat(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>
            </div>

            {/* Graphics Preset + API */}
            <div className="bg-[#0b0e12] border border-slate-800 rounded p-3 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Graphics Preset
                </span>
                <div className="inline-flex rounded border border-slate-700/80 bg-[#11151b] p-0.5 gap-0.5">
                  {(
                    [
                      ['performance', 'Perf'],
                      ['balanced', 'Balanced'],
                      ['high', 'High'],
                      ['ultra', 'Ultra'],
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => onQualityChange(mode)}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider cursor-pointer transition-colors ${
                        qualityMode === mode
                          ? 'bg-amber-500 text-slate-950'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  {qualityMode === 'custom' && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-sky-500/20 text-sky-300">
                      Custom
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">Render Scale</div>
                  <div className="flex gap-1">
                    {([0.75, 1.0, 1.25, 1.5] as RenderScaleOption[]).map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => onGraphicsChange({ renderScale: val })}
                        className={`flex-1 py-0.5 rounded text-[10px] font-mono-num font-semibold border cursor-pointer ${
                          graphics.renderScale === val
                            ? 'bg-amber-500 border-amber-400 text-slate-950'
                            : 'bg-slate-900 border-slate-700 text-slate-300'
                        }`}
                      >
                        {Math.round(val * 100)}%
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">Shadows</div>
                  <div className="flex gap-1">
                    {(['off', 'low', 'medium', 'high'] as ShadowQuality[]).map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => onGraphicsChange({ shadowQuality: val })}
                        className={`flex-1 py-0.5 rounded text-[10px] uppercase font-semibold border cursor-pointer ${
                          graphics.shadowQuality === val
                            ? 'bg-amber-500 border-amber-400 text-slate-950'
                            : 'bg-slate-900 border-slate-700 text-slate-300'
                        }`}
                      >
                        {val === 'medium' ? 'Med' : val}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">AO</div>
                  <div className="flex gap-1">
                    {(['off', 'fast', 'high'] as AoQuality[]).map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => onGraphicsChange({ aoQuality: val })}
                        className={`flex-1 py-0.5 rounded text-[10px] uppercase font-semibold border cursor-pointer ${
                          graphics.aoQuality === val
                            ? 'bg-amber-500 border-amber-400 text-slate-950'
                            : 'bg-slate-900 border-slate-700 text-slate-300'
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">Anti-Aliasing</div>
                  <div className="flex gap-1">
                    {(['off', 'fxaa'] as AntiAliasingMode[]).map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => onGraphicsChange({ antiAliasing: val })}
                        className={`flex-1 py-0.5 rounded text-[10px] uppercase font-semibold border cursor-pointer ${
                          graphics.antiAliasing === val
                            ? 'bg-amber-500 border-amber-400 text-slate-950'
                            : 'bg-slate-900 border-slate-700 text-slate-300'
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">Post-FX</div>
                  <div className="flex gap-1">
                    {(
                      [
                        ['off', 'Off'],
                        ['bloom', 'Bloom'],
                        ['bloom_sharpen', 'Sharp'],
                      ] as Array<[PostFxMode, string]>
                    ).map(([val, lbl]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => onGraphicsChange({ postFx: val })}
                        className={`flex-1 py-0.5 rounded text-[10px] uppercase font-semibold border cursor-pointer ${
                          graphics.postFx === val
                            ? 'bg-amber-500 border-amber-400 text-slate-950'
                            : 'bg-slate-900 border-slate-700 text-slate-300'
                        }`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">FPS Counter</div>
                  <div className="flex gap-1">
                    {[false, true].map((flag) => (
                      <button
                        key={String(flag)}
                        type="button"
                        onClick={() => onGraphicsChange({ showFps: flag })}
                        className={`flex-1 py-0.5 rounded text-[10px] uppercase font-semibold border cursor-pointer ${
                          graphics.showFps === flag
                            ? 'bg-sky-400 border-sky-300 text-slate-950'
                            : 'bg-slate-900 border-slate-700 text-slate-300'
                        }`}
                      >
                        {flag ? 'On' : 'Off'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-800/80">
                <span className="text-[11px] font-medium text-slate-400">Graphics API</span>
                <div className="inline-flex rounded border border-slate-700/80 bg-[#11151b] p-0.5 gap-0.5">
                  {(
                    [
                      ['auto', 'Vulkan / WebGPU'],
                      ['webgl2', 'WebGL2'],
                    ] as const
                  ).map(([pref, label]) => (
                    <button
                      key={pref}
                      type="button"
                      onClick={() => onBackendChange(pref)}
                      className={`px-2.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider cursor-pointer transition-colors ${
                        backendPref === pref
                          ? 'bg-sky-400 text-slate-950'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 pt-1">
          <div className="flex flex-col sm:flex-row gap-2">
            {isPaused ? (
              <button
                type="button"
                onClick={onResume}
                className="flex-1 font-display py-2.5 px-5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold uppercase tracking-wider cursor-pointer transition-colors"
              >
                Resume
              </button>
            ) : (
              <button
                type="button"
                data-start="true"
                onClick={onDeployNextMap}
                className="flex-1 font-display py-2.5 px-5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold uppercase tracking-wider cursor-pointer transition-colors"
              >
                Next Map · {nextMap.name}
              </button>
            )}
            <button
              type="button"
              onClick={onRestart}
              className="font-display py-2.5 px-4 rounded bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold uppercase tracking-wider cursor-pointer transition-colors"
            >
              {isPaused ? 'Restart' : 'Replay Map'}
            </button>
          </div>

          <div className="flex gap-2">
            {isPaused && (
              <button
                type="button"
                onClick={onDeployNextMap}
                className="flex-1 font-display py-2 px-4 rounded bg-slate-800/90 border border-amber-500/40 hover:border-amber-400 text-amber-300 text-sm font-semibold uppercase tracking-wider cursor-pointer transition-colors"
              >
                {isTraining ? `Deploy Combat · ${nextMap.name}` : `Skip to ${nextMap.name}`}
              </button>
            )}
            <button
              type="button"
              onClick={onMainMenu}
              className="flex-1 font-display py-2 px-4 rounded bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-200 text-sm font-semibold uppercase tracking-wider cursor-pointer transition-colors"
            >
              Main Menu
            </button>
            {typeof window !== 'undefined' && window.desktopApp?.isDesktop && (
              <button
                type="button"
                onClick={() => void window.desktopApp?.quit()}
                className="font-display py-2 px-4 rounded bg-rose-950/70 border border-rose-500/50 hover:border-rose-400 text-rose-200 text-sm font-semibold uppercase tracking-wider cursor-pointer transition-colors"
              >
                Quit
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
