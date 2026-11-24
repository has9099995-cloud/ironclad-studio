import * as THREE from 'three/webgpu';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import type { EnemyArchetype, WeaponId } from './types';
import type { ProceduralTextureSet } from './textures';

export interface WeaponViewModelRig {
  root: THREE.Group;
  muzzlePoint: THREE.Object3D;
  muzzleFlashSprite: THREE.Sprite;
  boltCarrier: THREE.Object3D;
  hipPos: THREE.Vector3;
  adsPos: THREE.Vector3;
}

export interface EnemyRig {
  root: THREE.Group;
  torsoPivot: THREE.Group;
  headPivot: THREE.Group;
  headMesh: THREE.Mesh;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  rotors: THREE.Object3D[];
  muzzleAnchor: THREE.Object3D;
  muzzleFlashSprite: THREE.Sprite | null;
  hitMeshes: THREE.Mesh[];
  materialsToFlash: THREE.MeshStandardMaterial[];
  contactShadow: THREE.Mesh;
}

function createExtrudedProfile(
  points: Array<[number, number]>,
  depth: number,
  bevel = 0.004,
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    shape.lineTo(points[i][0], points[i][1]);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
  });
  geo.center();
  return geo;
}

export function buildWeaponViewModel(
  weapon: WeaponId,
  textures: ProceduralTextureSet,
): WeaponViewModelRig {
  const root = new THREE.Group();

  const gunmetal = new THREE.MeshStandardMaterial({
    color: 0x2a2f36,
    metalness: 0.88,
    roughness: 0.24,
  });
  const darkSteel = new THREE.MeshStandardMaterial({
    color: 0x15181c,
    metalness: 0.85,
    roughness: 0.34,
  });
  const polymer = new THREE.MeshStandardMaterial({
    color: 0x1e2126,
    metalness: 0.08,
    roughness: 0.78,
  });
  const tanPolymer = new THREE.MeshStandardMaterial({
    color: 0x76644c,
    metalness: 0.06,
    roughness: 0.72,
  });
  const brassBolt = new THREE.MeshStandardMaterial({
    color: 0xc29958,
    metalness: 0.92,
    roughness: 0.2,
  });
  const gloveMat = new THREE.MeshStandardMaterial({
    color: 0x35312b,
    normalMap: textures.fabricNormal,
    normalScale: new THREE.Vector2(0.7, 0.7),
    roughness: 0.84,
    metalness: 0.06,
  });
  const sleeveMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.camoWoodlandMap,
    normalMap: textures.fabricNormal,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: 0.88,
    metalness: 0.02,
  });
  const opticGlass = new THREE.MeshPhysicalMaterial({
    color: 0x38bdf8,
    metalness: 0.1,
    roughness: 0.06,
    transparent: true,
    opacity: 0.32,
    clearcoat: 1.0,
  });
  const reticleDotMat = new THREE.MeshBasicMaterial({
    color: 0xff3b30,
  });

  const muzzlePoint = new THREE.Object3D();
  const boltCarrier = new THREE.Group();

  const flashMat = new THREE.SpriteMaterial({
    map: textures.glowSpriteMap,
    color: 0xffc864,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const muzzleFlashSprite = new THREE.Sprite(flashMat);
  muzzleFlashSprite.scale.set(0.32, 0.32, 1);

  if (weapon === 'rifle') {
    // M4A1 Tactical Carbine with beveled receiver, quad-rail, PEQ-15 laser, hollow EOTech, & sculpted arms
    const upperGeo = createExtrudedProfile(
      [
        [-0.026, -0.028],
        [0.026, -0.028],
        [0.028, 0.018],
        [0.018, 0.032],
        [-0.018, 0.032],
        [-0.028, 0.018],
      ],
      0.27,
      0.003,
    );
    const upperReceiver = new THREE.Mesh(upperGeo, gunmetal);
    upperReceiver.position.set(0, 0, 0);

    const lowerReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.048, 0.21), darkSteel);
    lowerReceiver.position.set(0, -0.044, 0.02);

    // Octagonal M-LOK / Quad-Rail Handguard
    const handguard = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.034, 0.25, 8), polymer);
    handguard.rotation.x = Math.PI / 2;
    handguard.position.set(0, 0.002, -0.26);

    // Barrel + Gas Block + Vented Tactical Suppressor
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.34, 14), darkSteel);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.008, -0.47);

    const suppressor = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.13, 16), gunmetal);
    suppressor.rotation.x = Math.PI / 2;
    suppressor.position.set(0, 0.008, -0.63);

    // Side-mounted PEQ-15 Tactical Laser Box
    const peqBox = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.022, 0.078), tanPolymer);
    peqBox.position.set(-0.036, 0.012, -0.31);
    const peqLens = new THREE.Mesh(new THREE.CircleGeometry(0.005, 8), reticleDotMat);
    peqLens.rotation.y = Math.PI;
    peqLens.position.set(-0.036, 0.012, -0.351);

    // Curved PMAG
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.15, 0.06), tanPolymer);
    mag.position.set(0, -0.118, -0.045);
    mag.rotation.x = 0.2;

    const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.019, 0.075, 4, 8), polymer);
    grip.position.set(0, -0.095, 0.088);
    grip.rotation.x = -0.34;

    const foregrip = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.017, 0.085, 12), tanPolymer);
    foregrip.position.set(0, -0.062, -0.26);

    const stockTube = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.22, 12), darkSteel);
    stockTube.rotation.x = Math.PI / 2;
    stockTube.position.set(0, -0.004, 0.21);
    const stockPad = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.092, 0.16), tanPolymer);
    stockPad.position.set(0, -0.024, 0.24);

    // Picatinny top rail ribs
    for (let r = 0; r < 7; r++) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.007, 0.013), darkSteel);
      rib.position.set(0, 0.035, -0.14 - r * 0.032);
      root.add(rib);
    }

    // Front iron sight post
    const frontPost = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.034, 0.016), darkSteel);
    frontPost.position.set(0, 0.045, -0.37);

    // Hollow Holographic EOTech Sight Frame
    const holoBase = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.013, 0.084), darkSteel);
    holoBase.position.set(0, 0.039, -0.03);
    const holoLeftWall = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.044, 0.068), gunmetal);
    holoLeftWall.position.set(-0.02, 0.066, -0.03);
    const holoRightWall = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.044, 0.068), gunmetal);
    holoRightWall.position.set(0.02, 0.066, -0.03);
    const holoTopHood = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.006, 0.068), gunmetal);
    holoTopHood.position.set(0, 0.088, -0.03);

    const holoLens = new THREE.Mesh(new THREE.PlaneGeometry(0.034, 0.036), opticGlass);
    holoLens.position.set(0, 0.066, -0.028);
    const holoDot = new THREE.Mesh(new THREE.CircleGeometry(0.0016, 10), reticleDotMat);
    holoDot.position.set(0, 0.066, -0.027);

    const boltPlate = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.016, 0.056), brassBolt);
    boltPlate.position.set(0.026, 0.004, -0.01);
    boltCarrier.add(boltPlate);

    muzzlePoint.position.set(0, 0.008, -0.71);
    muzzlePoint.add(muzzleFlashSprite);

    // Sculpted gloved hands & sleeves
    const rightHand = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.045, 4, 8), gloveMat);
    rightHand.position.set(0.012, -0.095, 0.09);
    const leftHand = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.055, 4, 8), gloveMat);
    leftHand.rotation.x = Math.PI / 2;
    leftHand.position.set(-0.018, -0.045, -0.25);
    const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.24, 4, 10), sleeveMat);
    leftArm.position.set(-0.12, -0.14, -0.08);
    leftArm.rotation.set(1.18, 0, -0.45);

    root.add(
      upperReceiver,
      lowerReceiver,
      handguard,
      barrel,
      suppressor,
      peqBox,
      peqLens,
      mag,
      grip,
      foregrip,
      stockTube,
      stockPad,
      frontPost,
      holoBase,
      holoLeftWall,
      holoRightWall,
      holoTopHood,
      holoLens,
      holoDot,
      boltCarrier,
      muzzlePoint,
      rightHand,
      leftHand,
      leftArm,
    );

    return {
      root,
      muzzlePoint,
      muzzleFlashSprite,
      boltCarrier,
      hipPos: new THREE.Vector3(0.23, -0.22, -0.42),
      adsPos: new THREE.Vector3(0.0, -0.066, -0.26),
    };
  }

  if (weapon === 'shotgun') {
    const receiverGeo = createExtrudedProfile(
      [
        [-0.027, -0.034],
        [0.027, -0.034],
        [0.027, 0.025],
        [0.018, 0.035],
        [-0.018, 0.035],
        [-0.027, 0.025],
      ],
      0.27,
      0.003,
    );
    const receiver = new THREE.Mesh(receiverGeo, gunmetal);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.017, 0.49, 14), darkSteel);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.018, -0.36);

    const magTube = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.43, 12), gunmetal);
    magTube.rotation.x = Math.PI / 2;
    magTube.position.set(0, -0.014, -0.33);

    const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.19, 10), tanPolymer);
    pump.rotation.x = Math.PI / 2;
    pump.position.set(0, -0.016, -0.28);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.09, 0.25), polymer);
    stock.position.set(0, -0.038, 0.24);
    stock.rotation.x = 0.12;

    const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.019, 0.075, 4, 8), polymer);
    grip.position.set(0, -0.075, 0.11);
    grip.rotation.x = -0.36;

    const ghostRing = new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.003, 8, 16), darkSteel);
    ghostRing.position.set(0, 0.052, 0.06);

    const frontBlade = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.018, 0.014), reticleDotMat);
    frontBlade.position.set(0, 0.042, -0.57);

    // Side-saddle 4-shell holder (12G red hulls + brass rims)
    const shellHullMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.45, metalness: 0.1 });
    for (let s = 0; s < 4; s++) {
      const shHull = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.045, 8), shellHullMat);
      shHull.position.set(-0.031, 0.004, -0.055 + s * 0.024);
      const shBrass = new THREE.Mesh(new THREE.CylinderGeometry(0.0068, 0.0068, 0.014, 8), brassBolt);
      shBrass.position.set(-0.031, -0.022, -0.055 + s * 0.024);
      root.add(shHull, shBrass);
    }

    const boltPlate = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.018, 0.06), brassBolt);
    boltPlate.position.set(0.026, 0.01, -0.02);
    boltCarrier.add(boltPlate);

    muzzlePoint.position.set(0, 0.018, -0.62);
    muzzlePoint.add(muzzleFlashSprite);

    const rightHand = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.045, 4, 8), gloveMat);
    rightHand.position.set(0.01, -0.08, 0.11);
    const leftHand = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.055, 4, 8), gloveMat);
    leftHand.rotation.x = Math.PI / 2;
    leftHand.position.set(-0.018, -0.04, -0.27);
    const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.24, 4, 10), sleeveMat);
    leftArm.position.set(-0.12, -0.14, -0.09);
    leftArm.rotation.set(1.18, 0, -0.45);

    root.add(
      receiver,
      barrel,
      magTube,
      pump,
      stock,
      grip,
      ghostRing,
      frontBlade,
      boltCarrier,
      muzzlePoint,
      rightHand,
      leftHand,
      leftArm,
    );

    return {
      root,
      muzzlePoint,
      muzzleFlashSprite,
      boltCarrier,
      hipPos: new THREE.Vector3(0.24, -0.23, -0.41),
      adsPos: new THREE.Vector3(0.0, -0.052, -0.29),
    };
  }

  if (weapon === 'knife') {
    // Karambit Tactical Combat Knife (Damascus curved claw blade + jimping + G10 grip + retention ring + gloved hand)
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0xdbe4ee,
      map: textures.damascusMap,
      metalness: 0.94,
      roughness: 0.14,
    });
    const edgeMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.96,
      roughness: 0.06,
    });
    const g10Mat = new THREE.MeshStandardMaterial({
      color: 0x202624,
      normalMap: textures.armorPlateNormal,
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughness: 0.82,
      metalness: 0.14,
    });
    const titaniumMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.92,
      roughness: 0.2,
    });

    const knifeGroup = new THREE.Group();
    knifeGroup.rotation.set(0.32, -0.28, -0.18);

    const bladeGeo = createExtrudedProfile(
      [
        [0, 0],
        [0.018, 0.06],
        [0.022, 0.13],
        [0.008, 0.195],
        [-0.024, 0.245],
        [-0.006, 0.17],
        [0.004, 0.1],
        [-0.008, 0.015],
      ],
      0.0055,
      0.0018,
    );
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.rotation.y = Math.PI / 2;
    blade.rotation.x = -0.35;
    blade.position.set(0, 0.11, -0.055);

    const edgeGeo = new THREE.BoxGeometry(0.002, 0.14, 0.006);
    const edgeStrip = new THREE.Mesh(edgeGeo, edgeMat);
    edgeStrip.position.set(0, 0.125, -0.042);
    edgeStrip.rotation.x = -0.22;

    // Spine jimping notches
    for (let j = 0; j < 4; j++) {
      const notch = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.005, 0.005), titaniumMat);
      notch.position.set(0, 0.032 + j * 0.011, -0.006 - j * 0.004);
      knifeGroup.add(notch);
    }

    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.016, 0.042), titaniumMat);
    guard.position.set(0, 0.016, 0.0);

    const handleGeo = createExtrudedProfile(
      [
        [-0.014, -0.068],
        [0.015, -0.068],
        [0.018, 0.0],
        [-0.016, 0.014],
      ],
      0.019,
      0.003,
    );
    const handle = new THREE.Mesh(handleGeo, g10Mat);
    handle.rotation.y = Math.PI / 2;
    handle.position.set(0, -0.042, 0.012);

    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.024, 10), brassBolt);
    pin.rotation.z = Math.PI / 2;
    pin.position.set(0, 0.0, 0.0);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.0045, 10, 20), titaniumMat);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(0, -0.095, 0.025);

    const rightHand = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.055, 6, 10), gloveMat);
    rightHand.position.set(0.006, -0.045, 0.015);
    const rightThumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.013, 0.032, 4, 8), gloveMat);
    rightThumb.position.set(-0.016, -0.005, -0.006);
    rightThumb.rotation.x = -0.45;
    const rightForearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.25, 6, 10), sleeveMat);
    rightForearm.position.set(0.05, -0.17, 0.14);
    rightForearm.rotation.set(1.02, 0, 0.28);

    knifeGroup.add(blade, edgeStrip, guard, handle, pin, ring, rightHand, rightThumb, rightForearm);
    root.add(knifeGroup);

    muzzlePoint.position.set(0, 0.12, -0.2);

    return {
      root,
      muzzlePoint,
      muzzleFlashSprite,
      boltCarrier,
      hipPos: new THREE.Vector3(0.22, -0.18, -0.34),
      adsPos: new THREE.Vector3(0.11, -0.14, -0.3),
    };
  }

  // MK14 Marksman DMR Sniper (bipod, elevation turrets, cheek riser, & gloved hands)
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.062, 0.34), tanPolymer);
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.054, 0.24), gunmetal);
  receiver.position.set(0, 0.02, -0.03);

  const flutedBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.014, 0.56, 14), darkSteel);
  flutedBarrel.rotation.x = Math.PI / 2;
  flutedBarrel.position.set(0, 0.022, -0.44);

  const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.07, 10), gunmetal);
  muzzleBrake.rotation.x = Math.PI / 2;
  muzzleBrake.position.set(0, 0.022, -0.73);

  // Folded tactical bipod legs under forend
  const bipodBlock = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.024, 0.042), darkSteel);
  bipodBlock.position.set(0, -0.036, -0.24);
  const bipodLegL = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.16, 8), darkSteel);
  bipodLegL.rotation.x = Math.PI / 2;
  bipodLegL.position.set(-0.028, -0.044, -0.31);
  const bipodLegR = bipodLegL.clone();
  bipodLegR.position.x = 0.028;

  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.12, 0.068), darkSteel);
  mag.position.set(0, -0.086, -0.06);

  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.086, 0.24), polymer);
  stock.position.set(0, -0.015, 0.26);
  const cheekRiser = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.026, 0.12), tanPolymer);
  cheekRiser.position.set(0, 0.032, 0.24);

  const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.26, 16), darkSteel);
  scopeTube.rotation.x = Math.PI / 2;
  scopeTube.position.set(0, 0.075, -0.05);
  const scopeBell = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.02, 0.07, 16), gunmetal);
  scopeBell.rotation.x = Math.PI / 2;
  scopeBell.position.set(0, 0.075, -0.19);
  const topTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.024, 12), gunmetal);
  topTurret.position.set(0, 0.098, -0.05);
  const sideTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.022, 12), gunmetal);
  sideTurret.rotation.z = Math.PI / 2;
  sideTurret.position.set(-0.026, 0.075, -0.05);
  const scopeLens = new THREE.Mesh(new THREE.CircleGeometry(0.019, 16), opticGlass);
  scopeLens.position.set(0, 0.075, 0.081);
  const reticleCross = new THREE.Mesh(new THREE.CircleGeometry(0.002, 8), reticleDotMat);
  reticleCross.position.set(0, 0.075, 0.08);

  const boltPlate = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.016, 0.056), brassBolt);
  boltPlate.position.set(0.026, 0.02, -0.03);
  boltCarrier.add(boltPlate);

  muzzlePoint.position.set(0, 0.022, -0.78);
  muzzlePoint.add(muzzleFlashSprite);

  const leftHand = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.055, 4, 8), gloveMat);
  leftHand.rotation.x = Math.PI / 2;
  leftHand.position.set(-0.018, -0.042, -0.16);
  const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.24, 4, 10), sleeveMat);
  leftArm.position.set(-0.12, -0.14, -0.01);
  leftArm.rotation.set(1.18, 0, -0.45);

  root.add(
    chassis,
    receiver,
    flutedBarrel,
    muzzleBrake,
    bipodBlock,
    bipodLegL,
    bipodLegR,
    mag,
    stock,
    cheekRiser,
    scopeTube,
    scopeBell,
    topTurret,
    sideTurret,
    scopeLens,
    reticleCross,
    boltCarrier,
    muzzlePoint,
    leftHand,
    leftArm,
  );

  return {
    root,
    muzzlePoint,
    muzzleFlashSprite,
    boltCarrier,
    hipPos: new THREE.Vector3(0.24, -0.23, -0.44),
    adsPos: new THREE.Vector3(0.0, -0.075, -0.24),
  };
}

