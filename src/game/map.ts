import * as THREE from 'three/webgpu';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import type { AABB2D, MapId } from './types';
import type { ProceduralTextureSet } from './textures';
import { buildArmoredMrap, buildHarborGantry, buildRadarArray, buildWatchtower } from './models';

export interface ExplosiveBarrel {
  id: string;
  mesh: THREE.Group;
  hitMesh: THREE.Mesh;
  x: number;
  y: number;
  z: number;
  hp: number;
  exploded: boolean;
}

export interface MapLightingPreset {
  sunElevationDeg: number;
  sunAzimuthDeg: number;
  sunColor: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  rimColor: number;
  rimIntensity: number;
  fogColor: number;
  fogDensity: number;
  skyTurbidity: number;
  skyRayleigh: number;
  skyMie: number;
  skyMieG: number;
  cloudCoverage: number;
  cloudDensity: number;
  exposure: number;
  envIntensity: number;
}

export interface TacticalMapData {
  mapId: MapId;
  mapRoot: THREE.Group;
  arenaHalfExtent: number;
  obstacles: AABB2D[];
  raycastMeshes: THREE.Object3D[];
  barrels: ExplosiveBarrel[];
  enemySpawnPoints: Array<{ x: number; y: number; z: number; preferSniper?: boolean }>;
  playerSpawn: { x: number; z: number; yaw: number };
  lighting: MapLightingPreset;
  rotatingProps: THREE.Object3D[];
  vanguardSpawns: Array<{ x: number; y: number; z: number; archetype: 'rifleman' | 'rusher' | 'sniper' }>;
  dispose: () => void;
}

