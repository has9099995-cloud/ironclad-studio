import React, { useState } from 'react';
import { Crosshair, Download, Maximize2, Power, SlidersHorizontal } from 'lucide-react';
import { ALL_MAP_ORDER, MAP_CATALOG, WEAPON_ORDER, WEAPON_SPECS } from '../game/rules';
import { WeaponSilhouetteSvg } from './CombatHud';
import { PWAInstallButton } from './PWAInstallButton';
import type {
  AntiAliasingMode,
  AoQuality,
  DifficultyMode,
  GraphicsSettings,
  MapId,
  PostFxMode,
  QualityMode,
  RendererBackendPref,
  RenderScaleOption,
  ShadowQuality,
  WeaponId,
} from '../game/types';

interface TitleOverlayProps {
  difficulty: DifficultyMode;
  onSelectDifficulty: (d: DifficultyMode) => void;
  selectedWeapon: WeaponId;
  onSelectWeapon: (w: WeaponId) => void;
  selectedMap: MapId;
  onSelectMap: (m: MapId) => void;
  qualityMode: QualityMode;
  onSelectQuality: (q: QualityMode) => void;
  graphics: GraphicsSettings;
  onGraphicsChange: (patch: Partial<Omit<GraphicsSettings, 'preset'>>) => void;
  backendPref: RendererBackendPref;
  onSelectBackend: (b: RendererBackendPref) => void;
  activeBackendLabel: string;
  autoQueueMaps: boolean;
  onToggleAutoQueue: (enabled: boolean) => void;
  musicMuted: boolean;
  onToggleMusic: () => void;
  onDeploy: () => void;
  onDeployTraining: () => void;
}

const WEAPON_BARS: Record<WeaponId, { dmg: number; rof: number; rng: number; mob: number }> = {
  rifle: { dmg: 64, rof: 92, rng: 74, mob: 78 },
  shotgun: { dmg: 92, rof: 44, rng: 32, mob: 74 },
  sniper: { dmg: 98, rof: 36, rng: 98, mob: 64 },
  knife: { dmg: 85, rof: 84, rng: 14, mob: 100 },
};

function describeGraphics(g: GraphicsSettings): string {
  const scale = `${Math.round(g.renderScale * 100)}%`;
  const shd = g.shadowQuality === 'off' ? 'Shadows Off' : `Shadows ${g.shadowQuality.toUpperCase()}`;
  const ao = g.aoQuality === 'off' ? 'Single-Pass' : `GTAO ${g.aoQuality.toUpperCase()}`;
  const fx =
    g.postFx === 'bloom_sharpen'
      ? 'Bloom + Sharpen'
      : g.postFx === 'bloom'
        ? 'Bloom'
        : 'Direct AA';
  return `${scale} Scale · ${shd} · ${ao} · ${fx}`;
}