function prepGeoForMerge(
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
): THREE.BufferGeometry {
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
  return g;
}

function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = BufferGeometryUtils.mergeGeometries(parts, false);
  for (let i = 0; i < parts.length; i++) {
    parts[i].dispose();
  }
  return merged;
}

function createSculptedTorsoGeo(): THREE.BufferGeometry {
  // Athletic tactical operator V-taper: trim waist -> obliques -> broad chest/lats -> traps
  const profile = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.175, 0.0),
    new THREE.Vector2(0.178, 0.09),
    new THREE.Vector2(0.198, 0.22),
    new THREE.Vector2(0.232, 0.36),
    new THREE.Vector2(0.248, 0.49),
    new THREE.Vector2(0.215, 0.56),
    new THREE.Vector2(0.105, 0.605),
    new THREE.Vector2(0.0, 0.615),
  ];
  const lathe = new THREE.LatheGeometry(profile, 16);
  lathe.scale(1.16, 1.0, 0.8);
  return lathe;
}

function createSculptedLegGeo(side: -1 | 1): THREE.BufferGeometry {
  // Muscular quad -> articulated knee -> gastrocnemius calf -> bloused Crye pant cuff
  const profile = [
    new THREE.Vector2(0.0, -0.75),
    new THREE.Vector2(0.08, -0.74), // bloused cuff over boot
    new THREE.Vector2(0.088, -0.58), // calf swell
    new THREE.Vector2(0.082, -0.44), // knee
    new THREE.Vector2(0.104, -0.26), // muscular thigh
    new THREE.Vector2(0.116, -0.1),
    new THREE.Vector2(0.106, 0.0),
    new THREE.Vector2(0.0, 0.0),
  ];
  const leg = new THREE.LatheGeometry(profile, 14);
  const cargo = new THREE.BoxGeometry(0.044, 0.165, 0.13);
  const calfPocket = new THREE.BoxGeometry(0.032, 0.11, 0.09);
  const parts = [
    prepGeoForMerge(leg, 0, 0, 0, 0, 0, 0, 1.0, 1.0, 1.05),
    prepGeoForMerge(cargo, side * 0.102, -0.24, -0.005, 0, 0, side * -0.04),
    prepGeoForMerge(calfPocket, side * 0.084, -0.57, 0.005, 0, 0, side * -0.02),
  ];
  leg.dispose();
  cargo.dispose();
  calfPocket.dispose();
  return mergeParts(parts);
}

function createBootGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const shaft = new THREE.CylinderGeometry(0.074, 0.084, 0.165, 12);
  const foot = new THREE.CapsuleGeometry(0.072, 0.13, 5, 12);
  const toeCap = new THREE.SphereGeometry(0.074, 10, 8);
  const heel = new THREE.BoxGeometry(0.148, 0.046, 0.115);
  const sole = new THREE.BoxGeometry(0.16, 0.034, 0.285);
  parts.push(
    prepGeoForMerge(shaft, 0, -0.77, 0.008),
    prepGeoForMerge(foot, 0, -0.822, 0.08, Math.PI / 2, 0, 0, 1.02, 1.0, 0.84),
    prepGeoForMerge(toeCap, 0, -0.828, 0.145, 0, 0, 0, 0.96, 0.72, 1.05),
    prepGeoForMerge(heel, 0, -0.855, -0.022),
    prepGeoForMerge(sole, 0, -0.869, 0.052),
  );
  shaft.dispose();
  foot.dispose();
  toeCap.dispose();
  heel.dispose();
  sole.dispose();
  return mergeParts(parts);
}

