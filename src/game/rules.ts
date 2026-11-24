import type {
  AABB2D,
  AimDrillId,
  AimDrillMeta,
  DifficultyMode,
  EnemyArchetype,
  GraphicsSettings,
  MapId,
  MapMeta,
  QualityMode,
  WaveConfig,
  WeaponAmmoState,
  WeaponId,
  WeaponSpec,
} from './types';

export const MAX_WAVES = 5;

export const MAP_CATALOG: Record<MapId, MapMeta> = {
  ironclad: {
    id: 'ironclad',
    name: 'FOB Ironclad',
    sector: 'Sector 01 · Arid Forward Base',
    environment: 'High-Noon Desert',
    description: 'Sunlit concrete helipad, armored MRAP flank, twin overwatch towers, and sandstone mesas.',
  },
  harbor: {
    id: 'harbor',
    name: 'Port Caldera',
    sector: 'Sector 02 · Maritime Terminal',
    environment: 'Golden Dusk Harbor',
    description: 'Container shipyards, gantry cranes, ocean pier lanes, and warm amber floodlight shadows.',
  },
  quarry: {
    id: 'quarry',
    name: 'Blackout Quarry',
    sector: 'Sector 03 · Radar Outpost',
    environment: 'Moonlit Night Ops',
    description: 'High-altitude basalt quarry, rotating radar array, APC bunker, and crisp moonlight shadows.',
  },
  range: {
    id: 'range',
    name: 'Aim Training Ground',
    sector: 'Sector 00 · CS / CoD Firing Range',
    environment: 'Live-Fire Range',
    description: '10m–45m ballistic firing lanes, head-glitch peek cover, strafing soldier targets, and 30s speed drills.',
    isTraining: true,
  },
};

export const MAP_ORDER: MapId[] = ['ironclad', 'harbor', 'quarry'];
export const ALL_MAP_ORDER: MapId[] = ['ironclad', 'harbor', 'quarry', 'range'];

export const AIM_DRILLS: Record<AimDrillId, AimDrillMeta> = {
  static: {
    id: 'static',
    keyBind: '5',
    name: 'Static Flicks',
    description: '6 soldier targets across 10m–42m lanes with instant respawn for crisp flicks & 1-taps.',
  },
  tracking: {
    id: 'tracking',
    keyBind: '6',
    name: 'Strafe Tracking',
    description: 'Operators strafe laterally at varied speeds across mid-range lanes.',
  },
  peek: {
    id: 'peek',
    keyBind: '7',
    name: 'Cover Peek',
    description: 'Soldiers peek in and out from shoot-house crates & head-glitch barriers.',
  },
  speed30: {
    id: 'speed30',
    keyBind: '8',
    name: '30s Challenge',
    description: '30-second timed kill race measuring KPM, Accuracy, Headshot %, and reaction time.',
  },
};

export const AIM_DRILL_ORDER: AimDrillId[] = ['static', 'tracking', 'peek', 'speed30'];

export const GRAPHICS_PRESETS: Record<Exclude<QualityMode, 'custom'>, GraphicsSettings> = {
  performance: {
    preset: 'performance',
    renderScale: 0.75,
    shadowQuality: 'off',
    aoQuality: 'off',
    antiAliasing: 'off',
    postFx: 'off',
    showFps: true,
  },
  balanced: {
    preset: 'balanced',
    renderScale: 1.0,
    shadowQuality: 'medium',
    aoQuality: 'off',
    antiAliasing: 'fxaa',
    postFx: 'off',
    showFps: false,
  },
  high: {
    preset: 'high',
    renderScale: 1.0,
    shadowQuality: 'high',
    aoQuality: 'fast',
    antiAliasing: 'fxaa',
    postFx: 'bloom',
    showFps: false,
  },
  ultra: {
    preset: 'ultra',
    renderScale: 1.25,
    shadowQuality: 'high',
    aoQuality: 'high',
    antiAliasing: 'fxaa',
    postFx: 'bloom_sharpen',
    showFps: false,
  },
};

