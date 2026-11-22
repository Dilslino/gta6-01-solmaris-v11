// SOLMARIS — main game: loop, rendering (2.5D canvas), HUD, wanted, shop, missions.
// Vanilla JS, ES modules, no external dependencies, no network.
import { buildWorld, WORLD_W, WORLD_H, DISTRICTS, ROADS_H, ROADS_V, ROAD_W, LANDMARKS, collideBuildings, clampWorld, pointOnRoad, inBeach, inWater, inPark } from './world.js';
import { makeCar, makePed, spawnTraffic, spawnParked, spawnPeds, driveCar, updateTrafficCar, updatePed, updatePoliceCar, dist, CAR_DEFS } from './entities.js';
import { MISSIONS, missionById, createMissionState, updateMission, missionMarker, missionStartMarkers } from './missions.js';
import { loadSave, storeSave, SHOP_ITEMS, buyItem, engineMultiplier, maxHealth, armorFactor } from './save.js';
import { SoundEngine } from './audio.js';
import { Input } from './input.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const minimap = document.getElementById('minimap');
const mctx = minimap.getContext('2d');

const save = loadSave();
const sound = new SoundEngine();
const input = new Input();
const world = buildWorld();

const game = {
  state: 'menu', // menu | playing | paused | wasted | shop
  time: 0,
  player: { x: 1050, y: 620, angle: 0, speed: 0, health: maxHealth(save) },
  playerCar: null,
  cars: [],
  peds: [],
  police: [],
  wanted: 0,
  wantedCooldown: 0,
  hideTimer: 0,
  mission: null,
  missionState: null,
  camera: { x: 1050, y: 620 },
  toastTimer: null,
  targetCarRef: null,
  stats: { crimes: 0, carsStolen: 0, missionsDone: 0 },
};
game.save = save;
game.sound = sound;
game.toast = (msg, ms) => showToast(msg, ms);
game.spawnTargetCar = () => {
  const t = makeCar('car_muscle', LANDMARKS.bridge.x + 80, LANDMARKS.bridge.y, Math.PI / 2, { traffic: true });
  t.color = '#111111'; t.health = 120;
  game.cars.push(t);
  game.targetCarRef = t;
  return t;
};

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// ---------- entities setup ----------
game.cars = [...spawnParked(world, save), ...spawnTraffic(world, 14)];
game.peds = spawnPeds(36);