function applyFrontCylindricalHeadUVs(geo: THREE.BufferGeometry, minY: number, maxY: number) {
  const pos = geo.attributes.position;
  const uvs = new Float32Array(pos.count * 2);
  const invSpanY = 1 / Math.max(0.001, maxY - minY);
  const twoPi = Math.PI * 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const u = 0.5 + Math.atan2(x, z) / twoPi;
    const v = Math.max(0, Math.min(1, (y - minY) * invSpanY));
    uvs[i * 2] = u;
    uvs[i * 2 + 1] = v;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
}

function createSculptedHeadGeo(): THREE.BufferGeometry {
  // Built in headPivot space (origin at neck base y=0 -> crown y=0.275)
  const profile = [
    new THREE.Vector2(0.0, -0.025),
    new THREE.Vector2(0.084, -0.015), // neck base inside collar
    new THREE.Vector2(0.075, 0.048), // neck mid
    new THREE.Vector2(0.104, 0.082), // jawline/chin
    new THREE.Vector2(0.128, 0.132), // cheekbones
    new THREE.Vector2(0.136, 0.182), // brow ridge
    new THREE.Vector2(0.125, 0.242), // cranium
    new THREE.Vector2(0.0, 0.272), // crown
  ];
  const skull = new THREE.LatheGeometry(profile, 18);
  const nose = new THREE.BoxGeometry(0.032, 0.048, 0.042);
  const jawContour = new THREE.CylinderGeometry(0.112, 0.096, 0.072, 14, 1, false, -0.75, 1.5);
  const parts = [
    prepGeoForMerge(skull, 0, 0, 0, 0, 0, 0, 0.94, 1.0, 1.05),
    prepGeoForMerge(nose, 0, 0.152, 0.132, -0.22),
    prepGeoForMerge(jawContour, 0, 0.088, 0.024),
  ];
  skull.dispose();
  nose.dispose();
  jawContour.dispose();
  const merged = mergeParts(parts);
  applyFrontCylindricalHeadUVs(merged, -0.025, 0.272);
  return merged;
}

function createLimbMeshGeo(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  rA: number,
  rB: number,
): THREE.BufferGeometry {
  const pa = new THREE.Vector3(ax, ay, az);
  const pb = new THREE.Vector3(bx, by, bz);
  const delta = new THREE.Vector3().subVectors(pb, pa);
  const len = delta.length();
  const mid = new THREE.Vector3().copy(pa).addScaledVector(delta, 0.5);
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().divideScalar(len));
  const cyl = new THREE.CylinderGeometry(rB, rA, len, 12);
  const g = cyl.toNonIndexed();
  const mat = new THREE.Matrix4().compose(mid, quat, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(mat);
  cyl.dispose();
  return g;
}

interface SharedEnemyAssets {
  soldierShadowGeo: THREE.BufferGeometry;
  droneShadowGeo: THREE.BufferGeometry;
  shadowMat: THREE.MeshBasicMaterial;
  // Shared static materials
  bootMat: THREE.MeshStandardMaterial;
  brassAccentMat: THREE.MeshStandardMaterial;
  gunMat: THREE.MeshStandardMaterial;
  droneOpticMat: THREE.MeshStandardMaterial;
  droneThrusterGlowMat: THREE.MeshStandardMaterial;
  droneNavGreenMat: THREE.MeshStandardMaterial;
  // Archetype-specific non-flashing materials
  vestMats: Record<'rifleman' | 'rusher' | 'sniper', THREE.MeshStandardMaterial>;
  visorMats: Record<'rifleman' | 'rusher' | 'sniper', THREE.MeshPhysicalMaterial>;
  skinMats: Record<'rifleman' | 'rusher' | 'sniper', THREE.MeshStandardMaterial>;
  // Archetype base templates for fast clone() of flashable materials
  fatiguesTemplates: Record<'rifleman' | 'rusher' | 'sniper', THREE.MeshStandardMaterial>;
  armorTemplates: Record<'rifleman' | 'rusher' | 'sniper', THREE.MeshStandardMaterial>;
  helmetTemplates: Record<'rifleman' | 'rusher' | 'sniper', THREE.MeshStandardMaterial>;
  droneHullTemplate: THREE.MeshStandardMaterial;
  droneAccentTemplate: THREE.MeshStandardMaterial;
  // Drone shared merged geometries
  droneHullGeo: THREE.BufferGeometry;
  droneAccentGeo: THREE.BufferGeometry;
  droneVentGeo: THREE.BufferGeometry;
  droneHeadGeo: THREE.BufferGeometry;
  droneBladeGeo: THREE.BufferGeometry;
  droneNavStrobeGeo: THREE.BufferGeometry;
  // Soldier shared merged geometries
  leftLegFatiguesGeo: THREE.BufferGeometry;
  rightLegFatiguesGeo: THREE.BufferGeometry;
  leftLegGearGeo: THREE.BufferGeometry;
  rightLegGearGeo: THREE.BufferGeometry;
  bootGeo: THREE.BufferGeometry;
  torsoFatiguesGeos: Record<'rifleman' | 'rusher' | 'sniper', THREE.BufferGeometry>;
  torsoArmorGeos: Record<'rifleman' | 'rusher' | 'sniper', THREE.BufferGeometry>;
  torsoVestGeos: Record<'rifleman' | 'rusher' | 'sniper', THREE.BufferGeometry>;
  torsoTrimGeo: THREE.BufferGeometry;
  headGeo: THREE.BufferGeometry;
  helmetGeos: Record<'rifleman' | 'rusher' | 'sniper', THREE.BufferGeometry>;
  headGearGeos: Record<'rifleman' | 'rusher' | 'sniper', THREE.BufferGeometry>;
  headVisorGeos: Record<'rifleman' | 'rusher' | 'sniper', THREE.BufferGeometry>;
  leftArmFatiguesGeo: THREE.BufferGeometry;
  leftArmGearGeo: THREE.BufferGeometry;
  rightArmFatiguesGeo: THREE.BufferGeometry;
  rightArmGearGeo: THREE.BufferGeometry;
  gunMetalGeos: Record<'rifleman' | 'rusher' | 'sniper', THREE.BufferGeometry>;
  gunFurnitureGeos: Record<'rifleman' | 'rusher' | 'sniper', THREE.BufferGeometry>;
  enemyFlashMatTemplate: THREE.SpriteMaterial;
}

const enemyAssetCache = new WeakMap<ProceduralTextureSet, SharedEnemyAssets>();

const SOLDIER_PALETTES = {
  rifleman: {
    // Task Force 141 / US Rangers MultiCam + Coyote Tan Crye JPC Plate Carrier
    camoKey: 'camoWoodlandMap' as const,
    faceKey: 'operatorFaceMap' as const,
    fatiguesTint: 0xf4f0e4,
    armor: 0xb2966e, // Crisp Coyote Tan SAPI carrier
    vest: 0x56503f, // Ranger/Coyote cordura webbing & pack
    helmet: 0x736850, // Matte Ops-Core Coyote/OD shell
    visor: 0x223646, // Smoked Oakley ballistic lens
    visorEmissive: 0x0c1a26,
    skin: 0xffffff,
  },
  rusher: {
    // Shadow Company / Konni Heavy Breacher (Wolf-Grey Urban Camo + Slate Armor + Crimson Visor)
    camoKey: 'camoUrbanMap' as const,
    faceKey: 'operatorFaceMap' as const,
    fatiguesTint: 0xe6ecf4,
    armor: 0x545d6b, // Crisp matte ballistic slate-grey carrier & pauldrons
    vest: 0x2c313a, // Tactical charcoal nylon rig
    helmet: 0x3b424e, // Matte slate Ops-Core + Mandible
    visor: 0x5c2024, // Tinted crimson-smoke ballistic shield
    visorEmissive: 0x260a0d,
    skin: 0xffffff,
  },
  sniper: {
    // Ghost / Recon Marksman (Arid MultiCam + Ranger Green Ghillie + Skull Balaclava)
    camoKey: 'camoDesertMap' as const,
    faceKey: 'ghostFaceMap' as const,
    fatiguesTint: 0xf6f0de,
    armor: 0x626b4f, // Ranger green Crye carrier + scrim
    vest: 0x4f4837, // Desert-olive recon webbing
    helmet: 0x555142, // Matte coyote-olive helmet + quad NVGs
    visor: 0x232e22, // Tactical smoked lens
    visorEmissive: 0x0d170c,
    skin: 0xffffff,
  },
};

