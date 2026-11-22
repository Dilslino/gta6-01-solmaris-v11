// SOLMARIS V4 fix: transcript touch.
// SOLMARIS — 5 missions with objective tracker, timers and cash rewards.
import { LANDMARKS } from './world.js';
import { dist } from './entities.js';

export const MISSIONS = [
  {
    id: 'package', name: 'PACKAGE RUN', reward: 400,
    desc: 'Pick up the package at the Docks, then deliver it to Vice Beach. No cops, no crash — just drive.',
    start: LANDMARKS.docks, end: LANDMARKS.beach, timeLimit: 120,
  },
  {
    id: 'escape', name: 'HOT PURSUIT ESCAPE', reward: 600,
    desc: 'The LCPD is on you! Survive the chase for 30 seconds, then reach the hideout in the Suburbs.',
    start: LANDMARKS.downtown, end: LANDMARKS.suburbs, timeLimit: 90, wantedOnStart: 2,
  },
  {
    id: 'cash', name: 'CASH GRAB', reward: 500,
    desc: 'Five cash bags are scattered around Downtown and Little Havana. Grab them all before time runs out.',
    start: LANDMARKS.downtown, end: null, timeLimit: 120,
  },
  {
    id: 'race', name: 'CHECKPOINT RUSH', reward: 700,
    desc: 'Race the clock through 5 checkpoints: Docks → Downtown → Bridge → Island → Beach. Fastest wins.',
    start: LANDMARKS.docks, end: LANDMARKS.beach, timeLimit: 150,
  },
  {
    id: 'target', name: 'TARGET TAKEDOWN', reward: 900,
    desc: 'A rival crew car is cruising near the Island bridge. Ram it 3 times to take it out. Watch your health.',
    start: LANDMARKS.bridge, end: LANDMARKS.island, timeLimit: 150,
  },
];

export function missionById(id) { return MISSIONS.find((m) => m.id === id) || null; }

export function createMissionState(mission, state) {
  const s = {
    mission, startedAt: performance.now(), elapsed: 0, timeLeft: mission.timeLimit,
    stage: 0, // 0 = go to start/pickup, 1 = main objective, 2 = done
    objective: '',
    cashBags: [],
    checkpoints: [],
    checkpointIndex: 0,
    targetCar: null, targetHits: 0,
    hideoutReached: false,
  };
  if (mission.id === 'cash') {
    const spots = [
      { x: 1050, y: 500 }, { x: 1500, y: 900 }, { x: 900, y: 1600 },
      { x: 1400, y: 1900 }, { x: 1250, y: 1250 },
    ];
    s.cashBags = spots.map((p) => ({ ...p, taken: false }));
    s.objective = 'Collect cash bags: 0 / 5';
  } else if (mission.id === 'race') {
    s.checkpoints = [
      LANDMARKS.docks, LANDMARKS.downtown, LANDMARKS.bridge, LANDMARKS.island, LANDMARKS.beach,
    ];
    s.objective = 'Reach checkpoint 1 / 5 — DOCKS';
  } else if (mission.id === 'package') {
    s.objective = 'Pick up the package at the DOCKS';
  } else if (mission.id === 'escape') {
    s.objective = 'Survive the chase! 30s remaining';
  } else if (mission.id === 'target') {
    s.objective = 'Find the rival car near the BRIDGE and ram it (0 / 3 hits)';
  }
  return s;
}

