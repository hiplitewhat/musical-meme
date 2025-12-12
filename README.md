# HTML5 Obby Game

A pure HTML/CSS/JavaScript canvas-based obstacle course (obby) game with 5 progressively challenging levels, checkpoint system, multiple hazard types, and best-time tracking.

## How to play

Open `index.html` in a modern browser.

### Controls

- **Move**: A/D or Arrow Left/Right
- **Jump**: Space / W / Arrow Up
- **Respawn**: R (costs one life)
- **Touch**: Mobile controls available on supported devices

### Features

**Gameplay**
- 5 levels with progressively harder obstacle layouts and different challenges
- Checkpoint system: respawn at last reached checkpoint instead of restarting
- Lives system: 5 lives per level with respawn mechanic
- Win/completion detection with transition to next level
- Fall detection: respawn at checkpoint if player falls off

**Obstacles & Mechanics**
- Multiple obstacle types: moving platforms, spike hazards, falling blocks, rotating obstacles
- Physics system: gravity, collision detection, coyote time, jump buffering
- Smooth player movement with acceleration and friction
- Platform momentum transfer: player carries moving platform velocity

**Progression & Scoring**
- Level progression system: complete level to unlock next
- Best-time tracking per level (localStorage)
- Difficulty scaling: later levels have more complex obstacle combinations
- Level selection screen to play any unlocked level

**UI & Polish**
- Main menu with start and level select
- Level selection screen showing best times
- In-game HUD with current level, time, lives, checkpoint count
- Game over and level complete screens
- Toast notifications for checkpoints and events
- Camera smooth following with shake effects
- Visual feedback: player spawn glow, rotating obstacles, falling block animations
- Responsive controls with touch support for mobile

**Technical**
- Pure HTML5, CSS, and JavaScript (no external libraries)
- Canvas-based 2D rendering with gradients and visual effects
- Smooth 60 FPS gameplay
- localStorage persistence for progress and best times
- Clean class-based architecture for easy level design and expansion
