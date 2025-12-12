# HTML5 Obby Game

A complex obstacle course (obby) game built with pure HTML5, Canvas, and JavaScript.

## Features

### Core Gameplay
- Player-controlled character with smooth physics (move left/right, jump)
- 5 progressively harder levels with unique challenges
- Checkpoint system for saving progress within levels
- Lives system (5 lives per level)
- Win detection and level progression

### Obstacles & Mechanics
- **Moving Platforms**: Platforms that move between two points
- **Spike Hazards**: Dangerous spikes that kill on contact
- **Falling Blocks**: Platforms that collapse when stepped on
- **Rotating Obstacles**: Spinning hazards to avoid
- **Narrow Jumps**: Precision platforming challenges
- **Physics System**: Realistic gravity, collision detection, coyote time, jump buffering

### Progression & Scoring
- Level unlock system (complete levels to unlock the next)
- Time tracking with best times saved to localStorage
- Leaderboard showing best times for each level
- 5 lives per level with checkpoint respawning

### UI & Polish
- Main menu with Start, Level Select, and Reset Progress
- Level selection screen showing unlocked levels and best times
- In-game HUD displaying level name, time, lives, and checkpoint info
- Level complete screen with time comparison
- Game over screen
- Toast notifications for checkpoints and events
- Visual feedback with camera shake and spawn glow effects
- Touch controls for mobile devices

### Levels
1. **Level 1 — Warmup Run**: Introduction with basic jumps (2600×900)
2. **Level 2 — Moving Trouble**: More complexity with moving platforms (3100×1000)
3. **Level 3 — Tower Climb**: Vertical challenge with 3 checkpoints (1600×2400)
4. **Level 4 — Precision**: Narrow platforms requiring precise jumps (2200×1200)
5. **Level 5 — Momentum Master**: Largest level with all obstacle types (3400×1400)

## Files

### Standalone Version
- **obby-standalone.html**: Complete game in a single HTML file with all CSS and JavaScript embedded. Can be opened directly in any modern browser with no dependencies.

### Development Version
- **index.html**: Main HTML structure
- **style.css**: All styling and UI design
- **game.js**: Complete game logic and physics engine

## Controls

- **Move Left**: A or ◀
- **Move Right**: D or ▶
- **Jump**: Space / W / ▲
- **Respawn**: R (costs 1 life)
- **Mobile**: Touch controls appear automatically on touch devices

## How to Play

### Standalone Version
Simply open `obby-standalone.html` in any modern web browser (Chrome, Firefox, Safari, Edge).

### Development Version
Open `index.html` in a web browser, or use a local server:
```bash
# Using Python 3
python3 -m http.server 8000

# Using Node.js
npx serve
```

Then navigate to `http://localhost:8000` in your browser.

## Technical Details

- Pure HTML5 Canvas rendering
- No external libraries or dependencies
- LocalStorage for save data persistence
- Responsive canvas scaling
- Delta-time based game loop for consistent physics
- Object-oriented architecture with clean class separation
- Touch input support for mobile devices
- Smooth camera following with lerp interpolation

## Game Classes

- **Input**: Keyboard and touch input handling
- **Camera**: Smooth following camera with shake effects
- **Platform**: Static platforms
- **MovingPlatform**: Moving platforms on defined paths
- **FallingBlock**: Platforms that fall when touched
- **Spike**: Hazard obstacles
- **Rotator**: Rotating obstacles with capsule collision
- **Checkpoint**: Respawn points within levels
- **Goal**: Level finish points
- **Player**: Player character with physics
- **Level**: Container for level data and objects
- **Game**: Main game manager and state machine

## Browser Compatibility

Works in all modern browsers that support:
- HTML5 Canvas
- ES6 JavaScript
- LocalStorage
- RequestAnimationFrame

Tested on: Chrome, Firefox, Safari, Edge

## License

This is a demo game project for educational purposes.