export function getGraphicsPreset(mode: QualityMode): GraphicsSettings {
  if (mode === 'custom') {
    return { ...GRAPHICS_PRESETS.balanced };
  }
  return { ...GRAPHICS_PRESETS[mode] };
}

export function resolveMatchingGraphicsPreset(settings: Omit<GraphicsSettings, 'preset'>): QualityMode {
  const keys: Array<Exclude<QualityMode, 'custom'>> = ['performance', 'balanced', 'high', 'ultra'];
  for (const key of keys) {
    const p = GRAPHICS_PRESETS[key];
    if (
      p.renderScale === settings.renderScale &&
      p.shadowQuality === settings.shadowQuality &&
      p.aoQuality === settings.aoQuality &&
      p.antiAliasing === settings.antiAliasing &&
      p.postFx === settings.postFx
    ) {
      return key;
    }
  }
  return 'custom';
}

export function applyGraphicsPatch(
  current: GraphicsSettings,
  patch: Partial<Omit<GraphicsSettings, 'preset'>>,
): GraphicsSettings {
  const next = {
    ...current,
    ...patch,
  };
  next.preset = resolveMatchingGraphicsPreset(next);
  return next;
}

export function getNextMapId(current: MapId, queue: readonly MapId[] = MAP_ORDER): MapId {
  const list = queue.length > 0 ? queue : MAP_ORDER;
  const idx = list.indexOf(current);
  if (idx < 0) return list[0];
  return list[(idx + 1) % list.length];
}

export function buildMapQueue(startMap: MapId): MapId[] {
  const idx = MAP_ORDER.indexOf(startMap);
  if (idx <= 0) return [...MAP_ORDER];
  return [...MAP_ORDER.slice(idx), ...MAP_ORDER.slice(0, idx)];
}

export const WEAPON_SPECS: Record<WeaponId, WeaponSpec> = {
  rifle: {
    id: 'rifle',
    name: 'M4A1 Tactical',
    role: 'Full-Auto Carbine',
    keyBind: '1',
    magSize: 30,
    startReserve: 150,
    fireInterval: 0.095,
    reloadDuration: 1.55,
    damage: 28,
    headshotMultiplier: 2.0,
    pellets: 1,
    hipSpread: 0.026,
    adsSpread: 0.004,
    recoilPitch: 0.014,
    recoilYaw: 0.006,
    adsFov: 52,
    automatic: true,
    range: 130,
    moveSpeedMultiplier: 1.0,
  },
  shotgun: {
    id: 'shotgun',
    name: 'M1014 Breacher',
    role: 'Close-Quarters 12G',
    keyBind: '2',
    magSize: 8,
    startReserve: 40,
    fireInterval: 0.58,
    reloadDuration: 1.75,
    damage: 19,
    headshotMultiplier: 1.6,
    pellets: 7,
    hipSpread: 0.072,
    adsSpread: 0.045,
    recoilPitch: 0.042,
    recoilYaw: 0.015,
    adsFov: 58,
    automatic: false,
    range: 42,
    moveSpeedMultiplier: 0.97,
  },
  sniper: {
    id: 'sniper',
    name: 'MK14 Marksman',
    role: 'Precision DMR',
    keyBind: '3',
    magSize: 10,
    startReserve: 50,
    fireInterval: 0.72,
    reloadDuration: 1.9,
    damage: 88,
    headshotMultiplier: 2.35,
    pellets: 1,
    hipSpread: 0.055,
    adsSpread: 0.0008,
    recoilPitch: 0.048,
    recoilYaw: 0.012,
    adsFov: 30,
    automatic: false,
    range: 190,
    moveSpeedMultiplier: 0.94,
  },
  knife: {
    id: 'knife',
    name: 'Karambit Tactical',
    role: 'CQC Combat Blade',
    keyBind: '4',
    magSize: 1,
    startReserve: 0,
    fireInterval: 0.36,
    reloadDuration: 0,
    damage: 70,
    heavyDamage: 120,
    headshotMultiplier: 1.75,
    pellets: 1,
    hipSpread: 0.01,
    adsSpread: 0.01,
    recoilPitch: 0,
    recoilYaw: 0,
    adsFov: 68,
    automatic: false,
    range: 3.4,
    isMelee: true,
    moveSpeedMultiplier: 1.18,
  },
};