function getSharedEnemyAssets(textures: ProceduralTextureSet): SharedEnemyAssets {
  const cached = enemyAssetCache.get(textures);
  if (cached) return cached;

  const makeSoldierMats = (arch: 'rifleman' | 'rusher' | 'sniper') => {
    const p = SOLDIER_PALETTES[arch];
    return {
      fatigues: new THREE.MeshStandardMaterial({
        color: p.fatiguesTint,
        map: textures[p.camoKey],
        normalMap: textures.fabricNormal,
        normalScale: new THREE.Vector2(0.9, 0.9),
        roughness: 0.86,
        metalness: 0.04,
      }),
      armor: new THREE.MeshStandardMaterial({
        color: p.armor,
        map: textures.molleVestMap,
        normalMap: textures.armorPlateNormal,
        normalScale: new THREE.Vector2(0.85, 0.85),
        roughness: 0.62,
        metalness: 0.14,
      }),
      vest: new THREE.MeshStandardMaterial({
        color: p.vest,
        map: textures.molleVestMap,
        normalMap: textures.fabricNormal,
        normalScale: new THREE.Vector2(0.85, 0.85),
        roughness: 0.78,
        metalness: 0.08,
      }),
      helmet: new THREE.MeshStandardMaterial({
        color: p.helmet,
        normalMap: textures.armorPlateNormal,
        normalScale: new THREE.Vector2(0.5, 0.5),
        roughness: 0.48,
        metalness: 0.28,
      }),
      visor: new THREE.MeshPhysicalMaterial({
        color: p.visor,
        emissive: p.visorEmissive,
        emissiveIntensity: 0.25,
        roughness: 0.08,
        metalness: 0.35,
        clearcoat: 1.0,
        clearcoatRoughness: 0.06,
      }),
      skin: new THREE.MeshStandardMaterial({
        color: p.skin,
        map: textures[p.faceKey],
        normalMap: textures.fabricNormal,
        normalScale: new THREE.Vector2(0.45, 0.45),
        roughness: 0.84,
        metalness: 0.03,
      }),
    };
  };

  const rm = makeSoldierMats('rifleman');
  const rum = makeSoldierMats('rusher');
  const sm = makeSoldierMats('sniper');

  // --- Pre-merge Drone Geometries ---
  const droneFuselageGeo = createExtrudedProfile(
    [
      [-0.38, -0.14],
      [0.38, -0.14],
      [0.46, 0.04],
      [0.24, 0.2],
      [-0.24, 0.2],
      [-0.46, 0.04],
    ],
    0.92,
    0.03,
  );
  const droneTopSensorGeo = new THREE.CylinderGeometry(0.22, 0.34, 0.16, 10);
  const droneEyeHoodGeo = new THREE.BoxGeometry(0.32, 0.12, 0.22);
  const droneChuteGeo = new THREE.BoxGeometry(0.18, 0.07, 0.12);
  const dronePodHousingGeo = new THREE.CylinderGeometry(0.065, 0.075, 0.24, 10);
  const droneBarrelGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.56, 8);
  const droneShroudGeo = new THREE.TorusGeometry(0.34, 0.044, 8, 20);
  droneShroudGeo.rotateX(Math.PI / 2);
  const droneArmGeo = new THREE.CylinderGeometry(0.044, 0.056, 0.68, 8);
  const droneCowlingGeo = new THREE.BoxGeometry(0.46, 0.12, 0.62);
  const droneSensorRingGeo = new THREE.TorusGeometry(0.18, 0.025, 8, 16);
  const droneAmmoDrumGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.28, 12);
  const droneMuzzleCrownGeo = new THREE.TorusGeometry(0.036, 0.01, 6, 12);
  const dronePodGeo = new THREE.CylinderGeometry(0.1, 0.12, 0.16, 10);

  const armOffsets = [
    [-0.7, 0.06, -0.62],
    [0.7, 0.06, -0.62],
    [-0.7, 0.06, 0.62],
    [0.7, 0.06, 0.62],
  ];

  const droneHullParts: THREE.BufferGeometry[] = [
    prepGeoForMerge(droneFuselageGeo),
    prepGeoForMerge(droneTopSensorGeo, 0, 0.28, 0.05),
    prepGeoForMerge(droneEyeHoodGeo, 0, 0.08, 0.45),
    prepGeoForMerge(droneChuteGeo, -0.16, -0.2, 0.06),
    prepGeoForMerge(droneChuteGeo, 0.16, -0.2, 0.06),
  ];
  const droneAccentParts: THREE.BufferGeometry[] = [
    prepGeoForMerge(droneCowlingGeo, 0, 0.21, -0.04),
    prepGeoForMerge(droneSensorRingGeo, 0, 0.36, 0.05, Math.PI / 2),
    prepGeoForMerge(droneAmmoDrumGeo, 0, -0.22, 0.04, 0, 0, Math.PI / 2),
  ];
  for (const side of [-1, 1]) {
    droneHullParts.push(prepGeoForMerge(dronePodHousingGeo, side * 0.3, -0.22, 0.06, Math.PI / 2));
    for (let b = 0; b < 3; b++) {
      const ang = (b / 3) * Math.PI * 2;
      droneHullParts.push(
        prepGeoForMerge(
          droneBarrelGeo,
          side * 0.3 + Math.cos(ang) * 0.028,
          -0.22 + Math.sin(ang) * 0.028,
          0.34,
          Math.PI / 2,
        ),
      );
    }
    droneAccentParts.push(prepGeoForMerge(droneMuzzleCrownGeo, side * 0.3, -0.22, 0.56));
  }
  const tmpDummy = new THREE.Object3D();
  for (const [ax, ay, az] of armOffsets) {
    tmpDummy.position.set(ax * 0.52, ay, az * 0.52);
    tmpDummy.lookAt(ax, ay, az);
    tmpDummy.rotateX(Math.PI / 2);
    tmpDummy.updateMatrix();
    const gArm = prepGeoForMerge(droneArmGeo);
    gArm.applyMatrix4(tmpDummy.matrix);
    droneHullParts.push(gArm);
    droneHullParts.push(prepGeoForMerge(droneShroudGeo, ax, ay + 0.05, az));
    droneAccentParts.push(prepGeoForMerge(dronePodGeo, ax, ay, az));
  }
  const droneHullGeo = mergeParts(droneHullParts);
  const droneAccentGeo = mergeParts(droneAccentParts);
  const droneBladeAGeo = new THREE.BoxGeometry(0.58, 0.014, 0.055);
  const droneBladeBGeo = new THREE.BoxGeometry(0.055, 0.014, 0.58);
  const droneBladeGeo = mergeParts([prepGeoForMerge(droneBladeAGeo), prepGeoForMerge(droneBladeBGeo)]);
  [
    droneFuselageGeo,
    droneTopSensorGeo,
    droneEyeHoodGeo,
    droneChuteGeo,
    dronePodHousingGeo,
    droneBarrelGeo,
    droneShroudGeo,
    droneArmGeo,
    droneCowlingGeo,
    droneSensorRingGeo,
    droneAmmoDrumGeo,
    droneMuzzleCrownGeo,
    dronePodGeo,
    droneBladeAGeo,
    droneBladeBGeo,
  ].forEach((g) => g.dispose());

  // --- Pre-merge Soldier Leg Geometries ---
  const leftLegFatiguesGeo = createSculptedLegGeo(-1);
  const rightLegFatiguesGeo = createSculptedLegGeo(1);
  const bootGeo = createBootGeo();

  const kneePadGeo = new THREE.CylinderGeometry(0.088, 0.088, 0.13, 12, 1, false, -0.85, 1.7);
  const kneeCapRimGeo = new THREE.BoxGeometry(0.098, 0.095, 0.024);
  const kneeStrapGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.025, 12);
  const holsterGeo = new THREE.BoxGeometry(0.068, 0.165, 0.105);
  const pistolSlideGeo = new THREE.BoxGeometry(0.032, 0.044, 0.14);
  const pistolButtGeo = new THREE.BoxGeometry(0.032, 0.062, 0.068);
  const thighStrapGeo = new THREE.CylinderGeometry(0.112, 0.112, 0.026, 12);
  const legPouchGeo = new THREE.BoxGeometry(0.05, 0.125, 0.1);

  const leftLegGearGeo = mergeParts([
    prepGeoForMerge(kneePadGeo, 0, -0.43, 0.045),
    prepGeoForMerge(kneeCapRimGeo, 0, -0.43, 0.125),
    prepGeoForMerge(kneeStrapGeo, 0, -0.43, 0),
    prepGeoForMerge(legPouchGeo, -0.108, -0.2, 0.025),
    prepGeoForMerge(thighStrapGeo, 0, -0.2, 0),
  ]);
  const rightLegGearGeo = mergeParts([
    prepGeoForMerge(kneePadGeo, 0, -0.43, 0.045),
    prepGeoForMerge(kneeCapRimGeo, 0, -0.43, 0.125),
    prepGeoForMerge(kneeStrapGeo, 0, -0.43, 0),
    prepGeoForMerge(holsterGeo, 0.11, -0.22, 0.02),
    prepGeoForMerge(pistolSlideGeo, 0.112, -0.155, 0.045, 0.25),
    prepGeoForMerge(pistolButtGeo, 0.112, -0.12, -0.015, 0.45),
    prepGeoForMerge(thighStrapGeo, 0, -0.22, 0),
  ]);
  [kneePadGeo, kneeCapRimGeo, kneeStrapGeo, holsterGeo, pistolSlideGeo, pistolButtGeo, thighStrapGeo, legPouchGeo].forEach((g) =>
    g.dispose(),
  );

  // --- Pre-merge Soldier Torso Geometries ---
  const sculptedTorso = createSculptedTorsoGeo();
  const shoulderCap = new THREE.SphereGeometry(0.108, 12, 10);
  const sniperScrimDrape = new THREE.CylinderGeometry(0.19, 0.295, 0.24, 14, 1, false, 0.35, Math.PI * 1.55);
  const sniperCapeGeo = new THREE.BoxGeometry(0.46, 0.46, 0.045);

  const baseTorsoFatigues = [
    prepGeoForMerge(sculptedTorso),
    prepGeoForMerge(shoulderCap, -0.275, 0.5, 0, 0, 0, 0, 0.92, 1.0, 0.96),
    prepGeoForMerge(shoulderCap, 0.275, 0.5, 0, 0, 0, 0, 0.92, 1.0, 0.96),
  ];
  const torsoFatiguesGeos = {
    rifleman: mergeParts(baseTorsoFatigues.map((g) => g.clone())),
    rusher: mergeParts(baseTorsoFatigues.map((g) => g.clone())),
    sniper: mergeParts([
      ...baseTorsoFatigues.map((g) => g.clone()),
      prepGeoForMerge(sniperScrimDrape, 0, 0.51, -0.02),
      prepGeoForMerge(sniperCapeGeo, 0, 0.44, -0.21, 0.18),
    ]),
  };
  baseTorsoFatigues.forEach((g) => g.dispose());
  [sculptedTorso, shoulderCap, sniperScrimDrape, sniperCapeGeo].forEach((g) => g.dispose());

  // Crye JPC / AVS Ballistic SAPI Plate Carrier (front/back contoured plates + cummerbund + shoulder pads + rusher armor)
  const vestPlateGeo = createExtrudedProfile(
    [
      [-0.195, -0.18],
      [0.195, -0.18],
      [0.215, 0.05],
      [0.145, 0.19],
      [-0.145, 0.19],
      [-0.215, 0.05],
    ],
    0.32,
    0.024,
  );
  const cummerbundGeo = new THREE.CylinderGeometry(0.228, 0.218, 0.15, 14);
  const shoulderPadGeo = new THREE.BoxGeometry(0.088, 0.042, 0.25);
  const adminPouchGeo = new THREE.BoxGeometry(0.19, 0.095, 0.045);
  const groinFlapGeo = new THREE.BoxGeometry(0.2, 0.115, 0.042);
  const gorgetGeo = new THREE.CylinderGeometry(0.162, 0.222, 0.105, 12);
  const pauldronGeo = new THREE.SphereGeometry(0.148, 12, 10, 0, Math.PI, 0, Math.PI * 0.62);

  const baseArmorParts = [
    prepGeoForMerge(vestPlateGeo, 0, 0.34, 0.006),
    prepGeoForMerge(cummerbundGeo, 0, 0.22, 0, 0, 0, 0, 1.12, 1.0, 0.82),
    prepGeoForMerge(shoulderPadGeo, -0.138, 0.562, 0),
    prepGeoForMerge(shoulderPadGeo, 0.138, 0.562, 0),
    prepGeoForMerge(adminPouchGeo, 0, 0.425, 0.175),
  ];
  const torsoArmorGeos = {
    rifleman: mergeParts(baseArmorParts.map((g) => g.clone())),
    sniper: mergeParts(baseArmorParts.map((g) => g.clone())),
    rusher: mergeParts([
      ...baseArmorParts.map((g) => g.clone()),
      prepGeoForMerge(groinFlapGeo, 0, 0.085, 0.185, -0.1),
      prepGeoForMerge(gorgetGeo, 0, 0.575, 0),
      prepGeoForMerge(pauldronGeo, -0.32, 0.5, 0, 0, 0, 0.72),
      prepGeoForMerge(pauldronGeo, 0.32, 0.5, 0, 0, 0, -0.72),
    ]),
  };
  baseArmorParts.forEach((g) => g.dispose());
  [vestPlateGeo, cummerbundGeo, shoulderPadGeo, adminPouchGeo, groinFlapGeo, gorgetGeo, pauldronGeo].forEach((g) => g.dispose());

  // Chest Webbing, Triple PMAG Pouches, Battle Belt, Hydration Pack, PRC-152 Radio + Antenna
  const pouchGeo = new THREE.BoxGeometry(0.082, 0.125, 0.06);
  const sniperMagGeo = new THREE.BoxGeometry(0.088, 0.145, 0.068);
  const beltGeo = new THREE.CylinderGeometry(0.214, 0.214, 0.076, 14);
  const dumpPouchGeo = new THREE.BoxGeometry(0.11, 0.13, 0.075);
  const ifakGeo = new THREE.BoxGeometry(0.135, 0.095, 0.075);
  const backpackGeo = new THREE.CapsuleGeometry(0.135, 0.21, 5, 12);
  const bedrollGeo = new THREE.CylinderGeometry(0.048, 0.048, 0.29, 10);
  const fragPouchGeo = new THREE.CylinderGeometry(0.036, 0.036, 0.082, 8);
  const pttGeo = new THREE.BoxGeometry(0.042, 0.072, 0.032);
  const radioGeo = new THREE.BoxGeometry(0.07, 0.135, 0.05);
  const antennaGeo = new THREE.CylinderGeometry(0.005, 0.008, 0.34, 6);
  const collarGaiterGeo = new THREE.CylinderGeometry(0.112, 0.138, 0.065, 14);

  const sharedVestParts = [
    prepGeoForMerge(beltGeo, 0, 0.042, 0, 0, 0, 0, 1.14, 1.0, 0.84),
    prepGeoForMerge(dumpPouchGeo, -0.19, 0.02, -0.09, 0, 0.35),
    prepGeoForMerge(ifakGeo, 0.12, 0.05, -0.2),
    prepGeoForMerge(backpackGeo, 0, 0.35, -0.215, 0, 0, 0, 1.2, 1.0, 0.64),
    prepGeoForMerge(bedrollGeo, 0, 0.17, -0.24, 0, 0, Math.PI / 2),
    prepGeoForMerge(fragPouchGeo, 0.21, 0.24, 0.13),
    prepGeoForMerge(pttGeo, -0.135, 0.45, 0.185),
    prepGeoForMerge(radioGeo, -0.2, 0.44, -0.14),
    prepGeoForMerge(antennaGeo, -0.22, 0.66, -0.15),
    prepGeoForMerge(collarGaiterGeo, 0, 0.59, 0.005),
  ];
  const torsoVestGeos = {
    rifleman: mergeParts([
      ...sharedVestParts.map((g) => g.clone()),
      prepGeoForMerge(pouchGeo, -0.102, 0.245, 0.192),
      prepGeoForMerge(pouchGeo, 0, 0.245, 0.192),
      prepGeoForMerge(pouchGeo, 0.102, 0.245, 0.192),
    ]),
    rusher: mergeParts([
      ...sharedVestParts.map((g) => g.clone()),
      prepGeoForMerge(pouchGeo, -0.102, 0.245, 0.192),
      prepGeoForMerge(pouchGeo, 0, 0.245, 0.192),
      prepGeoForMerge(pouchGeo, 0.102, 0.245, 0.192),
    ]),
    sniper: mergeParts([
      ...sharedVestParts.map((g) => g.clone()),
      prepGeoForMerge(sniperMagGeo, -0.075, 0.245, 0.194),
      prepGeoForMerge(sniperMagGeo, 0.075, 0.245, 0.194),
    ]),
  };
  sharedVestParts.forEach((g) => g.dispose());
  [
    pouchGeo,
    sniperMagGeo,
    beltGeo,
    dumpPouchGeo,
    ifakGeo,
    backpackGeo,
    bedrollGeo,
    fragPouchGeo,
    pttGeo,
    radioGeo,
    antennaGeo,
    collarGaiterGeo,
  ].forEach((g) => g.dispose());

  // Brass PMAG tops, Shoulder Flag/Callsign Patch, Cobra Belt Buckle, Carabiner
  const magTopGeo = new THREE.BoxGeometry(0.058, 0.04, 0.038);
  const patchGeo = new THREE.BoxGeometry(0.018, 0.068, 0.088);
  const chestPatchGeo = new THREE.BoxGeometry(0.088, 0.048, 0.014);
  const buckleGeo = new THREE.BoxGeometry(0.072, 0.064, 0.032);
  const torsoTrimGeo = mergeParts([
    prepGeoForMerge(magTopGeo, -0.102, 0.316, 0.192),
    prepGeoForMerge(magTopGeo, 0, 0.316, 0.192),
    prepGeoForMerge(magTopGeo, 0.102, 0.316, 0.192),
    prepGeoForMerge(patchGeo, -0.275, 0.45, 0),
    prepGeoForMerge(patchGeo, 0.275, 0.45, 0),
    prepGeoForMerge(chestPatchGeo, 0.02, 0.435, 0.202),
    prepGeoForMerge(buckleGeo, 0, 0.042, 0.195),
  ]);
  [magTopGeo, patchGeo, chestPatchGeo, buckleGeo].forEach((g) => g.dispose());

  // --- Pre-merge Operator Head (neck origin y=0 inside headPivot), FAST Helmet & Flipped-Up PVS-31 / Quad NVGs ---
  const headGeo = createSculptedHeadGeo();
  const helmetShellGeo = new THREE.SphereGeometry(0.162, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const counterweightGeo = new THREE.BoxGeometry(0.114, 0.07, 0.046);
  const railGeo = new THREE.BoxGeometry(0.018, 0.028, 0.14);
  const nvgArmGeo = new THREE.BoxGeometry(0.032, 0.068, 0.034);
  const nvgBridgeGeo = new THREE.BoxGeometry(0.135, 0.022, 0.028);
  const nvgTubeGeo = new THREE.CylinderGeometry(0.017, 0.02, 0.095, 10);
  const sniperHoodShellGeo = new THREE.SphereGeometry(0.172, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.56);
  const mandibleGeo = new THREE.CylinderGeometry(0.134, 0.116, 0.095, 14, 1, false, -0.82, 1.64);

  // Local headPivot coordinates (0, 0, 0) corresponds to old torso Y = 0.59
  const baseHelmetParts = [
    prepGeoForMerge(helmetShellGeo, 0, 0.165, -0.01, -0.12),
    prepGeoForMerge(counterweightGeo, 0, 0.155, -0.172),
    prepGeoForMerge(railGeo, -0.152, 0.19, 0.01),
    prepGeoForMerge(railGeo, 0.152, 0.19, 0.01),
  ];

  // Classic Call of Duty MW2/MW3 flipped-up PVS-31 dual-tube NVGs angled upward (+42 deg) on forehead!
  const nvgTilt = 0.72; // tilted upward away from eyes so face & goggles are clear
  const helmetGeos = {
    rifleman: mergeParts([
      ...baseHelmetParts.map((g) => g.clone()),
      prepGeoForMerge(nvgArmGeo, 0, 0.258, 0.145, -0.35),
      prepGeoForMerge(nvgBridgeGeo, 0, 0.285, 0.162, -nvgTilt),
      prepGeoForMerge(nvgTubeGeo, -0.036, 0.305, 0.168, Math.PI / 2 - nvgTilt),
      prepGeoForMerge(nvgTubeGeo, 0.036, 0.305, 0.168, Math.PI / 2 - nvgTilt),
    ]),
    rusher: mergeParts([
      ...baseHelmetParts.map((g) => g.clone()),
      prepGeoForMerge(mandibleGeo, 0, 0.088, 0.026),
    ]),
    sniper: mergeParts([
      ...baseHelmetParts.map((g) => g.clone()),
      prepGeoForMerge(sniperHoodShellGeo, 0, 0.168, -0.015, -0.14),
      prepGeoForMerge(nvgArmGeo, 0, 0.26, 0.148, -0.35),
      prepGeoForMerge(nvgBridgeGeo, 0, 0.288, 0.164, -nvgTilt),
      ...[-0.068, -0.024, 0.024, 0.068].map((tx) =>
        prepGeoForMerge(nvgTubeGeo, tx, 0.308, 0.168, Math.PI / 2 - nvgTilt),
      ),
    ]),
  };
  baseHelmetParts.forEach((g) => g.dispose());
  [
    helmetShellGeo,
    counterweightGeo,
    railGeo,
    nvgArmGeo,
    nvgBridgeGeo,
    nvgTubeGeo,
    sniperHoodShellGeo,
    mandibleGeo,
  ].forEach((g) => g.dispose());

  // Peltor ComTac Headset + IR Strobe + Boom Mic + Wilcox Shroud + NVG Lens Rings
  const earGeo = new THREE.CylinderGeometry(0.052, 0.052, 0.044, 12);
  const micBoomGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.12, 6);
  const irStrobeGeo = new THREE.BoxGeometry(0.048, 0.024, 0.064);
  const nvgShroudGeo = new THREE.BoxGeometry(0.054, 0.062, 0.028);
  const goggleStrapGeo = new THREE.CylinderGeometry(0.144, 0.144, 0.024, 16);
  const nvgRimGeo = new THREE.CylinderGeometry(0.019, 0.019, 0.02, 10);
  const flashLightGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.075, 8);
  const ventFilterGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.026, 8);

  const sharedHeadGearParts = [
    prepGeoForMerge(earGeo, -0.146, 0.135, -0.01, 0, 0, Math.PI / 2),
    prepGeoForMerge(earGeo, 0.146, 0.135, -0.01, 0, 0, Math.PI / 2),
    prepGeoForMerge(micBoomGeo, -0.105, 0.098, 0.078, Math.PI / 2.2, 0, -0.45),
    prepGeoForMerge(irStrobeGeo, 0, 0.315, -0.02),
    prepGeoForMerge(nvgShroudGeo, 0, 0.228, 0.142),
    prepGeoForMerge(goggleStrapGeo, 0, 0.168, -0.005),
    prepGeoForMerge(flashLightGeo, 0.158, 0.195, 0.03, Math.PI / 2),
  ];
  const headGearGeos = {
    rifleman: mergeParts([
      ...sharedHeadGearParts.map((g) => g.clone()),
      prepGeoForMerge(nvgRimGeo, -0.036, 0.335, 0.198, Math.PI / 2 - nvgTilt),
      prepGeoForMerge(nvgRimGeo, 0.036, 0.335, 0.198, Math.PI / 2 - nvgTilt),
    ]),
    rusher: mergeParts([
      ...sharedHeadGearParts.map((g) => g.clone()),
      prepGeoForMerge(ventFilterGeo, -0.052, 0.084, 0.132, Math.PI / 2),
      prepGeoForMerge(ventFilterGeo, 0.052, 0.084, 0.132, Math.PI / 2),
    ]),
    sniper: mergeParts([
      ...sharedHeadGearParts.map((g) => g.clone()),
      ...[-0.068, -0.024, 0.024, 0.068].map((tx) =>
        prepGeoForMerge(nvgRimGeo, tx, 0.338, 0.198, Math.PI / 2 - nvgTilt),
      ),
    ]),
  };
  sharedHeadGearParts.forEach((g) => g.dispose());
  [earGeo, micBoomGeo, irStrobeGeo, nvgShroudGeo, goggleStrapGeo, nvgRimGeo, flashLightGeo, ventFilterGeo].forEach((g) =>
    g.dispose(),
  );

  // Smoked Oakley Ballistic Goggles + Flipped-Up Blue-Coated NVG Optics (NO neon glowing robo-eyes!)
  const goggleLensGeo = new THREE.CylinderGeometry(0.142, 0.142, 0.048, 16, 1, false, -0.74, 1.48);
  const nvgLensGeo = new THREE.CircleGeometry(0.015, 10);
  const baseVisorParts = [prepGeoForMerge(goggleLensGeo, 0, 0.168, 0.022)];
  const headVisorGeos = {
    rifleman: mergeParts([
      ...baseVisorParts.map((g) => g.clone()),
      prepGeoForMerge(nvgLensGeo, -0.036, 0.34, 0.208, -nvgTilt),
      prepGeoForMerge(nvgLensGeo, 0.036, 0.34, 0.208, -nvgTilt),
    ]),
    rusher: mergeParts([
      prepGeoForMerge(goggleLensGeo, 0, 0.168, 0.026, 0, 0, 0, 1.03, 1.15, 1.03),
    ]),
    sniper: mergeParts([
      ...baseVisorParts.map((g) => g.clone()),
      ...[-0.068, -0.024, 0.024, 0.068].map((tx) =>
        prepGeoForMerge(nvgLensGeo, tx, 0.343, 0.208, -nvgTilt),
      ),
    ]),
  };
  baseVisorParts.forEach((g) => g.dispose());
  [goggleLensGeo, nvgLensGeo].forEach((g) => g.dispose());

  // --- Pre-merge Articulated Arms & C-Clamp Rifle Hands (aligned cleanly with angled CoD shouldered rifle) ---
  const elbowGeo = new THREE.SphereGeometry(0.068, 10, 8);
  const gloveGeo = new THREE.SphereGeometry(0.052, 10, 8);
  const cuffGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.05, 10);

  // leftArm origin at (-0.29, 0.50, 0); handguard C-clamp target at (+0.388, -0.092, +0.454)
  const lUpper = createLimbMeshGeo(0, 0, 0, 0.02, -0.22, 0.18, 0.084, 0.068);
  const lFore = createLimbMeshGeo(0.02, -0.22, 0.18, 0.388, -0.092, 0.454, 0.064, 0.052);
  const leftArmFatiguesGeo = mergeParts([lUpper, lFore]);
  const leftArmGearGeo = mergeParts([
    prepGeoForMerge(elbowGeo, 0.02, -0.22, 0.18),
    prepGeoForMerge(cuffGeo, 0.335, -0.11, 0.41, 1.25, 0, -0.6),
    prepGeoForMerge(gloveGeo, 0.392, -0.092, 0.458, 0, 0, 0, 1.05, 0.9, 1.15),
  ]);

  // rightArm origin at (0.29, 0.50, 0); pistol grip target at (-0.124, -0.135, 0.147)
  const rUpper = createLimbMeshGeo(0, 0, 0, 0.05, -0.18, 0.04, 0.084, 0.068);
  const rFore = createLimbMeshGeo(0.05, -0.18, 0.04, -0.124, -0.135, 0.147, 0.064, 0.052);
  const rightArmFatiguesGeo = mergeParts([rUpper, rFore]);
  const rightArmGearGeo = mergeParts([
    prepGeoForMerge(elbowGeo, 0.05, -0.18, 0.04),
    prepGeoForMerge(cuffGeo, -0.095, -0.145, 0.13, 1.2, 0, 0.7),
    prepGeoForMerge(gloveGeo, -0.124, -0.135, 0.147, 0, 0, 0, 1.0, 0.95, 1.1),
  ]);
  [elbowGeo, gloveGeo, cuffGeo].forEach((g) => g.dispose());

  // --- Pre-merge Authentic CoD Enemy Rifles (2 draw calls per weapon!) ---
  const gunRecGeo = new THREE.BoxGeometry(0.048, 0.072, 0.28);
  const gunHoloGeo = new THREE.BoxGeometry(0.038, 0.048, 0.082);
  const gunScopeTubeGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.24, 12);
  const gunScopeBellGeo = new THREE.CylinderGeometry(0.025, 0.018, 0.065, 12);
  const gunSuppressorGeo = new THREE.CylinderGeometry(0.021, 0.021, 0.15, 10);
  const gunBrakeGeo = new THREE.CylinderGeometry(0.019, 0.017, 0.06, 8);
  const gunGripGeo = new THREE.BoxGeometry(0.032, 0.098, 0.042);
  const gunMagGeo = new THREE.BoxGeometry(0.032, 0.15, 0.064);
  const gunDrumGeo = new THREE.CylinderGeometry(0.068, 0.068, 0.056, 12);
  const gunStockGeo = new THREE.BoxGeometry(0.04, 0.095, 0.24);
  const gunHandguardGeo = new THREE.BoxGeometry(0.046, 0.054, 0.26);
  const gunPeqGeo = new THREE.BoxGeometry(0.032, 0.024, 0.075);
  const gunForegripGeo = new THREE.CylinderGeometry(0.015, 0.018, 0.078, 8);
  const gunBipodGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.16, 8);

  const makeWeaponGeos = (arch: 'rifleman' | 'rusher' | 'sniper') => {
    const barrelLen = arch === 'sniper' ? 0.54 : arch === 'rusher' ? 0.28 : 0.4;
    const gunBarrelGeo = new THREE.CylinderGeometry(0.014, 0.016, barrelLen, 10);

    const metalParts: THREE.BufferGeometry[] = [
      prepGeoForMerge(gunRecGeo),
      prepGeoForMerge(gunBarrelGeo, 0, 0.014, 0.14 + barrelLen * 0.5, Math.PI / 2),
      prepGeoForMerge(gunGripGeo, 0, -0.065, -0.075, 0.28),
    ];

    if (arch === 'sniper') {
      metalParts.push(
        prepGeoForMerge(gunScopeTubeGeo, 0, 0.068, 0.0, Math.PI / 2),
        prepGeoForMerge(gunScopeBellGeo, 0, 0.068, 0.14, Math.PI / 2),
        prepGeoForMerge(gunSuppressorGeo, 0, 0.014, 0.14 + barrelLen + 0.06, Math.PI / 2),
        prepGeoForMerge(gunMagGeo, 0, -0.088, 0.03, 0.08, 0, 0, 1.0, 0.85, 1.15),
        prepGeoForMerge(gunBipodGeo, -0.028, -0.032, 0.34, Math.PI / 2),
        prepGeoForMerge(gunBipodGeo, 0.028, -0.032, 0.34, Math.PI / 2),
      );
    } else if (arch === 'rusher') {
      metalParts.push(
        prepGeoForMerge(gunHoloGeo, 0, 0.056, 0.01),
        prepGeoForMerge(gunBrakeGeo, 0, 0.014, 0.14 + barrelLen + 0.02, Math.PI / 2),
        prepGeoForMerge(gunDrumGeo, 0, -0.085, 0.035, Math.PI / 2),
      );
    } else {
      metalParts.push(
        prepGeoForMerge(gunHoloGeo, 0, 0.058, 0.01),
        prepGeoForMerge(gunSuppressorGeo, 0, 0.014, 0.14 + barrelLen + 0.05, Math.PI / 2),
        prepGeoForMerge(gunMagGeo, 0, -0.095, 0.04, 0.2),
      );
    }

    const furniture = mergeParts([
      prepGeoForMerge(gunStockGeo, 0.008, -0.014, -0.22),
      prepGeoForMerge(gunHandguardGeo, 0, 0.01, 0.24),
      prepGeoForMerge(gunPeqGeo, 0.028, 0.032, 0.28),
      prepGeoForMerge(gunForegripGeo, 0, -0.046, 0.25),
    ]);

    gunBarrelGeo.dispose();
    return { metal: mergeParts(metalParts), furniture };
  };

  const wRifle = makeWeaponGeos('rifleman');
  const wRusher = makeWeaponGeos('rusher');
  const wSniper = makeWeaponGeos('sniper');
  [
    gunRecGeo,
    gunHoloGeo,
    gunScopeTubeGeo,
    gunScopeBellGeo,
    gunSuppressorGeo,
    gunBrakeGeo,
    gunGripGeo,
    gunMagGeo,
    gunDrumGeo,
    gunStockGeo,
    gunHandguardGeo,
    gunPeqGeo,
    gunForegripGeo,
    gunBipodGeo,
  ].forEach((g) => g.dispose());

  const droneVentGeo = new THREE.BoxGeometry(0.16, 0.11, 0.06);
  const droneHeadGeo = new THREE.SphereGeometry(0.15, 14, 12);
  const droneNavStrobeGeo = new THREE.SphereGeometry(0.036, 6, 6);

  const assets: SharedEnemyAssets = {
    soldierShadowGeo: new THREE.CircleGeometry(0.68, 16),
    droneShadowGeo: new THREE.CircleGeometry(0.9, 16),
    shadowMat: new THREE.MeshBasicMaterial({
      map: textures.contactShadowMap,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
    }),
    bootMat: new THREE.MeshStandardMaterial({ color: 0x292b30, roughness: 0.74, metalness: 0.12 }),
    brassAccentMat: new THREE.MeshStandardMaterial({ color: 0xc9a35d, roughness: 0.32, metalness: 0.78 }),
    gunMat: new THREE.MeshStandardMaterial({ color: 0x2d323b, roughness: 0.34, metalness: 0.78 }),
    droneOpticMat: new THREE.MeshStandardMaterial({
      color: 0xff2d20,
      emissive: 0xff2d20,
      emissiveIntensity: 2.0,
      roughness: 0.12,
    }),
    droneThrusterGlowMat: new THREE.MeshStandardMaterial({
      color: 0xf97316,
      emissive: 0xff6b00,
      emissiveIntensity: 1.7,
      roughness: 0.2,
    }),
    droneNavGreenMat: new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      emissive: 0x22c55e,
      emissiveIntensity: 1.5,
    }),
    vestMats: { rifleman: rm.vest, rusher: rum.vest, sniper: sm.vest },
    visorMats: { rifleman: rm.visor, rusher: rum.visor, sniper: sm.visor },
    skinMats: { rifleman: rm.skin, rusher: rum.skin, sniper: sm.skin },
    fatiguesTemplates: { rifleman: rm.fatigues, rusher: rum.fatigues, sniper: sm.fatigues },
    armorTemplates: { rifleman: rm.armor, rusher: rum.armor, sniper: sm.armor },
    helmetTemplates: { rifleman: rm.helmet, rusher: rum.helmet, sniper: sm.helmet },
    droneHullTemplate: new THREE.MeshStandardMaterial({
      color: 0x242930,
      normalMap: textures.armorPlateNormal,
      normalScale: new THREE.Vector2(1.0, 1.0),
      metalness: 0.82,
      roughness: 0.24,
    }),
    droneAccentTemplate: new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.48, roughness: 0.36 }),
    droneHullGeo,
    droneAccentGeo,
    droneVentGeo,
    droneHeadGeo,
    droneBladeGeo,
    droneNavStrobeGeo,
    leftLegFatiguesGeo,
    rightLegFatiguesGeo,
    leftLegGearGeo,
    rightLegGearGeo,
    bootGeo,
    torsoFatiguesGeos,
    torsoArmorGeos,
    torsoVestGeos,
    torsoTrimGeo,
    headGeo,
    helmetGeos,
    headGearGeos,
    headVisorGeos,
    leftArmFatiguesGeo,
    leftArmGearGeo,
    rightArmFatiguesGeo,
    rightArmGearGeo,
    gunMetalGeos: { rifleman: wRifle.metal, rusher: wRusher.metal, sniper: wSniper.metal },
    gunFurnitureGeos: { rifleman: wRifle.furniture, rusher: wRusher.furniture, sniper: wSniper.furniture },
    enemyFlashMatTemplate: new THREE.SpriteMaterial({
      map: textures.glowSpriteMap,
      color: 0xffc668,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  };

  enemyAssetCache.set(textures, assets);
  return assets;
}

