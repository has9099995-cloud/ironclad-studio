import * as THREE from 'three/webgpu';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import {
  pass,
  mrt,
  output,
  emissive,
  normalView,
  screenUV,
  builtinAOContext,
  renderOutput,
} from 'three/tsl';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import {
  AIM_DRILLS,
  applyGraphicsPatch,
  applyPlayerDamage,
  applyReload,
  buildMapQueue,
  canFireWeapon,
  canReloadWeapon,
  checkMatchOutcome,
  computeAvgTtkMs,
  computeExplosionDamage,
  computeHeadshotPercent,
  computeHitDamage,
  computeKillScore,
  computeKpm,
  computeWeaponSpread,
  consumeAmmo,
  createInitialWeaponsState,
  evaluateMeleeStrike,
  getGraphicsPreset,
  getNextMapId,
  getWaveConfig,
  GRAPHICS_PRESETS,
  MAP_CATALOG,
  MAX_WAVES,
  resolveCircleObstacles,
  WEAPON_ORDER,
  WEAPON_SPECS,
} from './rules';
import { tacticalAudio } from './audio';
import { tacticalMusic } from './music';
import { resolveMusicIntensity } from './musicTheory';
import { createProceduralTextures, type ProceduralTextureSet } from './textures';
import {
  buildEnemySoldier,
  buildWeaponViewModel,
  disposeEnemyRig,
  type EnemyRig,
  type WeaponViewModelRig,
} from './models';
import { buildTacticalMap, type TacticalMapData } from './map';
import type {
  AimDrillId,
  DifficultyMode,
  EnemyArchetype,
  GameMode,
  GamePhase,
  GraphicsSettings,
  HudSnapshot,
  KillFeedEntry,
  MapId,
  QualityMode,
  RadarBlip,
  RendererBackendPref,
  WeaponAmmoState,
  WeaponId,
} from './types';

const GRAPHICS_STORAGE_KEY = 'ironclad_graphics_v1';
const BEST_SPEED30_KEY = 'ironclad_aim_best30_v1';

function loadSavedGraphicsSettings(): GraphicsSettings {
  try {
    const raw = localStorage.getItem(GRAPHICS_STORAGE_KEY);
    if (!raw) return { ...GRAPHICS_PRESETS.balanced };
    const parsed = JSON.parse(raw) as Partial<GraphicsSettings>;
    const base = { ...GRAPHICS_PRESETS.balanced };
    if (parsed.renderScale === 0.75 || parsed.renderScale === 1.0 || parsed.renderScale === 1.25 || parsed.renderScale === 1.5) {
      base.renderScale = parsed.renderScale;
    }
    if (parsed.shadowQuality === 'off' || parsed.shadowQuality === 'low' || parsed.shadowQuality === 'medium' || parsed.shadowQuality === 'high') {
      base.shadowQuality = parsed.shadowQuality;
    }
    if (parsed.aoQuality === 'off' || parsed.aoQuality === 'fast' || parsed.aoQuality === 'high') {
      base.aoQuality = parsed.aoQuality;
    }
    if (parsed.antiAliasing === 'off' || parsed.antiAliasing === 'fxaa') {
      base.antiAliasing = parsed.antiAliasing;
    }
    if (parsed.postFx === 'off' || parsed.postFx === 'bloom' || parsed.postFx === 'bloom_sharpen') {
      base.postFx = parsed.postFx;
    }
    if (typeof parsed.showFps === 'boolean') {
      base.showFps = parsed.showFps;
    }
    return applyGraphicsPatch(base, {});
  } catch {
    return { ...GRAPHICS_PRESETS.balanced };
  }
}

function saveGraphicsSettings(g: GraphicsSettings) {
  try {
    localStorage.setItem(GRAPHICS_STORAGE_KEY, JSON.stringify(g));
  } catch {
    // Ignore private browsing quota errors
  }
}

function loadSavedBest30(): number {
  try {
    const v = Number(localStorage.getItem(BEST_SPEED30_KEY) || '0');
    return Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
  } catch {
    return 0;
  }
}

function saveBest30(kills: number) {
  try {
    localStorage.setItem(BEST_SPEED30_KEY, String(kills));
  } catch {
    // Ignore storage errors
  }
}

interface ActiveEnemy {
  id: number;
  archetype: EnemyArchetype;
  rig: EnemyRig;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  hp: number;
  maxHp: number;
  speed: number;
  state: 'alive' | 'ko';
  koTimer: number;
  koRollDir: number;
  hitFlashTimer: number;
  fireCooldown: number;
  telegraphTimer: number;
  telegraphDuration: number;
  strafeDir: number;
  strafeTimer: number;
  walkPhase: number;
  fireFlashTimer: number;
  recoilKick: number;
  flinchKick: number;
  laserLine: THREE.Line | null;
  rangeSlotIndex?: number;
  rangeHomeX?: number;
  rangeHomeZ?: number;
  rangePeekPhase?: number;
}

interface PooledParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  gravity: number;
  color: THREE.Color;
}

interface TracerBeam {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
}

interface ShellCasing {
  mesh: THREE.Mesh;
  active: boolean;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  life: number;
}

interface ActiveGrenade {
  mesh: THREE.Mesh;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  fuse: number;
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _sunDir = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

function createStudioEnvironmentScene(skyHex = 0x8bb6e0, groundHex = 0x6b5640, sunHex = 0xfff1d6): THREE.Scene {
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(skyHex);
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(12, 16, 12),
    new THREE.MeshBasicMaterial({ color: skyHex, side: THREE.BackSide }),
  );
  envScene.add(skyDome);

  const groundDisc = new THREE.Mesh(
    new THREE.CircleGeometry(11, 16),
    new THREE.MeshBasicMaterial({ color: groundHex }),
  );
  groundDisc.rotation.x = -Math.PI / 2;
  groundDisc.position.y = -3.5;
  envScene.add(groundDisc);

  const warmPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 5),
    new THREE.MeshBasicMaterial({ color: sunHex }),
  );
  warmPanel.position.set(4, 5, 3);
  warmPanel.lookAt(0, 0, 0);
  envScene.add(warmPanel);

  const rimPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 4),
    new THREE.MeshBasicMaterial({ color: skyHex }),
  );
  rimPanel.position.set(-4, 3, -4);
  rimPanel.lookAt(0, 0, 0);
  envScene.add(rimPanel);
  return envScene;
}

export interface EngineCallbacks {
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onPhaseChange: (phase: GamePhase, outcome: 'none' | 'victory' | 'defeat') => void;
}