export const WEAPON_ORDER: WeaponId[] = ['rifle', 'shotgun', 'sniper', 'knife'];
export const PRIMARY_FIREARM_ORDER: WeaponId[] = ['rifle', 'shotgun', 'sniper'];

export function createInitialWeaponsState(): Record<WeaponId, WeaponAmmoState> {
  return {
    rifle: { mag: WEAPON_SPECS.rifle.magSize, reserve: WEAPON_SPECS.rifle.startReserve },
    shotgun: { mag: WEAPON_SPECS.shotgun.magSize, reserve: WEAPON_SPECS.shotgun.startReserve },
    sniper: { mag: WEAPON_SPECS.sniper.magSize, reserve: WEAPON_SPECS.sniper.startReserve },
    knife: { mag: 1, reserve: 0 },
  };
}

export function canFireWeapon(ammo: WeaponAmmoState, isReloading: boolean, weaponId?: WeaponId): boolean {
  if (weaponId === 'knife') return true;
  return !isReloading && ammo.mag > 0;
}

export function consumeAmmo(ammo: WeaponAmmoState, weaponId?: WeaponId): WeaponAmmoState {
  if (weaponId === 'knife') return ammo;
  if (ammo.mag <= 0) return ammo;
  return {
    mag: ammo.mag - 1,
    reserve: ammo.reserve,
  };
}

export function canReloadWeapon(
  ammo: WeaponAmmoState,
  magSize: number,
  isReloading: boolean,
  weaponId?: WeaponId,
): boolean {
  if (weaponId === 'knife') return false;
  return !isReloading && ammo.mag < magSize && ammo.reserve > 0;
}

export function applyReload(ammo: WeaponAmmoState, magSize: number): WeaponAmmoState {
  if (ammo.reserve <= 0 || ammo.mag >= magSize) return ammo;
  const needed = magSize - ammo.mag;
  const transfer = Math.min(needed, ammo.reserve);
  return {
    mag: ammo.mag + transfer,
    reserve: ammo.reserve - transfer,
  };
}

export function computeWeaponSpread(
  spec: WeaponSpec,
  isAds: boolean,
  moveSpeedRatio: number,
  recoilAccum: number,
): number {
  if (spec.isMelee) return 0.008;
  const base = isAds ? spec.adsSpread : spec.hipSpread;
  const movePenalty = isAds ? moveSpeedRatio * 0.008 : moveSpeedRatio * 0.024;
  return base + movePenalty + Math.min(0.05, recoilAccum * 0.28);
}

export function computeHitDamage(
  spec: WeaponSpec,
  distance: number,
  isHeadshot: boolean,
): number {
  const falloffStart = spec.range * 0.45;
  let falloff = 1.0;
  if (distance > falloffStart) {
    const t = Math.min(1, (distance - falloffStart) / Math.max(1, spec.range - falloffStart));
    falloff = 1.0 - t * 0.45;
  }
  const raw = spec.damage * falloff * (isHeadshot ? spec.headshotMultiplier : 1.0);
  return Math.max(1, Math.round(raw));
}

export interface MeleeTargetCandidate {
  id: number;
  x: number;
  y: number;
  z: number;
  facingYaw: number;
}

