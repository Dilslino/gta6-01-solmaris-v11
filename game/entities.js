// SOLMARIS V4 fix: transcript touch.
// SOLMARIS — entities: player, cars (traffic / parked / police), pedestrians.
import { collideBuildings, clampWorld, pointOnRoad, WORLD_W, WORLD_H, ROADS_H, ROADS_V } from './world.js';

export const CAR_DEFS = {
  car_sedan: { name: 'Sedan', color: '#4d8dff', topSpeed: 380, accel: 260, w: 46, l: 78 },
  car_sport: { name: 'Comet', color: '#ff2e63', topSpeed: 560, accel: 340, w: 44, l: 80 },
  car_muscle: { name: 'Sabre', color: '#ff9d2e', topSpeed: 500, accel: 320, w: 48, l: 84 },
  car_taxi: { name: 'Cabbie', color: '#ffd23e', topSpeed: 430, accel: 280, w: 46, l: 78 },
  car_police: { name: 'LCPD Cruiser', color: '#1c2733', topSpeed: 470, accel: 330, w: 46, l: 80 },
  car_van: { name: 'Van', color: '#8a94a6', topSpeed: 300, accel: 200, w: 50, l: 92 },
};

let nextId = 1;
export function makeCar(kind, x, y, angle, opts) {
  const def = CAR_DEFS[kind] || CAR_DEFS.car_sedan;
  return {
    id: nextId++, kind, def, x, y, angle: angle || 0,
    speed: 0, steer: 0, color: (opts && opts.color) || def.color,
    parked: !!(opts && opts.parked), isPolice: kind === 'car_police',
    traffic: !!(opts && opts.traffic), aiTarget: null, aiWait: 0,
    health: 100, dead: false, target: null,
  };
}

export function makePed(x, y) {
  const palette = ['#ff8a5b', '#7CFC9A', '#4dd8ff', '#ff5ea8', '#e8e8e8', '#ffd23e'];
  return {
    x, y, angle: Math.random() * Math.PI * 2, speed: 28 + Math.random() * 22,
    color: palette[Math.floor(Math.random() * palette.length)],
    walkPhase: Math.random() * 6, panic: 0, dead: false,
  };
}

export function spawnTraffic(world, count) {
  const cars = [];
  const kinds = ['car_sedan', 'car_sedan', 'car_van', 'car_taxi', 'car_sedan'];
  for (let i = 0; i < count; i++) {
    const horiz = Math.random() < 0.5;
    const x = horiz ? 200 + Math.random() * (WORLD_W - 400) : ROADS_V[Math.floor(Math.random() * ROADS_V.length)];
    const y = horiz ? ROADS_H[Math.floor(Math.random() * ROADS_H.length)] : 200 + Math.random() * (WORLD_H - 400);
    const angle = horiz ? (Math.random() < 0.5 ? 0 : Math.PI) : (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    const c = makeCar(kinds[Math.floor(Math.random() * kinds.length)], x, y, angle, { traffic: true });
    c.speed = 60 + Math.random() * 60;
    cars.push(c);
  }
  return cars;
}

export function spawnParked(world, save) {
  const cars = [];
  const spots = [
    { x: 1050, y: 760 }, { x: 1150, y: 760 }, { x: 1250, y: 760 },
    { x: 380, y: 1900 }, { x: 2250, y: 1650 }, { x: 3050, y: 2050 },
    { x: 1400, y: 1150 }, { x: 2500, y: 700 },
  ];
  const kinds = ['car_sedan', 'car_van', 'car_taxi', 'car_sedan', 'car_sedan', 'car_muscle', 'car_sedan', 'car_van'];
  spots.forEach((s, i) => {
    cars.push(makeCar(kinds[i % kinds.length], s.x, s.y, (Math.random() - 0.5) * 0.6, { parked: true }));
  });
  // Owned shop cars wait at the garage.
  const owned = (save.owned || []).filter((id) => id !== 'car_sedan');
  owned.forEach((id, i) => {
    cars.push(makeCar(id, 950 + i * 90, 820, 0, { parked: true }));
  });
  return cars;
}

export function spawnPeds(count) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const x = 200 + Math.random() * (WORLD_W - 400);
    const y = 200 + Math.random() * (WORLD_H - 400);
    if (pointOnRoad(x, y)) continue;
    peds.push(makePed(x, y));
  }
  return peds;
}

