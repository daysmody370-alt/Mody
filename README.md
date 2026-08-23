# Cozmos Kingdom

An 8-bit style side-scrolling platformer starring Cozmo, the royal pup, on a
quest to reclaim the floating Kingdom from the Slime King.

Built with vanilla HTML5 canvas and JavaScript — no build step, no
dependencies. Sprites are hand-drawn pixel-art grids, sound effects and the
looping background music are synthesized live with the Web Audio API.

## Play

Open `index.html` in a browser, or serve the folder locally:

```
python3 -m http.server 8000
```

then visit `http://localhost:8000`. Add `?level=N` to jump straight to level
`N` (1-6) for testing or a quick replay.

## Controls

- **Arrows / WASD** — move
- **Space / Up** — jump (tap for a short hop, hold for a full jump)
- **P** — pause
- **M** — toggle music
- **Enter** — start / retry

## Features

- **6 hand-built levels**, each with its own visual theme: Sky Meadow, Cloud
  Battlements, Frost Spire, Star Citadel, Ember Ruins, and the Slime King's
  Throne.
- **Enemy variety**: patrolling Star Slimes, flying bats, turret sentries
  that fire projectiles, and static spike hazards.
- **Power-ups**: Star (temporary invincibility + speed), Wing (an extra
  mid-air jump), Shield (absorbs one hit), and Heart (extra life).
- **Checkpoints** so a mid-level death doesn't send you back to the start.
- **A boss fight** against the Slime King — dodge his ground-slam shockwaves
  and summoned minions, then stomp him three times to win back the crown.
- Tight platforming feel: coyote time, jump buffering, variable jump height,
  squash-and-stretch animation, dust particles, and hit-stop on big impacts.
