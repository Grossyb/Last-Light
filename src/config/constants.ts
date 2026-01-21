// Display
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

// Physics / Timing
export const FIXED_TIMESTEP = 1000 / 60; // 60 updates per second
export const MAX_DELTA = 250; // Cap delta to prevent spiral of death

// Player
export const PLAYER_SPEED = 200; // units per second
export const PLAYER_ACCELERATION = 1200; // units per second squared
export const PLAYER_FRICTION = 800; // deceleration when no input
export const PLAYER_SIZE = 24;
export const PLAYER_MAX_HP = 50;

// Torch (smallest radius)
export const TORCH_RADIUS = 120;

// Lantern (medium radius)
export const LANTERN_RADIUS = 200;

// Flare (largest radius)
export const FLARE_RADIUS = 350;

// Fog
export const FOG_CREEP_SPEED = 25000; // ms until fully re-darkened

// Combat - Pistol (default weapon)
export const PISTOL_DAMAGE = 10;
export const PISTOL_FIRE_RATE = 4; // shots per second
export const PISTOL_RANGE = 250;

// Combat - Assault Rifle
export const RIFLE_DAMAGE = 8;
export const RIFLE_FIRE_RATE = 10; // faster fire rate
export const RIFLE_RANGE = 300;

// Combat - Shotgun
export const SHOTGUN_DAMAGE = 6; // per pellet
export const SHOTGUN_FIRE_RATE = 1.5; // slower
export const SHOTGUN_PELLETS = 5;
export const SHOTGUN_SPREAD = 0.4; // radians
export const SHOTGUN_RANGE = 180; // shorter range

// Combat - Gatling Gun
export const GATLING_DAMAGE = 5;
export const GATLING_FIRE_RATE = 25; // extremely fast
export const GATLING_RANGE = 280;

// Combat - Scythe (melee)
export const SCYTHE_DAMAGE = 15;
export const SCYTHE_ROTATION_SPEED = 3; // rotations per second
export const SCYTHE_HIT_COOLDOWN = 0.2; // seconds between hits on same zombie
export const SCYTHE_RADIUS = 35; // tight melee range just around player

// Combat - General
export const BULLET_SPEED = 600;
export const AUTO_SHOOT_RANGE = 250;

// Zombies
export const ZOMBIE_BASE_HP = 20;
export const ZOMBIE_BASE_SPEED = 70;
export const ZOMBIE_DAMAGE_PER_SECOND = 8;
export const ZOMBIE_SIZE = 20;

// Level Progression
export const STARTING_MAP_SIZE = 25; // 25x25 tiles
export const MAP_SIZE_INCREMENT = 5; // +5 tiles per level
export const MAX_MAP_SIZE = 60; // cap at 60x60

// Zombie Spawning (endless)
export const ZOMBIE_SPAWN_RATE_BASE = 0.8; // zombies per second at level 1
export const ZOMBIE_SPAWN_RATE_INCREMENT = 0.3; // +0.3 per level
export const ZOMBIE_HP_SCALE_PER_LEVEL = 0.2; // +20% HP per level
export const ZOMBIE_SPEED_SCALE_PER_LEVEL = 0.05; // +5% speed per level
export const MAX_ZOMBIES_ALIVE = 500; // increased with sprite optimization

// Flare flight
export const FLARE_FLIGHT_SPEED = 800; // units per second

// Economy
export const POINTS_PER_KILL = 10;

// Maze
export const TILE_SIZE = 40;

// Colors (no assets - just hex values)
export const COLOR_BACKGROUND = 0x0a0a0a;
export const COLOR_WALL = 0x2a2a2a;
export const COLOR_FLOOR = 0x1a1a1a;
export const COLOR_PLAYER = 0x44aa44;
export const COLOR_ZOMBIE = 0x884444;