export function disposeEnemyRig(rig: EnemyRig) {
  for (let i = 0; i < rig.materialsToFlash.length; i++) {
    rig.materialsToFlash[i].dispose();
  }
  if (rig.muzzleFlashSprite) {
    rig.muzzleFlashSprite.material.dispose();
  }
}

export function buildEnemySoldier(
  enemyId: number,
  archetype: EnemyArchetype,
  textures: ProceduralTextureSet,
): EnemyRig {
  const shared = getSharedEnemyAssets(textures);
  const root = new THREE.Group();
  const hitMeshes: THREE.Mesh[] = [];
  const materialsToFlash: THREE.MeshStandardMaterial[] = [];
  const rotors: THREE.Object3D[] = [];

  const tagHitMesh = (mesh: THREE.Mesh, isHead: boolean, castShadow = true) => {
    mesh.userData.enemyId = enemyId;
    mesh.userData.isHead = isHead;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    hitMeshes.push(mesh);
    return mesh;
  };

  // Contact shadow disc grounded at y=0.015 (shared geometry & material)
  const contactShadow = new THREE.Mesh(
    archetype === 'heavy_drone' ? shared.droneShadowGeo : shared.soldierShadowGeo,
    shared.shadowMat,
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.015;
  root.add(contactShadow);

  const torsoPivot = new THREE.Group();
  root.add(torsoPivot);
  const headPivot = new THREE.Group();

  if (archetype === 'heavy_drone') {
    const hullMat = shared.droneHullTemplate.clone();
    const accentMat = shared.droneAccentTemplate.clone();
    materialsToFlash.push(hullMat, accentMat);

    torsoPivot.position.y = 2.15;

    const hullMesh = tagHitMesh(new THREE.Mesh(shared.droneHullGeo, hullMat), false, true);
    const accentMesh = new THREE.Mesh(shared.droneAccentGeo, accentMat);
    const headMesh = tagHitMesh(new THREE.Mesh(shared.droneHeadGeo, shared.droneOpticMat), true, false);
    headMesh.position.set(0, -0.02, 0.48);

    const ventL = new THREE.Mesh(shared.droneVentGeo, shared.droneThrusterGlowMat);
    ventL.position.set(-0.16, 0.02, -0.49);
    const ventR = new THREE.Mesh(shared.droneVentGeo, shared.droneThrusterGlowMat);
    ventR.position.set(0.16, 0.02, -0.49);

    torsoPivot.add(hullMesh, accentMesh, headMesh, ventL, ventR);

    const armOffsets = [
      [-0.7, 0.06, -0.62],
      [0.7, 0.06, -0.62],
      [-0.7, 0.06, 0.62],
      [0.7, 0.06, 0.62],
    ];
    for (const [ax, ay, az] of armOffsets) {
      const rotorHub = new THREE.Mesh(shared.droneBladeGeo, accentMat);
      rotorHub.position.set(ax, ay + 0.06, az);
      rotors.push(rotorHub);
      const navStrobe = new THREE.Mesh(
        shared.droneNavStrobeGeo,
        ax < 0 ? shared.droneOpticMat : shared.droneNavGreenMat,
      );
      navStrobe.position.set(ax * 1.15, ay + 0.05, az);
      torsoPivot.add(rotorHub, navStrobe);
    }

    const muzzleAnchor = new THREE.Object3D();
    muzzleAnchor.position.set(0, -0.22, 0.62);
    const flashMat = shared.enemyFlashMatTemplate.clone();
    const muzzleFlashSprite = new THREE.Sprite(flashMat);
    muzzleFlashSprite.scale.set(0.55, 0.55, 1);
    muzzleAnchor.add(muzzleFlashSprite);
    torsoPivot.add(muzzleAnchor);

    const dummyGroup = new THREE.Group();
    return {
      root,
      torsoPivot,
      headPivot,
      headMesh,
      leftArm: dummyGroup,
      rightArm: dummyGroup,
      leftLeg: dummyGroup,
      rightLeg: dummyGroup,
      rotors,
      muzzleAnchor,
      muzzleFlashSprite,
      hitMeshes,
      materialsToFlash,
      contactShadow,
    };
  }

  // Sculpted Call of Duty Modern Warfare Tactical Operator
  const fatiguesMat = shared.fatiguesTemplates[archetype].clone();
  const armorMat = shared.armorTemplates[archetype].clone();
  const helmetMat = shared.helmetTemplates[archetype].clone();
  const vestMat = shared.vestMats[archetype];
  const visorMat = shared.visorMats[archetype];
  const skinMaskMat = shared.skinMats[archetype];
  const bootMat = shared.bootMat;
  const brassAccentMat = shared.brassAccentMat;
  const gunMat = shared.gunMat;

  materialsToFlash.push(fatiguesMat, armorMat, helmetMat);

  // 1. Articulated Legs in natural tactical stance (grounded under root, independent of torso lean)
  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.145, 0.885, 0.04);
  const leftLegMesh = tagHitMesh(new THREE.Mesh(shared.leftLegFatiguesGeo, fatiguesMat), false, true);
  const leftGearMesh = new THREE.Mesh(shared.leftLegGearGeo, armorMat);
  const leftBootMesh = new THREE.Mesh(shared.bootGeo, bootMat);
  leftBootMesh.castShadow = true;
  leftLeg.add(leftLegMesh, leftGearMesh, leftBootMesh);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.145, 0.885, -0.04);
  const rightLegMesh = tagHitMesh(new THREE.Mesh(shared.rightLegFatiguesGeo, fatiguesMat), false, true);
  const rightGearMesh = new THREE.Mesh(shared.rightLegGearGeo, bootMat);
  const rightBootMesh = new THREE.Mesh(shared.bootGeo, bootMat);
  rightBootMesh.castShadow = true;
  rightLeg.add(rightLegMesh, rightGearMesh, rightBootMesh);

  root.add(leftLeg, rightLeg);

  // 2. Sculpted Torso, Crye JPC Plate Carrier & Rig (torsoPivot sits cleanly at hip belt y=0.885)
  torsoPivot.position.y = 0.885;
  const torsoFatiguesMesh = tagHitMesh(new THREE.Mesh(shared.torsoFatiguesGeos[archetype], fatiguesMat), false, true);
  const plateCarrierMesh = tagHitMesh(new THREE.Mesh(shared.torsoArmorGeos[archetype], armorMat), false, true);
  const rigVestMesh = new THREE.Mesh(shared.torsoVestGeos[archetype], vestMat);
  rigVestMesh.receiveShadow = true;
  const rigTrimMesh = new THREE.Mesh(shared.torsoTrimGeo, brassAccentMat);
  torsoPivot.add(torsoFatiguesMesh, plateCarrierMesh, rigVestMesh, rigTrimMesh);

  // 3. Operator Head, Balaclava / Ghost Skull, FAST Helmet, ComTacs & Ballistic Eyewear
  headPivot.position.set(0, 0.59, 0);
  headPivot.rotation.set(0.03, 0.06, -0.04); // slight tactical cheek-weld cant toward optic
  const headMesh = tagHitMesh(new THREE.Mesh(shared.headGeo, skinMaskMat), true, true);
  const helmetMesh = tagHitMesh(new THREE.Mesh(shared.helmetGeos[archetype], helmetMat), true, true);
  const headGearMesh = new THREE.Mesh(shared.headGearGeos[archetype], bootMat);
  const visorMesh = new THREE.Mesh(shared.headVisorGeos[archetype], visorMat);
  headPivot.add(headMesh, helmetMesh, headGearMesh, visorMesh);
  torsoPivot.add(headPivot);

  // 4. Shouldered Two-Handed Rifle Stance & Weapon
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.29, 0.5, 0);
  const lSleeve = tagHitMesh(new THREE.Mesh(shared.leftArmFatiguesGeo, fatiguesMat), false, false);
  const lGlove = new THREE.Mesh(shared.leftArmGearGeo, bootMat);
  leftArm.add(lSleeve, lGlove);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.29, 0.5, 0);
  const rSleeve = tagHitMesh(new THREE.Mesh(shared.rightArmFatiguesGeo, fatiguesMat), false, false);
  const rGlove = new THREE.Mesh(shared.rightArmGearGeo, bootMat);
  rightArm.add(rSleeve, rGlove);

  const gunGroup = new THREE.Group();
  gunGroup.position.set(-0.14, -0.07, 0.22);
  gunGroup.rotation.set(0.05, -0.22, 0);
  const gunMetalMesh = new THREE.Mesh(shared.gunMetalGeos[archetype], gunMat);
  gunMetalMesh.castShadow = true;
  const gunFurnMesh = new THREE.Mesh(shared.gunFurnitureGeos[archetype], armorMat);
  gunGroup.add(gunMetalMesh, gunFurnMesh);
  rightArm.add(gunGroup);

  const barrelLen = archetype === 'sniper' ? 0.54 : archetype === 'rusher' ? 0.28 : 0.4;
  const muzzleOffsetZ = archetype === 'rusher' ? 0.14 + barrelLen + 0.05 : 0.14 + barrelLen + 0.13;
  const muzzleAnchor = new THREE.Object3D();
  muzzleAnchor.position.set(0, 0.014, muzzleOffsetZ);
  const flashMat = shared.enemyFlashMatTemplate.clone();
  const muzzleFlashSprite = new THREE.Sprite(flashMat);
  muzzleFlashSprite.scale.set(0.36, 0.36, 1);
  muzzleAnchor.add(muzzleFlashSprite);
  gunGroup.add(muzzleAnchor);

  torsoPivot.add(leftArm, rightArm);

  return {
    root,
    torsoPivot,
    headPivot,
    headMesh,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    rotors,
    muzzleAnchor,
    muzzleFlashSprite,
    hitMeshes,
    materialsToFlash,
    contactShadow,
  };
}

