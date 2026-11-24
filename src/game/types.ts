export type GamePhase = 'title' | 'playing' | 'paused' | 'gameover';

export type GameMode = 'combat' | 'training';

export type DifficultyMode = 'standard' | 'veteran' | 'impossible';

export type WeaponId = 'rifle' | 'shotgun' | 'sniper' | 'knife';

export type MapId = 'ironclad' | 'harbor' | 'quarry' | 'range';

export type QualityMode = 'performance' | 'balanced' | 'high' | 'ultra' | 'custom';

export type RenderScaleOption = 0.75 | 1.0 | 1.25 | 1.5;

export type ShadowQuality = 'off' | 'low' | 'medium' | 'high';

export type AoQuality = 'off' | 'fast' | 'high';

export type AntiAliasingMode = 'off' | 'fxaa';

export type PostFxMode = 'off' | 'bloom' | 'bloom_sharpen';

export interface GraphicsSettings {
  preset: QualityMode;
  renderScale: RenderScaleOption;
  shadowQuality: ShadowQuality;
  aoQuality: AoQuality;
  antiAliasing: AntiAliasingMode;
  postFx: PostFxMode;
  showFps: boolean;
}

export type RendererBackendPref = 'auto' | 'webgl2';

export type EnemyArchetype = 'rifleman' | 'rusher' | 'sniper' | 'heavy_drone';

export type AimDrillId = 'static' | 'tracking' | 'peek' | 'speed30';

export interface AimDrillMeta {
  id: AimDrillId;
  keyBind: '5' | '6' | '7' | '8';
  name: string;
  description: string;
}

export interface AimTrainingSnapshot {
  drill: AimDrillId;
  timeRemaining: number; // seconds left in speed30 challenge
  challengeActive: boolean;
  challengeComplete: boolean;
  kills: number;
  headshots: number;
  shotsFired: number;
  shotsHit: number;
  streak: number;
  bestStreak: number;
  kpm: number;
  avgTtkMs: number;
  bestSpeedKills: number;
  headshotOnly: boolean;
  strafeEnabled: boolean;
}

export interface WeaponSpec {
  id: WeaponId;
  name: string;
  role: string;
  keyBind: '1' | '2' | '3' | '4';
  magSize: number;
  startReserve: number;
  fireInterval: number; // seconds between shots or slashes
  reloadDuration: number; // seconds
  damage: number;
  headshotMultiplier: number;
  pellets: number;
  hipSpread: number; // radians
  adsSpread: number; // radians
  recoilPitch: number; // radians kick per shot
  recoilYaw: number;
  adsFov: number;
  automatic: boolean;
  range: number;
  isMelee?: boolean;
  heavyDamage?: number;
  moveSpeedMultiplier?: number;
}

export interface WeaponAmmoState {
  mag: number;
  reserve: number;
}

export interface MapMeta {
  id: MapId;
  name: string;
  sector: string;
  environment: string;
  description: string;
  isTraining?: boolean;
}

export interface AABB2D {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
  kind: 'building' | 'container' | 'barrier' | 'tower' | 'vehicle' | 'crate';
}

export interface KillFeedEntry {
  id: number;
  weaponName: string;
  enemyLabel: string;
  headshot: boolean;
  timestamp: number;
}

export interface RadarBlip {
  x: number;
  z: number;
  kind: EnemyArchetype | 'barrel';
}

export type MusicIntensity = 'briefing' | 'stealth' | 'combat' | 'climax' | 'paused';

export interface HudSnapshot {
  phase: GamePhase;
  gameMode: GameMode;
  outcome: 'none' | 'victory' | 'defeat';
  hp: number;
  maxHp: number;
  armor: number;
  maxArmor: number;
  stamina: number;
  activeWeapon: WeaponId;
  weapons: Record<WeaponId, WeaponAmmoState>;
  isReloading: boolean;
  reloadProgress: number;
  isAds: boolean;
  grenades: number;
  wave: number;
  maxWaves: number;
  enemiesRemaining: number;
  waveBanner: string | null;
  score: number;
  kills: number;
  headshots: number;
  shotsFired: number;
  shotsHit: number;
  elapsedSeconds: number;
  hitmarkerKind: 'none' | 'hit' | 'kill' | 'headshot';
  damageFlash: number;
  damageAngle: number | null; // relative angle in radians to last attacker
  pointerLocked: boolean;
  muted: boolean;
  musicMuted: boolean;
  musicVolume: number;
  crosshairSpread: number;
  killFeed: KillFeedEntry[];
  playerX: number;
  playerZ: number;
  playerYaw: number;
  radarBlips: RadarBlip[];
  difficulty: DifficultyMode;
  mapId: MapId;
  nextMapId: MapId;
  mapQueue: MapId[];
  autoQueueMaps: boolean;
  activeBackendLabel: string;
  qualityMode: QualityMode;
  graphics: GraphicsSettings;
  fps: number;
  aimTraining: AimTrainingSnapshot;
}

export interface WaveConfig {
  wave: number;
  title: string;
  totalEnemies: number;
  maxConcurrent: number;
  attackTokens: number;
  hpScale: number;
  damageScale: number;
  accuracyScale: number;
  cooldownScale: number;
  telegraphScale: number;
  speedScale: number;
  archetypes: EnemyArchetype[];
}

export interface DesktopBridge {
  isDesktop: boolean;
  platform: string;
  quit: () => Promise<void>;
  toggleFullscreen: () => Promise<boolean>;
  isFullscreen: () => Promise<boolean>;
}

declare global {
  interface Window {
    desktopApp?: DesktopBridge;
  }
}