export function buildTacticalMap(
  scene: THREE.Scene,
  textures: ProceduralTextureSet,
  mapId: MapId = 'ironclad',
): TacticalMapData {
  const mapRoot = new THREE.Group();
  scene.add(mapRoot);

  const arenaHalfExtent = 34;
  const obstacles: AABB2D[] = [];
  const raycastMeshes: THREE.Object3D[] = [];
  const barrels: ExplosiveBarrel[] = [];
  const rotatingProps: THREE.Object3D[] = [];

  // Shared PBR Materials
  const oliveContMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.containerOliveMap,
    normalMap: textures.containerNormal,
    normalScale: new THREE.Vector2(1.4, 1.4),
    roughness: 0.56,
    metalness: 0.42,
  });
  const tanContMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.containerTanMap,
    normalMap: textures.containerNormal,
    normalScale: new THREE.Vector2(1.4, 1.4),
    roughness: 0.58,
    metalness: 0.38,
  });
  const navyContMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.containerNavyMap,
    normalMap: textures.containerNormal,
    normalScale: new THREE.Vector2(1.4, 1.4),
    roughness: 0.52,
    metalness: 0.48,
  });
  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.concreteMap,
    normalMap: textures.concreteNormal,
    normalScale: new THREE.Vector2(1.1, 1.1),
    roughness: 0.9,
    metalness: 0.04,
  });
  const sandbagMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.sandbagMap,
    normalMap: textures.sandbagNormal,
    normalScale: new THREE.Vector2(1.2, 1.2),
    roughness: 0.94,
    metalness: 0.02,
  });
  const crateMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.crateMap,
    normalMap: textures.crateNormal,
    normalScale: new THREE.Vector2(1.1, 1.1),
    roughness: 0.82,
    metalness: 0.08,
  });
  const metalPlateMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.metalPlateMap,
    normalMap: textures.metalPlateNormal,
    normalScale: new THREE.Vector2(1.2, 1.2),
    roughness: 0.44,
    metalness: 0.72,
  });
  const trimSteelMat = new THREE.MeshStandardMaterial({
    color: 0x262a2f,
    roughness: 0.36,
    metalness: 0.8,
  });

  // Accumulate small non-raycast decorative/trim meshes per material so they merge into 1 draw call per material
  const mergeBuckets = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; castShadow: boolean }>();
  const addMergedPart = (
    mat: THREE.Material,
    geo: THREE.BufferGeometry,
    px = 0,
    py = 0,
    pz = 0,
    rx = 0,
    ry = 0,
    rz = 0,
    sx = 1,
    sy = 1,
    sz = 1,
    castShadow = false,
  ) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (sx !== 1 || sy !== 1 || sz !== 1) g.scale(sx, sy, sz);
    if (rx !== 0) g.rotateX(rx);
    if (ry !== 0) g.rotateY(ry);
    if (rz !== 0) g.rotateZ(rz);
    if (px !== 0 || py !== 0 || pz !== 0) g.translate(px, py, pz);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) {
      const count = g.attributes.position.count;
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }
    for (const key of Object.keys(g.attributes)) {
      if (key !== 'position' && key !== 'normal' && key !== 'uv') {
        g.deleteAttribute(key);
      }
    }
    let bucket = mergeBuckets.get(mat);
    if (!bucket) {
      bucket = { geos: [], castShadow };
      mergeBuckets.set(mat, bucket);
    } else if (castShadow) {
      bucket.castShadow = true;
    }
    bucket.geos.push(g);
  };

  const flushMergedParts = () => {
    for (const [mat, bucket] of mergeBuckets) {
      if (bucket.geos.length === 0) continue;
      const merged = BufferGeometryUtils.mergeGeometries(bucket.geos, false);
      for (let i = 0; i < bucket.geos.length; i++) bucket.geos[i].dispose();
      if (merged) {
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = bucket.castShadow;
        mesh.receiveShadow = true;
        mapRoot.add(mesh);
      }
    }
    mergeBuckets.clear();
  };

  const loopGeo = new THREE.TorusGeometry(0.06, 0.016, 6, 10, Math.PI);
  const stripeBox90Geo = new THREE.BoxGeometry(0.32, 0.14, 0.42);
  const stripeBox0Geo = new THREE.BoxGeometry(0.42, 0.14, 0.32);
  const refBox90Geo = new THREE.BoxGeometry(0.33, 0.06, 0.12);
  const refBox0Geo = new THREE.BoxGeometry(0.12, 0.06, 0.33);
  const postUnitGeo = new THREE.BoxGeometry(0.18, 1, 0.18);
  const castingGeo = new THREE.BoxGeometry(0.24, 0.2, 0.24);
  const rodUnitGeo = new THREE.CylinderGeometry(0.028, 0.028, 1, 6);

  const addObstacleBox = (
    id: string,
    cx: number,
    cz: number,
    w: number,
    h: number,
    d: number,
    kind: AABB2D['kind'],
    mat: THREE.Material,
    withTrim = false,
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(cx, h / 2 + 0.025, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mapRoot.add(mesh);
    raycastMeshes.push(mesh);

    if (withTrim) {
      const topGeo = new THREE.BoxGeometry(w + 0.12, 0.16, d + 0.12);
      const botGeo = new THREE.BoxGeometry(w + 0.12, 0.14, d + 0.12);
      addMergedPart(trimSteelMat, topGeo, cx, h + 0.02, cz);
      addMergedPart(trimSteelMat, botGeo, cx, 0.09, cz);
      topGeo.dispose();
      botGeo.dispose();

      // Corner ISO structural steel columns & corner castings (batched into trimSteelMat)
      const corners: Array<[number, number]> = [
        [-w / 2 - 0.01, -d / 2 - 0.01],
        [w / 2 + 0.01, -d / 2 - 0.01],
        [-w / 2 - 0.01, d / 2 + 0.01],
        [w / 2 + 0.01, d / 2 + 0.01],
      ];
      for (const [ox, oz] of corners) {
        addMergedPart(trimSteelMat, postUnitGeo, cx + ox, h / 2 + 0.02, cz + oz, 0, 0, 0, 1, h + 0.06, 1);
        addMergedPart(trimSteelMat, castingGeo, cx + ox, h + 0.03, cz + oz);
      }

      // Cargo door vertical locking bar rods on facing ends (batched into metalPlateMat)
      const isLongZ = d >= w;
      const rodH = h - 0.26;
      if (isLongZ) {
        for (const endSign of [-1, 1]) {
          for (const barOff of [-0.36, -0.14, 0.14, 0.36]) {
            addMergedPart(
              metalPlateMat,
              rodUnitGeo,
              cx + barOff,
              h / 2 + 0.03,
              cz + endSign * (d / 2 + 0.03),
              0,
              0,
              0,
              1,
              rodH,
              1,
            );
          }
        }
      } else {
        for (const endSign of [-1, 1]) {
          for (const barOff of [-0.36, -0.14, 0.14, 0.36]) {
            addMergedPart(
              metalPlateMat,
              rodUnitGeo,
              cx + endSign * (w / 2 + 0.03),
              h / 2 + 0.03,
              cz + barOff,
              0,
              0,
              0,
              1,
              rodH,
              1,
            );
          }
        }
      }
    }

    obstacles.push({
      id,
      minX: cx - w / 2,
      maxX: cx + w / 2,
      minZ: cz - d / 2,
      maxZ: cz + d / 2,
      height: h,
      kind,
    });
  };

  const jerseyShape = new THREE.Shape();
  jerseyShape.moveTo(-0.45, 0);
  jerseyShape.lineTo(0.45, 0);
  jerseyShape.lineTo(0.38, 0.25);
  jerseyShape.lineTo(0.18, 0.55);
  jerseyShape.lineTo(0.14, 1.22);
  jerseyShape.lineTo(-0.14, 1.22);
  jerseyShape.lineTo(-0.18, 0.55);
  jerseyShape.lineTo(-0.38, 0.25);
  jerseyShape.closePath();

  const barrierHazardMat = new THREE.MeshStandardMaterial({
    map: textures.hazardMap,
    roughness: 0.52,
    metalness: 0.2,
  });
  const barrierReflectorMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xd97706,
    emissiveIntensity: 0.65,
    roughness: 0.25,
    metalness: 0.2,
  });

  const addJerseyBarrier = (id: string, cx: number, cz: number, length: number, rotate90 = false) => {
    const geo = new THREE.ExtrudeGeometry(jerseyShape, {
      depth: length,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.03,
      bevelSegments: 2,
    });
    geo.center();
    if (!rotate90) geo.rotateY(Math.PI / 2);
    const mesh = new THREE.Mesh(geo, concreteMat);
    mesh.position.set(cx, 0.64, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mapRoot.add(mesh);
    raycastMeshes.push(mesh);

    // Steel top anchor loops & hazard reflector plates batched into shared draw calls
    const stripeGeo = rotate90 ? stripeBox90Geo : stripeBox0Geo;
    const refGeo = rotate90 ? refBox90Geo : refBox0Geo;
    for (const s of [-1, 1]) {
      addMergedPart(
        trimSteelMat,
        loopGeo,
        cx + (rotate90 ? 0 : s * (length * 0.34)),
        1.25,
        cz + (rotate90 ? s * (length * 0.34) : 0),
        0,
        rotate90 ? Math.PI / 2 : 0,
        0,
      );
      addMergedPart(
        barrierHazardMat,
        stripeGeo,
        cx + (rotate90 ? 0 : s * (length * 0.42)),
        1.05,
        cz + (rotate90 ? s * (length * 0.42) : 0),
      );
      addMergedPart(
        barrierReflectorMat,
        refGeo,
        cx + (rotate90 ? 0 : s * (length * 0.42)),
        1.18,
        cz + (rotate90 ? s * (length * 0.42) : 0),
      );
    }

    obstacles.push({
      id,
      minX: cx - (rotate90 ? 0.48 : length / 2),
      maxX: cx + (rotate90 ? 0.48 : length / 2),
      minZ: cz - (rotate90 ? length / 2 : 0.48),
      maxZ: cz + (rotate90 ? length / 2 : 0.48),
      height: 1.25,
      kind: 'barrier',
    });
  };

  const bagGeo = new THREE.BoxGeometry(0.92, 0.34, 0.52);
  const addSandbagBunker = (id: string, cx: number, cz: number, length: number) => {
    const cols = Math.max(2, Math.round(length / 0.96));
    const startX = -((cols - 1) * 0.94) / 2;
    for (let row = 0; row < 3; row++) {
      const rowOffset = (row % 2) * 0.25;
      const count = row % 2 === 1 ? cols - 1 : cols;
      for (let c = 0; c < count; c++) {
        addMergedPart(
          sandbagMat,
          bagGeo,
          cx + startX + c * 0.94 + rowOffset,
          0.025 + 0.19 + row * 0.34,
          cz + (row % 2 === 0 ? 0.02 : -0.02),
          0,
          (((c + row) % 3) - 1) * 0.04,
          0,
          1,
          1,
          1,
          true,
        );
      }
    }
    // Single lean core collider mesh nestled inside bags for fast raycasting
    const core = new THREE.Mesh(new THREE.BoxGeometry(length - 0.16, 0.98, 0.44), sandbagMat);
    core.position.set(cx, 0.52, cz);
    mapRoot.add(core);
    raycastMeshes.push(core);

    obstacles.push({
      id,
      minX: cx - length / 2,
      maxX: cx + length / 2,
      minZ: cz - 0.45,
      maxZ: cz + 0.45,
      height: 1.2,
      kind: 'barrier',
    });
  };

  const barrelRedMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.45, metalness: 0.45 });
  const barrelStripeMat = new THREE.MeshStandardMaterial({ map: textures.hazardMap, roughness: 0.5, metalness: 0.3 });
  const barrelDrumGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.18, 14);
  const barrelBandGeo = new THREE.CylinderGeometry(0.432, 0.432, 0.22, 14);
  const barrelCapGeo = new THREE.TorusGeometry(0.4, 0.03, 6, 14);
  barrelCapGeo.rotateX(Math.PI / 2);
  const barrelRibGeo = new THREE.TorusGeometry(0.422, 0.02, 6, 14);
  barrelRibGeo.rotateX(Math.PI / 2);
  const barrelBungGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.05, 8);

  const addBarrels = (coords: Array<[string, number, number]>) => {
    for (const [id, bx, bz] of coords) {
      const bg = new THREE.Group();
      const drum = new THREE.Mesh(barrelDrumGeo, barrelRedMat);
      drum.position.y = 0.61;
      drum.castShadow = true;
      drum.receiveShadow = true;
      drum.userData.barrelId = id;

      const band = new THREE.Mesh(barrelBandGeo, barrelStripeMat);
      band.position.y = 0.61;
      const capRing = new THREE.Mesh(barrelCapGeo, trimSteelMat);
      capRing.position.y = 1.2;
      const ribBot = new THREE.Mesh(barrelRibGeo, barrelRedMat);
      ribBot.position.y = 0.35;
      const ribTop = new THREE.Mesh(barrelRibGeo, barrelRedMat);
      ribTop.position.y = 0.87;
      const bung = new THREE.Mesh(barrelBungGeo, trimSteelMat);
      bung.position.set(0.18, 1.21, 0.1);

      bg.position.set(bx, 0.025, bz);
      bg.add(drum, band, capRing, ribBot, ribTop, bung);
      mapRoot.add(bg);
      raycastMeshes.push(drum);

      barrels.push({
        id,
        mesh: bg,
        hitMesh: drum,
        x: bx,
        y: 0.6,
        z: bz,
        hp: 45,
        exploded: false,
      });
      obstacles.push({
        id,
        minX: bx - 0.45,
        maxX: bx + 0.45,
        minZ: bz - 0.45,
        maxZ: bz + 0.45,
        height: 1.25,
        kind: 'crate',
      });
    }
  };

  // Precompute static world matrices once and cleanly release GPU buffers when changing maps
  const freezeAndCreateDispose = () => {
    flushMergedParts();
    // Release reusable builder template geometries that were cloned/transformed into merged batches
    loopGeo.dispose();
    stripeBox90Geo.dispose();
    stripeBox0Geo.dispose();
    refBox90Geo.dispose();
    refBox0Geo.dispose();
    postUnitGeo.dispose();
    castingGeo.dispose();
    rodUnitGeo.dispose();
    bagGeo.dispose();
    mapRoot.updateMatrixWorld(true);
    const dynamicSet = new Set<THREE.Object3D>(rotatingProps);
    for (let i = 0; i < barrels.length; i++) {
      dynamicSet.add(barrels[i].mesh);
    }
    mapRoot.traverse((obj) => {
      if (obj === mapRoot || dynamicSet.has(obj)) return;
      // Keep children of rotatingProps dynamic if needed, though only parent pivot rotates
      let parent = obj.parent;
      let isDynamicChild = false;
      while (parent) {
        if (dynamicSet.has(parent)) {
          isDynamicChild = true;
          break;
        }
        parent = parent.parent;
      }
      if (!isDynamicChild) {
        obj.matrixAutoUpdate = false;
      }
    });

    return () => {
      const disposedGeos = new Set<THREE.BufferGeometry>();
      const disposedMats = new Set<THREE.Material>();
      mapRoot.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry && !disposedGeos.has(mesh.geometry)) {
          disposedGeos.add(mesh.geometry);
          mesh.geometry.dispose();
        }
        const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        for (const m of mats) {
          if (!disposedMats.has(m)) {
            disposedMats.add(m);
            m.dispose();
          }
        }
      });
      scene.remove(mapRoot);
    };
  };

  const addCourtyardFloor = (roughnessScale = 0.88, tint = 0xffffff) => {
    const courtyardGeo = new THREE.PlaneGeometry(72, 72);
    const courtyardMat = new THREE.MeshStandardMaterial({
      color: tint,
      map: textures.asphaltMap,
      normalMap: textures.asphaltNormal,
      normalScale: new THREE.Vector2(0.38, 0.38),
      roughnessMap: textures.asphaltRoughness,
      roughness: roughnessScale,
      metalness: 0.06,
    });
    const courtyard = new THREE.Mesh(courtyardGeo, courtyardMat);
    courtyard.rotation.x = -Math.PI / 2;
    courtyard.position.y = 0.025;
    courtyard.receiveShadow = true;
    mapRoot.add(courtyard);
    raycastMeshes.push(courtyard);
  };

  const addPerimeterWall = (capMat: THREE.Material) => {
    const perimeterSegments: Array<[number, number, number, number]> = [
      [-22, -35, 22, 1.8],
      [22, -35, 22, 1.8],
      [-22, 35, 22, 1.8],
      [22, 35, 22, 1.8],
      [-35, -22, 1.8, 22],
      [-35, 22, 1.8, 22],
      [35, -22, 1.8, 22],
      [35, 22, 1.8, 22],
    ];
    perimeterSegments.forEach(([px, pz, w, d], idx) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 2.35, d), concreteMat);
      wall.position.set(px, 1.175, pz);
      wall.castShadow = true;
      wall.receiveShadow = true;
      mapRoot.add(wall);
      raycastMeshes.push(wall);
      if (idx % 2 === 0) {
        const capGeo = new THREE.BoxGeometry(w + 0.1, 0.25, d + 0.1);
        addMergedPart(capMat, capGeo, px, 2.45, pz);
        capGeo.dispose();
      }
    });
  };

  const addMesaRing = (mat: THREE.Material, baseHex: number, heightBase: number) => {
    const mesaGeo = new THREE.CylinderGeometry(0.45, 1.0, 1.0, 7, 3);
    const posAttr = mesaGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vy = posAttr.getY(i);
      const vz = posAttr.getZ(i);
      const jag = 1 + Math.sin(vx * 7.3 + vz * 5.1) * 0.18 + Math.cos(vy * 9.0) * 0.08;
      posAttr.setXYZ(i, vx * jag, vy, vz * jag);
    }
    mesaGeo.computeVertexNormals();

    const cliffCount = 36;
    const cliffInst = new THREE.InstancedMesh(mesaGeo, mat, cliffCount);
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();
    for (let i = 0; i < cliffCount; i++) {
      const angle = (i / cliffCount) * Math.PI * 2;
      const dist = 78 + (i % 3) * 22 + Math.sin(i * 2.7) * 8;
      const height = heightBase + (i % 4) * 5.5;
      dummy.position.set(Math.cos(angle) * dist, height * 0.42, Math.sin(angle) * dist);
      dummy.scale.set(16 + (i % 5) * 4, height, 12 + ((i + 2) % 4) * 4);
      dummy.rotation.set(0, angle + (i % 3) * 0.4, 0);
      dummy.updateMatrix();
      cliffInst.setMatrixAt(i, dummy.matrix);
      tint.setHex(baseHex).offsetHSL(0, 0.02, ((i % 5) - 2) * 0.035);
      cliffInst.setColorAt(i, tint);
    }
    cliffInst.instanceMatrix.needsUpdate = true;
    if (cliffInst.instanceColor) cliffInst.instanceColor.needsUpdate = true;
    cliffInst.computeBoundingSphere();
    mapRoot.add(cliffInst);
  };

  // =========================================================================
  // MAP 2: PORT CALDERA (Golden Dusk Maritime Container Terminal & Pier)
  // =========================================================================
  if (mapId === 'harbor') {
    // Ocean Basin below pier level
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x16384c,
      normalMap: textures.waterNormal,
      normalScale: new THREE.Vector2(1.1, 1.1),
      roughness: 0.14,
      metalness: 0.86,
    });
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(340, 340), waterMat);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = -0.85;
    mapRoot.add(ocean);

    // Concrete Pier Quay Deck (raises playable zone above water)
    const pierDeck = new THREE.Mesh(new THREE.BoxGeometry(76, 0.9, 76), concreteMat);
    pierDeck.position.set(0, -0.45, 0);
    pierDeck.receiveShadow = true;
    mapRoot.add(pierDeck);
    raycastMeshes.push(pierDeck);

    addCourtyardFloor(0.55, 0xd8e0e8); // Slight damp pier tarmac sheen

    // Pier Warning Hazard Border Strip
    const hazardMat = new THREE.MeshStandardMaterial({ map: textures.hazardMap, roughness: 0.55 });
    const northStrip = new THREE.Mesh(new THREE.PlaneGeometry(72, 1.1), hazardMat);
    northStrip.rotation.x = -Math.PI / 2;
    northStrip.position.set(0, 0.04, -34.5);
    const eastStrip = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 72), hazardMat);
    eastStrip.rotation.x = -Math.PI / 2;
    eastStrip.position.set(34.5, 0.04, 0);
    mapRoot.add(northStrip, eastStrip);

    // Long Cargo Lanes of Navy, Tan, and Olive Containers
    addObstacleBox('h-cont-1', -12, 3, 3.0, 2.9, 7.2, 'container', navyContMat, true);
    addObstacleBox('h-cont-2', -12, -8, 3.0, 2.9, 7.2, 'container', tanContMat, true);
    addObstacleBox('h-cont-3', 12, 2, 3.0, 2.9, 7.2, 'container', oliveContMat, true);
    addObstacleBox('h-cont-4', 12, -9, 3.0, 2.9, 7.2, 'container', navyContMat, true);
    addObstacleBox('h-cont-5', 0, -18, 7.6, 2.9, 3.2, 'container', navyContMat, true);
    addObstacleBox('h-cont-6', -22, -16, 6.8, 2.9, 3.0, 'container', tanContMat, true);
    addObstacleBox('h-cont-7', 22, -16, 6.8, 2.9, 3.0, 'container', oliveContMat, true);

    // Upper stacked cargo containers
    const upperA = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.8, 7.2), oliveContMat);
    upperA.position.set(-12, 2.9 + 1.42, -8);
    upperA.castShadow = true;
    upperA.receiveShadow = true;
    const upperB = new THREE.Mesh(new THREE.BoxGeometry(7.6, 2.8, 3.2), tanContMat);
    upperB.position.set(0, 2.9 + 1.42, -18);
    upperB.castShadow = true;
    upperB.receiveShadow = true;
    mapRoot.add(upperA, upperB);
    raycastMeshes.push(upperA, upperB);

    // Central Loading Dock Jersey Barriers & Crates
    addJerseyBarrier('h-bar-1', -4.8, 8.5, 4.0);
    addJerseyBarrier('h-bar-2', 4.8, 8.5, 4.0);
    addJerseyBarrier('h-bar-3', 0, -2.5, 4.8);
    addSandbagBunker('h-sb-1', -18, 12, 4.2);
    addSandbagBunker('h-sb-2', 18, 12, 4.2);
    addObstacleBox('h-crate-1', -4.5, -10.5, 1.8, 1.5, 1.8, 'crate', crateMat);
    addObstacleBox('h-crate-2', 4.5, -10.5, 1.8, 1.5, 1.8, 'crate', crateMat);

    // Harbor Gantry Cranes on flanks (Hero Architecture)
    const gantryW = buildHarborGantry(textures);
    gantryW.position.set(-24, 0, -4);
    mapRoot.add(gantryW);
    gantryW.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) raycastMeshes.push(c);
    });
    obstacles.push({ id: 'gantry-w', minX: -26.8, maxX: -21.2, minZ: -6.8, maxZ: -1.2, height: 12, kind: 'tower' });

    const gantryE = buildHarborGantry(textures);
    gantryE.position.set(24, 0, -4);
    gantryE.rotation.y = Math.PI;
    mapRoot.add(gantryE);
    gantryE.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) raycastMeshes.push(c);
    });
    obstacles.push({ id: 'gantry-e', minX: 21.2, maxX: 26.8, minZ: -6.8, maxZ: -1.2, height: 12, kind: 'tower' });

    // Overwatch Watchtowers at North corners
    const towerN = buildWatchtower(textures);
    towerN.position.set(19, 0.02, -25);
    mapRoot.add(towerN);
    towerN.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) raycastMeshes.push(c);
    });
    obstacles.push({ id: 'h-tower-ne', minX: 17, maxX: 21, minZ: -27, maxZ: -23, height: 7.8, kind: 'tower' });

    // Distant Freighter Hull silhouette moored offshore
    const shipHull = new THREE.Mesh(new THREE.BoxGeometry(64, 7.5, 14), navyContMat);
    shipHull.position.set(-18, 2.8, -62);
    const shipBridge = new THREE.Mesh(new THREE.BoxGeometry(12, 11, 11), concreteMat);
    shipBridge.position.set(6, 10.5, -62);
    mapRoot.add(shipHull, shipBridge);

    // Warm Harbor Dock Floodlight
    const dockLight = new THREE.PointLight(0xffb454, 14, 34, 1.5);
    dockLight.position.set(0, 10, -4);
    mapRoot.add(dockLight);

    // Cast-iron mooring bollards along north & east pier edge (merged into trimSteelMat)
    const bollardBaseGeo = new THREE.CylinderGeometry(0.28, 0.34, 0.14, 10);
    const bollardStemGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.56, 10);
    const bollardHornGeo = new THREE.BoxGeometry(0.48, 0.1, 0.12);
    const addBollard = (bx: number, bz: number) => {
      addMergedPart(trimSteelMat, bollardBaseGeo, bx, 0.095, bz);
      addMergedPart(trimSteelMat, bollardStemGeo, bx, 0.405, bz, 0, 0, 0, 1, 1, 1, true);
      addMergedPart(trimSteelMat, bollardHornGeo, bx, 0.605, bz);
    };
    for (const bx of [-28, -16, -4, 8, 20, 31]) {
      addBollard(bx, -33.6);
    }
    for (const bz of [-22, -8, 6, 20]) {
      addBollard(33.6, bz);
    }
    bollardBaseGeo.dispose();
    bollardStemGeo.dispose();
    bollardHornGeo.dispose();

    addPerimeterWall(metalPlateMat);
    addBarrels([
      ['hb-1', -7.2, 2.5],
      ['hb-2', 7.4, 2.5],
      ['hb-3', 0, -9.5],
      ['hb-4', -16.5, -5.0],
      ['hb-5', 16.5, -5.0],
    ]);

    return {
      mapId,
      mapRoot,
      arenaHalfExtent,
      obstacles,
      raycastMeshes,
      barrels,
      enemySpawnPoints: [
        { x: -24, y: 0, z: -26 },
        { x: 24, y: 0, z: -26 },
        { x: 0, y: 0, z: -29 },
        { x: -27, y: 0, z: 6 },
        { x: 27, y: 0, z: 6 },
        { x: -18, y: 0, z: -22 },
        { x: 19, y: 4.8, z: -25, preferSniper: true },
      ],
      playerSpawn: { x: 0, z: 23, yaw: 0 },
      rotatingProps,
      vanguardSpawns: [
        { x: -2.4, y: 0, z: 6.5, archetype: 'rifleman' },
        { x: 3.1, y: 0, z: 4.5, archetype: 'rusher' },
      ],
      lighting: {
        sunElevationDeg: 14,
        sunAzimuthDeg: 112,
        sunColor: 0xffc68a,
        sunIntensity: 1.55,
        hemiSky: 0x5c7fa8,
        hemiGround: 0x3b352e,
        hemiIntensity: 0.42,
        rimColor: 0x67a3e6,
        rimIntensity: 0.4,
        fogColor: 0x738496,
        fogDensity: 0.0044,
        skyTurbidity: 4.5,
        skyRayleigh: 1.6,
        skyMie: 0.004,
        skyMieG: 0.78,
        cloudCoverage: 0.48,
        cloudDensity: 0.45,
        exposure: 0.92,
        envIntensity: 0.45,
      },
      dispose: freezeAndCreateDispose(),
    };
  }

  // =========================================================================
  // MAP 3: BLACKOUT QUARRY (Moonlit High-Altitude Tactical Radar Outpost)
  // =========================================================================
  if (mapId === 'quarry') {
    const quarryFloorMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.quarryRockMap,
      normalMap: textures.quarryRockNormal,
      normalScale: new THREE.Vector2(1.2, 1.2),
      roughness: 0.92,
      metalness: 0.06,
    });
    const baseGround = new THREE.Mesh(new THREE.PlaneGeometry(280, 280), quarryFloorMat);
    baseGround.rotation.x = -Math.PI / 2;
    baseGround.receiveShadow = true;
    mapRoot.add(baseGround);
    raycastMeshes.push(baseGround);

    addCourtyardFloor(0.72, 0xcbd5e1);

    // Central Rotating Tactical Radar Outpost Landmark
    const radar = buildRadarArray(textures);
    radar.group.position.set(0, 0.02, -8);
    mapRoot.add(radar.group);
    rotatingProps.push(radar.dishPivot);
    radar.group.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) raycastMeshes.push(c);
    });
    obstacles.push({ id: 'q-radar', minX: -3.5, maxX: 3.5, minZ: -11.5, maxZ: -4.5, height: 6.5, kind: 'building' });

    // Armored Bunkers & Tactical Cover
    addObstacleBox('q-bunk-w', -15, -4, 4.2, 2.7, 7.2, 'building', metalPlateMat, true);
    addObstacleBox('q-bunk-e', 15, -4, 4.2, 2.7, 7.2, 'building', metalPlateMat, true);
    addObstacleBox('q-cont-nw', -16, -20, 6.8, 2.9, 3.0, 'container', navyContMat, true);
    addObstacleBox('q-cont-ne', 16, -20, 6.8, 2.9, 3.0, 'container', oliveContMat, true);

    addJerseyBarrier('q-bar-1', -6.8, 7.5, 4.4);
    addJerseyBarrier('q-bar-2', 6.8, 7.5, 4.4);
    addJerseyBarrier('q-bar-3', -9.2, -13.5, 3.8);
    addJerseyBarrier('q-bar-4', 9.2, -13.5, 3.8);
    addSandbagBunker('q-sb-1', 0, 13.5, 4.4);
    addObstacleBox('q-crate-1', -6.5, 1.5, 1.8, 1.45, 1.8, 'crate', crateMat);
    addObstacleBox('q-crate-2', 6.5, 1.5, 1.8, 1.45, 1.8, 'crate', crateMat);

    // Armored MRAP on East Approach
    const mrap = buildArmoredMrap(textures);
    mrap.position.set(11.5, 0.02, 10.5);
    mrap.rotation.y = -0.45;
    mapRoot.add(mrap);
    mrap.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) raycastMeshes.push(c);
    });
    obstacles.push({ id: 'q-mrap', minX: 9.7, maxX: 13.3, minZ: 7.6, maxZ: 13.4, height: 2.6, kind: 'vehicle' });

    // Twin Quarry Sniper Watchtowers
    const towerNW = buildWatchtower(textures);
    towerNW.position.set(-22, 0.02, -23);
    mapRoot.add(towerNW);
    towerNW.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) raycastMeshes.push(c);
    });
    obstacles.push({ id: 'q-tower-nw', minX: -24, maxX: -20, minZ: -25, maxZ: -21, height: 7.8, kind: 'tower' });

    const towerNE = buildWatchtower(textures);
    towerNE.position.set(22, 0.02, -23);
    mapRoot.add(towerNE);
    towerNE.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) raycastMeshes.push(c);
    });
    obstacles.push({ id: 'q-tower-ne', minX: 20, maxX: 24, minZ: -25, maxZ: -21, height: 7.8, kind: 'tower' });

    // Tactical Perimeter Tripod Floodlights (physical rigs + colored night-ops lighting)
    const addFloodlightRig = (fx: number, fz: number, yaw: number, glowHex: number) => {
      const rig = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 3.6, 8), trimSteelMat);
      pole.position.y = 1.8;
      pole.castShadow = true;
      const crossArm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.1), trimSteelMat);
      crossArm.position.y = 3.55;
      const headMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: glowHex,
        emissiveIntensity: 2.2,
        roughness: 0.2,
      });
      for (const s of [-0.28, 0.28]) {
        const housing = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.24, 0.2), trimSteelMat);
        housing.position.set(s, 3.72, 0);
        housing.rotation.x = 0.35;
        const lens = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.18, 0.04), headMat);
        lens.position.set(s, 3.7, 0.1);
        lens.rotation.x = 0.35;
        rig.add(housing, lens);
      }
      for (let k = 0; k < 3; k++) {
        const a = (k * Math.PI * 2) / 3;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.15, 6), trimSteelMat);
        leg.position.set(Math.cos(a) * 0.36, 0.48, Math.sin(a) * 0.36);
        leg.rotation.set(Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55);
        rig.add(leg);
      }
      rig.position.set(fx, 0.025, fz);
      rig.rotation.y = yaw;
      rig.add(pole, crossArm);
      mapRoot.add(rig);
    };

    addFloodlightRig(-11.8, 2.2, 0.85, 0x60a5fa);
    addFloodlightRig(11.8, -11.5, -2.35, 0xf59e0b);

    const keyBeaconL = new THREE.PointLight(0x60a5fa, 22, 40, 1.35);
    keyBeaconL.position.set(-10.5, 5.2, 2.2);
    const keyBeaconR = new THREE.PointLight(0xf59e0b, 20, 40, 1.35);
    keyBeaconR.position.set(10.5, 5.2, -11.5);
    const radarAccentLight = new THREE.PointLight(0x38bdf8, 12, 22, 1.5);
    radarAccentLight.position.set(0, 6.2, -8);
    mapRoot.add(keyBeaconL, keyBeaconR, radarAccentLight);

    addPerimeterWall(metalPlateMat);
    const cliffMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.quarryRockMap,
      normalMap: textures.quarryRockNormal,
      normalScale: new THREE.Vector2(1.5, 1.5),
      roughness: 0.9,
      metalness: 0.06,
      flatShading: true,
    });
    addMesaRing(cliffMat, 0x526075, 14);

    addBarrels([
      ['qb-1', -4.8, 3.2],
      ['qb-2', 4.8, 3.2],
      ['qb-3', -9.0, -5.0],
      ['qb-4', 9.0, -5.0],
      ['qb-5', 0, -17.5],
    ]);

    return {
      mapId,
      mapRoot,
      arenaHalfExtent,
      obstacles,
      raycastMeshes,
      barrels,
      enemySpawnPoints: [
        { x: -24, y: 0, z: -26 },
        { x: 24, y: 0, z: -26 },
        { x: 0, y: 0, z: -29 },
        { x: -27, y: 0, z: -4 },
        { x: 27, y: 0, z: -4 },
        { x: -25, y: 0, z: 14 },
        { x: 22, y: 4.8, z: -23, preferSniper: true },
        { x: -22, y: 4.8, z: -23, preferSniper: true },
      ],
      playerSpawn: { x: 0, z: 23, yaw: 0 },
      rotatingProps,
      vanguardSpawns: [
        { x: -3.6, y: 0, z: 6.2, archetype: 'rifleman' },
        { x: 3.4, y: 0, z: 5.5, archetype: 'rusher' },
      ],
      lighting: {
        sunElevationDeg: 1.8,
        sunAzimuthDeg: 210,
        sunColor: 0xbcd8ff,
        sunIntensity: 1.48,
        hemiSky: 0x3b6298,
        hemiGround: 0x1e2633,
        hemiIntensity: 0.68,
        rimColor: 0x38bdf8,
        rimIntensity: 0.58,
        fogColor: 0x162238,
        fogDensity: 0.0046,
        skyTurbidity: 1.6,
        skyRayleigh: 0.42,
        skyMie: 0.0014,
        skyMieG: 0.68,
        cloudCoverage: 0.28,
        cloudDensity: 0.28,
        exposure: 0.96,
        envIntensity: 0.48,
      },
      dispose: freezeAndCreateDispose(),
    };
  }

  // =========================================================================
  // MAP 4: AIM TRAINING GROUND (CS2 / CoD Ballistic Firing Range)
  // =========================================================================
  if (mapId === 'range') {
    const outerDesertMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.desertMap,
      normalMap: textures.desertNormal,
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughness: 0.95,
      metalness: 0.02,
    });
    const outerFloor = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), outerDesertMat);
    outerFloor.rotation.x = -Math.PI / 2;
    outerFloor.receiveShadow = true;
    mapRoot.add(outerFloor);
    raycastMeshes.push(outerFloor);

    // Ballistic concrete shooting range deck (70m wide x 72m deep)
    const rangeDeckMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.rangeLaneMap,
      normalMap: textures.concreteNormal,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughness: 0.78,
      metalness: 0.08,
    });
    const rangeDeck = new THREE.Mesh(new THREE.PlaneGeometry(70, 72), rangeDeckMat);
    rangeDeck.rotation.x = -Math.PI / 2;
    rangeDeck.position.set(0, 0.025, 0);
    rangeDeck.receiveShadow = true;
    mapRoot.add(rangeDeck);
    raycastMeshes.push(rangeDeck);

    // Yellow/Black hazard firing line at z = 16 (Player spawns at z = 22 facing North -Z)
    const firingLine = new THREE.Mesh(new THREE.PlaneGeometry(56, 0.9), barrierHazardMat);
    firingLine.rotation.x = -Math.PI / 2;
    firingLine.position.set(0, 0.036, 16);
    mapRoot.add(firingLine);

    // Flanking Shooting Bay Benches (left/right of shooter bay so center lane stays wide open)
    addObstacleBox('range-bench-w', -6.8, 17.8, 3.6, 0.96, 1.3, 'crate', crateMat);
    addObstacleBox('range-bench-e', 6.8, 17.8, 3.6, 0.96, 1.3, 'crate', crateMat);

    // Distance Lane Strips (10m, 20m, 30m, 45m from z = 16) + Overhead Steel Trusses & Signs
    const laneConfigs: Array<{ z: number; signTex: THREE.CanvasTexture; stripeColor: number }> = [
      { z: 6, signTex: textures.rangeSign10Map, stripeColor: 0x22c55e },
      { z: -4, signTex: textures.rangeSign20Map, stripeColor: 0xf59e0b },
      { z: -14, signTex: textures.rangeSign30Map, stripeColor: 0xf97316 },
      { z: -29, signTex: textures.rangeSign45Map, stripeColor: 0xef4444 },
    ];
    const postGeo = new THREE.BoxGeometry(0.24, 5.2, 0.24);
    const beamGeo = new THREE.BoxGeometry(56, 0.26, 0.26);
    const signBackGeo = new THREE.BoxGeometry(3.2, 1.55, 0.12);
    const signFaceGeo = new THREE.PlaneGeometry(3.0, 1.4);

    for (const lane of laneConfigs) {
      const stripMat = new THREE.MeshBasicMaterial({ color: lane.stripeColor });
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(54, 0.16), stripMat);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(0, 0.035, lane.z);
      mapRoot.add(strip);

      // Steel gantry posts on flanks + cross-truss overhead
      addMergedPart(trimSteelMat, postGeo, -27.5, 2.6, lane.z, 0, 0, 0, 1, 1, 1, true);
      addMergedPart(trimSteelMat, postGeo, 27.5, 2.6, lane.z, 0, 0, 0, 1, 1, 1, true);
      addMergedPart(trimSteelMat, beamGeo, 0, 5.15, lane.z);

      // Left & Right overhead distance marker signs facing player (+Z)
      const signMat = new THREE.MeshBasicMaterial({ map: lane.signTex });
      for (const sx of [-18, 18]) {
        addMergedPart(trimSteelMat, signBackGeo, sx, 4.4, lane.z);
        const face = new THREE.Mesh(signFaceGeo, signMat);
        face.position.set(sx, 4.4, lane.z + 0.07);
        mapRoot.add(face);
      }
    }
    postGeo.dispose();
    beamGeo.dispose();
    signBackGeo.dispose();

    // Ballistic Backstop Berm at North End (z = -35) + Acoustic Side Baffle Walls
    addObstacleBox('range-backstop', 0, -34.8, 66, 4.8, 2.6, 'building', concreteMat, true);
    addObstacleBox('range-baffle-w', -33.5, -2, 2.2, 3.6, 66, 'building', metalPlateMat, true);
    addObstacleBox('range-baffle-e', 33.5, -2, 2.2, 3.6, 66, 'building', metalPlateMat, true);

    // Mid-Range Shoot-House Peek Crates & Head-Glitch Barriers (clear center lanes + dedicated cover-peek flanks)
    addObstacleBox('range-crate-lw', -11.5, 1.5, 1.9, 1.85, 1.9, 'crate', crateMat);
    addObstacleBox('range-crate-re', 11.5, 1.5, 1.9, 1.85, 1.9, 'crate', crateMat);
    addJerseyBarrier('range-hg-l', -7.2, -5.5, 3.4);
    addJerseyBarrier('range-hg-r', 7.2, -5.5, 3.4);
    addObstacleBox('range-cont-lw', -16.5, -13.5, 2.4, 2.4, 2.6, 'container', oliveContMat, true);
    addObstacleBox('range-cont-re', 16.5, -13.5, 2.4, 2.4, 2.6, 'container', navyContMat, true);
    addSandbagBunker('range-sb-mid', 0, -18.5, 3.6);

    // Explosive training barrels on flanks (respawn automatically in range mode)
    addBarrels([
      ['rb-1', -21.5, 0],
      ['rb-2', 21.5, 0],
      ['rb-3', -21.5, -19],
      ['rb-4', 21.5, -19],
    ]);

    const rangeCliffMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.desertMap,
      normalMap: textures.desertNormal,
      normalScale: new THREE.Vector2(1.2, 1.2),
      roughness: 0.95,
      metalness: 0.02,
      flatShading: true,
    });
    addMesaRing(rangeCliffMat, 0xa17f5d, 9);

    return {
      mapId,
      mapRoot,
      arenaHalfExtent: 31.5,
      obstacles,
      raycastMeshes,
      barrels,
      enemySpawnPoints: [
        // 10m - 20m close & mid flick lanes
        { x: -15, y: 0, z: 5.5 },
        { x: -6.5, y: 0, z: 4.5 },
        { x: 0, y: 0, z: 3.5 },
        { x: 6.5, y: 0, z: 4.5 },
        { x: 15, y: 0, z: 5.5 },
        // 20m - 30m mid lanes & peek cover slots
        { x: -12.5, y: 0, z: -2.0 },
        { x: -3.2, y: 0, z: -6.0 },
        { x: 3.2, y: 0, z: -6.0 },
        { x: 12.5, y: 0, z: -2.0 },
        // 30m - 45m precision & sniper lanes
        { x: -14.0, y: 0, z: -14.0, preferSniper: true },
        { x: -5.5, y: 0, z: -15.0 },
        { x: 5.5, y: 0, z: -15.0 },
        { x: 14.0, y: 0, z: -14.0, preferSniper: true },
        { x: -8.0, y: 0, z: -26.5, preferSniper: true },
        { x: 0, y: 0, z: -27.5, preferSniper: true },
        { x: 8.0, y: 0, z: -26.5, preferSniper: true },
      ],
      playerSpawn: { x: 0, z: 21.5, yaw: 0 },
      rotatingProps,
      vanguardSpawns: [
        { x: -5.5, y: 0, z: 5.0, archetype: 'rifleman' },
        { x: 5.5, y: 0, z: 5.0, archetype: 'rusher' },
      ],
      lighting: {
        sunElevationDeg: 40,
        sunAzimuthDeg: 42,
        sunColor: 0xfff3e0,
        sunIntensity: 1.65,
        hemiSky: 0x94bfe8,
        hemiGround: 0x625648,
        hemiIntensity: 0.48,
        rimColor: 0x8cc0f2,
        rimIntensity: 0.34,
        fogColor: 0xb2c5d6,
        fogDensity: 0.0028,
        skyTurbidity: 2.0,
        skyRayleigh: 0.9,
        skyMie: 0.0018,
        skyMieG: 0.72,
        cloudCoverage: 0.3,
        cloudDensity: 0.3,
        exposure: 0.92,
        envIntensity: 0.44,
      },
      dispose: freezeAndCreateDispose(),
    };
  }

  // =========================================================================
  // MAP 1: FOB IRONCLAD (Default Sunlit Desert Compound)
  // =========================================================================
  const desertGeo = new THREE.PlaneGeometry(280, 280);
  const desertMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.desertMap,
    normalMap: textures.desertNormal,
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughness: 0.94,
    metalness: 0.02,
  });
  const desertFloor = new THREE.Mesh(desertGeo, desertMat);
  desertFloor.rotation.x = -Math.PI / 2;
  desertFloor.position.y = 0;
  desertFloor.receiveShadow = true;
  mapRoot.add(desertFloor);
  raycastMeshes.push(desertFloor);

  addCourtyardFloor(0.88, 0xffffff);

  // Central Helipad Landmark
  const helipadPad = new THREE.Mesh(
    new THREE.CylinderGeometry(6.8, 7.1, 0.08, 28),
    concreteMat,
  );
  helipadPad.position.set(0, 0.06, -4);
  helipadPad.receiveShadow = true;
  mapRoot.add(helipadPad);

  const hBarMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.78,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const helipadRing = new THREE.Mesh(new THREE.RingGeometry(5.3, 5.75, 32), hBarMat);
  helipadRing.rotation.x = -Math.PI / 2;
  helipadRing.position.set(0, 0.11, -4);
  const hLeft = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 3.6), hBarMat);
  hLeft.rotation.x = -Math.PI / 2;
  hLeft.position.set(-1.1, 0.115, -4);
  const hRight = hLeft.clone();
  hRight.position.set(1.1, 0.115, -4);
  const hCross = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.65), hBarMat);
  hCross.rotation.x = -Math.PI / 2;
  hCross.position.set(0, 0.115, -4);
  mapRoot.add(helipadRing, hLeft, hRight, hCross);

  addObstacleBox('cont-nw', -16, -14, 3.0, 2.9, 6.8, 'container', oliveContMat, true);
  addObstacleBox('cont-ne', 16, -12, 6.8, 2.9, 3.0, 'container', tanContMat, true);
  addObstacleBox('cont-sw', -17, 10, 6.8, 2.9, 3.0, 'container', tanContMat, true);
  addObstacleBox('cont-se', 17, 12, 3.0, 2.9, 6.8, 'container', oliveContMat, true);
  addObstacleBox('cont-north', 0, -24, 7.2, 3.1, 3.0, 'container', oliveContMat, true);

  const stackedUpper = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.8, 6.8), tanContMat);
  stackedUpper.position.set(17, 2.9 + 1.42, 12);
  stackedUpper.castShadow = true;
  stackedUpper.receiveShadow = true;
  mapRoot.add(stackedUpper);
  raycastMeshes.push(stackedUpper);

  addJerseyBarrier('barrier-c1', -7.5, 4.5, 4.2);
  addJerseyBarrier('barrier-c2', 7.5, 4.5, 4.2);
  addSandbagBunker('barrier-n1', -8.5, -12, 4.0);
  addSandbagBunker('barrier-n2', 8.5, -12, 4.0);
  addSandbagBunker('barrier-s1', -6.5, 16.5, 3.8);
  addSandbagBunker('barrier-s2', 6.5, 16.5, 3.8);

  addObstacleBox('crate-1', -12.5, -11.5, 1.6, 1.45, 1.6, 'crate', crateMat);
  addObstacleBox('crate-2', 12.2, 9.5, 1.8, 1.4, 1.6, 'crate', crateMat);
  addObstacleBox('crate-3', -4.2, -21, 1.7, 1.35, 1.7, 'crate', crateMat);

  const mrap = buildArmoredMrap(textures);
  mrap.position.set(-10.5, 0.02, -2.5);
  mrap.rotation.y = 0.35;
  mapRoot.add(mrap);
  mrap.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) raycastMeshes.push(c);
  });
  obstacles.push({ id: 'mrap-west', minX: -12.3, maxX: -8.7, minZ: -5.4, maxZ: 0.4, height: 2.6, kind: 'vehicle' });

  const towerNE = buildWatchtower(textures);
  towerNE.position.set(22, 0.02, -22);
  mapRoot.add(towerNE);
  towerNE.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) raycastMeshes.push(c);
  });
  obstacles.push({ id: 'tower-ne', minX: 20, maxX: 24, minZ: -24, maxZ: -20, height: 7.8, kind: 'tower' });

  const towerNW = buildWatchtower(textures);
  towerNW.position.set(-22, 0.02, -22);
  mapRoot.add(towerNW);
  towerNW.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) raycastMeshes.push(c);
  });
  obstacles.push({ id: 'tower-nw', minX: -24, maxX: -20, minZ: -24, maxZ: -20, height: 7.8, kind: 'tower' });

  addPerimeterWall(sandbagMat);

  const cliffMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.desertMap,
    normalMap: textures.desertNormal,
    normalScale: new THREE.Vector2(1.4, 1.4),
    roughness: 0.95,
    metalness: 0.02,
    flatShading: true,
  });
  addMesaRing(cliffMat, 0xa17f5d, 10);

  addBarrels([
    ['barrel-1', -4.5, -6.5],
    ['barrel-2', 5.2, -8.5],
    ['barrel-3', 12.8, -5.0],
    ['barrel-4', -12.0, 6.5],
    ['barrel-5', 2.5, -18.5],
  ]);

  return {
    mapId: 'ironclad',
    mapRoot,
    arenaHalfExtent,
    obstacles,
    raycastMeshes,
    barrels,
    enemySpawnPoints: [
      { x: -24, y: 0, z: -26 },
      { x: 24, y: 0, z: -26 },
      { x: 0, y: 0, z: -29 },
      { x: -27, y: 0, z: -6 },
      { x: 27, y: 0, z: -6 },
      { x: -25, y: 0, z: 14 },
      { x: 25, y: 0, z: 14 },
      { x: 22, y: 4.8, z: -22, preferSniper: true },
      { x: -22, y: 4.8, z: -22, preferSniper: true },
    ],
    playerSpawn: { x: 0, z: 23, yaw: 0 },
    rotatingProps,
    vanguardSpawns: [
      { x: -2.4, y: 0, z: 7.5, archetype: 'rifleman' },
      { x: 2.8, y: 0, z: 5.8, archetype: 'rusher' },
    ],
    lighting: {
      sunElevationDeg: 34,
      sunAzimuthDeg: 138,
      sunColor: 0xfff1db,
      sunIntensity: 1.65,
      hemiSky: 0x8bb6e0,
      hemiGround: 0x6b5640,
      hemiIntensity: 0.44,
      rimColor: 0x7fb0e6,
      rimIntensity: 0.32,
      fogColor: 0xa5b9cc,
      fogDensity: 0.0038,
      skyTurbidity: 2.4,
      skyRayleigh: 0.95,
      skyMie: 0.0022,
      skyMieG: 0.7,
      cloudCoverage: 0.36,
      cloudDensity: 0.35,
      exposure: 0.9,
      envIntensity: 0.42,
    },
    dispose: freezeAndCreateDispose(),
  };
}