export function buildWatchtower(textures: ProceduralTextureSet): THREE.Group {
  const g = new THREE.Group();
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x30353b, metalness: 0.78, roughness: 0.36 });
  const sandbagMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.sandbagMap,
    normalMap: textures.sandbagNormal,
    normalScale: new THREE.Vector2(1.1, 1.1),
    roughness: 0.92,
    metalness: 0.02,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.containerTanMap,
    normalMap: textures.containerNormal,
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughness: 0.65,
    metalness: 0.35,
  });
  const floodMat = new THREE.MeshStandardMaterial({
    color: 0xfffbeb,
    emissive: 0xfef08a,
    emissiveIntensity: 1.6,
  });

  const offsets = [
    [-1.6, -1.6],
    [1.6, -1.6],
    [-1.6, 1.6],
    [1.6, 1.6],
  ];
  for (const [px, pz] of offsets) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.28, 7.6, 0.28), steelMat);
    leg.position.set(px, 3.8, pz);
    leg.castShadow = true;
    leg.receiveShadow = true;
    g.add(leg);
  }

  // Horizontal mid-tier tie beams + diagonal X-braces + steel access ladder rungs
  for (const [x1, z1, x2, z2] of [
    [-1.6, -1.6, 1.6, -1.6],
    [-1.6, 1.6, 1.6, 1.6],
    [-1.6, -1.6, -1.6, 1.6],
    [1.6, -1.6, 1.6, 1.6],
  ]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x2 - x1) || 0.14, 0.14, Math.abs(z2 - z1) || 0.14), steelMat);
    beam.position.set((x1 + x2) / 2, 2.35, (z1 + z2) / 2);
    beam.castShadow = true;
    g.add(beam);
  }
  for (let rung = 0; rung < 8; rung++) {
    const step = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.72, 6), steelMat);
    step.rotation.z = Math.PI / 2;
    step.position.set(0, 0.55 + rung * 0.52, 1.65);
    g.add(step);
  }

  const deck = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.32, 4.2), steelMat);
  deck.position.y = 4.6;
  deck.castShadow = true;
  deck.receiveShadow = true;
  g.add(deck);

  const parapetPositions: [number, number, number, number][] = [
    [0, -1.9, 4.1, 0.35],
    [0, 1.9, 4.1, 0.35],
    [-1.9, 0, 0.35, 3.6],
    [1.9, 0, 0.35, 3.6],
  ];
  for (const [x, z, w, d] of parapetPositions) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 0.95, d), sandbagMat);
    wall.position.set(x, 5.22, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    g.add(wall);
  }

  const roof = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.22, 4.5), roofMat);
  roof.position.y = 7.65;
  roof.castShadow = true;
  roof.receiveShadow = true;
  g.add(roof);

  // Corner floodlight pods
  for (const sx of [-1.75, 1.75]) {
    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.22, 0.22), steelMat);
    pod.position.set(sx, 7.45, 2.2);
    const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.16), floodMat);
    lens.position.set(sx, 7.45, 2.32);
    g.add(pod, lens);
  }

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.3, 8), steelMat);
  mast.position.set(1.4, 8.35, -1.4);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 1.6 }),
  );
  beacon.position.set(1.4, 9.05, -1.4);
  g.add(mast, beacon);

  return g;
}