export function evaluateMeleeStrike(
  playerX: number,
  playerY: number,
  playerZ: number,
  playerYaw: number,
  targets: readonly MeleeTargetCandidate[],
  isHeavy: boolean,
): { targetId: number; damage: number; isBackstab: boolean } | null {
  const spec = WEAPON_SPECS.knife;
  const maxRange = isHeavy ? spec.range + 0.45 : spec.range;
  const fwdX = -Math.sin(playerYaw);
  const fwdZ = -Math.cos(playerYaw);

  let bestTarget: MeleeTargetCandidate | null = null;
  let bestDist = Infinity;

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const dy = Math.abs(t.y - playerY);
    if (dy > 2.4) continue;
    const dx = t.x - playerX;
    const dz = t.z - playerZ;
    const dist = Math.hypot(dx, dz);
    if (dist > maxRange) continue;

    if (dist > 0.05) {
      const dot = (dx / dist) * fwdX + (dz / dist) * fwdZ;
      if (dot < 0.48) continue;
    }

    if (dist < bestDist) {
      bestDist = dist;
      bestTarget = t;
    }
  }

  if (!bestTarget) return null;

  // Check if striking from behind enemy's facing vector (+sin(yaw), +cos(yaw) in Three.js model local +Z)
  const enemyFwdX = Math.sin(bestTarget.facingYaw);
  const enemyFwdZ = Math.cos(bestTarget.facingYaw);
  const alignDot = fwdX * enemyFwdX + fwdZ * enemyFwdZ;
  const isBackstab = alignDot > 0.35;

  const baseDmg = isHeavy ? spec.heavyDamage ?? 120 : spec.damage;
  const damage = isBackstab ? Math.round(baseDmg * 1.45) : baseDmg;

  return {
    targetId: bestTarget.id,
    damage,
    isBackstab,
  };
}

export function computeExplosionDamage(
  distance: number,
  radius: number,
  maxDamage: number,
): number {
  if (distance >= radius) return 0;
  const ratio = 1 - distance / radius;
  return Math.round(maxDamage * (0.25 + 0.75 * ratio * ratio));
}

export function applyPlayerDamage(
  hp: number,
  armor: number,
  incomingDamage: number,
): { hp: number; armor: number; defeated: boolean } {
  const dmg = Math.max(0, Math.round(incomingDamage));
  const absorbedByArmor = Math.min(armor, Math.ceil(dmg * 0.6));
  const nextArmor = Math.max(0, armor - absorbedByArmor);
  const remainingDmg = dmg - absorbedByArmor;
  const nextHp = Math.max(0, hp - remainingDmg);
  return {
    hp: nextHp,
    armor: nextArmor,
    defeated: nextHp <= 0,
  };
}

export function resolveCircleObstacles(
  x: number,
  z: number,
  radius: number,
  obstacles: readonly AABB2D[],
  arenaHalfExtent: number,
): { x: number; z: number } {
  let rx = Math.max(-arenaHalfExtent + radius, Math.min(arenaHalfExtent - radius, x));
  let rz = Math.max(-arenaHalfExtent + radius, Math.min(arenaHalfExtent - radius, z));

  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < obstacles.length; i++) {
      const box = obstacles[i];
      const closestX = Math.max(box.minX, Math.min(rx, box.maxX));
      const closestZ = Math.max(box.minZ, Math.min(rz, box.maxZ));
      const dx = rx - closestX;
      const dz = rz - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < radius * radius) {
        if (distSq > 1e-8) {
          const dist = Math.sqrt(distSq);
          const push = radius - dist;
          rx += (dx / dist) * push;
          rz += (dz / dist) * push;
        } else {
          const penLeft = Math.abs(rx - box.minX);
          const penRight = Math.abs(box.maxX - rx);
          const penTop = Math.abs(rz - box.minZ);
          const penBottom = Math.abs(box.maxZ - rz);
          const minPen = Math.min(penLeft, penRight, penTop, penBottom);
          if (minPen === penLeft) rx = box.minX - radius;
          else if (minPen === penRight) rx = box.maxX + radius;
          else if (minPen === penTop) rz = box.minZ - radius;
          else rz = box.maxZ + radius;
        }
      }
    }
    rx = Math.max(-arenaHalfExtent + radius, Math.min(arenaHalfExtent - radius, rx));
    rz = Math.max(-arenaHalfExtent + radius, Math.min(arenaHalfExtent - radius, rz));
  }

  return { x: rx, z: rz };
}

