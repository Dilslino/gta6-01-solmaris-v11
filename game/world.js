// SOLMARIS V4 fix: transcript touch.
// SOLMARIS — world generation: Leonida coastal city.
// Grid roads, districts, beach, bridge, park, docks. All procedural, no assets.
export const WORLD_W = 3400;
export const WORLD_H = 2600;

export const DISTRICTS = [
  { name: 'VICE BEACH', x: 0, y: 1500, w: 700, h: 1100, ground: '#e8d9a0', accent: '#ffb347' },
  { name: 'DOWNTOWN', x: 700, y: 300, w: 1100, h: 1100, ground: '#3a3f4a', accent: '#4dd8ff' },
  { name: 'LITTLE HAVANA', x: 700, y: 1400, w: 1100, h: 700, ground: '#4a3f35', accent: '#ff8a5b' },
  { name: 'DOCKS', x: 1800, y: 300, w: 900, h: 800, ground: '#33302e', accent: '#9fb4d8' },
  { name: 'SUBURBS', x: 1800, y: 1100, w: 900, h: 1000, ground: '#4d5c43', accent: '#7CFC9A' },
  { name: 'PALM PARK', x: 700, y: 2100, w: 1100, h: 500, ground: '#2f6b34', accent: '#7CFC9A' },
  { name: 'ISLAND', x: 2700, y: 1400, w: 700, h: 1200, ground: '#5c4a63', accent: '#ff5ea8' },
];

// Horizontal + vertical roads (grid). Roads are driveable strips.
export const ROADS_H = [300, 700, 1100, 1400, 1750, 2100, 2450];
export const ROADS_V = [350, 700, 1050, 1400, 1800, 2150, 2500, 2850, 3150];
export const ROAD_W = 96;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pointOnRoad(x, y) {
  for (const ry of ROADS_H) if (Math.abs(y - ry) < ROAD_W / 2 - 6) return true;
  for (const rx of ROADS_V) if (Math.abs(x - rx) < ROAD_W / 2 - 6) return true;
  return false;
}
export function inBeach(x, y) { return x < 640 && y > 1560; }
export function inWater(x, y) { return x < 130 && y > 1500; }
export function inPark(x, y) { return x > 700 && x < 1800 && y > 2100; }

export function buildWorld() {
  const rand = mulberry32(20261122);
  const buildings = [];
  const palms = [];
  const colors = ['#6b7a99', '#8a6f5c', '#5c7a6b', '#7a5c8a', '#997a5c', '#5c6b8a', '#8a5c5c', '#4a6b7a'];
  // Buildings fill the blocks between roads, skipping beach / park / water.
  for (let bx = 0; bx < ROADS_V.length - 1; bx++) {
    for (let by = 0; by < ROADS_H.length - 1; by++) {
      const x0 = ROADS_V[bx] + ROAD_W / 2 + 14;
      const x1 = ROADS_V[bx + 1] - ROAD_W / 2 - 14;
      const y0 = ROADS_H[by] + ROAD_W / 2 + 14;
      const y1 = ROADS_H[by + 1] - ROAD_W / 2 - 14;
      if (x1 - x0 < 90 || y1 - y0 < 90) continue;
      if (x0 > 600 && x0 < 700 && y1 > 1500) continue; // beach edge
      if (y0 > 2050 && x0 > 650 && x0 < 1850) continue; // park
      if (x0 < 200) continue; // water
      const n = 1 + Math.floor(rand() * 3);
      for (let i = 0; i < n; i++) {
        const w = 70 + rand() * Math.min(150, (x1 - x0) / n - 20);
        const h = 60 + rand() * 110;
        const x = x0 + 8 + rand() * Math.max(1, (x1 - x0) - w - 16);
        const y = y0 + 8 + rand() * Math.max(1, (y1 - y0) - h - 16);
        const downtown = x > 700 && x < 1800 && y > 300 && y < 1400;
        const height = downtown ? 26 + rand() * 70 : 12 + rand() * 26;
        buildings.push({
          x, y, w, h, height,
          color: colors[Math.floor(rand() * colors.length)],
          roof: rand() < 0.3 ? '#2c3444' : '#3d465c',
          windows: Math.floor(rand() * 4),
        });
      }
    }
  }
  // Palm trees along the beach and in the park.
  for (let i = 0; i < 90; i++) {
    const beach = rand() < 0.55;
    palms.push(beach
      ? { x: 180 + rand() * 420, y: 1560 + rand() * 980 }
      : { x: 750 + rand() * 1000, y: 2150 + rand() * 400 });
  }
  // Docks crates.
  const crates = [];
  for (let i = 0; i < 26; i++) crates.push({ x: 1900 + rand() * 700, y: 350 + rand() * 650, s: 26 + rand() * 22 });
  return { buildings, palms, crates };
}

// Circle-vs-building collision. Returns corrected position or null if free.
export function collideBuildings(buildings, x, y, r) {
  let nx = x, ny = y, hit = false;
  for (const b of buildings) {
    const cx = Math.max(b.x, Math.min(nx, b.x + b.w));
    const cy = Math.max(b.y, Math.min(ny, b.y + b.h));
    const dx = nx - cx, dy = ny - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.01) {
        const d = Math.sqrt(d2);
        nx = cx + (dx / d) * r;
        ny = cy + (dy / d) * r;
      } else {
        ny = b.y - r;
      }
    }
  }
  return { x: nx, y: ny, hit };
}

export function clampWorld(x, y) {
  return { x: Math.max(40, Math.min(WORLD_W - 40, x)), y: Math.max(40, Math.min(WORLD_H - 40, y)) };
}

// Named landmarks for mission markers.
export const LANDMARKS = {
  garage: { x: 1050, y: 700, label: 'LEONIDA MOTORS' },
  beach: { x: 380, y: 2050, label: 'VICE BEACH' },
  downtown: { x: 1250, y: 500, label: 'DOWNTOWN' },
  docks: { x: 2250, y: 550, label: 'DOCKS' },
  park: { x: 1250, y: 2300, label: 'PALM PARK' },
  island: { x: 3050, y: 2000, label: 'STAR ISLAND' },
  suburbs: { x: 2250, y: 1650, label: 'SUBURBS' },
  bridge: { x: 2620, y: 1750, label: 'BRIDGE' },
};
