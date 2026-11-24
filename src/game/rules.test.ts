import test from 'node:test';
import assert from 'node:assert/strict';
import {
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
  computeKpm,
  computeWeaponSpread,
  consumeAmmo,
  createInitialWeaponsState,
  evaluateMeleeStrike,
  getGraphicsPreset,
  getNextMapId,
  getWaveConfig,
  GRAPHICS_PRESETS,
  resolveCircleObstacles,
  resolveMatchingGraphicsPreset,
  WEAPON_SPECS,
} from './rules';
import {
  computeMusicMixParameters,
  computeSchedulerSteps,
  createSoftClipCurve,
  midiToFreq,
  resolveMusicIntensity,
  STEP_DURATION_SEC,
  TOTAL_STEPS,
} from './musicTheory';

test('ammo firing and reload mechanics work accurately', () => {
  const weapons = createInitialWeaponsState();
  let rifle = weapons.rifle;
  assert.equal(canFireWeapon(rifle, false, 'rifle'), true);
  assert.equal(canFireWeapon(rifle, true, 'rifle'), false);

  rifle = consumeAmmo(rifle, 'rifle');
  assert.equal(rifle.mag, 29);
  assert.equal(canReloadWeapon(rifle, WEAPON_SPECS.rifle.magSize, false, 'rifle'), true);

  rifle = applyReload(rifle, WEAPON_SPECS.rifle.magSize);
  assert.equal(rifle.mag, 30);
  assert.equal(rifle.reserve, 149);
});

test('tactical knife cannot reload, stays always ready, and evaluates melee cone + backstabs', () => {
  const weapons = createInitialWeaponsState();
  assert.equal(canFireWeapon(weapons.knife, false, 'knife'), true);
  assert.equal(canReloadWeapon(weapons.knife, 1, false, 'knife'), false);

  // Player at (0, 0) facing North (-Z, yaw = 0), enemy directly ahead at (0, -2.1)
  const frontStrike = evaluateMeleeStrike(
    0,
    0,
    0,
    0,
    [{ id: 1, x: 0, y: 0, z: -2.1, facingYaw: 0 }], // facing +Z toward player -> frontal strike
    false,
  );
  // Wait: Three.js model local +Z rotated by yaw=0 faces +Z (toward player at z=0 from z=-2.1)
  assert.equal(frontStrike?.targetId, 1);
  assert.equal(frontStrike?.damage, 70);
  assert.equal(frontStrike?.isBackstab, false);

  // Enemy facing away (-Z, yaw=Math.PI) -> backstab!
  const backstabHeavy = evaluateMeleeStrike(
    0,
    0,
    0,
    0,
    [{ id: 2, x: 0, y: 0, z: -2.6, facingYaw: Math.PI }],
    true,
  );
  assert.equal(backstabHeavy?.targetId, 2);
  assert.equal(backstabHeavy?.isBackstab, true);
  assert.equal(backstabHeavy?.damage, 174);

  // Enemy behind player at z = +2.0 -> out of forward cone
  const miss = evaluateMeleeStrike(0, 0, 0, 0, [{ id: 3, x: 0, y: 0, z: 2.0, facingYaw: 0 }], false);
  assert.equal(miss, null);
});

test('map queue cycles cleanly across all 3 tactical arenas', () => {
  assert.deepEqual(buildMapQueue('harbor'), ['harbor', 'quarry', 'ironclad']);
  assert.equal(getNextMapId('ironclad'), 'harbor');
  assert.equal(getNextMapId('harbor'), 'quarry');
  assert.equal(getNextMapId('quarry'), 'ironclad');
});

test('ADS tightens weapon spread and sniper headshots deal multiplied damage', () => {
  const rifleHip = computeWeaponSpread(WEAPON_SPECS.rifle, false, 0, 0);
  const rifleAds = computeWeaponSpread(WEAPON_SPECS.rifle, true, 0, 0);
  assert.ok(rifleAds < rifleHip);

  const sniperBody = computeHitDamage(WEAPON_SPECS.sniper, 25, false);
  const sniperHead = computeHitDamage(WEAPON_SPECS.sniper, 25, true);
  assert.equal(sniperBody, 88);
  assert.ok(sniperHead > 200);
});

test('explosion damage falls off smoothly with distance', () => {
  assert.equal(computeExplosionDamage(0, 7, 140), 140);
  assert.ok(computeExplosionDamage(3.5, 7, 140) > 40);
  assert.equal(computeExplosionDamage(8, 7, 140), 0);
});

test('player damage absorbs partially via armor and detects defeat', () => {
  const hit1 = applyPlayerDamage(100, 50, 40);
  assert.equal(hit1.armor, 26);
  assert.equal(hit1.hp, 84);
  assert.equal(hit1.defeated, false);

  const lethal = applyPlayerDamage(20, 0, 35);
  assert.equal(lethal.hp, 0);
  assert.equal(lethal.defeated, true);
});

