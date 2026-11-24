import React, { useEffect, useRef } from 'react';
import { Volume2, VolumeX, Pause, RotateCcw, Music } from 'lucide-react';
import {
  AIM_DRILLS,
  AIM_DRILL_ORDER,
  computeAccuracyPercent,
  computeHeadshotPercent,
  MAP_CATALOG,
  WEAPON_ORDER,
  WEAPON_SPECS,
} from '../game/rules';
import type { AABB2D, AimDrillId, HudSnapshot, WeaponId } from '../game/types';

interface CombatHudProps {
  hud: HudSnapshot;
  obstacles: AABB2D[];
  onSwitchWeapon: (w: WeaponId) => void;
  onToggleMute: () => void;
  onToggleMusic: () => void;
  onPause: () => void;
  onRestart: () => void;
  onSetAimDrill: (drill: AimDrillId) => void;
  onToggleHeadshotOnly: () => void;
  onToggleStrafe: () => void;
  onRestartAimDrill: () => void;
}

export const WeaponSilhouetteSvg: React.FC<{ weapon: WeaponId; className?: string }> = React.memo(({
  weapon,
  className = 'w-28 h-8',
}) => {
  if (weapon === 'knife') {
    return (
      <svg viewBox="0 0 132 40" className={`${className} text-amber-300`} aria-hidden="true">
        {/* Finger retention ring */}
        <circle cx="17" cy="21" r="7" fill="none" stroke="currentColor" strokeWidth="2.6" />
        <circle cx="17" cy="21" r="4" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.45" />
        {/* Contoured G10 handle with finger grooves & bolster */}
        <path
          d="M24 17 C36 14, 48 14.5, 59 17.5 L57 25 C46 22.5, 34 22.5, 24 24.5 Z"
          fill="#1e293b"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <line x1="33" y1="16" x2="31" y2="23.5" stroke="currentColor" strokeWidth="1" opacity="0.55" />
        <line x1="42" y1="15.5" x2="40" y2="23" stroke="currentColor" strokeWidth="1" opacity="0.55" />
        <line x1="50" y1="16" x2="48" y2="23.5" stroke="currentColor" strokeWidth="1" opacity="0.55" />
        {/* Curved Damascus hawkbill blade + bevel */}
        <path
          d="M59 17 C82 13, 102 18, 122 33 C103 27, 84 23, 57 24.5 Z"
          fill="currentColor"
        />
        <path
          d="M62 18.5 C81 15.5, 97 19, 112 28.5 C97 22, 81 19, 61 20 Z"
          fill="#0f172a"
          opacity="0.42"
        />
        <circle cx="59" cy="20.8" r="1.4" fill="#fbbf24" />
      </svg>
    );
  }
  if (weapon === 'shotgun') {
    return (
      <svg viewBox="0 0 144 40" className={`${className} text-slate-200`} aria-hidden="true">
        {/* Skeletonized adjustable stock + pistol grip */}
        <path
          d="M6 20 L34 17 L38 23 L31 35 L22 35 L26 23.5 L6 24.5 Z"
          fill="currentColor"
          opacity="0.88"
        />
        <rect x="10" y="20" width="12" height="2" rx="0.6" fill="#0f172a" opacity="0.7" />
        {/* Receiver + 12G side saddle shells */}
        <rect x="37" y="15" width="38" height="8" rx="1" fill="currentColor" />
        <rect x="44" y="16.5" width="3" height="5" fill="#dc2626" />
        <rect x="49" y="16.5" width="3" height="5" fill="#dc2626" />
        <rect x="54" y="16.5" width="3" height="5" fill="#dc2626" />
        <rect x="59" y="16.5" width="3" height="5" fill="#dc2626" />
        {/* Ribbed barrel + underbarrel mag tube + pump forend */}
        <rect x="75" y="14.5" width="58" height="3.2" fill="currentColor" />
        <rect x="75" y="19" width="48" height="2.8" fill="currentColor" opacity="0.82" />
        <rect x="80" y="21.5" width="26" height="4.5" rx="0.8" fill="#fbbf24" opacity="0.88" />
        {/* Ghost ring rear sight + front tritium post */}
        <rect x="41" y="12.5" width="5" height="2.5" fill="currentColor" />
        <rect x="128" y="12" width="2.5" height="2.5" fill="#f59e0b" />
      </svg>
    );
  }
  if (weapon === 'sniper') {
    return (
      <svg viewBox="0 0 152 40" className={`${className} text-slate-200`} aria-hidden="true">
        {/* Marksman stock with cheek riser */}
        <path
          d="M4 19 L34 17 L39 24 L32 35 L23 35 L27 23.5 L4 24.5 Z"
          fill="currentColor"
          opacity="0.9"
        />
        <rect x="11" y="14.8" width="16" height="2.4" rx="0.6" fill="#94a3b8" />
        {/* Upper/lower receiver */}
        <rect x="36" y="15.5" width="44" height="7.5" rx="0.8" fill="currentColor" />
        {/* Variable sniper optic + turrets + sunshade */}
        <rect x="44" y="9" width="28" height="4.4" rx="1" fill="#cbd5e1" />
        <rect x="40" y="8.2" width="6" height="6" rx="0.8" fill="currentColor" />
        <rect x="70" y="8.2" width="8" height="6" rx="0.8" fill="currentColor" />
        <rect x="55" y="6.8" width="4" height="2.2" fill="#f59e0b" />
        <rect x="49" y="13.4" width="3" height="2.2" fill="#94a3b8" />
        <rect x="64" y="13.4" width="3" height="2.2" fill="#94a3b8" />
        {/* Fluted heavy barrel + muzzle brake + folded bipod */}
        <rect x="80" y="16.4" width="56" height="2.8" fill="currentColor" />
        <rect x="136" y="15.5" width="9" height="4.5" rx="0.5" fill="#94a3b8" />
        <rect x="80" y="19.8" width="24" height="3.2" fill="currentColor" opacity="0.72" />
        <line x1="102" y1="22.5" x2="115" y2="29" stroke="#94a3b8" strokeWidth="1.8" />
        {/* 20-rd 7.62 magazine */}
        <path d="M58 23 L67 23 L64.5 34.5 L55.5 34.5 Z" fill="currentColor" opacity="0.86" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 144 40" className={`${className} text-slate-200`} aria-hidden="true">
      {/* SOPMOD buttstock & buffer tube */}
      <path d="M5 17 L28 15.5 L30 23 L5 26 Z" fill="currentColor" opacity="0.88" />
      <rect x="28" y="17.2" width="8" height="3.6" fill="#94a3b8" />
      {/* Receiver + pistol grip + trigger guard */}
      <rect x="36" y="14.8" width="36" height="8" rx="0.8" fill="currentColor" />
      <path d="M38 22.8 L44 22.8 L40 34 L34 34 Z" fill="currentColor" opacity="0.88" />
      {/* EOTech holographic sight + lens tint */}
      <path d="M44 9 L62 9 L62 14.4 L44 14.4 Z" fill="#cbd5e1" />
      <rect x="47" y="10.2" width="12" height="3" fill="#0f172a" />
      <circle cx="53" cy="11.7" r="1" fill="#ef4444" />
      {/* Quad rail handguard + PEQ laser box + angled foregrip */}
      <rect x="72" y="15.2" width="28" height="6.2" fill="currentColor" opacity="0.92" />
      <rect x="88" y="12.8" width="10" height="2.4" fill="#94a3b8" />
      <path d="M78 21.4 L88 21.4 L84 26.5 L75 26.5 Z" fill="#fbbf24" opacity="0.88" />
      {/* Free-float barrel + flash suppressor + curved STANAG mag */}
      <rect x="100" y="16.8" width="26" height="2.6" fill="currentColor" />
      <rect x="126" y="16" width="8" height="4.2" rx="0.5" fill="#94a3b8" />
      <path d="M55 22.8 L63.5 22.8 L60.5 35.5 L52 35.5 Z" fill="currentColor" opacity="0.9" />
    </svg>
  );
});

const FragGrenadeSvg: React.FC = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true">
    <path d="M10 3 L14 3 L14 6 L10 6 Z" fill="currentColor" />
    <path d="M14 4 L18 6 L17 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <ellipse cx="12" cy="14" rx="5.5" ry="6.8" fill="currentColor" opacity="0.9" />
    <line x1="7" y1="12" x2="17" y2="12" stroke="#0b0e12" strokeWidth="1.1" />
    <line x1="7" y1="16" x2="17" y2="16" stroke="#0b0e12" strokeWidth="1.1" />
    <line x1="12" y1="7.5" x2="12" y2="20.5" stroke="#0b0e12" strokeWidth="1.1" />
  </svg>
);