export const TitleOverlay: React.FC<TitleOverlayProps> = ({
  difficulty,
  onSelectDifficulty,
  selectedWeapon,
  onSelectWeapon,
  selectedMap,
  onSelectMap,
  qualityMode,
  onSelectQuality,
  graphics,
  onGraphicsChange,
  backendPref,
  onSelectBackend,
  activeBackendLabel,
  autoQueueMaps,
  onToggleAutoQueue,
  musicMuted,
  onToggleMusic,
  onDeploy,
  onDeployTraining,
}) => {
  const [showCustomGfx, setShowCustomGfx] = useState(false);
  const currentMap = MAP_CATALOG[selectedMap];
  const activeWeaponSpec = WEAPON_SPECS[selectedWeapon];
  const stats = WEAPON_BARS[selectedWeapon];
  const isDesktop = typeof window !== 'undefined' && Boolean(window.desktopApp?.isDesktop);
  const isFileProtocol = typeof window !== 'undefined' && window.location.protocol === 'file:';

  return (
    <div
      className="fixed inset-0 z-20 flex flex-col justify-between pointer-events-none"
      style={{
        background:
          'linear-gradient(90deg, rgba(9, 12, 16, 0.94) 0%, rgba(9, 12, 16, 0.78) 46%, rgba(9, 12, 16, 0.14) 76%, rgba(9, 12, 16, 0.22) 100%)',
      }}
    >
      <div className="flex-1 flex items-center px-6 md:px-14 max-w-2xl overflow-y-auto py-3">
        <div className="pointer-events-auto w-full space-y-3">
          {/* Bespoke SVG Emblem + Title Lockup */}
          <div className="space-y-1">
            <svg viewBox="0 0 360 36" className="w-56 h-5 text-amber-500" aria-hidden="true">
              <polygon
                points="0,18 12,4 24,18 12,32"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
              />
              <polygon points="12,11 17.5,18 12,25 6.5,18" fill="currentColor" />
              <line x1="34" y1="18" x2="104" y2="18" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
              <text
                x="114"
                y="22.5"
                fill="#e2e8f0"
                fontSize="12"
                fontWeight="700"
                letterSpacing="4"
                fontFamily="Chakra Petch, sans-serif"
              >
                TASK FORCE VANGUARD
              </text>
            </svg>

            <h1 className="font-display text-4xl font-bold tracking-tight text-slate-50 leading-none">
              OPERATION <span className="text-amber-400">IRONCLAD</span>
            </h1>

            <p className="text-slate-300 text-xs md:text-sm max-w-xl leading-snug">
              {currentMap.description}
            </p>
          </div>

          {/* Operation Map Queue & Aim Training Selector */}
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                Deployment Theater & Aim Range
              </span>
              <button
                type="button"
                onClick={() => onToggleAutoQueue(!autoQueueMaps)}
                className={`px-2.5 py-0.5 rounded text-[11px] font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                  autoQueueMaps
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                    : 'bg-[#12171e]/85 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                Rotation Queue: {autoQueueMaps ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {ALL_MAP_ORDER.map((mid, index) => {
                const meta = MAP_CATALOG[mid];
                const active = selectedMap === mid;
                const isRange = mid === 'range';
                return (
                  <button
                    key={mid}
                    type="button"
                    data-map={mid}
                    onClick={() => onSelectMap(mid)}
                    className={`text-left px-2.5 py-2 rounded border transition-colors cursor-pointer ${
                      active
                        ? isRange
                          ? 'bg-sky-500/22 border-sky-400 text-slate-50'
                          : 'bg-amber-500/20 border-amber-400 text-slate-50'
                        : isRange
                          ? 'bg-[#101922]/90 border-sky-800/70 text-slate-200 hover:border-sky-400/70'
                          : 'bg-[#12171e]/88 border-slate-700/70 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-display text-xs md:text-sm font-semibold whitespace-nowrap truncate">
                        {isRange ? 'Aim Range' : meta.name}
                      </span>
                      <span
                        className={`text-[10px] font-mono-num font-bold ${
                          isRange ? 'text-sky-400' : 'text-amber-400/90'
                        }`}
                      >
                        {isRange ? 'TRAIN' : `0${index + 1}`}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 whitespace-nowrap truncate">
                      {meta.environment}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Loadout Selector + Weapon Technical Blueprint Strip */}
          <div className="space-y-1.5 max-w-2xl">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              Starting Loadout
            </div>
            <div className="grid grid-cols-4 gap-2">
              {WEAPON_ORDER.map((wid) => {
                const spec = WEAPON_SPECS[wid];
                const active = selectedWeapon === wid;
                return (
                  <button
                    key={wid}
                    type="button"
                    data-weapon={wid}
                    onClick={() => onSelectWeapon(wid)}
                    className={`text-left px-2.5 py-1.5 rounded border transition-colors cursor-pointer ${
                      active
                        ? 'bg-amber-500/20 border-amber-400 text-slate-50'
                        : 'bg-[#12171e]/88 border-slate-700/70 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-display text-xs font-semibold whitespace-nowrap truncate">
                        {spec.name}
                      </span>
                      <span className="text-[10px] font-mono-num text-slate-400">[{spec.keyBind}]</span>
                    </div>
                    <div className="text-[10px] text-slate-400 whitespace-nowrap truncate">
                      {spec.role}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Selected Weapon Technical Schematic & Ballistics Comparison */}
            <div className="bg-[#0e131a]/92 border border-slate-700/65 rounded px-3.5 py-2 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <WeaponSilhouetteSvg weapon={selectedWeapon} className="w-24 h-7 shrink-0" />
                <div className="border-l border-slate-700/80 pl-3 space-y-0.5">
                  <div className="font-display text-xs font-bold text-amber-400 uppercase tracking-wider">
                    {activeWeaponSpec.name}
                  </div>
                  <div className="font-mono-num text-[11px] text-slate-300">
                    {activeWeaponSpec.isMelee
                      ? `Slash ${activeWeaponSpec.damage} · Heavy ${activeWeaponSpec.heavyDamage}`
                      : `${activeWeaponSpec.magSize}/${activeWeaponSpec.startReserve} · ${activeWeaponSpec.damage * activeWeaponSpec.pellets} DMG`}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1 flex-1 max-w-[230px]">
                {(
                  [
                    ['DMG', stats.dmg],
                    ['ROF', stats.rof],
                    ['RNG', stats.rng],
                    ['MOB', stats.mob],
                  ] as const
                ).map(([label, pct]) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <span className="font-mono-num text-[10px] text-slate-400 w-7">{label}</span>
                    <div className="flex-1 h-1.5 bg-slate-800 rounded-sm overflow-hidden">
                      <div className="h-full bg-amber-400" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Difficulty, Graphics Presets & Expandable Graphics Options */}
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex flex-wrap items-end gap-2.5">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-1">
                  Difficulty
                </div>
                <div className="inline-flex rounded border border-slate-700/80 bg-[#12171e]/88 p-0.5 gap-0.5">
                  {(['standard', 'veteran', 'impossible'] as DifficultyMode[]).map((mode) => {
                    const active = difficulty === mode;
                    const label =
                      mode === 'standard' ? 'Standard' : mode === 'veteran' ? 'Veteran' : 'Impossible';
                    return (
                      <button
                        key={mode}
                        type="button"
                        data-testid={`difficulty-${mode}`}
                        onClick={() => onSelectDifficulty(mode)}
                        className={`px-2 py-1 rounded text-[11px] font-semibold uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap ${
                          active
                            ? mode === 'impossible'
                              ? 'bg-rose-600 text-white'
                              : 'bg-amber-500 text-slate-950'
                            : mode === 'impossible'
                              ? 'text-rose-300/90 hover:text-rose-200'
                              : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-1">
                  Graphics Preset
                </div>
                <div className="inline-flex rounded border border-slate-700/80 bg-[#12171e]/88 p-0.5 gap-0.5">
                  {(
                    [
                      ['performance', 'Perf'],
                      ['balanced', 'Balanced'],
                      ['high', 'High'],
                      ['ultra', 'Ultra'],
                    ] as const
                  ).map(([mode, label]) => {
                    const active = qualityMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        data-testid={`preset-${mode}`}
                        onClick={() => onSelectQuality(mode)}
                        className={`px-2 py-1 rounded text-[11px] font-semibold uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap ${
                          active
                            ? 'bg-amber-500 text-slate-950'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                  {qualityMode === 'custom' && (
                    <span className="px-2 py-1 rounded text-[11px] font-semibold uppercase tracking-wider bg-sky-500/20 text-sky-300">
                      Custom
                    </span>
                  )}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-1">
                  Graphics API
                </div>
                <div className="inline-flex rounded border border-slate-700/80 bg-[#12171e]/88 p-0.5 gap-0.5">
                  {(
                    [
                      ['auto', 'Vulkan'],
                      ['webgl2', 'WebGL2'],
                    ] as const
                  ).map(([pref, label]) => {
                    const active = backendPref === pref;
                    return (
                      <button
                        key={pref}
                        type="button"
                        onClick={() => onSelectBackend(pref)}
                        className={`px-2 py-1 rounded text-[11px] font-semibold uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap ${
                          active
                            ? 'bg-sky-400 text-slate-950'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                data-testid="toggle-graphics-options"
                onClick={() => setShowCustomGfx((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                  showCustomGfx
                    ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                    : 'bg-[#12171e]/88 border-slate-700/80 text-slate-300 hover:border-slate-500'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Options
              </button>
            </div>

            {showCustomGfx ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-[#0d1218]/95 border border-slate-700/75 rounded p-2.5">
                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Render Scale</div>
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
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Shadows</div>
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
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Ambient Occlusion</div>
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
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Anti-Aliasing</div>
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
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Post-FX</div>
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
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">FPS Readout</div>
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
            ) : (
              <div className="text-[11px] font-mono-num text-slate-400">
                {describeGraphics(graphics)}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-0.5">
            <button
              type="button"
              data-start="true"
              onClick={onDeploy}
              className="font-display inline-flex items-center justify-center px-7 py-2.5 rounded bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-bold text-base tracking-wider uppercase transition-colors cursor-pointer shadow-lg whitespace-nowrap"
            >
              Deploy · {currentMap.name}
            </button>
            {selectedMap !== 'range' && (
              <button
                type="button"
                data-testid="deploy-aim-training"
                onClick={onDeployTraining}
                className="font-display inline-flex items-center gap-1.5 px-4 py-2.5 rounded bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/80 text-sky-200 font-semibold text-sm tracking-wider uppercase transition-colors cursor-pointer whitespace-nowrap"
              >
                <Crosshair className="w-4 h-4 text-sky-300" />
                Aim Training
              </button>
            )}
            <button
              type="button"
              data-testid="title-music-toggle"
              onClick={onToggleMusic}
              className={`px-3 py-2.5 rounded text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                musicMuted
                  ? 'bg-[#12171e]/85 border-slate-700 text-slate-400 hover:text-slate-200'
                  : 'bg-amber-500/15 border-amber-400/70 text-amber-300'
              }`}
            >
              Score: {musicMuted ? 'MUTED' : 'ON'} [N]
            </button>
            {!isFileProtocol && !isDesktop && <PWAInstallButton />}
            {!isFileProtocol && !isDesktop && (
              <a
                href="./operation-ironclad.html"
                download="operation-ironclad.html"
                data-testid="download-game-btn"
                title="Download offline single-file HTML build"
                className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded text-xs font-semibold border border-slate-700 bg-[#12171e]/85 hover:border-slate-500 text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5 text-slate-300" />
                Save File
              </a>
            )}
            {isDesktop && (
              <>
                <button
                  type="button"
                  onClick={() => void window.desktopApp?.toggleFullscreen()}
                  className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded text-xs font-semibold border border-slate-700 bg-[#12171e]/85 hover:border-slate-500 text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-sky-300" />
                  Fullscreen [F11]
                </button>
                <button
                  type="button"
                  onClick={() => void window.desktopApp?.quit()}
                  className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded text-xs font-semibold border border-rose-500/60 bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Power className="w-3.5 h-3.5 text-rose-300" />
                  Quit
                </button>
              </>
            )}
            <div className="text-xs text-slate-400 whitespace-nowrap">
              <span className="text-slate-200 font-semibold">{activeBackendLabel}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Single-line flat control hint in bottom safe margin */}
      <div className="px-6 md:px-14 py-2.5 text-xs text-slate-400 tracking-wide whitespace-nowrap overflow-hidden text-ellipsis">
        WASD Move · Mouse Aim / Click Fire · Right-Click or V Sight / Heavy Lunge · R Reload / Inspect · 1-3 Guns · 4 Karambit · C Quick Knife · G Frag · N Music · P Pause
      </div>
    </div>
  );
};