export function buildArmoredMrap(textures: ProceduralTextureSet): THREE.Group {
  const g = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x857458,
    normalMap: textures.armorPlateNormal,
    normalScale: new THREE.Vector2(0.4, 0.4),
    roughness: 0.62,
    metalness: 0.28,
  });
  const chassisMat = new THREE.MeshStandardMaterial({ color: 0x202328, roughness: 0.55, metalness: 0.72 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.9, metalness: 0.05 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x162030,
    roughness: 0.08,
    metalness: 0.25,
    clearcoat: 1.0,
  });
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xfef9c3,
    emissive: 0xfef08a,
    emissiveIntensity: 1.8,
  });
  const tailLightMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xdc2626,
    emissiveIntensity: 1.4,
  });
  const hazardMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: textures.hazardMap, roughness: 0.6, metalness: 0.2 });

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 6.2),
    new THREE.MeshBasicMaterial({ map: textures.contactShadowMap, transparent: true, opacity: 0.58, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  g.add(shadow);

  const lowerHull = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.85, 5.2), chassisMat);
  lowerHull.position.y = 0.9;
  lowerHull.castShadow = true;
  lowerHull.receiveShadow = true;
  g.add(lowerHull);

  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.25, 1.05, 3.1), hullMat);
  cab.position.set(0, 1.75, -0.35);
  cab.castShadow = true;
  cab.receiveShadow = true;
  g.add(cab);

  const hood = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.65, 1.7), hullMat);
  hood.position.set(0, 1.48, 1.85);
  hood.rotation.x = 0.14;
  hood.castShadow = true;
  g.add(hood);

  // Armored front grille slats & glowing headlights
  for (let s = 0; s < 4; s++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.08), chassisMat);
    slat.position.set(0, 1.15 + s * 0.11, 2.71);
    g.add(slat);
  }
  for (const hx of [-0.78, 0.78]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.06), headlightMat);
    hl.position.set(hx, 1.24, 2.7);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.06), tailLightMat);
    tl.position.set(hx, 1.18, -2.6);
    g.add(hl, tl);
  }

  // Side armored doors + handles + dual roof antennas
  for (const sx of [-1.14, 1.14]) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.85, 0.98), chassisMat);
    door.position.set(sx, 1.7, 0.2);
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.08), chassisMat);
    mirror.position.set(sx * 1.1, 1.95, 1.05);
    g.add(door, mirror);
  }
  const ant1 = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 1.6, 6), chassisMat);
  ant1.position.set(-0.85, 2.95, -1.6);
  const ant2 = ant1.clone();
  ant2.position.x = 0.85;
  g.add(ant1, ant2);

  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.52, 0.12), glassMat);
  windshield.position.set(0, 1.9, 1.18);
  windshield.rotation.x = -0.22;
  g.add(windshield);

  const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.38, 0.34, 0.36), hazardMat);
  bumper.position.set(0, 0.72, 2.7);
  bumper.castShadow = true;
  g.add(bumper);

  const turretRing = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.32, 14), chassisMat);
  turretRing.position.set(0, 2.42, -0.2);
  const turretShield = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.45, 0.12), hullMat);
  turretShield.position.set(0, 2.75, 0.25);
  const turretGun = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.2, 10), chassisMat);
  turretGun.rotation.x = Math.PI / 2;
  turretGun.position.set(0, 2.78, 0.78);
  g.add(turretRing, turretShield, turretGun);

  const wheelGeo = new THREE.CylinderGeometry(0.56, 0.56, 0.42, 18);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.45, 12);
  hubGeo.rotateZ(Math.PI / 2);
  const wheelCoords = [
    [-1.22, 0.56, 1.65],
    [1.22, 0.56, 1.65],
    [-1.22, 0.56, -1.65],
    [1.22, 0.56, -1.65],
  ];
  for (const [wx, wy, wz] of wheelCoords) {
    const tire = new THREE.Mesh(wheelGeo, tireMat);
    tire.position.set(wx, wy, wz);
    tire.castShadow = true;
    const hub = new THREE.Mesh(hubGeo, hullMat);
    hub.position.set(wx, wy, wz);
    g.add(tire, hub);
  }
  // Spare tire on rear hatch
  const spareTire = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.32, 16), tireMat);
  spareTire.rotation.x = Math.PI / 2;
  spareTire.position.set(0, 1.65, -2.65);
  g.add(spareTire);

  return g;
}

