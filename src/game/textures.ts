import * as THREE from 'three/webgpu';

export interface ProceduralTextureSet {
  asphaltMap: THREE.CanvasTexture;
  asphaltNormal: THREE.CanvasTexture;
  asphaltRoughness: THREE.CanvasTexture;
  desertMap: THREE.CanvasTexture;
  desertNormal: THREE.CanvasTexture;
  concreteMap: THREE.CanvasTexture;
  concreteNormal: THREE.CanvasTexture;
  containerOliveMap: THREE.CanvasTexture;
  containerTanMap: THREE.CanvasTexture;
  containerNavyMap: THREE.CanvasTexture;
  containerNormal: THREE.CanvasTexture;
  sandbagMap: THREE.CanvasTexture;
  sandbagNormal: THREE.CanvasTexture;
  crateMap: THREE.CanvasTexture;
  crateNormal: THREE.CanvasTexture;
  metalPlateMap: THREE.CanvasTexture;
  metalPlateNormal: THREE.CanvasTexture;
  quarryRockMap: THREE.CanvasTexture;
  quarryRockNormal: THREE.CanvasTexture;
  waterNormal: THREE.CanvasTexture;
  damascusMap: THREE.CanvasTexture;
  camoWoodlandMap: THREE.CanvasTexture;
  camoUrbanMap: THREE.CanvasTexture;
  camoDesertMap: THREE.CanvasTexture;
  operatorFaceMap: THREE.CanvasTexture;
  ghostFaceMap: THREE.CanvasTexture;
  molleVestMap: THREE.CanvasTexture;
  fabricNormal: THREE.CanvasTexture;
  armorPlateNormal: THREE.CanvasTexture;
  hazardMap: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
  glowSpriteMap: THREE.CanvasTexture;
  rangeLaneMap: THREE.CanvasTexture;
  rangeSign10Map: THREE.CanvasTexture;
  rangeSign20Map: THREE.CanvasTexture;
  rangeSign30Map: THREE.CanvasTexture;
  rangeSign45Map: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  return [c, ctx];
}

function configureTexture(
  canvas: HTMLCanvasElement,
  isColor: boolean,
  repeatX: number,
  repeatY: number,
  maxAniso: number,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = maxAniso;
  tex.needsUpdate = true;
  return tex;
}