const ArmorPlateSvg: React.FC = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-sky-400 shrink-0" aria-hidden="true">
    <path
      d="M5 4 L19 4 L19 12 C19 17 12 21 12 21 C12 21 5 17 5 12 Z"
      fill="currentColor"
      fillOpacity="0.22"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path d="M9 8 L15 8 M12 8 L12 16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

export const CombatHud: React.FC<CombatHudProps> = ({
  hud,
  obstacles,
  onSwitchWeapon,
  onToggleMute,
  onToggleMusic,
  onPause,
  onRestart,
  onSetAimDrill,
  onToggleHeadshotOnly,
  onToggleStrafe,
  onRestartAimDrill,
}) => {
  const radarRef = useRef<HTMLCanvasElement | null>(null);
  const dmgHistoryRef = useRef(hud.hp);

  useEffect(() => {
    if (hud.hp > dmgHistoryRef.current) {
      dmgHistoryRef.current = hud.hp;
    } else if (dmgHistoryRef.current > hud.hp) {
      const id = window.setTimeout(() => {
        dmgHistoryRef.current = hud.hp;
      }, 280);
      return () => clearTimeout(id);
    }
  }, [hud.hp]);

  // Draw detailed live tactical radar with compass & height-shaded cover
  useEffect(() => {
    const canvas = radarRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 136;
    const half = size / 2;
    const scale = 2.15;

    ctx.clearRect(0, 0, size, size);

    ctx.save();
    ctx.beginPath();
    ctx.arc(half, half, half - 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10, 14, 19, 0.88)';
    ctx.fill();
    ctx.clip();

    // Crosshair axes + subtle tactical range rings
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(half, 6);
    ctx.lineTo(half, size - 6);
    ctx.moveTo(6, half);
    ctx.lineTo(size - 6, half);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(half, half, 26, 0, Math.PI * 2);
    ctx.arc(half, half, 50, 0, Math.PI * 2);
    ctx.stroke();

    // Rotate map relative to player heading (player always faces UP)
    ctx.save();
    ctx.translate(half, half);
    ctx.rotate(hud.playerYaw);

    for (let i = 0; i < obstacles.length; i++) {
      const box = obstacles[i];
      const rx = (box.minX - hud.playerX) * scale;
      const rz = (box.minZ - hud.playerZ) * scale;
      const rw = (box.maxX - box.minX) * scale;
      const rh = (box.maxZ - box.minZ) * scale;
      ctx.fillStyle =
        box.kind === 'tower' || box.kind === 'container' || box.kind === 'building'
          ? 'rgba(148, 163, 184, 0.42)'
          : 'rgba(100, 116, 139, 0.28)';
      ctx.fillRect(rx, rz, rw, rh);
    }

    // Enemy & explosive barrel blips
    for (let i = 0; i < hud.radarBlips.length; i++) {
      const blip = hud.radarBlips[i];
      const bx = (blip.x - hud.playerX) * scale;
      const bz = (blip.z - hud.playerZ) * scale;
      ctx.beginPath();
      if (blip.kind === 'barrel') {
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(bx - 2, bz - 2, 4, 4);
      } else if (blip.kind === 'heavy_drone') {
        ctx.fillStyle = '#fb923c';
        ctx.moveTo(bx, bz - 4);
        ctx.lineTo(bx + 3.6, bz);
        ctx.lineTo(bx, bz + 4);
        ctx.lineTo(bx - 3.6, bz);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = blip.kind === 'sniper' ? '#f43f5e' : '#ef4444';
        ctx.arc(bx, bz, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // Rotating N / E / S / W cardinal markers around outer rim
    const dirs: Array<[string, number]> = [
      ['N', -Math.PI / 2],
      ['E', 0],
      ['S', Math.PI / 2],
      ['W', Math.PI],
    ];
    ctx.font = '700 9px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [lbl, baseAng] of dirs) {
      const ang = baseAng + hud.playerYaw;
      const cx = half + Math.cos(ang) * (half - 11);
      const cy = half + Math.sin(ang) * (half - 11);
      ctx.fillStyle = lbl === 'N' ? '#fbbf24' : 'rgba(203, 213, 225, 0.72)';
      ctx.fillText(lbl, cx, cy);
    }

    // Player FOV cone & chevron at center
    ctx.save();
    ctx.translate(half, half);
    ctx.fillStyle = 'rgba(245, 158, 11, 0.14)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-28, -54);
    ctx.lineTo(28, -54);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(0, -5.8);
    ctx.lineTo(4.6, 4.6);
    ctx.lineTo(0, 2);
    ctx.lineTo(-4.6, 4.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();

    // Outer tactical ring with bevel tick marks
    ctx.beginPath();
    ctx.arc(half, half, half - 3, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [hud.playerX, hud.playerZ, hud.playerYaw, hud.radarBlips, obstacles]);

  const isTraining = hud.gameMode === 'training';
  const aim = hud.aimTraining;
  const aimAcc = computeAccuracyPercent(aim.shotsFired, aim.shotsHit);
  const aimHsPct = computeHeadshotPercent(aim.kills, aim.headshots);
  const activeSpec = WEAPON_SPECS[hud.activeWeapon];
  const activeAmmo = hud.weapons[hud.activeWeapon];
  const isKnife = hud.activeWeapon === 'knife';
  const spreadPx = Math.round(8 + hud.crosshairSpread * 340);
  const showSniperScope = hud.isAds && hud.activeWeapon === 'sniper';
  const showHipTicks = !showSniperScope && !hud.isAds && !isKnife;
  const lowHpOpacity = hud.hp < 35 ? ((35 - hud.hp) / 35) * 0.45 : 0;
  const mapMeta = MAP_CATALOG[hud.mapId];
  const queueIndex = Math.max(0, hud.mapQueue.indexOf(hud.mapId)) + 1;

  return (
    <div className="fixed inset-0 z-10 pointer-events-none select-none overflow-hidden">
      {/* Low Health & Damage Flash Peripheral Vignette */}
      {(hud.damageFlash > 0.02 || lowHpOpacity > 0) && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            boxShadow: `inset 0 0 110px rgba(220, 38, 38, ${Math.min(0.75, hud.damageFlash * 0.55 + lowHpOpacity)})`,
          }}
        />
      )}

      {/* Directional Damage Indicator Arc */}
      {hud.damageFlash > 0.08 && hud.damageAngle !== null && (
        <div
          className="fixed left-1/2 top-1/2 w-56 h-56 -ml-28 -mt-28 pointer-events-none"
          style={{
            transform: `rotate(${hud.damageAngle}rad)`,
            opacity: Math.min(1, hud.damageFlash),
          }}
        >
          <div className="mx-auto w-14 h-2.5 rounded-sm bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.9)]" />
        </div>
      )}

      {/* Sniper Mil-Dot Magnified Optic Vignette when ADS with MK14 */}
      {showSniperScope && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
          <div
            className="w-[460px] h-[460px] rounded-full border-2 border-slate-900/95 relative flex items-center justify-center"
            style={{
              boxShadow: '0 0 0 9999px rgba(6, 8, 11, 0.88)',
            }}
          >
            <svg viewBox="0 0 200 200" className="w-full h-full" aria-hidden="true">
              <line x1="0" y1="100" x2="88" y2="100" stroke="rgba(226,232,240,0.65)" strokeWidth="0.8" />
              <line x1="112" y1="100" x2="200" y2="100" stroke="rgba(226,232,240,0.65)" strokeWidth="0.8" />
              <line x1="100" y1="0" x2="100" y2="88" stroke="rgba(226,232,240,0.65)" strokeWidth="0.8" />
              <line x1="100" y1="112" x2="100" y2="200" stroke="rgba(226,232,240,0.85)" strokeWidth="1" />
              {[40, 56, 72, 128, 144, 160].map((pos) => (
                <g key={pos}>
                  <line x1={pos} y1="97" x2={pos} y2="103" stroke="rgba(226,232,240,0.8)" strokeWidth="0.9" />
                  <line x1="97" y1={pos} x2="103" y2={pos} stroke="rgba(226,232,240,0.8)" strokeWidth="0.9" />
                </g>
              ))}
              <circle cx="100" cy="100" r="2.2" fill="#ef4444" />
            </svg>
          </div>
        </div>
      )}

      {/* Center Reticle & Hitmarker at exact (0, 0) */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        {!showSniperScope && !hud.isAds && (
          <div className="relative flex items-center justify-center">
            {isKnife ? (
              <div className="w-2.5 h-2.5 rotate-45 border border-amber-400/90 shadow-[0_0_4px_rgba(0,0,0,0.9)]" />
            ) : (
              <div className="w-1 h-1 rounded-full bg-amber-400 shadow-[0_0_4px_rgba(0,0,0,0.9)]" />
            )}
            {showHipTicks && (
              <>
                <div
                  className="absolute w-0.5 h-2.5 bg-white/90"
                  style={{ transform: `translateY(-${spreadPx}px)` }}
                />
                <div
                  className="absolute w-0.5 h-2.5 bg-white/90"
                  style={{ transform: `translateY(${spreadPx}px)` }}
                />
                <div
                  className="absolute h-0.5 w-2.5 bg-white/90"
                  style={{ transform: `translateX(-${spreadPx}px)` }}
                />
                <div
                  className="absolute h-0.5 w-2.5 bg-white/90"
                  style={{ transform: `translateX(${spreadPx}px)` }}
                />
              </>
            )}
          </div>
        )}

        {/* Crisp CoD-style X Hitmarker */}
        {hud.hitmarkerKind !== 'none' && (
          <svg
            viewBox="0 0 32 32"
            className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-7 ${
              hud.hitmarkerKind === 'kill' || hud.hitmarkerKind === 'headshot'
                ? 'text-red-500'
                : 'text-white'
            }`}
            aria-hidden="true"
          >
            <line x1="5" y1="5" x2="11" y2="11" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            <line x1="27" y1="5" x2="21" y2="11" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            <line x1="5" y1="27" x2="11" y2="21" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            <line x1="27" y1="27" x2="21" y2="21" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        )}

        {/* Reload Progress Indicator */}
        {hud.isReloading && (
          <div className="mt-10 text-center">
            <div className="text-[11px] font-display font-semibold uppercase tracking-widest text-amber-400 hud-text-shadow">
              Reloading
            </div>
            <div className="w-24 h-1 bg-slate-800/90 rounded-sm overflow-hidden mt-1 mx-auto">
              <div
                className="h-full bg-amber-400"
                style={{ width: `${Math.round(hud.reloadProgress * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* TOP-CENTER: Aim Training Drill Selector Bar */}
      {isTraining && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-auto">
          <div className="flex flex-wrap items-center justify-center gap-1.5 bg-[#0b0e12]/88 border border-slate-700/75 rounded px-2.5 py-1.5">
            {AIM_DRILL_ORDER.map((did) => {
              const meta = AIM_DRILLS[did];
              const active = aim.drill === did;
              return (
                <button
                  key={did}
                  type="button"
                  tabIndex={-1}
                  data-testid={`drill-${did}`}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onSetAimDrill(did);
                  }}
                  className={`px-2.5 py-1 rounded text-[11px] font-display font-semibold uppercase tracking-wider border transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-sky-500 border-sky-300 text-slate-950'
                      : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  [{meta.keyBind}] {meta.name}
                </button>
              );
            })}
            <span className="h-4 w-px bg-slate-700 mx-0.5" />
            <button
              type="button"
              tabIndex={-1}
              data-testid="aim-hs-only"
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleHeadshotOnly();
              }}
              className={`px-2 py-1 rounded text-[11px] font-semibold uppercase tracking-wider border transition-colors cursor-pointer whitespace-nowrap ${
                aim.headshotOnly
                  ? 'bg-amber-500 border-amber-300 text-slate-950'
                  : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:border-slate-500'
              }`}
            >
              [H] HS Only
            </button>
            <button
              type="button"
              tabIndex={-1}
              data-testid="aim-strafe-toggle"
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleStrafe();
              }}
              className={`px-2 py-1 rounded text-[11px] font-semibold uppercase tracking-wider border transition-colors cursor-pointer whitespace-nowrap ${
                aim.strafeEnabled || aim.drill === 'tracking'
                  ? 'bg-emerald-500 border-emerald-300 text-slate-950'
                  : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:border-slate-500'
              }`}
            >
              [B] Strafe
            </button>
            <button
              type="button"
              tabIndex={-1}
              data-testid="aim-reset-drill"
              onClick={(e) => {
                e.currentTarget.blur();
                onRestartAimDrill();
              }}
              className="px-2 py-1 rounded text-[11px] font-semibold uppercase tracking-wider border bg-slate-900/90 border-slate-700 text-slate-300 hover:border-amber-400 hover:text-amber-300 transition-colors cursor-pointer whitespace-nowrap"
            >
              Reset
            </button>
          </div>

          {aim.drill === 'speed30' && aim.challengeComplete && (
            <div className="flex items-center gap-3 bg-[#0b0e12]/92 border border-amber-400/70 rounded px-4 py-1.5 text-xs">
              <span className="font-display font-bold text-amber-400 uppercase tracking-wider">
                30s Complete: {aim.kills} Kills · {aimHsPct}% HS · PB {aim.bestSpeedKills}
              </span>
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onRestartAimDrill();
                }}
                className="px-2.5 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold uppercase tracking-wider cursor-pointer"
              >
                Run Again
              </button>
            </div>
          )}
        </div>
      )}

      {/* Wave / Training Announcement Banner */}
      {hud.waveBanner && (
        <div className={`fixed ${isTraining ? 'top-20' : 'top-14'} left-1/2 -translate-x-1/2 text-center pointer-events-none`}>
          <div className="px-6 py-2 bg-[#0b0e12]/88 border border-amber-500/50 rounded">
            <div className="font-display text-xl font-bold tracking-wider text-amber-400 hud-text-shadow">
              {hud.waveBanner}
            </div>
          </div>
        </div>
      )}

      {/* TOP-LEFT: Tactical Radar + Wave/Score OR Aim Training Telemetry */}
      <div className="fixed top-4 left-4 flex items-start gap-3">
        <canvas
          ref={radarRef}
          width={136}
          height={136}
          className="w-28 h-28 md:w-34 md:h-34 rounded-full"
          aria-label="Tactical Radar"
        />
        {isTraining ? (
          <div
            className="bg-[#0b0e12]/88 border border-sky-500/45 rounded px-3.5 py-2 space-y-1 min-w-[186px]"
            data-testid="aim-training-telemetry"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-800/90 pb-1">
              <span className="font-display text-xs font-bold uppercase tracking-wider text-sky-300 whitespace-nowrap">
                Aim Range
              </span>
              <span className="font-mono-num text-[10px] text-amber-400 font-semibold whitespace-nowrap">
                {aim.drill === 'speed30' ? `${aim.timeRemaining.toFixed(1)}s` : AIM_DRILLS[aim.drill].name}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] uppercase text-slate-400">Kills</span>
                <span className="font-mono-num font-bold text-slate-100" data-testid="hud-score">
                  {aim.kills}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] uppercase text-slate-400">KPM</span>
                <span className="font-mono-num font-bold text-amber-400">{aim.kpm}</span>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] uppercase text-slate-400">Acc</span>
                <span className="font-mono-num font-bold text-slate-100">{aimAcc}%</span>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] uppercase text-slate-400">HS</span>
                <span className="font-mono-num font-bold text-red-400">{aimHsPct}%</span>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] uppercase text-slate-400">TTK</span>
                <span className="font-mono-num font-bold text-sky-300">
                  {aim.avgTtkMs > 0 ? `${aim.avgTtkMs}ms` : '--'}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] uppercase text-slate-400">Streak</span>
                <span className="font-mono-num font-bold text-emerald-400">
                  {aim.streak}/{aim.bestStreak}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-[#0b0e12]/84 border border-slate-700/60 rounded px-3.5 py-2 space-y-1">
            <div className="flex items-center justify-between gap-3 border-b border-slate-800/90 pb-1">
              <span className="font-display text-xs font-bold uppercase tracking-wider text-slate-100 whitespace-nowrap">
                {mapMeta.name}
              </span>
              <span
                className={`font-mono-num text-[10px] font-semibold uppercase whitespace-nowrap ${
                  hud.difficulty === 'impossible' ? 'text-rose-400' : 'text-amber-400'
                }`}
              >
                {hud.difficulty} · MAP {queueIndex}/{hud.mapQueue.length}
              </span>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Wave</span>
              <span className="font-mono-num text-lg font-bold text-amber-400">
                {hud.wave}/{hud.maxWaves}
              </span>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Hostiles</span>
              <span className="font-mono-num text-sm font-bold text-red-400">
                {hud.enemiesRemaining}
              </span>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Score</span>
              <span className="font-mono-num text-sm font-bold text-slate-100" data-testid="hud-score">
                {hud.score}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* TOP-RIGHT: FPS Counter + Utility Buttons + Kill Feed */}
      <div className="fixed top-4 right-4 flex flex-col items-end gap-2.5">
        <div className="flex items-center gap-1.5 pointer-events-auto">
          {hud.graphics.showFps && (
            <div
              data-testid="hud-fps"
              className="px-2.5 h-9 rounded bg-[#0b0e12]/88 border border-slate-700/70 flex items-center gap-1.5 font-mono-num text-xs font-bold text-emerald-400 whitespace-nowrap"
            >
              <span>{hud.fps}</span>
              <span className="text-[10px] text-slate-400">FPS</span>
            </div>
          )}
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMusic();
            }}
            data-testid="hud-music-toggle"
            aria-label={hud.musicMuted ? 'Enable music' : 'Mute music'}
            title="Music [N]"
            className={`w-9 h-9 rounded bg-[#0b0e12]/84 border hover:border-amber-400 flex items-center justify-center cursor-pointer transition-colors relative ${
              hud.musicMuted ? 'border-slate-800 text-slate-500' : 'border-slate-700/70 text-amber-400'
            }`}
          >
            <Music className="w-4 h-4" />
            {hud.musicMuted && <span className="absolute w-5 h-0.5 bg-slate-500 rotate-45" />}
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            aria-label={hud.muted ? 'Unmute audio' : 'Mute audio'}
            title="Mute All [M]"
            className="w-9 h-9 rounded bg-[#0b0e12]/84 border border-slate-700/70 hover:border-amber-400 text-slate-200 flex items-center justify-center cursor-pointer transition-colors"
          >
            {hud.muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onRestart();
            }}
            aria-label="Restart match"
            title="Restart"
            className="w-9 h-9 rounded bg-[#0b0e12]/84 border border-slate-700/70 hover:border-amber-400 text-slate-200 flex items-center justify-center cursor-pointer transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            aria-label="Pause game"
            title="Pause [P]"
            className="w-9 h-9 rounded bg-[#0b0e12]/84 border border-slate-700/70 hover:border-amber-400 text-slate-200 flex items-center justify-center cursor-pointer transition-colors"
          >
            <Pause className="w-4 h-4" />
          </button>
        </div>

        {/* Killfeed */}
        <div className="space-y-1 text-right">
          {hud.killFeed.map((entry) => (
            <div
              key={entry.id}
              className="px-2.5 py-1 rounded bg-[#0b0e12]/82 border border-slate-800/80 text-xs text-slate-200 hud-text-shadow whitespace-nowrap"
            >
              <span className="text-amber-400 font-semibold">{entry.weaponName}</span>
              <span className="mx-1.5 text-slate-500">·</span>
              <span>{entry.enemyLabel}</span>
              {entry.headshot && (
                <span className="ml-1.5 text-red-400 font-bold uppercase text-[10px]">HS</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* BOTTOM-LEFT: Health, Armor & Sprint Stamina */}
      <div className="fixed bottom-4 left-4 w-64 bg-[#0b0e12]/84 border border-slate-700/60 rounded px-3.5 py-3 space-y-2">
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">HP</span>
            <span
              className={`font-mono-num text-2xl font-bold ${
                hud.hp <= 30 ? 'text-red-400' : 'text-slate-50'
              }`}
              data-testid="hud-hp"
            >
              {Math.round(hud.hp)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {isTraining ? (
              <span className="font-mono-num text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-sky-500/20 border border-sky-400/50 text-sky-300 font-semibold">
                Range Safe
              </span>
            ) : (
              <>
                <ArmorPlateSvg />
                <span className="text-[11px] uppercase tracking-wider text-sky-400 font-semibold">Armor</span>
                <span className="font-mono-num text-sm font-bold text-sky-300">
                  {Math.round(hud.armor)}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Armor bar */}
        <div className="h-1.5 w-full bg-slate-800 rounded-sm overflow-hidden">
          <div
            className="h-full bg-sky-400 transition-all duration-150"
            style={{ width: `${Math.round((hud.armor / hud.maxArmor) * 100)}%` }}
          />
        </div>

        {/* HP bar with trailing damage bar */}
        <div className="relative h-2.5 w-full bg-slate-800 rounded-sm overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-red-500/70 transition-all duration-300"
            style={{ width: `${Math.round((Math.max(hud.hp, dmgHistoryRef.current) / hud.maxHp) * 100)}%` }}
          />
          <div
            className={`absolute inset-y-0 left-0 transition-all duration-100 ${
              hud.hp <= 30 ? 'bg-red-500' : 'bg-emerald-400'
            }`}
            style={{ width: `${Math.round((hud.hp / hud.maxHp) * 100)}%` }}
          />
        </div>

        {/* Sprint Stamina */}
        <div className="flex items-center gap-2 pt-0.5">
          <span className="text-[10px] uppercase tracking-wider text-slate-400">Sprint</span>
          <div className="flex-1 h-1 bg-slate-800 rounded-sm overflow-hidden">
            <div
              className="h-full bg-amber-400/80"
              style={{ width: `${Math.round(hud.stamina)}%` }}
            />
          </div>
        </div>
      </div>

      {/* BOTTOM-RIGHT: Active Weapon, Ammo / Blade Info, Weapon Slots & Frag Grenade */}
      <div className="fixed bottom-4 right-4 bg-[#0b0e12]/84 border border-slate-700/60 rounded px-4 py-3 space-y-2.5 min-w-[292px]">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <div className="font-display text-sm font-bold text-slate-100 whitespace-nowrap">
              {activeSpec.name}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 whitespace-nowrap">
              <span>{isKnife ? 'LMB Slash · RMB Lunge' : `${activeSpec.role} · [C] Knife`}</span>
              <span className="text-slate-600">·</span>
              <FragGrenadeSvg />
              <span className="font-mono-num text-amber-400 font-bold">{hud.grenades} [G]</span>
            </div>
          </div>

          {isKnife ? (
            <div className="text-right font-mono-num">
              <div className="text-sm font-bold text-amber-400 tracking-wider" data-testid="hud-ammo-mag">
                CQC
              </div>
              <div className="text-[10px] text-slate-400">+18% SPD</div>
            </div>
          ) : (
            <div className="flex items-baseline gap-1 font-mono-num">
              <span
                className={`text-3xl font-bold ${
                  activeAmmo.mag <= Math.ceil(activeSpec.magSize * 0.25) ? 'text-amber-400' : 'text-slate-50'
                }`}
                data-testid="hud-ammo-mag"
              >
                {activeAmmo.mag}
              </span>
              <span className="text-slate-500 text-lg">/</span>
              <span className="text-slate-400 text-sm">{activeAmmo.reserve}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <WeaponSilhouetteSvg weapon={hud.activeWeapon} className="w-30 h-8" />

          {/* Interactive Weapon Slot Buttons [1]-[4] */}
          <div className="flex items-center gap-1 pointer-events-auto">
            {WEAPON_ORDER.map((wid) => {
              const spec = WEAPON_SPECS[wid];
              const active = hud.activeWeapon === wid;
              return (
                <button
                  key={wid}
                  type="button"
                  tabIndex={-1}
                  title={`${spec.name} [${spec.keyBind}]`}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onSwitchWeapon(wid);
                  }}
                  className={`px-2 py-1 rounded text-[11px] font-mono-num font-bold border transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-amber-500 border-amber-400 text-slate-950'
                      : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  [{spec.keyBind}]
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Subtle PointerLock Hint at Bottom Center when unlocked */}
      {!hud.pointerLocked && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded bg-[#0b0e12]/80 border border-slate-800 text-[11px] text-slate-300 whitespace-nowrap">
          Click viewport to lock aim · [C] Quick Knife · [4] Karambit · [F] Fire
        </div>
      )}
    </div>
  );
};
