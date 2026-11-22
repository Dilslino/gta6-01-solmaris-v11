# SOLMARIS — Open-World Crime (GTA 6 inspired)

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Dilslino/gta6-01-solmaris-v11/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Dilslino/gta6-01-solmaris-v11/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Bounty: https://make.fun/bounty/gta6-01?ref=5548afh3

A complete, playable open-world crime game set in **Leonida** — a coastal Vice City-style
map with downtown, beach, docks, suburbs, a park and a bridge to Star Island. Built as a
**2.5D canvas game with zero external dependencies**: vanilla JavaScript, all art drawn
procedurally on canvas, all sound synthesized with WebAudio. No images, no network fetches.

## Play

Open `index.html` in a browser, or run `node main.ts --serve` and visit
http://127.0.0.1:8123.

| Key | Action |
| --- | --- |
| W A S D / Arrows | Drive / walk |
| Space | Enter / exit car |
| E | Interact / start mission |
| B | Shop (at the Leonida Motors garage `$`) |
| M | Mute sound |
| P | Pause |
| Shift | Handbrake / sprint |
| R | Respawn after WASTED |

## Features

- **Driving** — acceleration, braking, steering, handbrake, collisions with buildings and
  traffic, car theft (steal any parked or traffic car), traffic AI and pedestrians.
- **Crime & wanted** — wanted stars rise when you steal cars, hit pedestrians or ram cops;
  stars fall when you lay low and hide. LCPD cruisers chase and ram you, with sirens.
- **5 missions** — Package Run, Hot Pursuit Escape, Cash Grab, Checkpoint Rush and Target
  Takedown, each with an objective tracker, timer and cash reward.
- **Economy** — earn cash from missions, buy sports / muscle / taxi cars and engine, armor
  and health upgrades at Leonida Motors. Progress persists in `localStorage`.
- **HUD** — live minimap, cash, wanted stars, speed, active mission, health bar.
- **Sound** — procedural WebAudio: engine hum that follows speed, two-tone siren, crash,
  gunshot, pickup and cash jingles, with a mute toggle.
- **World** — 3400×2600 city with districts, beach, park, docks and depth-sorted fake-3D
  buildings drawn entirely in code.

## Structure

```text
index.html        — page, HUD, overlays (start / shop / pause / wasted)
main.ts           — stdlib-only entrypoint: verifies files, optional local server
game/
  main.js         — game loop, rendering, HUD, minimap, wanted, shop
  world.js        — city generation, roads, districts, collisions
  entities.js     — player cars, traffic, pedestrians, police AI
  missions.js     — the 5 missions, objectives, timers, rewards
  save.js         — localStorage save + shop catalogue
  audio.js        — procedural WebAudio sound engine
  input.js        — keyboard input
```

## License

MIT — see `LICENSE`.