export class TacticalFpsEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;
  private isSoftwareGl: boolean;
  private renderer!: THREE.WebGPURenderer;
  private renderPipeline: THREE.RenderPipeline | null = null;
  private pipelineSignature = '';
  private pipelineDisabled = false;
  private forcePipeline =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('forcepipeline') === '1';
  private fallbackInProgress = false;
  private rendererReady = false;
  private preferredBackend: RendererBackendPref = 'webgl2';
  private activeBackendLabel = 'Initializing...';
  private graphics: GraphicsSettings = loadSavedGraphicsSettings();
  private qualityMode: QualityMode = this.graphics.preset;

  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private sky: SkyMesh;
  private hemiLight: THREE.HemisphereLight;
  private sunLight: THREE.DirectionalLight;
  private rimLight: THREE.DirectionalLight;
  private muzzleLight: THREE.PointLight;
  private explosionLight: THREE.PointLight;
  private explosionLightTimer = 0;

  private textures!: ProceduralTextureSet;
  private mapData!: TacticalMapData;
  private currentMapId: MapId = 'ironclad';
  private mapQueue: MapId[] = buildMapQueue('ironclad');
  private autoQueueMaps = true;

  private weaponRigs!: Record<WeaponId, WeaponViewModelRig>;
  private viewmodelGroup: THREE.Group;

  private raycaster = new THREE.Raycaster();
  private keysHeld = new Set<string>();
  private fireHeld = false;
  private fireJustPressed = false;
  private adsHeld = false;
  private adsToggle = false;
  private heavyMeleeJustPressed = false;
  private sensitivity = 1.0;

  private phase: GamePhase = 'title';
  private gameMode: GameMode = 'combat';
  private outcome: 'none' | 'victory' | 'defeat' = 'none';
  private difficulty: DifficultyMode = 'standard';

  // Shadow update throttling + FPS counter
  private lastShadowCenterX = 9999;
  private lastShadowCenterZ = 9999;
  private fpsSamplesAccum = 0;
  private fpsFrames = 0;
  private currentFps = 0;

  // Aim Training Ground state
  private aimDrill: AimDrillId = 'static';
  private aimTimeRemaining = 30;
  private aimChallengeActive = false;
  private aimChallengeComplete = false;
  private aimKills = 0;
  private aimHeadshots = 0;
  private aimShotsFired = 0;
  private aimShotsHit = 0;
  private aimStreak = 0;
  private aimBestStreak = 0;
  private aimTotalTtkSec = 0;
  private aimDrillElapsed = 0;
  private aimSplitStartTime = 0;
  private aimFirstShotStarted = false;
  private aimBestSpeedKills = loadSavedBest30();
  private aimHeadshotOnly = false;
  private aimStrafeEnabled = false;
  private barrelRespawnTimers = new Map<string, number>();

  // Player state
  private playerX = 0;
  private playerY = 0;
  private playerVy = 0;
  private playerZ = 23;
  private playerGrounded = true;
  private playerYaw = 0;
  private playerPitch = 0;
  private lungeVx = 0;
  private lungeVz = 0;
  private hp = 100;
  private maxHp = 100;
  private armor = 50;
  private maxArmor = 50;
  private stamina = 100;
  private grenades = 3;
  private walkDistance = 0;
  private stepDistAccum = 0;

  // Weapon & Knife state
  private activeWeapon: WeaponId = 'rifle';
  private quickKnifeReturnWeapon: WeaponId | null = null;
  private quickKnifeTimer = 0;
  private weapons: Record<WeaponId, WeaponAmmoState> = createInitialWeaponsState();
  private fireTimer = 0;
  private isReloading = false;
  private reloadTimer = 0;
  private recoilPitch = 0;
  private recoilYaw = 0;
  private recoilAccum = 0;
  private weaponKickZ = 0;
  private swapDip = 0;
  private muzzleFlashTimer = 0;
  private currentAdsAlpha = 0;
  private knifeSlashTimer = 0;
  private knifeSlashDuration = 0.28;
  private knifeSlashHeavy = false;
  private knifeInspectTimer = 0;

  // Juice & feedback
  private hitstopTimer = 0;
  private cameraTrauma = 0;
  private hitmarkerTimer = 0;
  private hitmarkerKind: 'none' | 'hit' | 'kill' | 'headshot' = 'none';
  private damageFlash = 0;
  private damageAngle: number | null = null;

  // Wave & score state
  private wave = 1;
  private enemiesToSpawn = 0;
  private spawnCooldown = 0;
  private waveBreakTimer = 0;
  private waveBanner: string | null = null;
  private waveBannerTimer = 0;
  private nextEnemyId = 1;
  private enemies: ActiveEnemy[] = [];
  private score = 0;
  private kills = 0;
  private headshots = 0;
  private shotsFired = 0;
  private shotsHit = 0;
  private elapsedSeconds = 0;
  private killFeed: KillFeedEntry[] = [];
  private killFeedSeq = 1;

  // Pools & cached reusable objects (zero per-frame / per-shot GC)
  private particlePool: PooledParticle[] = [];
  private particleInstanced: THREE.InstancedMesh;
  private tracers: TracerBeam[] = [];
  private tracerIndex = 0;
  private shells: ShellCasing[] = [];
  private shellIndex = 0;
  private activeGrenades: ActiveGrenade[] = [];
  private grenadeGeo = new THREE.SphereGeometry(0.11, 10, 10);
  private grenadeMat = new THREE.MeshStandardMaterial({ color: 0x3f4f3c, roughness: 0.5, metalness: 0.6 });
  private _hitTargetsPool: THREE.Object3D[] = [];
  private _meleeCandidatesPool: Array<{ id: number; x: number; y: number; z: number; facingYaw: number }> = [];

  // Loop & lifecycle
  private frameId = 0;
  private lastTimestamp = 0;
  private hudSyncTimer = 0;
  private titleOrbitAngle = 0.5;
  private disposed = false;
  private isDraggingLook = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  private pendingStartConfig: { difficulty: DifficultyMode; weapon?: WeaponId; mapId?: MapId } | null = null;

  constructor(container: HTMLElement, callbacks: EngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    this.isSoftwareGl = (() => {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param));
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = Math.max(1, container.clientWidth || window.innerWidth);
    const height = Math.max(1, container.clientHeight || window.innerHeight);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xa5b9cc, 0.0038);

    this.camera = new THREE.PerspectiveCamera(72, width / height, 0.08, 440);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    // Procedural SkyMesh (compatible with both WebGPU/Vulkan & WebGL2 backends)
    this.sky = new SkyMesh();
    this.sky.scale.setScalar(380);
    this.scene.add(this.sky);

    // Tactical Lighting Rig
    this.hemiLight = new THREE.HemisphereLight(0x8bb6e0, 0x6b5640, 0.44);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff1db, 1.65);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 140;
    this.sunLight.shadow.camera.left = -34;
    this.sunLight.shadow.camera.right = 34;
    this.sunLight.shadow.camera.top = 34;
    this.sunLight.shadow.camera.bottom = -34;
    this.sunLight.shadow.bias = -0.0004;
    this.sunLight.shadow.normalBias = 0.02;
    this.sunLight.shadow.radius = 2.5;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.rimLight = new THREE.DirectionalLight(0x7fb0e6, 0.32);
    this.rimLight.position.set(-40, 24, -45);
    this.scene.add(this.rimLight);

    this.muzzleLight = new THREE.PointLight(0xffb454, 0, 10, 2);
    this.muzzleLight.position.set(0.25, -0.1, -1.1);
    this.camera.add(this.muzzleLight);

    this.explosionLight = new THREE.PointLight(0xff7722, 0, 24, 1.5);
    this.scene.add(this.explosionLight);

    // Viewmodel container
    this.viewmodelGroup = new THREE.Group();
    this.camera.add(this.viewmodelGroup);
    this.viewmodelGroup.visible = false;

    // Pooled InstancedMesh Particles (160)
    const pGeo = new THREE.IcosahedronGeometry(0.14, 0);
    const pMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.particleInstanced = new THREE.InstancedMesh(pGeo, pMat, 160);
    this.particleInstanced.frustumCulled = false;
    for (let i = 0; i < 160; i++) {
      this.particlePool.push({
        active: false,
        x: 0,
        y: -50,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        size: 1,
        gravity: 9.8,
        color: new THREE.Color(0xffaa33),
      });
      _mat4.makeScale(0, 0, 0);
      this.particleInstanced.setMatrixAt(i, _mat4);
      this.particleInstanced.setColorAt(i, new THREE.Color(0xffffff));
    }
    this.particleInstanced.instanceMatrix.needsUpdate = true;
    this.scene.add(this.particleInstanced);

    // Pooled Bullet Tracers (24)
    const tracerGeo = new THREE.CylinderGeometry(0.014, 0.014, 1, 6);
    tracerGeo.rotateX(Math.PI / 2);
    for (let i = 0; i < 24; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffd27d,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(tracerGeo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.tracers.push({ mesh, mat, life: 0, maxLife: 0.09 });
    }

    // Pooled Brass Shell Casings (18)
    const shellGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.036, 6);
    const shellMat = new THREE.MeshStandardMaterial({ color: 0xd4a64a, metalness: 0.9, roughness: 0.25 });
    for (let i = 0; i < 18; i++) {
      const mesh = new THREE.Mesh(shellGeo, shellMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.shells.push({ mesh, active: false, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, life: 0 });
    }

    void this.initAsync(width, height);
  }

  private async initAsync(width: number, height: number) {
    try {
      await this.setupRenderer(this.preferredBackend, width, height);
      if (this.disposed) return;

      const maxAniso = typeof this.renderer.getMaxAnisotropy === 'function' ? this.renderer.getMaxAnisotropy() : 8;
      this.textures = createProceduralTextures(maxAniso);

      this.weaponRigs = {
        rifle: buildWeaponViewModel('rifle', this.textures),
        shotgun: buildWeaponViewModel('shotgun', this.textures),
        sniper: buildWeaponViewModel('sniper', this.textures),
        knife: buildWeaponViewModel('knife', this.textures),
      };
      for (const id of WEAPON_ORDER) {
        this.weaponRigs[id].root.visible = id === this.activeWeapon;
        this.viewmodelGroup.add(this.weaponRigs[id].root);
      }

      this.applyGraphicsSettings(true);
      this.loadMap(this.currentMapId);
      this.bindEvents();
      this.updateTitleCamera(0);

      if (!this.isSoftwareGl && typeof this.renderer.compileAsync === 'function') {
        await Promise.race([
          this.renderer.compileAsync(this.scene, this.camera).catch((err) => {
            console.warn('compileAsync skipped after error:', err);
          }),
          new Promise<void>((resolve) => window.setTimeout(resolve, 2500)),
        ]);
      }
      if (this.disposed) return;

      this.rendererReady = true;

      if (this.pendingStartConfig) {
        const cfg = this.pendingStartConfig;
        this.pendingStartConfig = null;
        this.startNewRun(cfg.difficulty, cfg.weapon, cfg.mapId);
      } else {
        this.emitHud();
      }

      // Draw Frame 1 synchronously right away so canvas never sits blank
      this.renderFrameSafe();

      this.lastTimestamp = performance.now();
      this.loop(this.lastTimestamp);
    } catch (err) {
      console.error('3D Engine init failed:', err);
      this.activeBackendLabel = 'Renderer Error';
      this.emitHud();
    }
  }

  private async createAndInitRenderer(forceWebGL: boolean, width: number, height: number): Promise<THREE.WebGPURenderer> {
    const renderer = new THREE.WebGPURenderer({
      antialias: !this.isSoftwareGl,
      alpha: false,
      powerPreference: 'high-performance',
      forceWebGL,
    });
    renderer.setSize(width, height);
    renderer.setClearColor(0x0b0e12, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.shadowMap.enabled = !this.isSoftwareGl && this.graphics.shadowQuality !== 'off';
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.setAttribute('data-testid', 'fps-canvas');

    await Promise.race([
      renderer.init(),
      new Promise<never>((_, reject) =>
        window.setTimeout(() => reject(new Error('Renderer initialization timed out')), 4500),
      ),
    ]);

    return renderer;
  }

  private async setupRenderer(pref: RendererBackendPref, width: number, height: number) {
    this.preferredBackend = pref;
    const wantWebGL = this.isSoftwareGl || pref === 'webgl2';

    let renderer: THREE.WebGPURenderer;
    let usedFallback = false;
    try {
      renderer = await this.createAndInitRenderer(wantWebGL, width, height);
    } catch (err) {
      if (!wantWebGL) {
        console.warn('WebGPU init failed, falling back to WebGL2:', err);
        usedFallback = true;
        renderer = await this.createAndInitRenderer(true, width, height);
      } else {
        throw err;
      }
    }

    if (this.disposed) {
      renderer.dispose();
      return;
    }

    if (this.renderPipeline) {
      this.renderPipeline.dispose();
      this.renderPipeline = null;
    }

    if (this.renderer) {
      const oldDom = this.renderer.domElement;
      oldDom.removeEventListener('mousedown', this.onMouseDown);
      oldDom.removeEventListener('wheel', this.onWheel);
      oldDom.removeEventListener('contextmenu', this.onContextMenu);
      if (oldDom.parentElement === this.container) {
        this.container.removeChild(oldDom);
      }
      this.renderer.dispose();
    }

    this.renderer = renderer;
    this.container.appendChild(this.renderer.domElement);
    this.applyResolutionScale(width, height);

    const backend = this.renderer.backend as {
      isWebGPUBackend?: boolean;
      device?: { addEventListener?: (ev: string, fn: (e: unknown) => void) => void };
    };
    if (backend?.isWebGPUBackend) {
      this.activeBackendLabel = 'WebGPU (Vulkan / Hardware)';
      this.renderer.onDeviceLost = (info) => {
        console.warn('WebGPU device lost, recovering via WebGL2:', info);
        void this.recoverToWebGL2();
      };
      this.renderer.onError = (errInfo) => {
        console.warn('WebGPU pipeline error, recovering via WebGL2:', errInfo);
        void this.recoverToWebGL2();
      };
      backend.device?.addEventListener?.('uncapturederror', (e) => {
        console.warn('WebGPU uncaptured error, recovering via WebGL2:', e);
        void this.recoverToWebGL2();
      });
    } else if (this.isSoftwareGl) {
      this.activeBackendLabel = 'WebGL2 (Software)';
    } else if (usedFallback) {
      this.activeBackendLabel = 'WebGL2 (Auto-Fallback)';
    } else {
      this.activeBackendLabel = 'WebGL2 (Hardware)';
    }

    if (this.mapData) {
      const L = this.mapData.lighting;
      this.refreshEnvironmentIBL(L.hemiSky, L.hemiGround, L.sunColor);
    }
    this.rebuildPostProcessing(true);

    if (this.rendererReady) {
      const dom = this.renderer.domElement;
      dom.addEventListener('mousedown', this.onMouseDown);
      dom.addEventListener('wheel', this.onWheel, { passive: true });
      dom.addEventListener('contextmenu', this.onContextMenu);
      this.renderFrameSafe();
    }
  }

  private async recoverToWebGL2() {
    if (this.disposed || this.fallbackInProgress || this.preferredBackend === 'webgl2') return;
    this.fallbackInProgress = true;
    try {
      this.pipelineDisabled = false;
      const width = Math.max(1, this.container.clientWidth || window.innerWidth);
      const height = Math.max(1, this.container.clientHeight || window.innerHeight);
      await this.setupRenderer('webgl2', width, height);
      this.emitHud();
    } catch (err) {
      console.error('WebGL2 recovery failed:', err);
    } finally {
      this.fallbackInProgress = false;
    }
  }

  private refreshEnvironmentIBL(skyHex: number, groundHex: number, sunHex: number) {
    if (!this.renderer) return;
    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const studioEnv = createStudioEnvironmentScene(skyHex, groundHex, sunHex);
      const envTex = pmrem.fromScene(studioEnv, 0.04).texture;
      if (this.scene.environment && typeof (this.scene.environment as THREE.Texture).dispose === 'function') {
        (this.scene.environment as THREE.Texture).dispose();
      }
      this.scene.environment = envTex;
      studioEnv.traverse((obj) => {
        const m = obj as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        for (const mat of mats) mat.dispose();
      });
      pmrem.dispose();
    } catch (err) {
      console.warn('IBL refresh failed:', err);
    }
  }

  private rebuildPostProcessing(force = false) {
    if (!this.renderer) return;
    const usePipeline =
      (!this.isSoftwareGl || this.forcePipeline) &&
      !this.pipelineDisabled &&
      (this.graphics.aoQuality !== 'off' || this.graphics.postFx !== 'off');

    const sig = usePipeline
      ? `${this.graphics.aoQuality}|${this.graphics.postFx}|${this.graphics.antiAliasing}`
      : 'direct';

    if (!force && sig === this.pipelineSignature && (usePipeline ? this.renderPipeline !== null : this.renderPipeline === null)) {
      return;
    }
    this.pipelineSignature = sig;

    if (this.renderPipeline) {
      this.renderPipeline.dispose();
      this.renderPipeline = null;
    }

    // Single-pass hardware MSAA fast path when AO & PostFX are disabled (massive FPS win)
    if (!usePipeline) {
      return;
    }

    try {
      const pipeline = new THREE.RenderPipeline(this.renderer);
      const scenePass = pass(this.scene, this.camera);
      const useBloom = this.graphics.postFx !== 'off';
      scenePass.setMRT(useBloom ? mrt({ output, emissive }) : mrt({ output }));

      if (this.graphics.aoQuality !== 'off') {
        const prePass = pass(this.scene, this.camera);
        prePass.setMRT(mrt({ output: normalView }));
        const prePassNormal = prePass.getTextureNode();
        const prePassDepth = prePass.getTextureNode('depth');

        const aoPass = ao(prePassDepth, prePassNormal, this.camera);
        aoPass.resolutionScale = this.graphics.aoQuality === 'high' ? 0.85 : 0.5;
        aoPass.samples.value = this.graphics.aoQuality === 'high' ? 12 : 6;
        aoPass.radius.value = 0.36;
        aoPass.thickness.value = 1.2;
        aoPass.scale.value = 1.1;
        scenePass.contextNode = builtinAOContext(aoPass.getTextureNode().sample(screenUV).r);
      }

      const sceneColor = scenePass.getTextureNode('output');
      const bloomed = useBloom
        ? sceneColor.add(
            bloom(
              scenePass.getTextureNode('emissive'),
              this.graphics.postFx === 'bloom_sharpen' ? 0.28 : 0.34,
              this.graphics.postFx === 'bloom_sharpen' ? 0.24 : 0.32,
              this.graphics.postFx === 'bloom_sharpen' ? 0.26 : 0.16,
            ),
          )
        : sceneColor;

      const sdrMapped = renderOutput(bloomed);
      const aaNode = this.graphics.antiAliasing === 'fxaa' ? fxaa(sdrMapped) : sdrMapped;

      pipeline.outputColorTransform = false;
      pipeline.outputNode = aaNode as unknown as typeof pipeline.outputNode;

      this.renderPipeline = pipeline;
    } catch (err) {
      console.warn('RenderPipeline setup failed, using direct renderer:', err);
      this.renderPipeline = null;
      this.pipelineSignature = 'direct';
    }
  }

  public async setRendererBackendPref(pref: RendererBackendPref) {
    if (this.preferredBackend === pref && this.rendererReady) return;
    this.preferredBackend = pref;
    this.pipelineDisabled = false;
    if (!this.rendererReady) return;
    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);
    await this.setupRenderer(pref, width, height);
    this.emitHud();
  }

  public loadMap(mapId: MapId) {
    if (!this.textures) {
      this.currentMapId = mapId;
      return;
    }
    this.clearEnemiesAndProjectiles();
    if (this.mapData) {
      this.mapData.dispose();
    }
    this.currentMapId = mapId;
    this.gameMode = mapId === 'range' ? 'training' : 'combat';
    this.mapQueue = buildMapQueue(mapId === 'range' ? 'ironclad' : mapId);
    this.mapData = buildTacticalMap(this.scene, this.textures, mapId);
    this.lastShadowCenterX = 9999;
    this.lastShadowCenterZ = 9999;

    const L = this.mapData.lighting;
    this.scene.fog = new THREE.FogExp2(L.fogColor, L.fogDensity);
    this.scene.environmentIntensity = L.envIntensity;
    if (this.renderer) {
      this.renderer.toneMappingExposure = L.exposure;
      this.refreshEnvironmentIBL(L.hemiSky, L.hemiGround, L.sunColor);
    }

    // Configure SkyMesh TSL atmospheric shader uniforms
    this.sky.turbidity.value = L.skyTurbidity;
    this.sky.rayleigh.value = L.skyRayleigh;
    this.sky.mieCoefficient.value = L.skyMie;
    this.sky.mieDirectionalG.value = L.skyMieG;
    this.sky.cloudCoverage.value = L.cloudCoverage;
    this.sky.cloudDensity.value = L.cloudDensity;

    const phi = THREE.MathUtils.degToRad(90 - L.sunElevationDeg);
    const theta = THREE.MathUtils.degToRad(L.sunAzimuthDeg);
    _sunDir.setFromSphericalCoords(1, phi, theta);
    this.sky.sunPosition.value.copy(_sunDir);

    const lightPhi = THREE.MathUtils.degToRad(90 - Math.max(20, L.sunElevationDeg));
    _sunDir.setFromSphericalCoords(1, lightPhi, theta);
    this.sunLight.color.setHex(L.sunColor);
    this.sunLight.intensity = L.sunIntensity;
    this.sunLight.position.copy(_sunDir).multiplyScalar(68);
    this.sunLight.target.position.set(0, 0, 0);

    this.hemiLight.color.setHex(L.hemiSky);
    this.hemiLight.groundColor.setHex(L.hemiGround);
    this.hemiLight.intensity = Math.max(0.52, L.hemiIntensity);

    this.rimLight.color.setHex(L.rimColor);
    this.rimLight.intensity = Math.max(0.55, L.rimIntensity * 1.45);
    this.rimLight.position.set(-_sunDir.x * 46, 26, Math.max(24, -_sunDir.z * 46));

    this.syncMusicState();
    this.emitHud();
  }

  public setAutoQueueMaps(enabled: boolean) {
    this.autoQueueMaps = enabled;
    this.emitHud();
  }

  private bindEvents() {
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onWindowBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);

    const dom = this.renderer.domElement;
    dom.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    dom.addEventListener('wheel', this.onWheel, { passive: true });
    dom.addEventListener('contextmenu', this.onContextMenu);
  }

  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  private applyResolutionScale(_width: number, _height: number) {
    if (!this.renderer) return;
    if (this.isSoftwareGl) {
      this.renderer.setPixelRatio(1);
      return;
    }
    const targetRatio = Math.max(0.65, Math.min(2.0, this.graphics.renderScale));
    this.renderer.setPixelRatio(targetRatio);
  }

  public getGraphicsSettings(): GraphicsSettings {
    return { ...this.graphics };
  }

  private applyGraphicsSettings(forcePipeline = false) {
    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.applyResolutionScale(width, height);
    if (this.renderer && (!this.isSoftwareGl || this.forcePipeline)) {
      const shadowsOn = this.graphics.shadowQuality !== 'off';
      this.renderer.shadowMap.enabled = !this.isSoftwareGl && shadowsOn;
      this.sunLight.castShadow = !this.isSoftwareGl && shadowsOn;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
      const shadowRes =
        this.graphics.shadowQuality === 'high'
          ? 2048
          : this.graphics.shadowQuality === 'medium'
            ? 1024
            : 512;
      if (this.sunLight.shadow.mapSize.width !== shadowRes) {
        this.sunLight.shadow.mapSize.set(shadowRes, shadowRes);
        this.sunLight.shadow.map?.dispose();
        this.sunLight.shadow.map = null;
      }
      this.rebuildPostProcessing(forcePipeline);
    }
    if (this.rendererReady) {
      this.renderFrameSafe();
    }
  }

  public setGraphicsSettings(patch: Partial<Omit<GraphicsSettings, 'preset'>>) {
    this.graphics = applyGraphicsPatch(this.graphics, patch);
    this.qualityMode = this.graphics.preset;
    saveGraphicsSettings(this.graphics);
    this.applyGraphicsSettings(false);
    this.emitHud();
  }

  public setQualityMode(mode: QualityMode) {
    if (mode !== 'custom') {
      const preset = getGraphicsPreset(mode);
      this.graphics = { ...preset, showFps: mode === 'performance' ? true : this.graphics.showFps };
      this.qualityMode = mode;
      saveGraphicsSettings(this.graphics);
    }
    this.applyGraphicsSettings(false);
    this.emitHud();
  }

  private onResize = () => {
    if (this.disposed || !this.renderer) return;
    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.applyResolutionScale(width, height);
    if (this.rendererReady) {
      this.renderFrameSafe();
    }
  };

  private onWindowBlur = () => {
    this.keysHeld.clear();
    this.fireHeld = false;
    this.adsHeld = false;
    this.isDraggingLook = false;
  };

  private onVisibilityChange = () => {
    if (document.hidden) {
      this.onWindowBlur();
    }
  };

  private onPointerLockChange = () => {
    this.emitHud();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.phase === 'title') {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        this.startNewRun(this.difficulty, undefined, this.currentMapId);
      }
      return;
    }

    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (this.phase === 'playing') {
        e.preventDefault();
        this.pauseGame();
        return;
      } else if (this.phase === 'paused' && e.code === 'KeyP') {
        e.preventDefault();
        this.resumeGame();
        return;
      }
    }

    if (e.code === 'KeyM') {
      this.toggleMute();
      return;
    }

    if (e.code === 'KeyN') {
      this.toggleMusic();
      return;
    }

    if (this.phase !== 'playing') return;

    this.keysHeld.add(e.code);

    if (e.code === 'Digit1') this.switchWeapon('rifle');
    if (e.code === 'Digit2') this.switchWeapon('shotgun');
    if (e.code === 'Digit3') this.switchWeapon('sniper');
    if (e.code === 'Digit4') this.switchWeapon('knife');
    if (this.gameMode === 'training') {
      if (e.code === 'Digit5') this.setAimDrill('static');
      if (e.code === 'Digit6') this.setAimDrill('tracking');
      if (e.code === 'Digit7') this.setAimDrill('peek');
      if (e.code === 'Digit8') this.setAimDrill('speed30');
      if (e.code === 'KeyH') this.toggleAimHeadshotOnly();
      if (e.code === 'KeyB') this.toggleAimStrafe();
    }
    if (e.code === 'KeyC') this.triggerQuickKnife();
    if (e.code === 'KeyR') {
      if (this.activeWeapon === 'knife') {
        this.knifeInspectTimer = 0.55;
      } else {
        this.startReload();
      }
    }
    if (e.code === 'KeyG') this.throwGrenade();
    if (e.code === 'KeyV') {
      if (this.activeWeapon === 'knife') {
        this.heavyMeleeJustPressed = true;
      } else {
        this.adsToggle = !this.adsToggle;
      }
    }
    if (e.code === 'KeyF') {
      if (!this.fireHeld) this.fireJustPressed = true;
      this.fireHeld = true;
    }
    if (e.code === 'Space' && this.playerGrounded) {
      this.playerVy = 6.6;
      this.playerGrounded = false;
      tacticalAudio.playFootstep();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keysHeld.delete(e.code);
    if (e.code === 'KeyF') {
      this.fireHeld = false;
    }
  };

  private onMouseDown = (e: MouseEvent) => {
    if (this.phase !== 'playing') return;
    tacticalAudio.unlock();
    tacticalMusic.unlockAndStart();

    if (document.pointerLockElement !== this.renderer.domElement && !this.isSoftwareGl) {
      try {
        void this.renderer.domElement.requestPointerLock();
      } catch {
        // Fallback drag look remains active
      }
    }

    if (e.button === 0) {
      this.fireHeld = true;
      this.fireJustPressed = true;
      this.isDraggingLook = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    } else if (e.button === 2) {
      if (this.activeWeapon === 'knife') {
        this.heavyMeleeJustPressed = true;
      } else {
        this.adsHeld = true;
      }
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) {
      this.fireHeld = false;
      this.isDraggingLook = false;
    } else if (e.button === 2) {
      this.adsHeld = false;
    }
  };

  private onMouseMove = (e: MouseEvent) => {
    if (this.phase !== 'playing') return;
    const locked = document.pointerLockElement === this.renderer.domElement;
    if (!locked && !this.isDraggingLook) return;

    const dx = locked ? e.movementX : e.clientX - this.lastMouseX;
    const dy = locked ? e.movementY : e.clientY - this.lastMouseY;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;

    const adsMult = this.isAdsActive() ? 0.55 : 1.0;
    const sens = 0.0022 * this.sensitivity * adsMult;
    this.playerYaw -= dx * sens;
    this.playerPitch = Math.max(-1.42, Math.min(1.42, this.playerPitch - dy * sens));
  };

  private onWheel = (e: WheelEvent) => {
    if (this.phase !== 'playing') return;
    const idx = WEAPON_ORDER.indexOf(this.activeWeapon);
    const nextIdx = (idx + (e.deltaY > 0 ? 1 : -1) + WEAPON_ORDER.length) % WEAPON_ORDER.length;
    this.switchWeapon(WEAPON_ORDER[nextIdx]);
  };

  public setSensitivity(val: number) {
    this.sensitivity = Math.max(0.3, Math.min(2.5, val));
  }

  public toggleMute(): boolean {
    const next = !tacticalAudio.isMuted();
    tacticalAudio.setMuted(next);
    tacticalMusic.syncMasterMute(next);
    this.emitHud();
    return next;
  }

  public toggleMusic(): boolean {
    tacticalMusic.unlockAndStart();
    const next = tacticalMusic.toggleMuted();
    this.emitHud();
    return next;
  }

  public setMusicVolume(val: number) {
    tacticalMusic.setVolume(val);
    this.emitHud();
  }

  private countAliveEnemies(): number {
    let alive = 0;
    for (let i = 0; i < this.enemies.length; i++) {
      if (this.enemies[i].state === 'alive') alive += 1;
    }
    return alive;
  }

  private syncMusicState() {
    const remaining = this.countAliveEnemies() + this.enemiesToSpawn;
    const intensity = resolveMusicIntensity(
      this.phase,
      this.wave,
      this.hp,
      remaining,
      this.waveBreakTimer > 0,
    );
    tacticalMusic.setState(intensity, this.currentMapId);
  }

  public startNewRun(difficulty: DifficultyMode = this.difficulty, initialWeapon?: WeaponId, mapId?: MapId) {
    if (!this.rendererReady) {
      this.pendingStartConfig = { difficulty, weapon: initialWeapon, mapId };
      return;
    }

    const targetMap = mapId || this.currentMapId;
    if (!this.mapData || this.mapData.mapId !== targetMap) {
      this.loadMap(targetMap);
    }

    this.difficulty = difficulty;
    tacticalAudio.unlock();
    tacticalMusic.unlockAndStart();
    this.clearEnemiesAndProjectiles();

    this.phase = 'playing';
    this.outcome = 'none';
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    this.playerX = this.mapData.playerSpawn.x;
    this.playerY = 0;
    this.playerVy = 0;
    this.playerZ = this.mapData.playerSpawn.z;
    this.playerGrounded = true;
    this.playerYaw = this.mapData.playerSpawn.yaw;
    this.playerPitch = 0;
    this.lungeVx = 0;
    this.lungeVz = 0;
    this.hp = 100;
    this.armor = 50;
    this.stamina = 100;
    this.grenades = 3;

    this.weapons = createInitialWeaponsState();
    this.activeWeapon = initialWeapon || 'rifle';
    this.quickKnifeReturnWeapon = null;
    this.quickKnifeTimer = 0;
    this.syncWeaponVisibility();
    this.isReloading = false;
    this.reloadTimer = 0;
    this.fireTimer = 0;
    this.knifeSlashTimer = 0;
    this.knifeInspectTimer = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.recoilAccum = 0;
    this.adsHeld = false;
    this.adsToggle = false;
    this.fireHeld = false;
    this.heavyMeleeJustPressed = false;
    this.keysHeld.clear();

    this.score = 0;
    this.kills = 0;
    this.headshots = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.elapsedSeconds = 0;
    this.killFeed = [];
    this.hitmarkerTimer = 0;
    this.hitmarkerKind = 'none';
    this.damageFlash = 0;
    this.damageAngle = null;

    for (const b of this.mapData.barrels) {
      b.exploded = false;
      b.hp = 45;
      b.mesh.visible = true;
    }
    this.barrelRespawnTimers.clear();

    this.viewmodelGroup.visible = true;
    if (this.gameMode === 'training') {
      this.resetAimTrainingMetrics();
      this.setupAimTrainingArena();
    } else {
      this.beginWave(1);
    }
    this.syncMusicState();

    document.body.dataset.state = 'playing';
    this.callbacks.onPhaseChange('playing', 'none');
    this.emitHud();
  }

  private resetAimTrainingMetrics() {
    this.aimTimeRemaining = 30;
    this.aimChallengeActive = this.aimDrill === 'speed30';
    this.aimChallengeComplete = false;
    this.aimKills = 0;
    this.aimHeadshots = 0;
    this.aimShotsFired = 0;
    this.aimShotsHit = 0;
    this.aimStreak = 0;
    this.aimBestStreak = 0;
    this.aimTotalTtkSec = 0;
    this.aimDrillElapsed = 0;
    this.aimSplitStartTime = 0;
    this.aimFirstShotStarted = false;
  }

  private getRangeSlotPool(): Array<{ x: number; y: number; z: number; peekCover?: boolean; preferSniper?: boolean }> {
    if (this.aimDrill === 'peek') {
      return [
        { x: -11.5, y: 0, z: 0.1, peekCover: true },
        { x: 11.5, y: 0, z: 0.1, peekCover: true },
        { x: -7.2, y: 0, z: -7.1, peekCover: true },
        { x: 7.2, y: 0, z: -7.1, peekCover: true },
        { x: -16.5, y: 0, z: -15.3, peekCover: true },
        { x: 16.5, y: 0, z: -15.3, peekCover: true },
        { x: 0, y: 0, z: -20.1, peekCover: true },
      ];
    }
    return this.mapData.enemySpawnPoints;
  }

  private spawnRangeBotInSlot(slotIndex: number) {
    const slots = this.getRangeSlotPool();
    const slot = slots[slotIndex % slots.length];
    const arch: EnemyArchetype =
      slot.preferSniper ? 'sniper' : slotIndex % 3 === 1 ? 'rusher' : slotIndex % 3 === 2 ? 'sniper' : 'rifleman';
    const id = this.nextEnemyId++;
    const rig = buildEnemySoldier(id, arch, this.textures);
    const initialYaw = Math.atan2(this.playerX - slot.x, this.playerZ - slot.z);
    rig.root.position.set(slot.x, slot.y, slot.z);
    rig.root.rotation.y = initialYaw;
    this.scene.add(rig.root);

    this.enemies.push({
      id,
      archetype: arch,
      rig,
      x: slot.x,
      y: slot.y,
      z: slot.z,
      vx: 0,
      vz: 0,
      yaw: initialYaw,
      hp: 90,
      maxHp: 90,
      speed: arch === 'rusher' ? 4.4 : 3.4,
      state: 'alive',
      koTimer: 0,
      koRollDir: Math.random() > 0.5 ? 1 : -1,
      hitFlashTimer: 0,
      fireCooldown: 99,
      telegraphTimer: 0,
      telegraphDuration: 0.4,
      strafeDir: slotIndex % 2 === 0 ? 1 : -1,
      strafeTimer: 1.4 + Math.random() * 1.2,
      walkPhase: Math.random() * Math.PI * 2,
      fireFlashTimer: 0,
      recoilKick: 0,
      flinchKick: 0,
      laserLine: null,
      rangeSlotIndex: slotIndex,
      rangeHomeX: slot.x,
      rangeHomeZ: slot.z,
      rangePeekPhase: slotIndex * 1.15,
    });
  }

  private setupAimTrainingArena() {
    this.clearEnemiesAndProjectiles();
    this.enemiesToSpawn = 0;
    this.wave = 1;
    this.waveBreakTimer = 0;
    this.waveBanner = `AIM TRAINING · ${AIM_DRILLS[this.aimDrill].name.toUpperCase()}`;
    this.waveBannerTimer = 2.0;

    const slots = this.getRangeSlotPool();
    const targetCount = Math.min(6, slots.length);
    const step = Math.max(1, Math.floor(slots.length / targetCount));
    for (let i = 0; i < targetCount; i++) {
      const slotIdx = (i * step) % slots.length;
      this.spawnRangeBotInSlot(slotIdx);
    }
  }

  public setAimDrill(drill: AimDrillId) {
    this.aimDrill = drill;
    if (drill === 'tracking') {
      this.aimStrafeEnabled = true;
    } else if (drill === 'static') {
      this.aimStrafeEnabled = false;
    }
    this.resetAimTrainingMetrics();
    if (this.gameMode === 'training' && this.phase === 'playing') {
      this.setupAimTrainingArena();
      tacticalAudio.playWaveCue(false);
    }
    this.emitHud();
  }

  public toggleAimHeadshotOnly() {
    this.aimHeadshotOnly = !this.aimHeadshotOnly;
    this.emitHud();
  }

  public toggleAimStrafe() {
    this.aimStrafeEnabled = !this.aimStrafeEnabled;
    this.emitHud();
  }

  public restartAimDrill() {
    if (this.gameMode !== 'training') return;
    this.resetAimTrainingMetrics();
    this.setupAimTrainingArena();
    tacticalAudio.playWaveCue(false);
    this.emitHud();
  }

  public deployNextMap() {
    const next = getNextMapId(this.currentMapId, this.mapQueue);
    this.startNewRun(this.difficulty, this.activeWeapon === 'knife' ? 'rifle' : this.activeWeapon, next);
  }

  public pauseGame() {
    if (this.phase !== 'playing') return;
    this.phase = 'paused';
    this.keysHeld.clear();
    this.fireHeld = false;
    this.adsHeld = false;
    document.exitPointerLock?.();
    document.body.dataset.state = 'paused';
    this.syncMusicState();
    this.callbacks.onPhaseChange('paused', 'none');
    this.emitHud();
  }

  public resumeGame() {
    if (this.phase !== 'paused') return;
    this.phase = 'playing';
    this.lastTimestamp = performance.now();
    document.body.dataset.state = 'playing';
    this.syncMusicState();
    this.callbacks.onPhaseChange('playing', 'none');
    this.emitHud();
  }

  public returnToTitle() {
    this.clearEnemiesAndProjectiles();
    this.phase = 'title';
    this.outcome = 'none';
    this.viewmodelGroup.visible = false;
    document.exitPointerLock?.();
    document.body.dataset.state = 'title';
    this.syncMusicState();
    this.callbacks.onPhaseChange('title', 'none');
    this.emitHud();
  }

  public switchWeapon(id: WeaponId) {
    if (this.activeWeapon === id) return;
    this.activeWeapon = id;
    this.quickKnifeReturnWeapon = null;
    this.quickKnifeTimer = 0;
    this.isReloading = false;
    this.reloadTimer = 0;
    this.adsToggle = false;
    this.adsHeld = false;
    this.swapDip = 0.22;
    this.syncWeaponVisibility();
    this.emitHud();
  }

  private triggerQuickKnife() {
    if (this.quickKnifeTimer > 0) return;
    if (this.activeWeapon !== 'knife') {
      this.quickKnifeReturnWeapon = this.activeWeapon;
      this.activeWeapon = 'knife';
      this.isReloading = false;
      this.reloadTimer = 0;
      this.adsToggle = false;
      this.syncWeaponVisibility();
    }
    this.quickKnifeTimer = 0.36;
    this.performKnifeAttack(false);
  }

  private syncWeaponVisibility() {
    if (!this.weaponRigs) return;
    for (const wid of WEAPON_ORDER) {
      this.weaponRigs[wid].root.visible = wid === this.activeWeapon;
    }
  }

  private isAdsActive(): boolean {
    return (this.adsHeld || this.adsToggle) && !this.isReloading && this.activeWeapon !== 'knife';
  }

  private startReload() {
    const spec = WEAPON_SPECS[this.activeWeapon];
    const ammo = this.weapons[this.activeWeapon];
    if (!canReloadWeapon(ammo, spec.magSize, this.isReloading, this.activeWeapon)) return;
    this.isReloading = true;
    this.reloadTimer = spec.reloadDuration;
    this.adsToggle = false;
    tacticalAudio.playReload('start');
    this.emitHud();
  }

  private beginWave(waveNum: number) {
    this.wave = waveNum;
    const cfg = getWaveConfig(waveNum, this.difficulty);
    this.enemiesToSpawn = cfg.totalEnemies;
    this.spawnCooldown = 0.25;
    this.waveBanner = `${MAP_CATALOG[this.currentMapId].name.toUpperCase()} · WAVE ${waveNum} — ${cfg.title.toUpperCase()}`;
    this.waveBannerTimer = 2.8;
    tacticalAudio.playWaveCue(false);

    if (waveNum > 1) {
      this.armor = Math.min(this.maxArmor, this.armor + 25);
      this.hp = Math.min(this.maxHp, this.hp + 20);
      this.grenades = Math.min(3, this.grenades + 1);
      for (const wid of WEAPON_ORDER) {
        if (wid === 'knife') continue;
        this.weapons[wid].reserve = Math.min(
          WEAPON_SPECS[wid].startReserve,
          this.weapons[wid].reserve + Math.ceil(WEAPON_SPECS[wid].magSize * 1.5),
        );
      }
    }

    if (this.enemiesToSpawn >= 2 && this.mapData.vanguardSpawns.length >= 2) {
      for (let i = 0; i < 2; i++) {
        const vs = this.mapData.vanguardSpawns[i];
        const arch = waveNum >= 3 && i === 1 ? 'rusher' : vs.archetype;
        this.spawnOneEnemyAt(vs.x, vs.y, vs.z, arch);
      }
      this.enemiesToSpawn -= 2;
    }
    this.syncMusicState();
  }

  private spawnOneEnemyAt(sx: number, sy: number, sz: number, arch: EnemyArchetype) {
    const cfg = getWaveConfig(this.wave, this.difficulty);
    const id = this.nextEnemyId++;
    const rig = buildEnemySoldier(id, arch, this.textures);
    const initialYaw = Math.atan2(this.playerX - sx, this.playerZ - sz);
    rig.root.position.set(sx, sy, sz);
    rig.root.rotation.y = initialYaw;
    this.scene.add(rig.root);

    const baseHp = arch === 'rusher' ? 110 : arch === 'sniper' ? 75 : arch === 'heavy_drone' ? 135 : 90;
    const baseSpeed = (arch === 'rusher' ? 6.8 : arch === 'sniper' ? 2.6 : arch === 'heavy_drone' ? 4.8 : 3.9) * cfg.speedScale;
    const baseTelegraph = arch === 'sniper' ? 0.85 : 0.38;

    let laserLine: THREE.Line | null = null;
    if (arch === 'sniper') {
      const lGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -1),
      ]);
      const lMat = new THREE.LineBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0 });
      laserLine = new THREE.Line(lGeo, lMat);
      laserLine.visible = false;
      this.scene.add(laserLine);
    }

    this.enemies.push({
      id,
      archetype: arch,
      rig,
      x: sx,
      y: sy,
      z: sz,
      vx: 0,
      vz: 0,
      yaw: initialYaw,
      hp: Math.round(baseHp * cfg.hpScale),
      maxHp: Math.round(baseHp * cfg.hpScale),
      speed: baseSpeed,
      state: 'alive',
      koTimer: 0,
      koRollDir: Math.random() > 0.5 ? 1 : -1,
      hitFlashTimer: 0,
      fireCooldown: (1.15 + Math.random() * 1.45) * cfg.cooldownScale,
      telegraphTimer: 0,
      telegraphDuration: baseTelegraph * cfg.telegraphScale,
      strafeDir: Math.random() > 0.5 ? 1 : -1,
      strafeTimer: 1.5 + Math.random() * 2,
      walkPhase: Math.random() * Math.PI * 2,
      fireFlashTimer: 0,
      recoilKick: 0,
      flinchKick: 0,
      laserLine,
    });
  }

  private spawnOneEnemy() {
    const cfg = getWaveConfig(this.wave, this.difficulty);
    const arch = cfg.archetypes[Math.floor(Math.random() * cfg.archetypes.length)];

    const candidates = this.mapData.enemySpawnPoints.filter((sp) => {
      if (arch === 'sniper' && sp.preferSniper) return true;
      if (arch !== 'sniper' && !sp.preferSniper) return true;
      return false;
    });
    const pool = candidates.length > 0 ? candidates : this.mapData.enemySpawnPoints;
    let best = pool[Math.floor(Math.random() * pool.length)];
    let bestDist = -1;
    for (let i = 0; i < 3; i++) {
      const c = pool[Math.floor(Math.random() * pool.length)];
      const d = Math.hypot(c.x - this.playerX, c.z - this.playerZ);
      if (d > bestDist) {
        bestDist = d;
        best = c;
      }
    }

    const sx = best.x + (Math.random() - 0.5) * 2.2;
    const sz = best.z + (Math.random() - 0.5) * 2.2;
    this.spawnOneEnemyAt(sx, best.y, sz, arch);
  }

  private clearEnemiesAndProjectiles() {
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      this.scene.remove(e.rig.root);
      disposeEnemyRig(e.rig);
      if (e.laserLine) {
        this.scene.remove(e.laserLine);
        e.laserLine.geometry.dispose();
        (e.laserLine.material as THREE.Material).dispose();
      }
    }
    this.enemies = [];
    for (let i = 0; i < this.activeGrenades.length; i++) {
      this.scene.remove(this.activeGrenades[i].mesh);
    }
    this.activeGrenades = [];
  }

  private renderFrameSafe() {
    if (this.disposed || !this.renderer) return;
    try {
      if (this.renderPipeline) {
        this.renderPipeline.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }
    } catch (err) {
      if (this.renderPipeline) {
        console.warn('RenderPipeline render error, falling back to direct render:', err);
        this.renderPipeline.dispose();
        this.renderPipeline = null;
        this.pipelineSignature = 'direct';
        this.pipelineDisabled = true;
        try {
          this.renderer.render(this.scene, this.camera);
          return;
        } catch (innerErr) {
          console.error('Direct render failed after pipeline fallback:', innerErr);
        }
      } else {
        console.error('Renderer draw error:', err);
      }
      const backend = this.renderer.backend as { isWebGPUBackend?: boolean };
      if (backend?.isWebGPUBackend) {
        void this.recoverToWebGL2();
      }
    }
  }

  private loop = (now: number) => {
    if (this.disposed || !this.rendererReady) return;

    const rawDt = Math.max(0.001, (now - this.lastTimestamp) / 1000);
    this.lastTimestamp = now;
    const dt = Math.min(rawDt, 0.05);

    this.fpsSamplesAccum += rawDt;
    this.fpsFrames += 1;
    if (this.fpsSamplesAccum >= 0.45) {
      this.currentFps = Math.round(this.fpsFrames / this.fpsSamplesAccum);
      this.fpsSamplesAccum = 0;
      this.fpsFrames = 0;
    }

    if (this.mapData) {
      for (const prop of this.mapData.rotatingProps) {
        prop.rotation.y += dt * 0.65;
      }
    }

    if (this.phase === 'title') {
      this.updateTitleCamera(dt);
    } else if (this.phase === 'playing') {
      this.updatePlaying(dt);
    }

    this.renderFrameSafe();

    if (this.isSoftwareGl) {
      this.afterDraw(() => this.loop(performance.now()));
    } else {
      this.frameId = requestAnimationFrame(this.loop);
    }
  };

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext | null;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private updateTitleCamera(dt: number) {
    this.titleOrbitAngle += dt * 0.14;
    const radius = 29;
    const cx = Math.sin(this.titleOrbitAngle) * radius;
    const cz = Math.cos(this.titleOrbitAngle) * radius - 4;
    this.camera.position.set(cx, 11.5 + Math.sin(this.titleOrbitAngle * 1.5) * 1.8, cz);
    this.camera.lookAt(0, 2.2, -5);
  }

  private updatePlaying(dt: number) {
    this.hitmarkerTimer = Math.max(0, this.hitmarkerTimer - dt);
    if (this.hitmarkerTimer <= 0) this.hitmarkerKind = 'none';
    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.2);
    this.cameraTrauma = Math.max(0, this.cameraTrauma - dt * 2.4);
    this.muzzleFlashTimer = Math.max(0, this.muzzleFlashTimer - dt);
    this.muzzleLight.intensity = this.muzzleFlashTimer > 0 ? (this.muzzleFlashTimer / 0.045) * 10.0 : 0;
    this.explosionLightTimer = Math.max(0, this.explosionLightTimer - dt);
    this.explosionLight.intensity = this.explosionLightTimer > 0 ? (this.explosionLightTimer / 0.42) * 32.0 : 0;
    this.knifeSlashTimer = Math.max(0, this.knifeSlashTimer - dt);
    this.knifeInspectTimer = Math.max(0, this.knifeInspectTimer - dt);

    if (this.quickKnifeTimer > 0) {
      this.quickKnifeTimer -= dt;
      if (this.quickKnifeTimer <= 0 && this.quickKnifeReturnWeapon) {
        this.activeWeapon = this.quickKnifeReturnWeapon;
        this.quickKnifeReturnWeapon = null;
        this.swapDip = 0.14;
        this.syncWeaponVisibility();
        this.emitHud();
      }
    }

    if (this.waveBannerTimer > 0) {
      this.waveBannerTimer -= dt;
      if (this.waveBannerTimer <= 0) this.waveBanner = null;
    }

    this.updateParticles(dt);
    this.updateTracers(dt);
    this.updateShells(dt);

    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      this.applyCameraAndViewmodel(dt, 0);
      return;
    }

    this.elapsedSeconds += dt;

    // 1. Keyboard fallback look
    const turnSpeed = 2.0;
    if (this.keysHeld.has('ArrowLeft') || this.keysHeld.has('KeyQ')) this.playerYaw += turnSpeed * dt;
    if (this.keysHeld.has('ArrowRight') || this.keysHeld.has('KeyE')) this.playerYaw -= turnSpeed * dt;

    // 2. Player Movement + Sprint + Lunge Impulse + Jump
    let moveForward = 0;
    let moveRight = 0;
    if (this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp')) moveForward += 1;
    if (this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown')) moveForward -= 1;
    if (this.keysHeld.has('KeyD')) moveRight += 1;
    if (this.keysHeld.has('KeyA')) moveRight -= 1;

    const wantsSprint =
      (this.keysHeld.has('ShiftLeft') || this.keysHeld.has('ShiftRight')) &&
      moveForward > 0 &&
      !this.isAdsActive() &&
      this.stamina > 8;

    if (wantsSprint) {
      this.stamina = Math.max(0, this.stamina - dt * 26);
    } else {
      this.stamina = Math.min(100, this.stamina + dt * 20);
    }

    const activeSpec = WEAPON_SPECS[this.activeWeapon];
    const weaponMoveMult = activeSpec.moveSpeedMultiplier ?? 1.0;
    const baseSpeed = (this.isAdsActive() ? 4.2 : wantsSprint ? 9.6 : 6.6) * weaponMoveMult;
    const len = Math.hypot(moveForward, moveRight);
    let horizSpeed = 0;

    let stepDx = this.lungeVx * dt;
    let stepDz = this.lungeVz * dt;
    this.lungeVx = THREE.MathUtils.damp(this.lungeVx, 0, 11, dt);
    this.lungeVz = THREE.MathUtils.damp(this.lungeVz, 0, 11, dt);

    if (len > 0) {
      const nf = moveForward / len;
      const nr = moveRight / len;
      const sinY = Math.sin(this.playerYaw);
      const cosY = Math.cos(this.playerYaw);
      stepDx += (-sinY * nf + cosY * nr) * baseSpeed * dt;
      stepDz += (-cosY * nf - sinY * nr) * baseSpeed * dt;
    }

    if (Math.abs(stepDx) > 1e-5 || Math.abs(stepDz) > 1e-5) {
      const resolved = resolveCircleObstacles(
        this.playerX + stepDx,
        this.playerZ + stepDz,
        0.6,
        this.mapData.obstacles,
        this.mapData.arenaHalfExtent,
      );
      horizSpeed = Math.hypot(resolved.x - this.playerX, resolved.z - this.playerZ) / dt;
      this.playerX = resolved.x;
      this.playerZ = resolved.z;
      this.walkDistance += horizSpeed * dt;
      this.stepDistAccum += horizSpeed * dt;
      if (this.playerGrounded && this.stepDistAccum > (wantsSprint ? 2.4 : 2.1)) {
        this.stepDistAccum = 0;
        tacticalAudio.playFootstep();
      }
    }

    if (!this.playerGrounded || this.playerY > 0) {
      this.playerVy -= 19.5 * dt;
      this.playerY += this.playerVy * dt;
      if (this.playerY <= 0) {
        this.playerY = 0;
        this.playerVy = 0;
        this.playerGrounded = true;
      }
    }

    // 3. Reload & Firing / Melee Slash
    if (this.isReloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.isReloading = false;
        const spec = WEAPON_SPECS[this.activeWeapon];
        this.weapons[this.activeWeapon] = applyReload(this.weapons[this.activeWeapon], spec.magSize);
        if (this.gameMode === 'training') {
          this.weapons[this.activeWeapon].reserve = spec.startReserve;
        }
        tacticalAudio.playReload('complete');
        this.emitHud();
      }
    }

    this.fireTimer = Math.max(0, this.fireTimer - dt);
    const wantsHeavyMelee = this.activeWeapon === 'knife' && this.heavyMeleeJustPressed;
    this.heavyMeleeJustPressed = false;
    const wantsFire = activeSpec.automatic ? this.fireHeld : this.fireJustPressed;
    this.fireJustPressed = false;

    if ((wantsFire || wantsHeavyMelee) && this.fireTimer <= 0) {
      if (this.activeWeapon === 'knife') {
        this.performKnifeAttack(wantsHeavyMelee);
      } else {
        const ammo = this.weapons[this.activeWeapon];
        if (canFireWeapon(ammo, this.isReloading, this.activeWeapon)) {
          this.fireActiveWeapon(horizSpeed / 9.6);
        } else if (!this.isReloading && ammo.mag === 0) {
          tacticalAudio.playDryFire();
          this.fireTimer = 0.25;
          if (ammo.reserve > 0) this.startReload();
        }
      }
    }

    // Recoil spring decay
    this.recoilPitch = THREE.MathUtils.damp(this.recoilPitch, 0, 14, dt);
    this.recoilYaw = THREE.MathUtils.damp(this.recoilYaw, 0, 14, dt);
    this.recoilAccum = THREE.MathUtils.damp(this.recoilAccum, 0, 9, dt);
    this.weaponKickZ = THREE.MathUtils.damp(this.weaponKickZ, 0, 18, dt);
    this.swapDip = THREE.MathUtils.damp(this.swapDip, 0, 14, dt);

    this.applyCameraAndViewmodel(dt, horizSpeed);

    // Throttled directional shadow frustum snap (avoids per-frame shadow camera matrix churn)
    if (!this.isSoftwareGl && this.sunLight.castShadow) {
      const tx = Math.round(this.playerX * 0.5) * 2;
      const tz = Math.round(this.playerZ * 0.5) * 2;
      if (Math.abs(tx - this.lastShadowCenterX) > 1.5 || Math.abs(tz - this.lastShadowCenterZ) > 1.5) {
        this.lastShadowCenterX = tx;
        this.lastShadowCenterZ = tz;
        this.sunLight.target.position.set(tx, 0, tz);
        this.sunLight.position.set(
          tx + _sunDir.x * 68,
          _sunDir.y * 68,
          tz + _sunDir.z * 68,
        );
      }
    }

    // 4. Grenades, Enemies & Wave/Training Spawner
    this.updateGrenades(dt);
    if (this.gameMode === 'training') {
      this.updateAimTraining(dt);
    } else {
      this.updateEnemies(dt);
      this.updateWaveSpawner(dt);
    }

    // 5. Throttled HUD sync
    this.hudSyncTimer += dt;
    if (this.hudSyncTimer >= 0.1) {
      this.hudSyncTimer = 0;
      this.emitHud();
    }
  }

  private performKnifeAttack(isHeavy: boolean) {
    const spec = WEAPON_SPECS.knife;
    this.fireTimer = isHeavy ? 0.58 : spec.fireInterval;
    this.knifeSlashDuration = isHeavy ? 0.36 : 0.26;
    this.knifeSlashTimer = this.knifeSlashDuration;
    this.knifeSlashHeavy = isHeavy;
    this.knifeInspectTimer = 0;
    this.shotsFired += 1;

    tacticalAudio.playKnifeSlash(isHeavy);

    if (isHeavy) {
      const fwdX = -Math.sin(this.playerYaw);
      const fwdZ = -Math.cos(this.playerYaw);
      this.lungeVx = fwdX * 11.5;
      this.lungeVz = fwdZ * 11.5;
    }

    this._meleeCandidatesPool.length = 0;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.state === 'alive') {
        this._meleeCandidatesPool.push({ id: e.id, x: e.x, y: e.y, z: e.z, facingYaw: e.yaw });
      }
    }

    const hit = evaluateMeleeStrike(
      this.playerX,
      this.playerY,
      this.playerZ,
      this.playerYaw,
      this._meleeCandidatesPool,
      isHeavy,
    );

    if (hit) {
      const enemy = this.enemies.find((e) => e.id === hit.targetId && e.state === 'alive');
      if (enemy) {
        this.shotsHit += 1;
        const killed = this.damageEnemy(
          enemy,
          hit.damage,
          hit.isBackstab || isHeavy,
          hit.isBackstab ? 'Karambit Backstab' : spec.name,
        );
        this.hitmarkerKind = killed ? 'kill' : hit.isBackstab ? 'headshot' : 'hit';
        this.hitmarkerTimer = killed ? 0.24 : 0.16;
        this.cameraTrauma = Math.min(1, this.cameraTrauma + (isHeavy ? 0.28 : 0.16));
        this.spawnBurst(enemy.x, enemy.y + 1.25, enemy.z, killed ? 0xfef08a : 0xef4444, 9, 4.8);
        tacticalAudio.playKnifeHit(killed);
      }
    } else {
      // Check if blade struck a nearby explosive fuel barrel
      const fwdX = -Math.sin(this.playerYaw);
      const fwdZ = -Math.cos(this.playerYaw);
      for (const barrel of this.mapData.barrels) {
        if (barrel.exploded) continue;
        const dx = barrel.x - this.playerX;
        const dz = barrel.z - this.playerZ;
        const d = Math.hypot(dx, dz);
        if (d <= 3.1 && (d < 0.2 || (dx / d) * fwdX + (dz / d) * fwdZ > 0.5)) {
          barrel.hp -= isHeavy ? 60 : 35;
          this.spawnBurst(barrel.x, barrel.y + 0.6, barrel.z, 0xf59e0b, 6, 4);
          tacticalAudio.playKnifeHit(false);
          if (barrel.hp <= 0) {
            this.detonateExplosion(barrel.x, barrel.y, barrel.z, 7.2, 135, 'Fuel Barrel');
            barrel.exploded = true;
            barrel.mesh.visible = false;
          }
          break;
        }
      }
    }

    this.emitHud();
  }

  private applyCameraAndViewmodel(dt: number, horizSpeed: number) {
    const shake = this.cameraTrauma * this.cameraTrauma * 0.045;
    const shakeX = (Math.random() - 0.5) * shake;
    const shakeY = (Math.random() - 0.5) * shake;

    const bobY = this.playerGrounded ? Math.sin(this.walkDistance * 2.2) * 0.032 * Math.min(1, horizSpeed / 6) : 0;
    this.camera.position.set(this.playerX, 1.7 + this.playerY + bobY, this.playerZ);

    _euler.set(
      this.playerPitch + this.recoilPitch + shakeX,
      this.playerYaw + this.recoilYaw + shakeY,
      0,
      'YXZ',
    );
    this.camera.quaternion.setFromEuler(_euler);

    const spec = WEAPON_SPECS[this.activeWeapon];
    const adsTarget = this.isAdsActive() ? 1 : 0;
    this.currentAdsAlpha = THREE.MathUtils.damp(this.currentAdsAlpha, adsTarget, 18, dt);
    const targetFov = THREE.MathUtils.lerp(72, spec.adsFov, this.currentAdsAlpha);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = targetFov;
      this.camera.updateProjectionMatrix();
    }

    const rig = this.weaponRigs[this.activeWeapon];
    _v1.copy(rig.hipPos).lerp(rig.adsPos, this.currentAdsAlpha);

    const bobScale = (1 - this.currentAdsAlpha * 0.72) * Math.min(1, horizSpeed / 6);
    const swayX = Math.cos(this.walkDistance * 1.1) * 0.012 * bobScale;
    const swayY = Math.abs(Math.sin(this.walkDistance * 1.1)) * -0.014 * bobScale;
    const reloadTilt = this.isReloading ? Math.sin((this.reloadTimer / spec.reloadDuration) * Math.PI) * 0.55 : 0;

    if (this.activeWeapon === 'knife') {
      let slashX = 0;
      let slashY = 0;
      let slashZ = 0;
      let rotX = 0;
      let rotY = 0;
      let rotZ = 0;

      if (this.knifeSlashTimer > 0) {
        const t = 1 - this.knifeSlashTimer / Math.max(0.01, this.knifeSlashDuration);
        const arc = Math.sin(t * Math.PI);
        if (this.knifeSlashHeavy) {
          // Deep forward lunging thrust
          slashX = -0.14 * arc;
          slashY = 0.04 * arc;
          slashZ = -0.26 * arc;
          rotX = -0.95 * arc;
          rotY = 0.35 * arc;
          rotZ = 0.45 * arc;
        } else {
          // Crisp horizontal CoD slash sweep right-to-left
          slashX = -0.28 * arc;
          slashY = -0.04 * arc;
          slashZ = -0.14 * arc;
          rotX = -0.45 * arc;
          rotY = 1.25 * arc;
          rotZ = 1.1 * arc;
        }
      } else if (this.knifeInspectTimer > 0) {
        const t = 1 - this.knifeInspectTimer / 0.55;
        rotZ = t * Math.PI * 2;
        slashX = -0.06 * Math.sin(t * Math.PI);
      }

      rig.root.position.set(
        _v1.x + swayX + slashX,
        _v1.y + swayY - this.swapDip + slashY,
        _v1.z + slashZ,
      );
      rig.root.rotation.set(rotX, rotY, rotZ);
      rig.muzzleFlashSprite.material.opacity = 0;
      return;
    }

    rig.root.visible = !(this.activeWeapon === 'sniper' && this.currentAdsAlpha > 0.65);
    rig.root.position.set(_v1.x + swayX, _v1.y + swayY - this.swapDip - reloadTilt * 0.14, _v1.z + this.weaponKickZ);
    rig.root.rotation.set(this.recoilPitch * 1.2 - reloadTilt * 0.5, 0, reloadTilt * 0.35);

    rig.boltCarrier.position.z = this.weaponKickZ * 1.15;
    if (this.muzzleFlashTimer > 0) {
      rig.muzzleFlashSprite.material.opacity = this.muzzleFlashTimer / 0.045;
      rig.muzzleFlashSprite.material.rotation = Math.random() * Math.PI;
    } else {
      rig.muzzleFlashSprite.material.opacity = 0;
    }
  }

  private fireActiveWeapon(moveSpeedRatio: number) {
    const spec = WEAPON_SPECS[this.activeWeapon];
    this.weapons[this.activeWeapon] = consumeAmmo(this.weapons[this.activeWeapon], this.activeWeapon);
    if (this.gameMode === 'training') {
      this.weapons[this.activeWeapon].reserve = spec.startReserve;
    }
    this.fireTimer = spec.fireInterval;
    this.shotsFired += 1;
    if (this.gameMode === 'training' && !this.aimChallengeComplete) {
      if (!this.aimFirstShotStarted) {
        this.aimFirstShotStarted = true;
        this.aimSplitStartTime = this.aimDrillElapsed;
      }
      this.aimShotsFired += 1;
    }
    tacticalAudio.playGunshot(this.activeWeapon);

    this.muzzleFlashTimer = 0.045;
    this.weaponKickZ = this.activeWeapon === 'rifle' ? 0.045 : 0.085;
    this.recoilPitch += spec.recoilPitch * (this.isAdsActive() ? 0.65 : 1.0);
    this.recoilYaw += (Math.random() - 0.5) * spec.recoilYaw;
    this.recoilAccum += spec.recoilPitch * 1.4;
    this.cameraTrauma = Math.min(1, this.cameraTrauma + (this.activeWeapon === 'rifle' ? 0.14 : 0.32));

    this.ejectShellCasing();

    const rig = this.weaponRigs[this.activeWeapon];
    rig.muzzlePoint.getWorldPosition(_v1);

    const spread = computeWeaponSpread(spec, this.isAdsActive(), moveSpeedRatio, this.recoilAccum);
    const targets = this._hitTargetsPool;
    targets.length = 0;
    const mapMeshes = this.mapData.raycastMeshes;
    for (let i = 0; i < mapMeshes.length; i++) {
      targets.push(mapMeshes[i]);
    }
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.state === 'alive') {
        const hm = e.rig.hitMeshes;
        for (let j = 0; j < hm.length; j++) {
          targets.push(hm[j]);
        }
      }
    }

    let anyHit = false;
    let bestHitKind: 'hit' | 'kill' | 'headshot' = 'hit';

    for (let p = 0; p < spec.pellets; p++) {
      _dir.set(
        (Math.random() - 0.5) * 2 * spread,
        (Math.random() - 0.5) * 2 * spread,
        -1,
      ).normalize();
      _dir.applyQuaternion(this.camera.quaternion);

      this.raycaster.set(this.camera.position, _dir);
      this.raycaster.far = spec.range;
      const hits = this.raycaster.intersectObjects(targets, false);

      const endPoint = _v2.copy(this.camera.position).addScaledVector(_dir, spec.range);
      if (hits.length > 0) {
        const hit = hits[0];
        endPoint.copy(hit.point);

        const enemyId = hit.object.userData.enemyId as number | undefined;
        const barrelId = hit.object.userData.barrelId as string | undefined;

        if (enemyId !== undefined) {
          const enemy = this.enemies.find((e) => e.id === enemyId && e.state === 'alive');
          if (enemy) {
            const isHead = Boolean(hit.object.userData.isHead);
            anyHit = true;
            if (this.gameMode === 'training' && this.aimHeadshotOnly && !isHead) {
              // Headshot-only mode deflects body shots with metallic sparks
              this.spawnBurst(hit.point.x, hit.point.y, hit.point.z, 0xf59e0b, 5, 4.2);
            } else {
              const dmg = computeHitDamage(spec, hit.distance, isHead);
              const killed = this.damageEnemy(enemy, dmg, isHead, spec.name);
              if (killed) bestHitKind = 'kill';
              else if (isHead && bestHitKind !== 'kill') bestHitKind = 'headshot';
              this.spawnBurst(hit.point.x, hit.point.y, hit.point.z, isHead ? 0xfef08a : 0xef4444, 6, 4.5);
            }
          }
        } else if (barrelId) {
          const barrel = this.mapData.barrels.find((b) => b.id === barrelId && !b.exploded);
          if (barrel) {
            anyHit = true;
            barrel.hp -= spec.damage;
            this.spawnBurst(hit.point.x, hit.point.y, hit.point.z, 0xf59e0b, 5, 5);
            if (barrel.hp <= 0) {
              this.detonateExplosion(barrel.x, barrel.y, barrel.z, 7.2, 135, 'Fuel Barrel');
              barrel.exploded = true;
              barrel.mesh.visible = false;
              if (this.gameMode === 'training') {
                this.barrelRespawnTimers.set(barrel.id, 4.0);
              }
            }
          }
        } else {
          this.spawnBurst(hit.point.x, hit.point.y, hit.point.z, 0xfbbf24, 4, 3.8);
        }
      }

      this.spawnTracer(_v1, endPoint, 0xffd27d);
    }

    if (anyHit) {
      this.shotsHit += 1;
      if (this.gameMode === 'training' && !this.aimChallengeComplete) {
        this.aimShotsHit += 1;
      }
      this.hitmarkerKind = bestHitKind;
      this.hitmarkerTimer = bestHitKind === 'kill' ? 0.22 : 0.14;
      tacticalAudio.playHitmarker(bestHitKind === 'headshot' || bestHitKind === 'kill');
    } else if (this.gameMode === 'training' && !this.aimChallengeComplete) {
      this.aimStreak = 0;
    }

    this.emitHud();
  }

  private damageEnemy(enemy: ActiveEnemy, dmg: number, isHead: boolean, weaponName: string): boolean {
    enemy.hp -= dmg;
    enemy.hitFlashTimer = 0.055;
    enemy.flinchKick = isHead ? 0.25 : 0.14;
    for (const m of enemy.rig.materialsToFlash) {
      m.emissive.setHex(0xffffff);
      m.emissiveIntensity = 0.85;
    }

    if (enemy.hp <= 0) {
      enemy.state = 'ko';
      enemy.koTimer = this.gameMode === 'training' ? 0.22 : 0.42;
      if (enemy.laserLine) enemy.laserLine.visible = false;
      this.kills += 1;
      if (isHead) this.headshots += 1;
      this.score += computeKillScore(enemy.archetype, isHead, this.wave);
      this.hitstopTimer = this.gameMode === 'training' ? 0.015 : 0.032;

      if (this.gameMode === 'training' && !this.aimChallengeComplete) {
        const split = Math.max(0.08, Math.min(4.0, this.aimDrillElapsed - this.aimSplitStartTime));
        this.aimTotalTtkSec += split;
        this.aimSplitStartTime = this.aimDrillElapsed;
        this.aimKills += 1;
        if (isHead) this.aimHeadshots += 1;
        this.aimStreak += 1;
        this.aimBestStreak = Math.max(this.aimBestStreak, this.aimStreak);
      }

      const labels: Record<EnemyArchetype, string> = {
        rifleman: 'Vanguard Rifleman',
        rusher: 'Breacher Rusher',
        sniper: 'Recon Sniper',
        heavy_drone: 'MQ-27 Combat Drone',
      };
      this.killFeed = [
        {
          id: this.killFeedSeq++,
          weaponName,
          enemyLabel: labels[enemy.archetype],
          headshot: isHead,
          timestamp: this.elapsedSeconds,
        },
        ...this.killFeed.slice(0, 3),
      ];
      return true;
    }
    return false;
  }

  private throwGrenade() {
    if (this.grenades <= 0) return;
    this.grenades -= 1;

    const gMesh = new THREE.Mesh(this.grenadeGeo, this.grenadeMat);
    _dir.set(0, 0.18, -1).normalize().applyQuaternion(this.camera.quaternion);
    const sx = this.playerX + _dir.x * 0.7;
    const sy = 1.55 + this.playerY;
    const sz = this.playerZ + _dir.z * 0.7;
    gMesh.position.set(sx, sy, sz);
    this.scene.add(gMesh);

    this.activeGrenades.push({
      mesh: gMesh,
      x: sx,
      y: sy,
      z: sz,
      vx: _dir.x * 16.5,
      vy: _dir.y * 16.5 + 3.2,
      vz: _dir.z * 16.5,
      fuse: 1.5,
    });
    this.emitHud();
  }

  private updateGrenades(dt: number) {
    for (let i = this.activeGrenades.length - 1; i >= 0; i--) {
      const g = this.activeGrenades[i];
      g.fuse -= dt;
      g.vy -= 18 * dt;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.z += g.vz * dt;
      if (g.y < 0.14) {
        g.y = 0.14;
        g.vy = Math.abs(g.vy) * 0.42;
        g.vx *= 0.65;
        g.vz *= 0.65;
      }
      g.mesh.position.set(g.x, g.y, g.z);
      g.mesh.rotation.x += dt * 8;
      if (g.fuse <= 0) {
        this.detonateExplosion(g.x, g.y, g.z, 7.6, 155, 'M67 Frag');
        this.scene.remove(g.mesh);
        this.activeGrenades.splice(i, 1);
      }
    }
  }

  private detonateExplosion(x: number, y: number, z: number, radius: number, maxDamage: number, sourceName: string) {
    tacticalAudio.playExplosion();
    this.cameraTrauma = Math.min(1, this.cameraTrauma + 0.55);
    this.explosionLight.position.set(x, y + 1.4, z);
    this.explosionLightTimer = 0.42;
    this.spawnBurst(x, y + 0.4, z, 0xff7722, 26, 9.5);
    this.spawnBurst(x, y + 0.6, z, 0xfef08a, 14, 7.2);

    let anyKill = false;
    for (const enemy of this.enemies) {
      if (enemy.state !== 'alive') continue;
      const dist = Math.hypot(enemy.x - x, enemy.y + 0.8 - y, enemy.z - z);
      const dmg = computeExplosionDamage(dist, radius, maxDamage);
      if (dmg > 0) {
        const killed = this.damageEnemy(enemy, dmg, false, sourceName);
        if (killed) anyKill = true;
      }
    }
    if (anyKill) {
      this.hitmarkerKind = 'kill';
      this.hitmarkerTimer = 0.25;
      tacticalAudio.playHitmarker(true);
    }

    if (this.gameMode !== 'training') {
      const pDist = Math.hypot(this.playerX - x, this.playerY - y, this.playerZ - z);
      const selfDmg = computeExplosionDamage(pDist, radius * 0.75, 45);
      if (selfDmg > 0) {
        const res = applyPlayerDamage(this.hp, this.armor, selfDmg);
        this.hp = res.hp;
        this.armor = res.armor;
        this.damageFlash = 0.7;
        if (res.defeated) this.triggerGameOver('defeat');
      }
    }
    this.emitHud();
  }

  private updateAimTraining(dt: number) {
    this.aimDrillElapsed += dt;

    // Auto-respawn exploded training barrels after 4s
    for (const [barrelId, timer] of this.barrelRespawnTimers) {
      const next = timer - dt;
      if (next <= 0) {
        this.barrelRespawnTimers.delete(barrelId);
        const barrel = this.mapData.barrels.find((b) => b.id === barrelId);
        if (barrel) {
          barrel.exploded = false;
          barrel.hp = 45;
          barrel.mesh.visible = true;
        }
      } else {
        this.barrelRespawnTimers.set(barrelId, next);
      }
    }

    // Handle 30s challenge countdown
    if (this.aimDrill === 'speed30' && this.aimChallengeActive) {
      this.aimTimeRemaining = Math.max(0, this.aimTimeRemaining - dt);
      if (this.aimTimeRemaining <= 0) {
        this.aimChallengeActive = false;
        this.aimChallengeComplete = true;
        if (this.aimKills > this.aimBestSpeedKills) {
          this.aimBestSpeedKills = this.aimKills;
          saveBest30(this.aimBestSpeedKills);
        }
        this.waveBanner = `30S DRILL COMPLETE · ${this.aimKills} KILLS (${computeHeadshotPercent(this.aimKills, this.aimHeadshots)}% HS)`;
        this.waveBannerTimer = 3.5;
        tacticalAudio.playWaveCue(true);
        this.emitHud();
      }
    }

    const slots = this.getRangeSlotPool();
    let respawnCount = 0;

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.hitFlashTimer > 0) {
        e.hitFlashTimer -= dt;
        if (e.hitFlashTimer <= 0) {
          for (const m of e.rig.materialsToFlash) {
            m.emissive.setHex(0x000000);
            m.emissiveIntensity = 0;
          }
        }
      }

      if (e.state === 'ko') {
        e.koTimer -= dt;
        const p = 1 - Math.max(0, e.koTimer / 0.22);
        e.rig.root.rotation.x = -p * (Math.PI * 0.48);
        e.rig.root.rotation.z = p * 0.35 * e.koRollDir;
        if (e.koTimer <= 0) {
          this.scene.remove(e.rig.root);
          disposeEnemyRig(e.rig);
          this.enemies.splice(i, 1);
          respawnCount += 1;
        }
        continue;
      }

      // Face player cleanly
      const dx = this.playerX - e.x;
      const dz = this.playerZ - e.z;
      e.yaw = Math.atan2(dx, dz);
      e.rig.root.rotation.y = e.yaw;

      const homeX = e.rangeHomeX ?? e.x;
      const homeZ = e.rangeHomeZ ?? e.z;
      let isMoving = false;

      if (this.aimDrill === 'peek') {
        e.rangePeekPhase = (e.rangePeekPhase ?? 0) + dt * 2.2;
        const peekWave = Math.sin(e.rangePeekPhase);
        const targetX = homeX + peekWave * 1.9 * e.strafeDir;
        const moveStep = targetX - e.x;
        const nextPos = resolveCircleObstacles(
          targetX,
          homeZ,
          0.48,
          this.mapData.obstacles,
          this.mapData.arenaHalfExtent,
        );
        e.x = nextPos.x;
        e.z = nextPos.z;
        isMoving = Math.abs(moveStep) > 0.002;
        e.walkPhase += Math.abs(moveStep) * 3.5;
        const swing = isMoving ? Math.sin(e.walkPhase) * 0.45 : 0;
        e.rig.leftLeg.rotation.x = swing;
        e.rig.rightLeg.rotation.x = -swing;
      } else if (this.aimDrill === 'tracking' || this.aimStrafeEnabled) {
        e.strafeTimer -= dt;
        const offsetFromHome = e.x - homeX;
        if (Math.abs(offsetFromHome) > 3.6) {
          e.strafeDir = offsetFromHome > 0 ? -1 : 1;
          e.strafeTimer = 1.2 + Math.random() * 1.2;
        } else if (e.strafeTimer <= 0) {
          e.strafeDir *= -1;
          e.strafeTimer = 1.0 + Math.random() * 1.4;
        }
        const prevX = e.x;
        const nextPos = resolveCircleObstacles(
          e.x + e.strafeDir * e.speed * dt,
          homeZ,
          0.52,
          this.mapData.obstacles,
          this.mapData.arenaHalfExtent,
        );
        if (Math.abs(nextPos.x - prevX) < 0.001) {
          e.strafeDir *= -1;
        }
        e.x = nextPos.x;
        e.z = nextPos.z;
        const moved = Math.abs(e.x - prevX);
        isMoving = moved > 0.001;
        e.walkPhase += moved * 3.2;
        const swing = Math.sin(e.walkPhase) * 0.55;
        e.rig.leftLeg.rotation.x = swing;
        e.rig.rightLeg.rotation.x = -swing;
      } else {
        e.rig.leftLeg.rotation.x = -0.06;
        e.rig.rightLeg.rotation.x = 0.06;
      }

      e.flinchKick = Math.max(0, e.flinchKick - dt * 1.4);
      const breath = Math.sin(this.elapsedSeconds * 2.4 + e.id * 1.3);
      e.rig.torsoPivot.position.y = 0.885 + breath * 0.009 - (isMoving ? Math.abs(Math.sin(e.walkPhase)) * 0.022 : 0);
      e.rig.torsoPivot.rotation.set(
        (isMoving ? 0.11 : 0.06) - e.flinchKick,
        -0.26 + (isMoving ? Math.cos(e.walkPhase) * 0.04 : breath * 0.02),
        0,
      );
      e.rig.headPivot.rotation.set(0.02 + e.flinchKick * 0.35, 0.26, -0.04);

      e.rig.root.position.set(e.x, e.y, e.z);
    }

    // Immediately refill empty target slots in free lanes
    if (respawnCount > 0 || this.enemies.length < 6) {
      const occupiedSlots = new Set<number>();
      for (const e of this.enemies) {
        if (e.rangeSlotIndex !== undefined) occupiedSlots.add(e.rangeSlotIndex);
      }
      const needed = Math.max(0, 6 - this.enemies.length);
      for (let k = 0; k < needed; k++) {
        const free: number[] = [];
        for (let s = 0; s < slots.length; s++) {
          if (!occupiedSlots.has(s)) free.push(s);
        }
        const chosen = free.length > 0 ? free[Math.floor(Math.random() * free.length)] : Math.floor(Math.random() * slots.length);
        occupiedSlots.add(chosen);
        this.spawnRangeBotInSlot(chosen);
      }
    }
  }

  private updateEnemies(dt: number) {
    const cfg = getWaveConfig(this.wave, this.difficulty);
    let activeAttackers = 0;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.state === 'alive' && e.telegraphTimer > 0) activeAttackers += 1;
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];

      if (e.hitFlashTimer > 0) {
        e.hitFlashTimer -= dt;
        if (e.hitFlashTimer <= 0) {
          for (const m of e.rig.materialsToFlash) {
            m.emissive.setHex(0x000000);
            m.emissiveIntensity = 0;
          }
        }
      }

      if (e.state === 'ko') {
        e.koTimer -= dt;
        const p = 1 - Math.max(0, e.koTimer / 0.42);
        if (e.archetype === 'heavy_drone') {
          e.rig.torsoPivot.position.y = Math.max(0.25, 2.15 - p * 1.9);
          e.rig.torsoPivot.rotation.z += dt * 9;
        } else {
          e.rig.root.rotation.x = -p * (Math.PI * 0.48);
          e.rig.root.rotation.z = p * 0.35 * e.koRollDir;
        }
        if (e.koTimer <= 0) {
          this.scene.remove(e.rig.root);
          disposeEnemyRig(e.rig);
          if (e.laserLine) {
            this.scene.remove(e.laserLine);
            e.laserLine.geometry.dispose();
            (e.laserLine.material as THREE.Material).dispose();
          }
          this.enemies.splice(i, 1);
        }
        continue;
      }

      const dx = this.playerX - e.x;
      const dz = this.playerZ - e.z;
      const dist = Math.max(0.01, Math.hypot(dx, dz));
      const nx = dx / dist;
      const nz = dz / dist;

      const targetYaw = Math.atan2(nx, nz);
      e.yaw = targetYaw;
      e.rig.root.rotation.y = e.yaw;

      let moveX = 0;
      let moveZ = 0;
      e.strafeTimer -= dt;
      if (e.strafeTimer <= 0) {
        e.strafeDir *= -1;
        e.strafeTimer = 1.4 + Math.random() * 1.6;
      }

      if (e.archetype === 'rusher') {
        if (dist > 3.8) {
          moveX = (nx - nz * 0.32 * e.strafeDir) * e.speed;
          moveZ = (nz + nx * 0.32 * e.strafeDir) * e.speed;
        }
      } else if (e.archetype === 'sniper') {
        if (e.y < 1.0) {
          if (dist < 18) {
            moveX = -nx * e.speed * 0.85;
            moveZ = -nz * e.speed * 0.85;
          } else {
            moveX = -nz * e.speed * 0.45 * e.strafeDir;
            moveZ = nx * e.speed * 0.45 * e.strafeDir;
          }
        }
      } else if (e.archetype === 'heavy_drone') {
        for (const r of e.rig.rotors) r.rotation.y += dt * 24;
        e.rig.torsoPivot.position.y = 2.15 + Math.sin(this.elapsedSeconds * 3.5 + e.id) * 0.22;
        const approach = dist > 16 ? 0.65 : dist < 9 ? -0.5 : 0;
        moveX = (nx * approach - nz * 0.85 * e.strafeDir) * e.speed;
        moveZ = (nz * approach + nx * 0.85 * e.strafeDir) * e.speed;
      } else {
        const approach = dist > 17 ? 0.85 : dist < 9.5 ? -0.45 : 0;
        moveX = (nx * approach - nz * 0.6 * e.strafeDir) * e.speed;
        moveZ = (nz * approach + nx * 0.6 * e.strafeDir) * e.speed;
      }

      let isMoving = false;
      if (e.y < 1.0 && (moveX !== 0 || moveZ !== 0)) {
        const nextPos = resolveCircleObstacles(
          e.x + moveX * dt,
          e.z + moveZ * dt,
          0.55,
          this.mapData.obstacles,
          this.mapData.arenaHalfExtent,
        );
        const stepDist = Math.hypot(nextPos.x - e.x, nextPos.z - e.z);
        e.x = nextPos.x;
        e.z = nextPos.z;
        isMoving = stepDist > 0.001;
        e.walkPhase += stepDist * 3.2;
        const swing = Math.sin(e.walkPhase) * 0.55;
        e.rig.leftLeg.rotation.x = swing;
        e.rig.rightLeg.rotation.x = -swing;
      } else if (e.archetype !== 'heavy_drone') {
        e.rig.leftLeg.rotation.x = -0.06;
        e.rig.rightLeg.rotation.x = 0.06;
      }

      e.flinchKick = Math.max(0, e.flinchKick - dt * 1.4);
      e.recoilKick = Math.max(0, e.recoilKick - dt * 1.1);
      if (e.fireFlashTimer > 0) {
        e.fireFlashTimer = Math.max(0, e.fireFlashTimer - dt);
        if (e.rig.muzzleFlashSprite) {
          e.rig.muzzleFlashSprite.material.opacity = e.fireFlashTimer / 0.065;
        }
      } else if (e.rig.muzzleFlashSprite && e.rig.muzzleFlashSprite.material.opacity !== 0) {
        e.rig.muzzleFlashSprite.material.opacity = 0;
      }

      if (e.archetype !== 'heavy_drone') {
        const breath = Math.sin(this.elapsedSeconds * 2.5 + e.id * 1.3);
        const baseLean = e.archetype === 'rusher' && isMoving ? 0.16 : isMoving ? 0.11 : 0.06;
        e.rig.torsoPivot.position.y = 0.885 + breath * 0.009 - (isMoving ? Math.abs(Math.sin(e.walkPhase)) * 0.024 : 0);
        e.rig.torsoPivot.rotation.set(
          baseLean - e.flinchKick,
          -0.26 + (isMoving ? Math.cos(e.walkPhase) * 0.045 : breath * 0.02),
          0,
        );
        e.rig.headPivot.rotation.set(0.02 + e.flinchKick * 0.35, 0.26, -0.04);
        e.rig.rightArm.rotation.x = -e.recoilKick;
        e.rig.leftArm.rotation.x = -e.recoilKick * 0.7;
      }

      e.rig.root.position.set(e.x, e.y, e.z);

      e.fireCooldown -= dt;
      if (e.telegraphTimer > 0) {
        e.telegraphTimer -= dt;
        if (e.laserLine) {
          e.rig.muzzleAnchor.getWorldPosition(_v1);
          const posAttr = e.laserLine.geometry.attributes.position as THREE.BufferAttribute;
          posAttr.setXYZ(0, _v1.x, _v1.y, _v1.z);
          posAttr.setXYZ(1, this.playerX, 1.35 + this.playerY, this.playerZ);
          posAttr.needsUpdate = true;
          e.laserLine.visible = true;
          (e.laserLine.material as THREE.LineBasicMaterial).opacity = 0.75;
        }

        if (e.telegraphTimer <= 0) {
          if (e.laserLine) e.laserLine.visible = false;
          this.fireEnemyWeapon(e, dist, cfg.damageScale, cfg.accuracyScale);
          const baseCooldown =
            e.archetype === 'sniper' ? 2.9 : e.archetype === 'rusher' ? 1.65 : 1.8 + Math.random() * 0.75;
          e.fireCooldown = baseCooldown * cfg.cooldownScale;
        }
      } else if (e.fireCooldown <= 0 && activeAttackers < cfg.attackTokens) {
        const maxAttackRange = e.archetype === 'rusher' ? 12 : e.archetype === 'sniper' ? 58 : 34;
        if (dist <= maxAttackRange && this.hasLineOfSight(e.x, e.y + 1.45, e.z)) {
          e.telegraphTimer = e.telegraphDuration;
          activeAttackers += 1;
          if (e.archetype === 'sniper') {
            tacticalAudio.playSniperTelegraph();
          }
        } else {
          e.fireCooldown = 0.4;
        }
      }
    }
  }

  private hasLineOfSight(ex: number, ey: number, ez: number): boolean {
    _v1.set(ex, ey, ez);
    _v2.set(this.playerX, 1.45 + this.playerY, this.playerZ).sub(_v1);
    const dist = _v2.length();
    if (dist < 0.5) return true;
    _v2.divideScalar(dist);
    this.raycaster.set(_v1, _v2);
    this.raycaster.far = dist - 0.5;
    const hits = this.raycaster.intersectObjects(this.mapData.raycastMeshes, false);
    return hits.length === 0;
  }

  private fireEnemyWeapon(e: ActiveEnemy, dist: number, damageScale: number, accuracyScale: number) {
    tacticalAudio.playEnemyShot(dist);
    e.fireFlashTimer = 0.065;
    e.recoilKick = e.archetype === 'sniper' ? 0.16 : 0.1;
    if (e.rig.muzzleFlashSprite) {
      e.rig.muzzleFlashSprite.material.opacity = 1;
      e.rig.muzzleFlashSprite.material.rotation = Math.random() * Math.PI;
    }
    e.rig.muzzleAnchor.getWorldPosition(_v1);
    _v2.set(this.playerX, 1.38 + this.playerY, this.playerZ);

    const baseHitChance =
      e.archetype === 'sniper'
        ? 0.66
        : e.archetype === 'rusher'
          ? Math.max(0.2, 0.68 - dist * 0.04)
          : Math.max(0.18, 0.56 - dist * 0.014);
    const hitChance = Math.min(0.94, Math.max(0.12, baseHitChance * accuracyScale));

    const hitsPlayer = Math.random() < hitChance && this.hasLineOfSight(e.x, e.y + 1.45, e.z);
    if (!hitsPlayer) {
      _v2.x += (Math.random() - 0.5) * 2.2;
      _v2.y += (Math.random() - 0.5) * 1.1;
      _v2.z += (Math.random() - 0.5) * 2.2;
      this.spawnTracer(_v1, _v2, 0xff5a36);
      return;
    }

    this.spawnTracer(_v1, _v2, 0xff4422);
    const baseDmg =
      e.archetype === 'sniper' ? 26 : e.archetype === 'rusher' ? 18 : e.archetype === 'heavy_drone' ? 14 : 11;
    const res = applyPlayerDamage(this.hp, this.armor, baseDmg * damageScale);
    this.hp = res.hp;
    this.armor = res.armor;
    this.damageFlash = 0.85;
    this.cameraTrauma = Math.min(1, this.cameraTrauma + 0.35);

    const worldAngle = Math.atan2(e.x - this.playerX, e.z - this.playerZ);
    this.damageAngle = worldAngle - this.playerYaw;
    tacticalAudio.playPlayerHurt();

    if (res.defeated) {
      this.triggerGameOver('defeat');
    } else {
      this.syncMusicState();
      this.emitHud();
    }
  }

  private updateWaveSpawner(dt: number) {
    const cfg = getWaveConfig(this.wave, this.difficulty);
    const aliveCount = this.countAliveEnemies();

    if (this.enemiesToSpawn > 0) {
      this.spawnCooldown -= dt;
      if (this.spawnCooldown <= 0 && aliveCount < cfg.maxConcurrent) {
        this.spawnOneEnemy();
        this.enemiesToSpawn -= 1;
        this.spawnCooldown = Math.max(0.65, (2.1 - this.wave * 0.22) * cfg.cooldownScale);
      }
    } else if (this.enemies.length === 0) {
      const outcome = checkMatchOutcome(this.hp, this.wave, 0);
      if (outcome === 'victory') {
        this.triggerGameOver('victory');
        return;
      }
      if (this.waveBreakTimer <= 0) {
        this.waveBreakTimer = 2.4;
        this.waveBanner = `WAVE ${this.wave} CLEARED`;
        this.waveBannerTimer = 2.0;
        tacticalAudio.playWaveCue(true);
        this.syncMusicState();
      } else {
        this.waveBreakTimer -= dt;
        if (this.waveBreakTimer <= 0 && this.wave < MAX_WAVES) {
          this.beginWave(this.wave + 1);
        }
      }
    }
  }

  private triggerGameOver(outcome: 'victory' | 'defeat') {
    this.phase = 'gameover';
    this.outcome = outcome;
    this.keysHeld.clear();
    this.fireHeld = false;
    this.adsHeld = false;
    document.exitPointerLock?.();
    document.body.dataset.state = 'gameover';
    tacticalAudio.playWaveCue(outcome === 'victory');
    this.syncMusicState();
    this.callbacks.onPhaseChange('gameover', outcome);
    this.emitHud();
  }

  private spawnBurst(x: number, y: number, z: number, colorHex: number, count: number, speed: number) {
    let spawned = 0;
    for (let i = 0; i < this.particlePool.length && spawned < count; i++) {
      const p = this.particlePool[i];
      if (p.active) continue;
      p.active = true;
      p.x = x;
      p.y = y;
      p.z = z;
      p.vx = (Math.random() - 0.5) * 2 * speed;
      p.vy = Math.random() * speed * 1.1 + 1.0;
      p.vz = (Math.random() - 0.5) * 2 * speed;
      p.maxLife = 0.28 + Math.random() * 0.35;
      p.life = p.maxLife;
      p.size = 0.55 + Math.random() * 0.9;
      p.gravity = 13.5;
      p.color.setHex(colorHex);
      spawned += 1;
    }
  }

  private updateParticles(dt: number) {
    let dirty = false;
    for (let i = 0; i < this.particlePool.length; i++) {
      const p = this.particlePool[i];
      if (!p.active) continue;
      dirty = true;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        _mat4.makeScale(0, 0, 0);
        this.particleInstanced.setMatrixAt(i, _mat4);
        continue;
      }
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.05) {
        p.y = 0.05;
        p.vy *= -0.35;
      }
      const s = p.size * (p.life / p.maxLife);
      _v3.set(p.x, p.y, p.z);
      _scale.set(s, s, s);
      _quat.identity();
      _mat4.compose(_v3, _quat, _scale);
      this.particleInstanced.setMatrixAt(i, _mat4);
      this.particleInstanced.setColorAt(i, p.color);
    }
    if (dirty) {
      this.particleInstanced.instanceMatrix.needsUpdate = true;
      if (this.particleInstanced.instanceColor) this.particleInstanced.instanceColor.needsUpdate = true;
    }
  }

  private spawnTracer(start: THREE.Vector3, end: THREE.Vector3, colorHex: number) {
    const t = this.tracers[this.tracerIndex];
    this.tracerIndex = (this.tracerIndex + 1) % this.tracers.length;
    const dist = start.distanceTo(end);
    if (dist < 0.1) return;

    t.mesh.position.copy(start).lerp(end, 0.5);
    t.mesh.lookAt(end);
    t.mesh.scale.set(1, 1, dist);
    t.mat.color.setHex(colorHex);
    t.mat.opacity = 0.9;
    t.mesh.visible = true;
    t.life = t.maxLife;
  }

  private updateTracers(dt: number) {
    for (const t of this.tracers) {
      if (!t.mesh.visible) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.mesh.visible = false;
      } else {
        t.mat.opacity = (t.life / t.maxLife) * 0.9;
      }
    }
  }

  private ejectShellCasing() {
    const s = this.shells[this.shellIndex];
    this.shellIndex = (this.shellIndex + 1) % this.shells.length;
    const right = _v2.set(1, 0.4, -0.2).applyQuaternion(this.camera.quaternion);
    s.mesh.position.copy(this.camera.position).addScaledVector(right, 0.25);
    s.vx = right.x * (2.6 + Math.random());
    s.vy = 2.2 + Math.random();
    s.vz = right.z * (2.6 + Math.random());
    s.rx = (Math.random() - 0.5) * 18;
    s.ry = (Math.random() - 0.5) * 18;
    s.life = 0.85;
    s.active = true;
    s.mesh.visible = true;
  }

  private updateShells(dt: number) {
    for (const s of this.shells) {
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.active = false;
        s.mesh.visible = false;
        continue;
      }
      s.vy -= 14 * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      s.mesh.rotation.x += s.rx * dt;
      s.mesh.rotation.y += s.ry * dt;
      if (s.mesh.position.y < 0.05) {
        s.mesh.position.y = 0.05;
        s.vy = Math.abs(s.vy) * 0.35;
      }
    }
  }

  public getObstaclesForRadar() {
    return this.mapData ? this.mapData.obstacles : [];
  }

  private emitHud() {
    const spec = WEAPON_SPECS[this.activeWeapon];
    const radarBlips: RadarBlip[] = [];
    for (const e of this.enemies) {
      if (e.state === 'alive') {
        radarBlips.push({ x: e.x, z: e.z, kind: e.archetype });
      }
    }
    if (this.mapData) {
      for (const b of this.mapData.barrels) {
        if (!b.exploded) {
          radarBlips.push({ x: b.x, z: b.z, kind: 'barrel' });
        }
      }
    }

    const aliveEnemies = this.countAliveEnemies() + this.enemiesToSpawn;
    const activeAimTime = Math.max(0.01, this.aimDrillElapsed);

    this.callbacks.onHudUpdate({
      phase: this.phase,
      gameMode: this.gameMode,
      outcome: this.outcome,
      hp: this.hp,
      maxHp: this.maxHp,
      armor: this.armor,
      maxArmor: this.maxArmor,
      stamina: this.stamina,
      activeWeapon: this.activeWeapon,
      weapons: {
        rifle: { ...this.weapons.rifle },
        shotgun: { ...this.weapons.shotgun },
        sniper: { ...this.weapons.sniper },
        knife: { ...this.weapons.knife },
      },
      isReloading: this.isReloading,
      reloadProgress: this.isReloading && spec.reloadDuration > 0 ? 1 - Math.max(0, this.reloadTimer / spec.reloadDuration) : 0,
      isAds: this.isAdsActive(),
      grenades: this.grenades,
      wave: this.wave,
      maxWaves: MAX_WAVES,
      enemiesRemaining: aliveEnemies,
      waveBanner: this.waveBanner,
      score: this.score,
      kills: this.kills,
      headshots: this.headshots,
      shotsFired: this.shotsFired,
      shotsHit: this.shotsHit,
      elapsedSeconds: this.elapsedSeconds,
      hitmarkerKind: this.hitmarkerKind,
      damageFlash: this.damageFlash,
      damageAngle: this.damageAngle,
      pointerLocked: Boolean(this.renderer && document.pointerLockElement === this.renderer.domElement),
      muted: tacticalAudio.isMuted(),
      musicMuted: tacticalMusic.isMuted(),
      musicVolume: tacticalMusic.getVolume(),
      crosshairSpread: computeWeaponSpread(spec, this.isAdsActive(), 0, this.recoilAccum),
      killFeed: this.killFeed,
      playerX: this.playerX,
      playerZ: this.playerZ,
      playerYaw: this.playerYaw,
      radarBlips,
      difficulty: this.difficulty,
      mapId: this.currentMapId,
      nextMapId: getNextMapId(this.currentMapId, this.mapQueue),
      mapQueue: [...this.mapQueue],
      autoQueueMaps: this.autoQueueMaps,
      activeBackendLabel: this.activeBackendLabel,
      qualityMode: this.qualityMode,
      graphics: { ...this.graphics },
      fps: this.currentFps,
      aimTraining: {
        drill: this.aimDrill,
        timeRemaining: this.aimTimeRemaining,
        challengeActive: this.aimChallengeActive,
        challengeComplete: this.aimChallengeComplete,
        kills: this.aimKills,
        headshots: this.aimHeadshots,
        shotsFired: this.aimShotsFired,
        shotsHit: this.aimShotsHit,
        streak: this.aimStreak,
        bestStreak: this.aimBestStreak,
        kpm: computeKpm(this.aimKills, activeAimTime),
        avgTtkMs: computeAvgTtkMs(this.aimTotalTtkSec, this.aimKills),
        bestSpeedKills: this.aimBestSpeedKills,
        headshotOnly: this.aimHeadshotOnly,
        strafeEnabled: this.aimStrafeEnabled,
      },
    });
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    tacticalMusic.dispose();

    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);

    this.clearEnemiesAndProjectiles();
    this.mapData?.dispose();
    this.grenadeGeo.dispose();
    this.grenadeMat.dispose();

    if (this.renderPipeline) {
      this.renderPipeline.dispose();
      this.renderPipeline = null;
    }

    if (this.renderer) {
      const dom = this.renderer.domElement;
      dom.removeEventListener('mousedown', this.onMouseDown);
      dom.removeEventListener('wheel', this.onWheel);
      dom.removeEventListener('contextmenu', this.onContextMenu);
      this.renderer.dispose();
      if (dom.parentElement === this.container) {
        this.container.removeChild(dom);
      }
    }

    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);

    this.textures?.dispose();
  }
}