export function getWaveConfig(wave: number, difficulty: DifficultyMode): WaveConfig {
  const clampedWave = Math.max(1, Math.min(MAX_WAVES, wave));
  const diffHp = difficulty === 'impossible' ? 1.5 : difficulty === 'veteran' ? 1.08 : 0.85;
  const diffDmg = difficulty === 'impossible' ? 1.85 : difficulty === 'veteran' ? 1.08 : 0.78;
  const accuracyScale = difficulty === 'impossible' ? 1.32 : difficulty === 'veteran' ? 0.94 : 0.74;
  const cooldownScale = difficulty === 'impossible' ? 0.66 : difficulty === 'veteran' ? 1.02 : 1.24;
  const telegraphScale = difficulty === 'impossible' ? 0.64 : difficulty === 'veteran' ? 1.0 : 1.2;
  const speedScale = difficulty === 'impossible' ? 1.16 : difficulty === 'veteran' ? 0.98 : 0.9;

  const titles = [
    'Perimeter Breach',
    'Armored Push',
    'Overwatch Ambush',
    'Drone Escort',
    'Ironclad Extraction',
  ];

  const archetypesByWave: EnemyArchetype[][] = [
    ['rifleman', 'rifleman', 'rusher'],
    ['rifleman', 'rusher', 'sniper', 'rifleman'],
    ['rifleman', 'rusher', 'sniper', 'heavy_drone'],
    ['rifleman', 'rusher', 'sniper', 'heavy_drone', 'rusher'],
    ['rifleman', 'rusher', 'sniper', 'heavy_drone', 'sniper', 'heavy_drone'],
  ];

  const baseTotal = 5 + clampedWave * 3;
  const totalEnemies = difficulty === 'impossible' ? baseTotal + 2 : baseTotal;
  const maxConcurrent =
    difficulty === 'impossible' ? Math.min(9, 4 + clampedWave) : Math.min(7, 3 + clampedWave);
  const attackTokens =
    difficulty === 'impossible'
      ? Math.min(6, 3 + Math.floor((clampedWave + 1) / 2))
      : Math.min(4, 2 + Math.floor(clampedWave / 2));

  return {
    wave: clampedWave,
    title: titles[clampedWave - 1],
    totalEnemies,
    maxConcurrent,
    attackTokens,
    hpScale: (1 + (clampedWave - 1) * 0.14) * diffHp,
    damageScale: (1 + (clampedWave - 1) * 0.1) * diffDmg,
    accuracyScale,
    cooldownScale,
    telegraphScale,
    speedScale,
    archetypes: archetypesByWave[clampedWave - 1],
  };
}

export function computeAccuracyPercent(shotsFired: number, shotsHit: number): number {
  if (shotsFired <= 0) return 0;
  return Math.min(100, Math.round((shotsHit / shotsFired) * 100));
}

export function computeKillScore(archetype: EnemyArchetype, headshot: boolean, wave: number): number {
  const base: Record<EnemyArchetype, number> = {
    rifleman: 100,
    rusher: 125,
    sniper: 175,
    heavy_drone: 225,
  };
  return Math.round((base[archetype] + (headshot ? 50 : 0)) * (1 + (wave - 1) * 0.15));
}

export function checkMatchOutcome(
  playerHp: number,
  wave: number,
  enemiesRemainingInWave: number,
): 'ongoing' | 'victory' | 'defeat' {
  if (playerHp <= 0) return 'defeat';
  if (wave >= MAX_WAVES && enemiesRemainingInWave <= 0) return 'victory';
  return 'ongoing';
}

export function computeKpm(kills: number, elapsedSeconds: number): number {
  if (kills <= 0 || elapsedSeconds <= 0.2) return 0;
  return Math.round((kills / elapsedSeconds) * 60);
}

export function computeHeadshotPercent(kills: number, headshots: number): number {
  if (kills <= 0) return 0;
  return Math.min(100, Math.round((headshots / kills) * 100));
}

export function computeAvgTtkMs(totalTtkSec: number, kills: number): number {
  if (kills <= 0 || totalTtkSec <= 0) return 0;
  return Math.round((totalTtkSec / kills) * 1000);
}