test('circle-vs-AABB collision pushes actor outside solid cover and arena bounds', () => {
  const box = {
    id: 'cover-1',
    minX: -2,
    maxX: 2,
    minZ: -1,
    maxZ: 1,
    height: 1.5,
    kind: 'barrier' as const,
  };
  const resolved = resolveCircleObstacles(0, 0.8, 0.6, [box], 30);
  assert.ok(resolved.z >= 1.59);

  const clamped = resolveCircleObstacles(45, -50, 0.6, [], 30);
  assert.equal(clamped.x, 29.4);
  assert.equal(clamped.z, -29.4);
});

test('wave progression scales enemies, eases standard bots, enables impossible tier, and win/loss conditions fire properly', () => {
  const w1 = getWaveConfig(1, 'standard');
  const w1Vet = getWaveConfig(1, 'veteran');
  const w1Imp = getWaveConfig(1, 'impossible');
  const w5 = getWaveConfig(5, 'veteran');

  assert.ok(w1.hpScale < 1 && w1.damageScale < 1 && w1.accuracyScale < 1);
  assert.ok(w1.cooldownScale > 1 && w1.telegraphScale > 1);
  assert.ok(w1Vet.hpScale > w1.hpScale && w1Vet.damageScale > w1.damageScale);
  assert.ok(w1Imp.hpScale >= 1.5 && w1Imp.damageScale >= 1.8 && w1Imp.accuracyScale >= 1.3);
  assert.ok(w1Imp.cooldownScale < 0.7 && w1Imp.telegraphScale < 0.7);
  assert.ok(w1Imp.totalEnemies > w1.totalEnemies && w1Imp.attackTokens > w1.attackTokens);

  assert.ok(w5.totalEnemies > w1.totalEnemies);
  assert.ok(w5.hpScale > w1.hpScale);

  assert.equal(checkMatchOutcome(0, 3, 2), 'defeat');
  assert.equal(checkMatchOutcome(75, 5, 0), 'victory');
  assert.equal(checkMatchOutcome(75, 5, 1), 'ongoing');
});

test('musicTheory MIDI LUT, adaptive intensity, map transposition, and scheduler behave accurately', () => {
  // A4 = 440 Hz, D2 (~38) < A4
  assert.ok(Math.abs(midiToFreq(69) - 440) < 0.01);
  assert.ok(Math.abs(midiToFreq(57) - 220) < 0.01);

  assert.equal(resolveMusicIntensity('title', 1, 100, 0, false), 'briefing');
  assert.equal(resolveMusicIntensity('paused', 3, 80, 5, false), 'paused');
  assert.equal(resolveMusicIntensity('playing', 2, 90, 0, true), 'stealth');
  assert.equal(resolveMusicIntensity('playing', 2, 90, 4, false), 'combat');
  assert.equal(resolveMusicIntensity('playing', 4, 90, 4, false), 'climax');
  assert.equal(resolveMusicIntensity('playing', 1, 25, 4, false), 'climax');

  const harborMix = computeMusicMixParameters('combat', 'harbor');
  const quarryMix = computeMusicMixParameters('climax', 'quarry');
  assert.equal(harborMix.transposeSemitones, -2);
  assert.equal(quarryMix.transposeSemitones, 2);
  assert.ok(quarryMix.cutoffHz > harborMix.cutoffHz);

  // Lookahead scheduler wraps around 64 steps and clamps long main-thread stalls
  const normal = computeSchedulerSteps(1.0, 1.0, 62, 0.25, STEP_DURATION_SEC);
  assert.ok(normal.events.length >= 2);
  assert.equal(normal.events[0].stepIndex, 62);
  assert.equal(normal.events[1].stepIndex, 63);
  assert.equal(normal.events[2].stepIndex, 0);
  assert.ok(normal.nextStepIndex < TOTAL_STEPS);

  const stalled = computeSchedulerSteps(10.0, 2.0, 0, 0.12, STEP_DURATION_SEC);
  assert.ok(stalled.events.length <= 2);
  assert.ok(stalled.events[0].timeSec >= 10.0);

  // Soft-clip WaveShaper curve stays bounded in [-1, 1] and monotonic
  const curve = createSoftClipCurve(256, 1.65);
  assert.equal(curve.length, 256);
  assert.ok(Math.abs(curve[0] + 1) < 0.001);
  assert.ok(Math.abs(curve[255] - 1) < 0.001);
  assert.ok(curve[200] > curve[128]);
});

test('graphics presets, custom patching, and aim training stats compute accurately', () => {
  const balanced = getGraphicsPreset('balanced');
  assert.equal(balanced.aoQuality, 'off');
  assert.equal(balanced.postFx, 'off');
  assert.equal(balanced.renderScale, 1.0);

  const custom = applyGraphicsPatch(balanced, { shadowQuality: 'high' });
  assert.equal(custom.preset, 'custom');
  assert.equal(custom.shadowQuality, 'high');

  const ultraMatch = resolveMatchingGraphicsPreset({
    ...GRAPHICS_PRESETS.ultra,
  });
  assert.equal(ultraMatch, 'ultra');

  assert.equal(computeKpm(15, 30), 30);
  assert.equal(computeKpm(0, 10), 0);
  assert.equal(computeHeadshotPercent(10, 6), 60);
  assert.equal(computeAvgTtkMs(4.5, 9), 500);
});