export function driveCar(car, input, dt, engineMult, world) {
  const def = car.def;
  const top = def.topSpeed * engineMult;
  let accel = 0;
  if (input.up) accel = def.accel;
  if (input.downKey) accel = -def.accel * 0.7;
  car.speed += accel * dt;
  // Drag + rolling resistance.
  car.speed -= car.speed * 0.55 * dt;
  if (input.brake) car.speed -= car.speed * 2.2 * dt;
  if (!input.up && !input.downKey) car.speed -= car.speed * 0.25 * dt;
  car.speed = Math.max(-top * 0.45, Math.min(top, car.speed));
  if (Math.abs(car.speed) < 4 && !input.up && !input.downKey) car.speed = 0;
  // Steering scales with speed, reverses when reversing.
  const steerInput = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  const dir = car.speed >= 0 ? 1 : -1;
  const steerAmount = steerInput * 2.1 * dt * Math.min(1, Math.abs(car.speed) / 90) * dir;
  car.angle += steerAmount;
  const nx = car.x + Math.sin(car.angle) * car.speed * dt;
  const ny = car.y - Math.cos(car.angle) * car.speed * dt;
  const col = collideBuildings(world.buildings, nx, ny, 30);
  if (col.hit) {
    // Bounce off with a speed penalty and a crash flag.
    const impact = Math.abs(car.speed);
    car.speed *= -0.25;
    car.x = col.x; car.y = col.y;
    return { crashed: impact > 140, impact };
  }
  const clamped = clampWorld(nx, ny);
  car.x = clamped.x; car.y = clamped.y;
  return { crashed: false, impact: 0 };
}

export function updateTrafficCar(car, dt, world, allCars) {
  if (car.dead) return;
  // Follow its road lane; at intersections pick a new direction sometimes.
  car.aiWait -= dt;
  const aheadX = car.x + Math.sin(car.angle) * 60;
  const aheadY = car.y - Math.cos(car.angle) * 60;
  if (!pointOnRoad(aheadX, aheadY) && car.aiWait <= 0) {
    // Turn around or pick a perpendicular road.
    car.angle += (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    car.aiWait = 2;
  }
  car.speed += (90 - car.speed) * dt * 0.5;
  const nx = car.x + Math.sin(car.angle) * car.speed * dt;
  const ny = car.y - Math.cos(car.angle) * car.speed * dt;
  const col = collideBuildings(world.buildings, nx, ny, 28);
  if (col.hit) { car.angle += Math.PI / 2; car.x = col.x; car.y = col.y; return; }
  // Gentle separation from other cars.
  for (const o of allCars) {
    if (o === car || o.dead) continue;
    const dx = car.x - o.x, dy = car.y - o.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < 70 * 70 && d2 > 0.01) { car.speed *= 0.9; }
  }
  const c = clampWorld(nx, ny);
  car.x = c.x; car.y = c.y;
}

export function updatePed(ped, dt, world, danger) {
  if (ped.dead) return;
  ped.walkPhase += dt * 8;
  let speed = ped.speed;
  if (danger) {
    const dx = ped.x - danger.x, dy = ped.y - danger.y;
    const d = Math.hypot(dx, dy);
    if (d < 160) { ped.angle = Math.atan2(dx, -dy); speed = ped.speed * 3.2; ped.panic = 1; }
    else ped.panic = Math.max(0, ped.panic - dt);
  }
  const nx = ped.x + Math.sin(ped.angle) * speed * dt;
  const ny = ped.y - Math.cos(ped.angle) * speed * dt;
  const col = collideBuildings(world.buildings, nx, ny, 12);
  if (col.hit) { ped.angle += Math.PI * (0.5 + Math.random()); ped.x = col.x; ped.y = col.y; return; }
  const c = clampWorld(nx, ny);
  ped.x = c.x; ped.y = c.y;
  // Occasionally change direction on sidewalks.
  if (Math.random() < dt * 0.12) ped.angle += (Math.random() - 0.5) * 1.6;
}

export function updatePoliceCar(car, target, dt, world) {
  if (car.dead) return { rammed: false };
  const dx = target.x - car.x, dy = target.y - car.y;
  const dist = Math.hypot(dx, dy) || 1;
  const desired = Math.atan2(dx, -dy);
  let diff = desired - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
  const want = Math.min(car.def.topSpeed, 300 + Math.min(160, dist * 0.4));
  car.speed += (want - car.speed) * dt * 0.8;
  const nx = car.x + Math.sin(car.angle) * car.speed * dt;
  const ny = car.y - Math.cos(car.angle) * car.speed * dt;
  const col = collideBuildings(world.buildings, nx, ny, 30);
  if (col.hit) { car.angle += Math.PI / 3; car.speed *= 0.4; car.x = col.x; car.y = col.y; return { rammed: false }; }
  const c = clampWorld(nx, ny);
  car.x = c.x; car.y = c.y;
  return { rammed: dist < 64, dist };
}

export function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