export function buildHarborGantry(textures: ProceduralTextureSet): THREE.Group {
  const g = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x8b3a24,
    roughness: 0.54,
    metalness: 0.45,
  });
  const deckMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.metalPlateMap,
    normalMap: textures.metalPlateNormal,
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughness: 0.48,
    metalness: 0.65,
  });
  const hazardMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: textures.hazardMap, roughness: 0.5, metalness: 0.3 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x22272e, roughness: 0.36, metalness: 0.82 });
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.8,
  });

  const legCoords = [
    [-2.4, -2.4],
    [2.4, -2.4],
    [-2.4, 2.4],
    [2.4, 2.4],
  ];
  for (const [lx, lz] of legCoords) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.48, 12.5, 0.48), frameMat);
    leg.position.set(lx, 6.25, lz);
    leg.castShadow = true;
    leg.receiveShadow = true;
    const basePlinth = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.6, 0.95), steelMat);
    basePlinth.position.set(lx, 0.3, lz);
    g.add(leg, basePlinth);
  }

  // Horizontal cross tie-beams
  for (const h of [5.5, 9.2]) {
    const beamN = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.35, 0.35), frameMat);
    beamN.position.set(0, h, -2.4);
    const beamS = beamN.clone();
    beamS.position.z = 2.4;
    g.add(beamN, beamS);
  }

  const bridge = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.65, 6.2), deckMat);
  bridge.position.y = 12.4;
  bridge.castShadow = true;
  bridge.receiveShadow = true;
  g.add(bridge);

  const boom = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.85, 16.0), frameMat);
  boom.position.set(0, 13.1, 3.0);
  boom.castShadow = true;
  g.add(boom);

  // Trolley + hoist cables + hazard spreader bar
  const trolley = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 2.2), steelMat);
  trolley.position.set(0, 12.6, 5.2);
  const cableL = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 4.2, 6), steelMat);
  cableL.position.set(-0.6, 10.4, 5.2);
  const cableR = cableL.clone();
  cableR.position.x = 0.6;
  const spreader = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.42, 4.4), hazardMat);
  spreader.position.set(0, 8.2, 5.2);
  spreader.castShadow = true;
  g.add(trolley, cableL, cableR, spreader);

  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.0, 2.6), steelMat);
  cab.position.set(0, 11.1, 2.2);
  cab.castShadow = true;
  g.add(cab);

  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), beaconMat);
  beacon.position.set(0, 14.0, -2.2);
  g.add(beacon);

  return g;
}

export function buildRadarArray(textures: ProceduralTextureSet): {
  group: THREE.Group;
  dishPivot: THREE.Group;
} {
  const group = new THREE.Group();
  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.concreteMap,
    normalMap: textures.concreteNormal,
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughness: 0.88,
    metalness: 0.08,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.metalPlateMap,
    normalMap: textures.metalPlateNormal,
    roughness: 0.44,
    metalness: 0.72,
  });
  const dishMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.32, metalness: 0.68 });
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x38bdf8,
    emissiveIntensity: 2.0,
  });

  const bunker = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 3.2, 8), concreteMat);
  bunker.position.y = 1.6;
  bunker.castShadow = true;
  bunker.receiveShadow = true;
  group.add(bunker);

  // Blast door + status light strip on bunker front
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.2, 0.22), metalMat);
  door.position.set(0, 1.15, 3.25);
  const doorStrip = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.09, 0.25), beaconMat);
  doorStrip.position.set(0, 2.38, 3.26);
  group.add(door, doorStrip);

  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, 2.6, 12), metalMat);
  pedestal.position.y = 4.4;
  pedestal.castShadow = true;
  group.add(pedestal);

  const dishPivot = new THREE.Group();
  dishPivot.position.y = 6.2;

  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(2.6, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.42),
    dishMat,
  );
  dish.rotation.x = Math.PI * 0.62;
  dish.castShadow = true;
  const rimRing = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.08, 8, 28), metalMat);
  rimRing.position.set(0, 0.25, 0.75);
  rimRing.rotation.x = 0.35;
  const feedHorn = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 1.8, 8), metalMat);
  feedHorn.rotation.x = Math.PI * 0.12;
  feedHorn.position.set(0, 0.6, 1.0);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), beaconMat);
  beacon.position.set(0, 1.5, 1.3);

  dishPivot.add(dish, rimRing, feedHorn, beacon);
  group.add(dishPivot);

  return { group, dishPivot };
}