function nearestCar(maxDist) {
  let best = null, bd = maxDist;
  for (const c of game.cars) {
    if (c.dead || c.isPolice) continue;
    const d = dist(game.player, c);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
function nearestMissionMarker() {
  for (const mk of missionStartMarkers()) {
    if (dist(game.player, mk) < 110) return mk;
  }
  return null;
}
function nearGarage() { return dist(game.player, LANDMARKS.garage) < 150; }

// ---------- wanted / police ----------
function addWanted(n, reason) {
  game.wanted = Math.min(5, game.wanted + n);
  game.wantedCooldown = 8;
  game.stats.crimes++;
  if (reason) showToast(reason + ' — Wanted level up!', 2200);
  updatePolice();
}
function updatePolice() {
  const want = game.wanted;
  // Spawn / despawn cruisers to match wanted level.
  while (game.police.length < want) {
    const a = Math.random() * Math.PI * 2;
    const c = makeCar('car_police', game.player.x + Math.cos(a) * 500, game.player.y + Math.sin(a) * 500, 0, {});
    game.police.push(c);
    game.cars.push(c);
  }
  while (game.police.length > want) {
    const c = game.police.pop();
    c.dead = true;
    game.cars = game.cars.filter((x) => x !== c);
  }
  if (want > 0) sound.startSiren(); else sound.stopSiren();
}
function decayWanted(dt) {
  if (game.wanted === 0) return;
  game.wantedCooldown -= dt;
  // Hiding: on foot, slow, far from police, out of sight of the chase.
  const nearestCop = game.police.length ? Math.min(...game.police.map((p) => dist(game.player, p))) : 9999;
  const moving = game.playerCar ? Math.abs(game.playerCar.speed) : Math.abs(game.player.speed || 0);
  if (nearestCop > 420 && moving < 40 && game.wantedCooldown <= 0) {
    game.hideTimer += dt;
    if (game.hideTimer > 4) { game.wanted--; game.hideTimer = 0; game.wantedCooldown = 6; showToast('You lay low… Wanted level down.', 1800); updatePolice(); }
  } else game.hideTimer = 0;
}

// ---------- missions ----------
function startMission(mission) {
  game.mission = mission;
  game.missionState = createMissionState(mission, game);
  if (mission.wantedOnStart) { game.wanted = Math.max(game.wanted, mission.wantedOnStart); updatePolice(); }
  showToast('MISSION: ' + mission.name + ' — ' + mission.desc, 4200);
  sound.success();
}
function completeMission() {
  const ms = game.missionState;
  const reward = ms.mission.reward;
  save.money += reward;
  save.totalEarned += reward;
  save.missionsDone[ms.mission.id] = (save.missionsDone[ms.mission.id] || 0) + 1;
  storeSave(save);
  game.stats.missionsDone++;
  showToast('MISSION COMPLETE! +$' + reward, 3500);
  sound.success();
  game.mission = null; game.missionState = null;
  if (game.wanted > 0) { game.wanted = Math.max(0, game.wanted - 1); updatePolice(); }
}
function failMission(reason) {
  showToast('MISSION FAILED: ' + (reason || 'time ran out'), 3000);
  sound.fail();
  game.mission = null; game.missionState = null;
}
function abandonMission() { if (game.mission) failMission('abandoned'); }

// ---------- toast / HUD ----------
let toastEl = document.getElementById('toast');
function showToast(msg, ms) {
  toastEl.textContent = msg;
  toastEl.style.opacity = '1';
  clearTimeout(game.toastTimer);
  game.toastTimer = setTimeout(() => { toastEl.style.opacity = '0'; }, ms || 2400);
}
function updateHUD() {
  document.getElementById('money').textContent = '$' + save.money.toLocaleString('en-US');
  const starsEl = document.getElementById('stars');
  let s = '';
  for (let i = 0; i < 5; i++) s += '<span class="' + (i < game.wanted ? 'lit' : 'dim') + '">★</span>';
  starsEl.innerHTML = s;
  const mh = maxHealth(save);
  document.getElementById('health-fill').style.width = Math.max(0, (game.player.health / mh) * 100) + '%';
  const speedEl = document.getElementById('speed');
  const spd = game.playerCar ? Math.abs(Math.round(game.playerCar.speed * 0.22)) : Math.abs(Math.round((game.player.speed || 0) * 0.22));
  speedEl.innerHTML = spd + ' <small>MPH</small>';
  document.getElementById('vehicle-label').textContent = game.playerCar ? game.playerCar.def.name.toUpperCase() + ' — ' + game.playerCar.color : 'ON FOOT';
  const title = document.getElementById('mission-title');
  const obj = document.getElementById('mission-obj');
  const timer = document.getElementById('mission-timer');
  if (game.missionState) {
    title.textContent = game.missionState.mission.name + '  •  $' + game.missionState.mission.reward;
    obj.textContent = game.missionState.objective;
    timer.textContent = '⏱ ' + Math.ceil(game.missionState.timeLeft) + 's left';
  } else {
    title.textContent = 'FREE ROAM';
    obj.textContent = 'Drive to a yellow ! marker and press E to start a mission. Steal a car with Space near it.';
    timer.textContent = 'Missions done: ' + game.stats.missionsDone + '  •  Crimes: ' + game.stats.crimes;
  }
  const hint = document.getElementById('hint');
  let h = '';
  if (!game.playerCar) {
    const c = nearestCar(110);
    if (c) h = 'Press SPACE to steal the ' + c.def.name;
  }
  const mk = !game.mission ? nearestMissionMarker() : null;
  if (mk) h = 'Press E to start: ' + mk.mission.name + ' ($' + mk.mission.reward + ')';
  if (nearGarage() && !game.mission) h = 'Press B to open Leonida Motors shop';
  hint.textContent = h;
}

// ---------- update ----------
function update(dt) {
  game.time += dt;
  const p = game.player;

  // Pause / mute / shop toggles.
  if (input.hit('p')) { togglePause(); }
  if (input.hit('m')) { sound.setMuted(!sound.muted); showToast(sound.muted ? 'Sound muted [M]' : 'Sound on [M]', 1200); }
  if (input.hit('b') && nearGarage() && game.state === 'playing') { openShop(); }
  if (input.hit('b') && game.state === 'shop') { closeShop(); }
  if (game.state !== 'playing') return;

  if (input.hit('e')) {
    if (game.mission) { /* E does nothing mid-mission except context */ }
    else {
      const mk = nearestMissionMarker();
      if (mk) startMission(mk.mission);
      else if (nearGarage()) openShop();
    }
  }

  // Enter / exit car.
  if (input.hit(' ')) {
    if (game.playerCar) {
      const car = game.playerCar;
      game.playerCar = null;
      p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 46;
      p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 46;
      p.angle = car.angle;
      car.speed *= 0.4;
      sound.setEngine(0, false);
    } else {
      const c = nearestCar(120);
      if (c) {
        game.playerCar = c;
        c.parked = false; c.traffic = false;
        if (c.color !== '#ff2e63' && c.kind !== 'car_police') { /* stolen */ }
        game.stats.carsStolen++;
        if (game.wanted === 0 && Math.random() < 0.6) addWanted(1, 'Grand theft auto!');
        else if (game.wanted > 0) addWanted(0, '');
        showToast('You took the ' + c.def.name + '. Drive!', 1800);
        sound.horn();
      }
    }
  }

  // Movement.
  if (game.playerCar) {
    const car = game.playerCar;
    const res = driveCar(car, input, dt, engineMultiplier(save), world);
    p.x = car.x; p.y = car.y; p.angle = car.angle;
    if (res.crashed) {
      sound.crash();
      p.health -= Math.min(18, res.impact * 0.05) * armorFactor(save);
      if (game.wanted > 0) { /* crashing near cops is fine */ }
    }
    sound.setEngine(Math.abs(car.speed) / (car.def.topSpeed * engineMultiplier(save)), true);
    // Car-vs-car collisions.
    for (const o of game.cars) {
      if (o === car || o.dead) continue;
      const d = dist(car, o);
      if (d < 62) {
        const push = (62 - d) / 2;
        const dx = (car.x - o.x) / (d || 1), dy = (car.y - o.y) / (d || 1);
        car.x += dx * push; car.y += dy * push;
        if (!o.traffic && !o.isPolice) { o.x -= dx * push; o.y -= dy * push; }
        if (Math.abs(car.speed) > 120) {
          o.health -= 8;
          if (o.isPolice) { addWanted(1, 'You hit a cop car!'); p.health -= 4; }
          if (o.health <= 0 && !o.dead) { o.dead = true; sound.crash(); if (o.isPolice) addWanted(1, 'Cop car wrecked!'); }
          car.speed *= 0.55;
          sound.crash();
        }
      }
    }
    // Running over pedestrians.
    for (const ped of game.peds) {
      if (ped.dead) continue;
      if (dist(car, ped) < 42 && Math.abs(car.speed) > 60) {
        ped.dead = true; sound.crash();
        addWanted(1, 'Pedestrian down!');
        p.health -= 2;
      }
    }
  } else {
    // On foot.
    const sp = input.brake ? 260 : 150;
    let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let my = (input.downKey ? 1 : 0) - (input.up ? 1 : 0);
    const len = Math.hypot(mx, my);
    if (len > 0) {
      mx /= len; my /= len;
      p.angle = Math.atan2(mx, -my);
      const nx = p.x + mx * sp * dt, ny = p.y + my * sp * dt;
      const col = collideBuildings(world.buildings, nx, ny, 14);
      const c = clampWorld(col.x, col.y);
      p.x = c.x; p.y = c.y;
      p.speed = sp;
    } else p.speed = 0;
    sound.setEngine(0, false);
  }

  // Traffic + peds + police AI.
  for (const c of game.cars) {
    if (c === game.playerCar || c.dead) continue;
    if (c.isPolice) continue;
    if (c.traffic) updateTrafficCar(c, dt, world, game.cars);
  }
  const danger = game.playerCar || p;
  for (const ped of game.peds) updatePed(ped, dt, world, Math.abs((game.playerCar && game.playerCar.speed) || 0) > 120 ? danger : null);
  // Respawn peds to keep the city alive.
  if (game.peds.filter((x) => !x.dead).length < 20 && Math.random() < dt * 0.5) {
    game.peds.push(makePed(p.x + (Math.random() - 0.5) * 900, p.y + (Math.random() - 0.5) * 700));
  }
  for (const cop of game.police) {
    if (cop.dead) continue;
    const res = updatePoliceCar(cop, p, dt, world);
    if (res.rammed) {
      p.health -= 14 * dt * armorFactor(save) * 4;
      if (game.playerCar) game.playerCar.speed *= 0.92;
      if (Math.random() < dt * 2) sound.crash();
    }
  }
  // Police on foot contact (busted if health low handled below).
  decayWanted(dt);

  // Mission update.
  if (game.missionState) {
    const result = updateMission(game.missionState, game, dt);
    if (result === 'complete') completeMission();
    else if (result === 'failed') failMission('time ran out');
  }

  // Health regen (slow) + wasted check.
  if (p.health < maxHealth(save) && game.wanted === 0) p.health = Math.min(maxHealth(save), p.health + 1.5 * dt);
  if (p.health <= 0) {
    game.state = 'wasted';
    const lost = Math.min(save.money, 150);
    save.money -= lost; storeSave(save);
    document.getElementById('gameover-text').textContent = 'The Leonida PD got you. You lost $' + lost + ', but the city is still yours.';
    document.getElementById('gameover-panel').style.display = 'flex';
    sound.stopSiren(); sound.fail();
  }

  // Camera follows player smoothly.
  game.camera.x += (p.x - game.camera.x) * Math.min(1, dt * 5);
  game.camera.y += (p.y - game.camera.y) * Math.min(1, dt * 5);
  updateHUD();
}

// ---------- rendering ----------
function drawCarShape(c, isPlayer) {
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(c.angle);
  const w = c.def.w, l = c.def.l;
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.fillRect(-w / 2 + 4, -l / 2 + 5, w, l);
  // Body with rounded look.
  ctx.fillStyle = c.color;
  roundRect(-w / 2, -l / 2, w, l, 10); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.25)';
  roundRect(-w / 2 + 4, -l / 2 + 8, w - 8, 14, 6); ctx.fill();
  // Cabin / windshield.
  ctx.fillStyle = '#12202e';
  roundRect(-w / 2 + 6, -l * 0.18, w - 12, l * 0.32, 6); ctx.fill();
  ctx.fillStyle = 'rgba(120,200,255,.5)';
  roundRect(-w / 2 + 8, -l * 0.16, w - 16, 8, 3); ctx.fill();
  // Headlights + taillights.
  ctx.fillStyle = '#fff8c0';
  ctx.fillRect(-w / 2 + 4, -l / 2 - 2, 10, 5); ctx.fillRect(w / 2 - 14, -l / 2 - 2, 10, 5);
  ctx.fillStyle = '#ff3b30';
  ctx.fillRect(-w / 2 + 4, l / 2 - 3, 10, 5); ctx.fillRect(w / 2 - 14, l / 2 - 3, 10, 5);
  if (c.isPolice) {
    ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('LCPD', 0, l * 0.32);
    // Light bar flashing.
    const on = Math.floor(game.time * 6) % 2 === 0;
    ctx.fillStyle = on ? '#ff2e2e' : '#2e7bff';
    ctx.fillRect(-14, -l * 0.32, 12, 7);
    ctx.fillStyle = on ? '#2e7bff' : '#ff2e2e';
    ctx.fillRect(2, -l * 0.32, 12, 7);
  }
  if (c.kind === 'car_taxi') { ctx.fillStyle = '#111'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('TAXI', 0, l * 0.32); }
  if (isPlayer) { ctx.strokeStyle = '#ffd23e'; ctx.lineWidth = 3; roundRect(-w / 2 - 3, -l / 2 - 3, w + 6, l + 6, 12); ctx.stroke(); }
  ctx.restore();
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawWorld() {
  const cam = game.camera;
  const vw = canvas.width, vh = canvas.height;
  const ox = vw / 2 - cam.x, oy = vh / 2 - cam.y;
  ctx.save();
  ctx.translate(ox, oy);
  // Ground base.
  ctx.fillStyle = '#2e3440'; ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  // Districts tint.
  for (const d of DISTRICTS) { ctx.fillStyle = d.ground; ctx.globalAlpha = 0.55; ctx.fillRect(d.x, d.y, d.w, d.h); ctx.globalAlpha = 1; }
  // Water + sand.
  ctx.fillStyle = '#1d6fb8'; ctx.fillRect(0, 1500, 130, 1100);
  ctx.fillStyle = '#e8d9a0'; ctx.fillRect(130, 1500, 560, 1100);
  // Park grass.
  ctx.fillStyle = '#2f6b34'; ctx.fillRect(700, 2100, 1100, 500);
  // Roads.
  ctx.fillStyle = '#23272f';
  for (const y of ROADS_H) ctx.fillRect(0, y - ROAD_W / 2, WORLD_W, ROAD_W);
  for (const x of ROADS_V) ctx.fillRect(x - ROAD_W / 2, 0, ROAD_W, WORLD_H);
  // Bridge to island (over water gap at x 2500-2700, y 1750).
  ctx.fillStyle = '#3d4450'; ctx.fillRect(2500, 1700, 220, 100);
  // Road markings.
  ctx.strokeStyle = '#f5d76e'; ctx.lineWidth = 3; ctx.setLineDash([26, 22]);
  ctx.beginPath();
  for (const y of ROADS_H) { ctx.moveTo(0, y); ctx.lineTo(WORLD_W, y); }
  for (const x of ROADS_V) { ctx.moveTo(x, 0); ctx.lineTo(x, WORLD_H); }
  ctx.stroke(); ctx.setLineDash([]);
  // Sidewalks.
  ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 2;
  for (const y of ROADS_H) { ctx.beginPath(); ctx.moveTo(0, y - ROAD_W / 2 - 6); ctx.lineTo(WORLD_W, y - ROAD_W / 2 - 6); ctx.moveTo(0, y + ROAD_W / 2 + 6); ctx.lineTo(WORLD_W, y + ROAD_W / 2 + 6); ctx.stroke(); }
  // Crates at docks.
  for (const cr of world.crates) { ctx.fillStyle = '#8a6f3c'; ctx.fillRect(cr.x, cr.y, cr.s, cr.s); ctx.strokeStyle = '#5c4a26'; ctx.strokeRect(cr.x, cr.y, cr.s, cr.s); }
  // Palm trees.
  for (const palm of world.palms) {
    ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(palm.x, palm.y); ctx.lineTo(palm.x + 4, palm.y - 18); ctx.stroke();
    ctx.fillStyle = '#2f8f4e';
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; ctx.beginPath(); ctx.ellipse(palm.x + 4 + Math.cos(a) * 10, palm.y - 20 + Math.sin(a) * 6, 12, 5, a, 0, Math.PI * 2); ctx.fill(); }
  }
  // Garage + landmark labels.
  ctx.fillStyle = '#ffd23e';
  ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left';
  for (const [key, lm] of Object.entries(LANDMARKS)) {
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(lm.x - 4, lm.y - 18, ctx.measureText(lm.label).width + 12, 18);
    ctx.fillStyle = '#ffd23e'; ctx.fillText(lm.label, lm.x + 2, lm.y - 5);
  }
  // Garage marker ($).
  ctx.fillStyle = '#7CFC9A'; ctx.beginPath(); ctx.arc(LANDMARKS.garage.x, LANDMARKS.garage.y, 26, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#062b12'; ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('$', LANDMARKS.garage.x, LANDMARKS.garage.y + 9);

  // Mission start markers (free roam).
  if (!game.mission) {
    for (const mk of missionStartMarkers()) {
      const bob = Math.sin(game.time * 3 + mk.x) * 5;
      ctx.fillStyle = '#ffd23e'; ctx.beginPath(); ctx.arc(mk.x, mk.y + bob, 20, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', mk.x, mk.y + bob + 8);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.fillText(mk.mission.name, mk.x, mk.y + bob + 36);
    }
  }
  // Active mission marker + cash bags + checkpoints.
  if (game.missionState) {
    const target = missionMarker(game.missionState);
    if (target) {
      const bob = Math.sin(game.time * 4) * 6;
      ctx.strokeStyle = '#ffd23e'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(target.x, target.y + bob, 34, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffd23e'; ctx.beginPath(); ctx.arc(target.x, target.y + bob, 8, 0, Math.PI * 2); ctx.fill();
    }
    if (game.missionState.mission.id === 'cash') {
      for (const bag of game.missionState.cashBags) {
        if (bag.taken) continue;
        ctx.fillStyle = '#7CFC9A'; ctx.beginPath(); ctx.arc(bag.x, bag.y, 14, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#062b12'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('$', bag.x, bag.y + 5);
      }
    }
  }

  // Depth-sorted draw: buildings (with fake height), cars, peds, player.
  const drawables = [];
  for (const b of world.buildings) drawables.push({ y: b.y + b.h, kind: 'building', b });
  for (const c of game.cars) if (!c.dead) drawables.push({ y: c.y + 20, kind: 'car', c });
  for (const ped of game.peds) if (!ped.dead) drawables.push({ y: ped.y, kind: 'ped', ped });
  drawables.sort((a, b) => a.y - b.y);
  for (const d of drawables) {
    if (d.kind === 'building') {
      const b = d.b;
      // Fake 3D: side wall + roof.
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(b.x + 6, b.y + 6, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y - b.height * 0.55, b.w, b.h + b.height * 0.55);
      ctx.fillStyle = b.roof; ctx.fillRect(b.x, b.y - b.height * 0.55, b.w, 10);
      // Windows on the wall face.
      ctx.fillStyle = 'rgba(180,220,255,.75)';
      const cols = Math.max(1, Math.floor(b.w / 26));
      for (let i = 0; i < cols; i++) for (let j = 0; j < 2; j++) ctx.fillRect(b.x + 8 + i * 26, b.y + 8 + j * 22, 12, 12);
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(b.x, b.y - b.height * 0.55, b.w, b.h + b.height * 0.55);
    } else if (d.kind === 'car') {
      drawCarShape(d.c, d.c === game.playerCar);
    } else if (d.kind === 'ped') {
      const ped = d.ped;
      const bob = Math.sin(ped.walkPhase) * 3;
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(ped.x, ped.y + 10, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = ped.color; ctx.beginPath(); ctx.arc(ped.x, ped.y + bob * 0.3, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1c2733'; ctx.beginPath(); ctx.arc(ped.x, ped.y - 11 + bob * 0.3, 6, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Player on foot.
  if (!game.playerCar) {
    const p = game.player;
    const bob = p.speed ? Math.sin(game.time * 12) * 2 : 0;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 12, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(p.x, p.y + bob); ctx.rotate(p.angle);
    ctx.fillStyle = '#ff5ea8'; ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd23e'; ctx.beginPath(); ctx.arc(0, -14, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111'; ctx.fillRect(-3, -22, 6, 8);
    ctx.restore();
    // Direction tick.
    ctx.strokeStyle = '#ffd23e'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.sin(p.angle) * 22, p.y - Math.cos(p.angle) * 22); ctx.stroke();
  }

  // Wanted flash vignette when chased.
  if (game.wanted > 0) {
    const pulse = 0.10 + 0.06 * Math.sin(game.time * 5);
    ctx.fillStyle = 'rgba(255,30,30,' + pulse.toFixed(3) + ')';
    ctx.fillRect(cam.x - vw / 2, cam.y - vh / 2, vw, 26);
    ctx.fillRect(cam.x - vw / 2, cam.y + vh / 2 - 26, vw, 26);
  }
  ctx.restore();
  drawMinimap();
}

function drawMinimap() {
  const s = 190 / WORLD_W;
  mctx.clearRect(0, 0, 190, 150);
  mctx.fillStyle = '#0d1b2e'; mctx.fillRect(0, 0, 190, 150);
  mctx.fillStyle = '#e8d9a0'; mctx.fillRect(0, 1500 * (150 / WORLD_H), 190 * (640 / WORLD_W), 150);
  mctx.fillStyle = '#1d6fb8'; mctx.fillRect(0, 1500 * (150 / WORLD_H), 130 * s, 150);
  mctx.fillStyle = '#2f6b34'; mctx.fillRect(700 * s, 2100 * (150 / WORLD_H), 1100 * s, 500 * (150 / WORLD_H));
  mctx.strokeStyle = '#5c6b7a'; mctx.lineWidth = 2;
  for (const y of ROADS_H) { mctx.beginPath(); mctx.moveTo(0, y * (150 / WORLD_H)); mctx.lineTo(190, y * (150 / WORLD_H)); mctx.stroke(); }
  for (const x of ROADS_V) { mctx.beginPath(); mctx.moveTo(x * s, 0); mctx.lineTo(x * s, 150); mctx.stroke(); }
  // Mission marker.
  if (game.missionState) {
    const t = missionMarker(game.missionState);
    if (t) { mctx.fillStyle = '#ffd23e'; mctx.beginPath(); mctx.arc(t.x * s, t.y * (150 / WORLD_H), 5, 0, Math.PI * 2); mctx.fill(); }
  } else {
    mctx.fillStyle = '#ffd23e';
    for (const mk of missionStartMarkers()) { mctx.beginPath(); mctx.arc(mk.x * s, mk.y * (150 / WORLD_H), 3, 0, Math.PI * 2); mctx.fill(); }
  }
  mctx.fillStyle = '#7CFC9A'; mctx.beginPath(); mctx.arc(LANDMARKS.garage.x * s, LANDMARKS.garage.y * (150 / WORLD_H), 4, 0, Math.PI * 2); mctx.fill();
  for (const cop of game.police) { mctx.fillStyle = '#ff3b30'; mctx.beginPath(); mctx.arc(cop.x * s, cop.y * (150 / WORLD_H), 3, 0, Math.PI * 2); mctx.fill(); }
  // Player arrow.
  const px = game.player.x * s, py = game.player.y * (150 / WORLD_H);
  mctx.save(); mctx.translate(px, py); mctx.rotate(game.player.angle);
  mctx.fillStyle = '#fff'; mctx.beginPath(); mctx.moveTo(0, -6); mctx.lineTo(5, 5); mctx.lineTo(-5, 5); mctx.closePath(); mctx.fill();
  mctx.restore();
  // North + district label.
  mctx.fillStyle = '#fff'; mctx.font = 'bold 10px sans-serif'; mctx.textAlign = 'left'; mctx.fillText('N ↑  LEONIDA', 6, 12);
}

// ---------- shop / pause ----------
function openShop() {
  game.state = 'shop';
  document.getElementById('shop-panel').style.display = 'flex';
  renderShop();
  sound.setEngine(0, false);
}
function closeShop() {
  game.state = 'playing';
  document.getElementById('shop-panel').style.display = 'none';
}
function renderShop() {
  document.getElementById('shop-money').textContent = 'Your cash: $' + save.money.toLocaleString('en-US');
  const box = document.getElementById('shop-items');
  box.innerHTML = '';
  for (const item of SHOP_ITEMS) {
    const owned = item.kind === 'car' ? save.owned.includes(item.id) : save.upgrades.includes(item.id);
    const row = document.createElement('div');
    row.className = 'shop-item';
    const left = document.createElement('div');
    const b = document.createElement('b'); b.textContent = item.name + ' — $' + item.price;
    const s = document.createElement('span'); s.textContent = item.desc;
    left.appendChild(b); left.appendChild(document.createElement('br')); left.appendChild(s);
    const btn = document.createElement('button');
    btn.textContent = owned ? 'OWNED ✓' : 'BUY';
    btn.disabled = owned || save.money < item.price;
    btn.addEventListener('click', () => {
      const res = buyItem(save, item);
      if (res.ok) {
        showToast(item.name + ' purchased!', 2500); sound.cash();
        if (item.kind === 'car') {
          const c = makeCar(item.id, LANDMARKS.garage.x - 60, LANDMARKS.garage.y + 90, 0, { parked: true });
          game.cars.push(c);
        }
        renderShop(); updateHUD();
      } else { showToast(res.reason, 2200); sound.fail(); }
    });
    row.appendChild(left); row.appendChild(btn);
    box.appendChild(row);
  }
}
function togglePause() {
  if (game.state === 'playing') {
    game.state = 'paused';
    document.getElementById('pause-panel').style.display = 'flex';
    sound.setEngine(0, false);
  } else if (game.state === 'paused') {
    game.state = 'playing';
    document.getElementById('pause-panel').style.display = 'none';
  }
}
function respawn() {
  game.player.health = maxHealth(save);
  game.player.x = LANDMARKS.garage.x; game.player.y = LANDMARKS.garage.y;
  game.playerCar = null;
  game.wanted = 0; updatePolice();
  game.mission = null; game.missionState = null;
  game.camera.x = game.player.x; game.camera.y = game.player.y;
  document.getElementById('gameover-panel').style.display = 'none';
  game.state = 'playing';
  showToast('Back on the streets. Stay sharp.', 2500);
  updateHUD();
}

// ---------- buttons ----------
document.getElementById('start-btn').addEventListener('click', () => {
  sound.ensure();
  document.getElementById('start-panel').style.display = 'none';
  game.state = 'playing';
  showToast('Welcome to Leonida! Find a car, then take a job (!).', 4000);
  updateHUD();
});
document.getElementById('shop-close').addEventListener('click', closeShop);
document.getElementById('resume-btn').addEventListener('click', togglePause);
document.getElementById('restart-btn').addEventListener('click', () => {
  document.getElementById('pause-panel').style.display = 'none';
  respawn();
});
document.getElementById('respawn-btn').addEventListener('click', respawn);
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'r' && game.state === 'wasted') respawn();
});

// ---------- main loop ----------
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game.state === 'playing' || game.state === 'paused' || game.state === 'shop') update(dt);
  if (game.state !== 'menu') drawWorld();
  else {
    // Menu backdrop: slow pan over the city.
    game.camera.x = 1700 + Math.sin(now / 9000) * 500;
    game.camera.y = 1300 + Math.cos(now / 12000) * 300;
    drawWorld();
  }
  input.endFrame();
  requestAnimationFrame(loop);
}
updateHUD();
requestAnimationFrame(loop);