function addGrain(ctx: CanvasRenderingContext2D, w: number, h: number, intensity: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const amp = 255 * intensity;
  for (let i = 0, len = d.length; i < len; i += 4) {
    const n = (Math.random() - 0.5) * amp;
    const r = d[i] + n;
    const g = d[i + 1] + n;
    const b = d[i + 2] + n;
    d[i] = r < 0 ? 0 : r > 255 ? 255 : r;
    d[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
    d[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
  }
  ctx.putImageData(img, 0, 0);
}

/** Convert a grayscale height canvas into a crisp tangent-space normal map via fast Sobel filter */
function heightToNormalCanvas(heightCanvas: HTMLCanvasElement, strength: number): HTMLCanvasElement {
  const w = heightCanvas.width;
  const h = heightCanvas.height;
  const srcCtx = heightCanvas.getContext('2d')!;
  const src = srcCtx.getImageData(0, 0, w, h).data;

  const [outC, outCtx] = makeCanvas(w, h);
  const outImg = outCtx.createImageData(w, h);
  const dst = outImg.data;

  const wMask = (w & (w - 1)) === 0 ? w - 1 : -1;
  const hMask = (h & (h - 1)) === 0 ? h - 1 : -1;
  const inv255 = 1 / 255;
  const scaledStrength = strength * inv255;

  for (let y = 0; y < h; y++) {
    const yPrev = y > 0 ? y - 1 : h - 1;
    const yNext = y + 1 < h ? y + 1 : 0;
    const rowPrev = yPrev * w;
    const rowCurr = y * w;
    const rowNext = yNext * w;

    for (let x = 0; x < w; x++) {
      const xPrev = wMask >= 0 ? (x - 1) & wMask : x > 0 ? x - 1 : w - 1;
      const xNext = wMask >= 0 ? (x + 1) & wMask : x + 1 < w ? x + 1 : 0;

      const tl = src[(rowPrev + xPrev) << 2];
      const t = src[(rowPrev + x) << 2];
      const tr = src[(rowPrev + xNext) << 2];
      const l = src[(rowCurr + xPrev) << 2];
      const r = src[(rowCurr + xNext) << 2];
      const bl = src[(rowNext + xPrev) << 2];
      const b = src[(rowNext + x) << 2];
      const br = src[(rowNext + xNext) << 2];

      const dX = (tr + 2 * r + br - (tl + 2 * l + bl)) * scaledStrength;
      const dY = (bl + 2 * b + br - (tl + 2 * t + tr)) * scaledStrength;
      const invLen = 1 / Math.sqrt(dX * dX + dY * dY + 1.0);

      const idx = (rowCurr + x) << 2;
      dst[idx] = ((-dX * invLen * 0.5 + 0.5) * 255 + 0.5) | 0;
      dst[idx + 1] = ((-dY * invLen * 0.5 + 0.5) * 255 + 0.5) | 0;
      dst[idx + 2] = ((invLen * 0.5 + 0.5) * 255 + 0.5) | 0;
      dst[idx + 3] = 255;
    }
  }
  // Silence unused hMask lint while keeping power-of-two fast wrap path clean
  void hMask;
  outCtx.putImageData(outImg, 0, 0);
  return outC;
}

export function createProceduralTextures(maxAniso: number): ProceduralTextureSet {
  const allTextures: THREE.CanvasTexture[] = [];
  const track = (t: THREE.CanvasTexture) => {
    allTextures.push(t);
    return t;
  };

  // 1. 512x512 Tactical Tarmac / Compound Courtyard (fast CPU/GPU footprint + crisp repeat)
  const [asphaltC, asphaltCtx] = makeCanvas(512, 512);
  asphaltCtx.fillStyle = '#2f3237';
  asphaltCtx.fillRect(0, 0, 512, 512);
  addGrain(asphaltCtx, 512, 512, 0.14);

  // Expansion slab joints
  asphaltCtx.strokeStyle = 'rgba(12, 14, 18, 0.72)';
  asphaltCtx.lineWidth = 2;
  for (let i = 0; i <= 512; i += 128) {
    asphaltCtx.beginPath();
    asphaltCtx.moveTo(i, 0);
    asphaltCtx.lineTo(i, 512);
    asphaltCtx.stroke();
    asphaltCtx.beginPath();
    asphaltCtx.moveTo(0, i);
    asphaltCtx.lineTo(512, i);
    asphaltCtx.stroke();
  }
  // Asphalt cracks & aggregate wear
  asphaltCtx.strokeStyle = 'rgba(18, 20, 24, 0.52)';
  asphaltCtx.lineWidth = 1.5;
  for (let c = 0; c < 14; c++) {
    let cx = Math.random() * 512;
    let cy = Math.random() * 512;
    asphaltCtx.beginPath();
    asphaltCtx.moveTo(cx, cy);
    for (let s = 0; s < 5; s++) {
      cx += (Math.random() - 0.5) * 42;
      cy += (Math.random() - 0.5) * 42;
      asphaltCtx.lineTo(cx, cy);
    }
    asphaltCtx.stroke();
  }
  // Subtle desert dust drift
  for (let i = 0; i < 18; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 24 + Math.random() * 48;
    const g = asphaltCtx.createRadialGradient(x, y, 2, x, y, r);
    g.addColorStop(0, 'rgba(130, 110, 84, 0.16)');
    g.addColorStop(1, 'rgba(130, 110, 84, 0)');
    asphaltCtx.fillStyle = g;
    asphaltCtx.beginPath();
    asphaltCtx.arc(x, y, r, 0, Math.PI * 2);
    asphaltCtx.fill();
  }

  const [asphaltHC, asphaltHCtx] = makeCanvas(512, 512);
  asphaltHCtx.fillStyle = '#808080';
  asphaltHCtx.fillRect(0, 0, 512, 512);
  addGrain(asphaltHCtx, 512, 512, 0.14);
  asphaltHCtx.strokeStyle = '#202020';
  asphaltHCtx.lineWidth = 3;
  for (let i = 0; i <= 512; i += 128) {
    asphaltHCtx.beginPath();
    asphaltHCtx.moveTo(i, 0);
    asphaltHCtx.lineTo(i, 512);
    asphaltHCtx.stroke();
    asphaltHCtx.beginPath();
    asphaltHCtx.moveTo(0, i);
    asphaltHCtx.lineTo(512, i);
    asphaltHCtx.stroke();
  }

  const [asphaltRC, asphaltRCtx] = makeCanvas(512, 512);
  asphaltRCtx.fillStyle = '#d4d4d4';
  asphaltRCtx.fillRect(0, 0, 512, 512);
  addGrain(asphaltRCtx, 512, 512, 0.18);

  const asphaltMap = track(configureTexture(asphaltC, true, 10, 10, maxAniso));
  const asphaltNormal = track(configureTexture(heightToNormalCanvas(asphaltHC, 1.8), false, 10, 10, maxAniso));
  const asphaltRoughness = track(configureTexture(asphaltRC, false, 10, 10, maxAniso));

  // 2. Desert Sand / Gravel Basin
  const [desertC, desertCtx] = makeCanvas(512, 512);
  desertCtx.fillStyle = '#92795b';
  desertCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 32; i++) {
    const y = (i / 32) * 512;
    desertCtx.fillStyle = i % 2 === 0 ? 'rgba(105, 84, 60, 0.16)' : 'rgba(170, 144, 110, 0.14)';
    desertCtx.fillRect(0, y, 512, 10);
  }
  addGrain(desertCtx, 512, 512, 0.18);

  const [desertHC, desertHCtx] = makeCanvas(512, 512);
  desertHCtx.fillStyle = '#808080';
  desertHCtx.fillRect(0, 0, 512, 512);
  addGrain(desertHCtx, 512, 512, 0.42);

  const desertMap = track(configureTexture(desertC, true, 26, 26, maxAniso));
  const desertNormal = track(configureTexture(heightToNormalCanvas(desertHC, 1.5), false, 26, 26, maxAniso));

  // 3. Weathered Poured Concrete with Formwork Tie Holes
  const [concC, concCtx] = makeCanvas(512, 512);
  concCtx.fillStyle = '#7c8082';
  concCtx.fillRect(0, 0, 512, 512);
  addGrain(concCtx, 512, 512, 0.14);
  concCtx.fillStyle = 'rgba(25, 28, 32, 0.24)';
  concCtx.fillRect(0, 448, 512, 64);
  // Formwork tie dots
  concCtx.fillStyle = 'rgba(30, 32, 36, 0.55)';
  for (let y = 80; y < 440; y += 160) {
    for (let x = 64; x < 512; x += 128) {
      concCtx.beginPath();
      concCtx.arc(x, y, 5, 0, Math.PI * 2);
      concCtx.fill();
    }
  }
  concCtx.strokeStyle = 'rgba(20, 22, 26, 0.35)';
  concCtx.lineWidth = 3;
  concCtx.strokeRect(2, 2, 508, 508);

  const [concHC, concHCtx] = makeCanvas(512, 512);
  concHCtx.fillStyle = '#888888';
  concHCtx.fillRect(0, 0, 512, 512);
  addGrain(concHCtx, 512, 512, 0.28);

  const concreteMap = track(configureTexture(concC, true, 2, 1, maxAniso));
  const concreteNormal = track(configureTexture(heightToNormalCanvas(concHC, 1.4), false, 2, 1, maxAniso));

  // 4. Corrugated Military Shipping Containers (Olive & Desert Tan + Normal Map)
  const makeContainer = (baseHex: string, darkHex: string, rustHex: string) => {
    const [c, ctx] = makeCanvas(512, 512);
    ctx.fillStyle = baseHex;
    ctx.fillRect(0, 0, 512, 512);
    for (let x = 0; x < 512; x += 32) {
      ctx.fillStyle = darkHex;
      ctx.fillRect(x, 0, 12, 512);
      ctx.fillStyle = 'rgba(255,255,255,0.09)';
      ctx.fillRect(x + 12, 0, 5, 512);
    }
    // Weathered edge scuffing & tactical stencil markings
    ctx.fillStyle = rustHex;
    for (let i = 0; i < 16; i++) {
      ctx.fillRect(Math.random() * 512, 470 + Math.random() * 35, 16 + Math.random() * 28, 6);
    }
    ctx.fillStyle = 'rgba(240, 240, 235, 0.25)';
    ctx.fillRect(36, 92, 140, 18);
    ctx.fillRect(36, 120, 88, 12);
    addGrain(ctx, 512, 512, 0.1);
    return c;
  };
  const [contHC, contHCtx] = makeCanvas(512, 512);
  contHCtx.fillStyle = '#b0b0b0';
  contHCtx.fillRect(0, 0, 512, 512);
  for (let x = 0; x < 512; x += 32) {
    contHCtx.fillStyle = '#383838';
    contHCtx.fillRect(x, 0, 14, 512);
  }

  const containerOliveMap = track(configureTexture(makeContainer('#394433', '#232b1f', 'rgba(92,58,34,0.35)'), true, 2, 1, maxAniso));
  const containerTanMap = track(configureTexture(makeContainer('#756246', '#52432e', 'rgba(98,62,36,0.3)'), true, 2, 1, maxAniso));
  const containerNavyMap = track(configureTexture(makeContainer('#28405a', '#18283a', 'rgba(110,64,34,0.34)'), true, 2, 1, maxAniso));
  const containerNormal = track(configureTexture(heightToNormalCanvas(contHC, 2.4), false, 2, 1, maxAniso));

  // 5. Sandbag Burlap Weave
  const [sbC, sbCtx] = makeCanvas(512, 512);
  sbCtx.fillStyle = '#8e7a5a';
  sbCtx.fillRect(0, 0, 512, 512);
  sbCtx.strokeStyle = 'rgba(55, 42, 26, 0.28)';
  sbCtx.lineWidth = 2;
  for (let i = 0; i < 512; i += 8) {
    sbCtx.beginPath();
    sbCtx.moveTo(0, i);
    sbCtx.lineTo(512, i);
    sbCtx.stroke();
    sbCtx.beginPath();
    sbCtx.moveTo(i, 0);
    sbCtx.lineTo(i, 512);
    sbCtx.stroke();
  }
  addGrain(sbCtx, 512, 512, 0.14);

  const [sbHC, sbHCtx] = makeCanvas(512, 512);
  sbHCtx.fillStyle = '#808080';
  sbHCtx.fillRect(0, 0, 512, 512);
  sbHCtx.strokeStyle = '#4a4a4a';
  sbHCtx.lineWidth = 2;
  for (let i = 0; i < 512; i += 8) {
    sbHCtx.beginPath();
    sbHCtx.moveTo(0, i);
    sbHCtx.lineTo(512, i);
    sbHCtx.stroke();
    sbHCtx.beginPath();
    sbHCtx.moveTo(i, 0);
    sbHCtx.lineTo(i, 512);
    sbHCtx.stroke();
  }
  addGrain(sbHCtx, 512, 512, 0.25);

  const sandbagMap = track(configureTexture(sbC, true, 1, 1, maxAniso));
  const sandbagNormal = track(configureTexture(heightToNormalCanvas(sbHC, 1.6), false, 1, 1, maxAniso));

  // 6. Tactical Military Supply Crate
  const [crateC, crateCtx] = makeCanvas(512, 512);
  crateCtx.fillStyle = '#534330';
  crateCtx.fillRect(0, 0, 512, 512);
  crateCtx.strokeStyle = '#251c13';
  crateCtx.lineWidth = 26;
  crateCtx.strokeRect(13, 13, 486, 486);
  crateCtx.beginPath();
  crateCtx.moveTo(26, 26);
  crateCtx.lineTo(486, 486);
  crateCtx.stroke();
  for (let y = 48; y < 464; y += 64) {
    crateCtx.fillStyle = 'rgba(0,0,0,0.28)';
    crateCtx.fillRect(26, y, 460, 5);
  }
  addGrain(crateCtx, 512, 512, 0.12);

  const [crateHC, crateHCtx] = makeCanvas(512, 512);
  crateHCtx.fillStyle = '#808080';
  crateHCtx.fillRect(0, 0, 512, 512);
  crateHCtx.strokeStyle = '#d0d0d0';
  crateHCtx.lineWidth = 26;
  crateHCtx.strokeRect(13, 13, 486, 486);

  const crateMap = track(configureTexture(crateC, true, 1, 1, maxAniso));
  const crateNormal = track(configureTexture(heightToNormalCanvas(crateHC, 1.6), false, 1, 1, maxAniso));

  // 7. Hazard Stripe Accent
  const [hazC, hazCtx] = makeCanvas(256, 256);
  hazCtx.fillStyle = '#d97706';
  hazCtx.fillRect(0, 0, 256, 256);
  hazCtx.fillStyle = '#141416';
  for (let i = -256; i < 512; i += 48) {
    hazCtx.beginPath();
    hazCtx.moveTo(i, 0);
    hazCtx.lineTo(i + 24, 0);
    hazCtx.lineTo(i + 280, 256);
    hazCtx.lineTo(i + 256, 256);
    hazCtx.closePath();
    hazCtx.fill();
  }
  addGrain(hazCtx, 256, 256, 0.08);
  const hazardMap = track(configureTexture(hazC, true, 2, 1, maxAniso));

  // 8. Soft Radial Contact Shadow
  const [csC, csCtx] = makeCanvas(128, 128);
  const csGrad = csCtx.createRadialGradient(64, 64, 6, 64, 64, 62);
  csGrad.addColorStop(0, 'rgba(0, 0, 0, 0.78)');
  csGrad.addColorStop(0.55, 'rgba(0, 0, 0, 0.35)');
  csGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  csCtx.fillStyle = csGrad;
  csCtx.fillRect(0, 0, 128, 128);
  const contactShadowMap = track(configureTexture(csC, true, 1, 1, 1));
  contactShadowMap.wrapS = THREE.ClampToEdgeWrapping;
  contactShadowMap.wrapT = THREE.ClampToEdgeWrapping;

  // 9. Crisp Muzzle Flash Sprite
  const [glC, glCtx] = makeCanvas(128, 128);
  const glGrad = glCtx.createRadialGradient(64, 64, 2, 64, 64, 60);
  glGrad.addColorStop(0, 'rgba(255, 248, 210, 1)');
  glGrad.addColorStop(0.28, 'rgba(255, 175, 65, 0.85)');
  glGrad.addColorStop(0.65, 'rgba(255, 90, 20, 0.22)');
  glGrad.addColorStop(1, 'rgba(255, 60, 0, 0)');
  glCtx.fillStyle = glGrad;
  glCtx.fillRect(0, 0, 128, 128);
  const glowSpriteMap = track(configureTexture(glC, true, 1, 1, 1));
  glowSpriteMap.wrapS = THREE.ClampToEdgeWrapping;
  glowSpriteMap.wrapT = THREE.ClampToEdgeWrapping;

  // 10. Industrial Steel Decking (Harbor Cranes & Quarry Bunkers)
  const [mpC, mpCtx] = makeCanvas(512, 512);
  mpCtx.fillStyle = '#333a42';
  mpCtx.fillRect(0, 0, 512, 512);
  mpCtx.strokeStyle = 'rgba(14, 18, 22, 0.55)';
  mpCtx.lineWidth = 3;
  for (let i = 0; i <= 512; i += 128) {
    mpCtx.beginPath();
    mpCtx.moveTo(i, 0);
    mpCtx.lineTo(i, 512);
    mpCtx.stroke();
    mpCtx.beginPath();
    mpCtx.moveTo(0, i);
    mpCtx.lineTo(512, i);
    mpCtx.stroke();
  }
  mpCtx.fillStyle = 'rgba(210, 222, 235, 0.2)';
  for (let y = 16; y < 512; y += 32) {
    for (let x = 16; x < 512; x += 32) {
      mpCtx.fillRect(x - 3, y - 1, 6, 2);
    }
  }
  addGrain(mpCtx, 512, 512, 0.12);

  const [mpHC, mpHCtx] = makeCanvas(512, 512);
  mpHCtx.fillStyle = '#808080';
  mpHCtx.fillRect(0, 0, 512, 512);
  mpHCtx.fillStyle = '#cccccc';
  for (let y = 16; y < 512; y += 32) {
    for (let x = 16; x < 512; x += 32) {
      mpHCtx.fillRect(x - 3, y - 1, 6, 2);
    }
  }
  const metalPlateMap = track(configureTexture(mpC, true, 2, 2, maxAniso));
  const metalPlateNormal = track(configureTexture(heightToNormalCanvas(mpHC, 1.8), false, 2, 2, maxAniso));

  // 11. Basalt Quarry Rock & Gravel
  const [qrC, qrCtx] = makeCanvas(512, 512);
  qrCtx.fillStyle = '#3d4147';
  qrCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 40; i++) {
    qrCtx.fillStyle = i % 2 === 0 ? 'rgba(22, 26, 32, 0.22)' : 'rgba(92, 98, 108, 0.14)';
    qrCtx.fillRect(0, (i / 40) * 512, 512, 8);
  }
  addGrain(qrCtx, 512, 512, 0.2);

  const [qrHC, qrHCtx] = makeCanvas(512, 512);
  qrHCtx.fillStyle = '#808080';
  qrHCtx.fillRect(0, 0, 512, 512);
  addGrain(qrHCtx, 512, 512, 0.45);
  const quarryRockMap = track(configureTexture(qrC, true, 16, 16, maxAniso));
  const quarryRockNormal = track(configureTexture(heightToNormalCanvas(qrHC, 2.0), false, 16, 16, maxAniso));

  // 12. Harbor Ocean Water Ripple Normal Map (fast direct pixel buffer)
  const [watHC, watHCtx] = makeCanvas(512, 512);
  const watImg = watHCtx.createImageData(512, 512);
  const watData = watImg.data;
  for (let y = 0; y < 512; y++) {
    const rowOff = y * 512;
    for (let x = 0; x < 512; x++) {
      const wv = Math.sin(x * 0.08 + y * 0.03) * 28 + Math.cos(y * 0.11 - x * 0.04) * 24;
      const v = wv < -128 ? 0 : wv > 127 ? 255 : (128 + wv) | 0;
      const idx = (rowOff + x) << 2;
      watData[idx] = v;
      watData[idx + 1] = v;
      watData[idx + 2] = v;
      watData[idx + 3] = 255;
    }
  }
  watHCtx.putImageData(watImg, 0, 0);
  const waterNormal = track(configureTexture(heightToNormalCanvas(watHC, 1.5), false, 24, 24, maxAniso));

  // 13. Etched Damascus Steel Pattern for Tactical Karambit Blade
  const [damC, damCtx] = makeCanvas(256, 256);
  damCtx.fillStyle = '#47505c';
  damCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 4) {
    damCtx.strokeStyle = y % 8 === 0 ? 'rgba(210, 224, 240, 0.25)' : 'rgba(20, 26, 34, 0.35)';
    damCtx.lineWidth = 2;
    damCtx.beginPath();
    for (let x = 0; x <= 256; x += 16) {
      const yy = y + Math.sin(x * 0.07 + y * 0.04) * 6;
      if (x === 0) damCtx.moveTo(x, yy);
      else damCtx.lineTo(x, yy);
    }
    damCtx.stroke();
  }
  const damascusMap = track(configureTexture(damC, true, 1, 1, maxAniso));

  // 14. Tactical MultiCam & Digital Fatigues + Operator Face/Balaclava + MOLLE Cordura Vest
  const makeCamo = (base: string, c1: string, c2: string, c3: string, highlight: string) => {
    const [c, ctx] = makeCanvas(256, 256);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    const colors = [c1, c2, c3, highlight];
    for (let i = 0; i < 88; i++) {
      ctx.fillStyle = colors[i % 4];
      const rx = (i * 73) % 256;
      const ry = (i * 137) % 256;
      const rw = 16 + ((i * 19) % 30);
      const rh = 9 + ((i * 23) % 18);
      const rot = ((i * 41) % 314) * 0.01;
      for (const ox of [0, -256, 256]) {
        for (const oy of [0, -256, 256]) {
          if (rx + ox < -50 || rx + ox > 306 || ry + oy < -50 || ry + oy > 306) continue;
          ctx.save();
          ctx.translate(rx + ox, ry + oy);
          ctx.rotate(rot);
          ctx.beginPath();
          ctx.ellipse(0, 0, rw * 0.62, rh * 0.55, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    }
    // Ripstop crosshatch weave
    ctx.strokeStyle = 'rgba(0,0,0,0.14)';
    ctx.lineWidth = 1;
    for (let p = 0; p < 256; p += 8) {
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, 256);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(256, p);
      ctx.stroke();
    }
    addGrain(ctx, 256, 256, 0.07);
    return c;
  };
  const camoWoodlandMap = track(
    configureTexture(makeCamo('#4d573d', '#303827', '#6c6248', '#25291f', '#89856a'), true, 2, 2, maxAniso),
  );
  const camoUrbanMap = track(
    configureTexture(makeCamo('#454c57', '#2b3038', '#626b7a', '#1d2128', '#7d8898'), true, 2, 2, maxAniso),
  );
  const camoDesertMap = track(
    configureTexture(makeCamo('#7b6d52', '#5b503b', '#9a8b6a', '#433b2c', '#b3a382'), true, 2, 2, maxAniso),
  );

  // Operator Head / Balaclava + Eye-Bridge Skin Texture (cylindrical UV: x=128 is front center)
  const makeOperatorFace = (skullPrint: boolean) => {
    const [fc, fctx] = makeCanvas(256, 256);
    // Dark tactical balaclava base
    fctx.fillStyle = skullPrint ? '#1b1d21' : '#262b24';
    fctx.fillRect(0, 0, 256, 256);

    // Subtle knit rib lines on hood/neck
    fctx.strokeStyle = 'rgba(255,255,255,0.045)';
    fctx.lineWidth = 1.5;
    for (let y = 0; y < 256; y += 5) {
      fctx.beginPath();
      fctx.moveTo(0, y);
      fctx.lineTo(256, y);
      fctx.stroke();
    }

    // Neck gaiter / collar seam fold near bottom
    fctx.fillStyle = 'rgba(0,0,0,0.34)';
    fctx.fillRect(0, 194, 256, 12);
    fctx.fillStyle = 'rgba(255,255,255,0.05)';
    fctx.fillRect(0, 188, 256, 5);

    // Human eye-opening skin strip centered at front (x=128, y=68..106)
    const skinGrad = fctx.createLinearGradient(86, 66, 86, 108);
    skinGrad.addColorStop(0, '#a67658');
    skinGrad.addColorStop(0.45, '#cc9878');
    skinGrad.addColorStop(1, '#9c6e52');
    fctx.fillStyle = skinGrad;
    fctx.beginPath();
    fctx.ellipse(128, 86, 36, 17, 0, 0, Math.PI * 2);
    fctx.fill();

    // Brow shadow & realistic eyes + eyebrows
    fctx.fillStyle = 'rgba(42, 24, 16, 0.55)';
    fctx.fillRect(98, 76, 22, 4);
    fctx.fillRect(136, 76, 22, 4);
    // Eye sockets & sclera/iris
    for (const ex of [112, 144]) {
      fctx.fillStyle = '#382218';
      fctx.beginPath();
      fctx.ellipse(ex, 86, 8, 4.5, 0, 0, Math.PI * 2);
      fctx.fill();
      fctx.fillStyle = '#d8cec4';
      fctx.beginPath();
      fctx.ellipse(ex, 86, 6, 3, 0, 0, Math.PI * 2);
      fctx.fill();
      fctx.fillStyle = '#1b1d22';
      fctx.beginPath();
      fctx.arc(ex, 86, 2.5, 0, Math.PI * 2);
      fctx.fill();
    }

    // Nose bridge shadow on balaclava
    fctx.fillStyle = 'rgba(0,0,0,0.28)';
    fctx.fillRect(118, 102, 20, 26);

    if (skullPrint) {
      // Iconic Call of Duty Ghost-inspired weathered skull jaw & nasal bone print
      fctx.fillStyle = '#dcd7cb';
      // Nasal cavity & cheekbone arches
      fctx.beginPath();
      fctx.moveTo(100, 114);
      fctx.lineTo(156, 114);
      fctx.lineTo(150, 142);
      fctx.lineTo(106, 142);
      fctx.closePath();
      fctx.fill();
      // Black nasal triangle
      fctx.fillStyle = '#15171b';
      fctx.beginPath();
      fctx.moveTo(128, 114);
      fctx.lineTo(121, 130);
      fctx.lineTo(135, 130);
      fctx.closePath();
      fctx.fill();
      // Jaw & teeth bars
      fctx.fillStyle = '#e4dfd2';
      fctx.fillRect(108, 140, 40, 26);
      fctx.fillStyle = '#14161a';
      for (let tx = 111; tx <= 145; tx += 7) {
        fctx.fillRect(tx, 145, 2.5, 18);
      }
      fctx.fillRect(108, 153, 40, 2.5);
    } else {
      // Tactical mesh respirator / balaclava seam stitching
      fctx.strokeStyle = 'rgba(255,255,255,0.09)';
      fctx.lineWidth = 1.5;
      fctx.beginPath();
      fctx.moveTo(100, 110);
      fctx.quadraticCurveTo(128, 124, 156, 110);
      fctx.stroke();
      fctx.fillStyle = 'rgba(0,0,0,0.38)';
      for (let my = 122; my <= 148; my += 7) {
        for (let mx = 114; mx <= 142; mx += 7) {
          fctx.fillRect(mx, my, 3, 3);
        }
      }
    }

    addGrain(fctx, 256, 256, 0.06);
    const tex = track(configureTexture(fc, true, 1, 1, maxAniso));
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  };
  const operatorFaceMap = makeOperatorFace(false);
  const ghostFaceMap = makeOperatorFace(true);

  // MOLLE Cordura Plate Carrier Weave Map (tiled webbing + tactical stitching)
  const [mvC, mvCtx] = makeCanvas(256, 256);
  mvCtx.fillStyle = '#c8c4bc';
  mvCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) {
    // PALS / MOLLE horizontal webbing bands
    mvCtx.fillStyle = 'rgba(30, 28, 24, 0.28)';
    mvCtx.fillRect(0, y + 6, 256, 14);
    mvCtx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    mvCtx.fillRect(0, y + 6, 256, 2);
    // Vertical bar-tack stitches every 32px
    mvCtx.fillStyle = 'rgba(18, 18, 18, 0.48)';
    for (let x = 14; x < 256; x += 32) {
      mvCtx.fillRect(x, y + 5, 4, 16);
    }
  }
  addGrain(mvCtx, 256, 256, 0.09);
  const molleVestMap = track(configureTexture(mvC, true, 3, 3, maxAniso));

  const [fabHC, fabHCtx] = makeCanvas(256, 256);
  fabHCtx.fillStyle = '#808080';
  fabHCtx.fillRect(0, 0, 256, 256);
  fabHCtx.strokeStyle = '#a8a8a8';
  fabHCtx.lineWidth = 1;
  for (let p = 0; p < 256; p += 6) {
    fabHCtx.beginPath();
    fabHCtx.moveTo(p, 0);
    fabHCtx.lineTo(p, 256);
    fabHCtx.stroke();
    fabHCtx.beginPath();
    fabHCtx.moveTo(0, p);
    fabHCtx.lineTo(256, p);
    fabHCtx.stroke();
  }
  const fabricNormal = track(configureTexture(heightToNormalCanvas(fabHC, 1.4), false, 3, 3, maxAniso));

  const [armHC, armHCtx] = makeCanvas(256, 256);
  armHCtx.fillStyle = '#808080';
  armHCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 8) {
    for (let x = 0; x < 256; x += 8) {
      armHCtx.fillStyle = ((x + y) / 8) % 2 === 0 ? '#9c9c9c' : '#646464';
      armHCtx.fillRect(x, y, 7, 7);
    }
  }
  const armorPlateNormal = track(configureTexture(heightToNormalCanvas(armHC, 1.8), false, 3, 3, maxAniso));

  // 15. Aim Training Ground Concrete Range Deck + Crisp Distance Marker Signs
  const [rngC, rngCtx] = makeCanvas(512, 512);
  rngCtx.fillStyle = '#383e46';
  rngCtx.fillRect(0, 0, 512, 512);
  rngCtx.strokeStyle = 'rgba(15, 20, 26, 0.6)';
  rngCtx.lineWidth = 2;
  for (let i = 0; i <= 512; i += 128) {
    rngCtx.beginPath();
    rngCtx.moveTo(i, 0);
    rngCtx.lineTo(i, 512);
    rngCtx.stroke();
    rngCtx.beginPath();
    rngCtx.moveTo(0, i);
    rngCtx.lineTo(512, i);
    rngCtx.stroke();
  }
  // Subtle ballistic lane stripe
  rngCtx.fillStyle = 'rgba(245, 158, 11, 0.12)';
  rngCtx.fillRect(252, 0, 8, 512);
  addGrain(rngCtx, 512, 512, 0.1);
  const rangeLaneMap = track(configureTexture(rngC, true, 8, 12, maxAniso));

  const makeRangeSign = (distLabel: string) => {
    const [sc, sctx] = makeCanvas(256, 128);
    sctx.fillStyle = '#11161d';
    sctx.fillRect(0, 0, 256, 128);
    sctx.strokeStyle = '#f59e0b';
    sctx.lineWidth = 6;
    sctx.strokeRect(5, 5, 246, 118);
    sctx.fillStyle = '#f8fafc';
    sctx.font = 'bold 56px "Chakra Petch", sans-serif';
    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    sctx.fillText(distLabel, 128, 54);
    sctx.fillStyle = '#fbbf24';
    sctx.font = '600 18px "Chakra Petch", sans-serif';
    sctx.fillText('LIVE FIRE LANE', 128, 98);
    const tex = track(configureTexture(sc, true, 1, 1, maxAniso));
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  };

  const rangeSign10Map = makeRangeSign('10M');
  const rangeSign20Map = makeRangeSign('20M');
  const rangeSign30Map = makeRangeSign('30M');
  const rangeSign45Map = makeRangeSign('45M');

  return {
    asphaltMap,
    asphaltNormal,
    asphaltRoughness,
    desertMap,
    desertNormal,
    concreteMap,
    concreteNormal,
    containerOliveMap,
    containerTanMap,
    containerNavyMap,
    containerNormal,
    sandbagMap,
    sandbagNormal,
    crateMap,
    crateNormal,
    metalPlateMap,
    metalPlateNormal,
    quarryRockMap,
    quarryRockNormal,
    waterNormal,
    damascusMap,
    camoWoodlandMap,
    camoUrbanMap,
    camoDesertMap,
    operatorFaceMap,
    ghostFaceMap,
    molleVestMap,
    fabricNormal,
    armorPlateNormal,
    hazardMap,
    contactShadowMap,
    glowSpriteMap,
    rangeLaneMap,
    rangeSign10Map,
    rangeSign20Map,
    rangeSign30Map,
    rangeSign45Map,
    dispose: () => {
      allTextures.forEach((t) => t.dispose());
    },
  };
}