// Returns 'complete' | 'failed' | null. Mutates mission state + game state via callbacks in `hooks`.
export function updateMission(ms, game, dt) {
  const m = ms.mission;
  ms.elapsed += dt;
  ms.timeLeft = Math.max(0, m.timeLimit - ms.elapsed);
  // Every mission — including the escape — fails when its clock runs out.
  if (ms.timeLeft <= 0) return 'failed';
  const px = game.player.x, py = game.player.y;
  const pos = { x: px, y: py };

  if (m.id === 'package') {
    if (ms.stage === 0) {
      if (dist(pos, m.start) < 90) { ms.stage = 1; ms.objective = 'Deliver the package to VICE BEACH'; game.toast('Package picked up! Deliver it to Vice Beach.'); game.sound.pickup(); }
      else ms.objective = 'Pick up the package at the DOCKS (' + Math.round(dist(pos, m.start)) + 'm)';
    } else if (dist(pos, m.end) < 90) return 'complete';
    else ms.objective = 'Deliver the package to VICE BEACH (' + Math.round(dist(pos, m.end)) + 'm)';
  }

  if (m.id === 'escape') {
    if (ms.stage === 0) {
      const remain = Math.max(0, 30 - ms.elapsed);
      ms.objective = 'Survive the chase! ' + Math.ceil(remain) + 's remaining — stay moving!';
      if (ms.elapsed >= 30) { ms.stage = 1; game.toast('You lost them — for now. Reach the Suburbs hideout!'); game.sound.success(); }
    } else if (dist(pos, m.end) < 110) return 'complete';
    else ms.objective = 'Reach the hideout in the SUBURBS (' + Math.round(dist(pos, m.end)) + 'm)';
  }

  if (m.id === 'cash') {
    let taken = 0;
    for (const bag of ms.cashBags) {
      if (!bag.taken && dist(pos, bag) < 55) { bag.taken = true; game.sound.cash(); game.toast('Cash bag grabbed! +$50'); game.save.money += 50; }
      if (bag.taken) taken++;
    }
    ms.objective = 'Collect cash bags: ' + taken + ' / 5';
    if (taken >= 5) return 'complete';
  }

  if (m.id === 'race') {
    const cp = ms.checkpoints[ms.checkpointIndex];
    if (cp && dist(pos, cp) < 100) {
      ms.checkpointIndex++;
      game.sound.pickup();
      if (ms.checkpointIndex >= ms.checkpoints.length) return 'complete';
      game.toast('Checkpoint ' + ms.checkpointIndex + ' / 5!');
    }
    const next = ms.checkpoints[ms.checkpointIndex];
    if (next) ms.objective = 'Reach checkpoint ' + (ms.checkpointIndex + 1) + ' / 5 — ' + next.label + ' (' + Math.round(dist(pos, next)) + 'm)';
  }

  if (m.id === 'target') {
    if (!ms.targetCar) {
      // Spawn the rival car lazily near the bridge once the mission starts.
      ms.targetCar = game.spawnTargetCar();
      game.toast('Rival car spotted near the bridge. Ram it!');
    }
    const t = ms.targetCar;
    if (t && !t.dead) {
      ms.objective = 'Ram the rival car! Hits: ' + ms.targetHits + ' / 3 (' + Math.round(dist(pos, t)) + 'm)';
      if (game.playerCar && dist(game.playerCar, t) < 62) {
        // Cooldown so one long contact is not 3 hits.
        if (!ms._hitCooldown || performance.now() - ms._hitCooldown > 1200) {
          ms._hitCooldown = performance.now();
          ms.targetHits++;
          t.health -= 40;
          game.sound.crash();
          game.toast('Hit! ' + ms.targetHits + ' / 3');
          if (ms.targetHits >= 3 || t.health <= 0) { t.dead = true; return 'complete'; }
        }
      }
    }
  }
  return null;
}

export function missionMarker(ms) {
  const m = ms.mission;
  if (m.id === 'package') return ms.stage === 0 ? m.start : m.end;
  if (m.id === 'escape') return ms.stage === 0 ? null : m.end;
  if (m.id === 'cash') { const next = ms.cashBags.find((b) => !b.taken); return next || null; }
  if (m.id === 'race') return ms.checkpoints[ms.checkpointIndex] || null;
  if (m.id === 'target') return ms.targetCar && !ms.targetCar.dead ? { x: ms.targetCar.x, y: ms.targetCar.y } : null;
  return null;
}

// Where the yellow "!" start markers sit on the map (free roam).
export function missionStartMarkers() {
  return MISSIONS.map((m, i) => ({ mission: m, x: m.start.x + (i % 2 === 0 ? 120 : -120), y: m.start.y + 60, label: m.name }));
}
