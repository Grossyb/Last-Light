import { Graphics, Container } from 'pixi.js';
import { MazeData, MazeGenerator } from './MazeGenerator';
import { FogOfWar } from './FogOfWar';
import {
  ZOMBIE_BASE_HP,
  ZOMBIE_BASE_SPEED,
  ZOMBIE_SIZE,
  ZOMBIE_DAMAGE_PER_SECOND,
  MAX_ZOMBIES_ALIVE,
} from '@/config/constants';

export interface Zombie {
  id: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  graphics: Graphics;
  alive: boolean;
}

export class ZombieManager {
  private container: Container;
  private zombies: Zombie[] = [];
  private maze: MazeData;
  private nextId = 0;

  // Scaling factors
  private hpMultiplier = 1;
  private speedMultiplier = 1;
  private baseSpeedMultiplier = 1;

  // Continuous spawning
  private spawnRate = 1; // zombies per second
  private baseSpawnRate = 1; // stored base rate
  private spawnAccumulator = 0;
  private spawningEnabled = false;
  private maxZombiesAlive = MAX_ZOMBIES_ALIVE;
  private hordeRushActive = false;

  // Player invisibility (ghost power-up)
  private playerInvisible = false;

  // Attraction point (gravity bomb)
  private attractionPoint: { x: number; y: number } | null = null;

  constructor(maze: MazeData) {
    this.maze = maze;
    this.container = new Container();
  }

  setMaze(maze: MazeData): void {
    this.maze = maze;
  }

  setSpawnRate(rate: number): void {
    this.spawnRate = rate;
    this.baseSpawnRate = rate;
  }

  setMaxZombiesAlive(max: number): void {
    this.maxZombiesAlive = max;
  }

  triggerHordeRush(): void {
    if (this.hordeRushActive) return;
    this.hordeRushActive = true;
    // Triple the spawn rate when exit is discovered
    this.spawnRate = this.baseSpawnRate * 3;
    // Make all existing and new zombies faster
    this.speedMultiplier *= 1.5;
    for (const zombie of this.zombies) {
      if (zombie.alive) {
        zombie.speed *= 1.5;
      }
    }
  }

  resetHordeRush(): void {
    this.hordeRushActive = false;
    this.spawnRate = this.baseSpawnRate;
    this.speedMultiplier = this.baseSpeedMultiplier;
  }

  isHordeRushActive(): boolean {
    return this.hordeRushActive;
  }

  startSpawning(): void {
    this.spawningEnabled = true;
    this.spawnAccumulator = 0;
  }

  stopSpawning(): void {
    this.spawningEnabled = false;
  }

  getContainer(): Container {
    return this.container;
  }

  setScaling(hpMult: number, speedMult: number): void {
    this.hpMultiplier = hpMult;
    this.speedMultiplier = speedMult;
    this.baseSpeedMultiplier = speedMult;
  }

  setPlayerInvisible(invisible: boolean): void {
    this.playerInvisible = invisible;
  }

  setAttractionPoint(x: number, y: number): void {
    this.attractionPoint = { x, y };
  }

  clearAttractionPoint(): void {
    this.attractionPoint = null;
  }

  spawnSingleZombie(playerX: number, playerY: number, fogOfWar: FogOfWar): boolean {
    const maxAttempts = 30;

    for (let attempts = 0; attempts < maxAttempts; attempts++) {
      // Pick a random floor tile
      const tileX = Math.floor(Math.random() * this.maze.width);
      const tileY = Math.floor(Math.random() * this.maze.height);

      // Must be a floor tile
      if (this.maze.tiles[tileY]?.[tileX] !== 0) continue;

      // Must NOT be lit (in darkness)
      if (fogOfWar.isTileLit(tileX, tileY, playerX, playerY)) continue;

      // Must be at least some distance from player
      const worldPos = MazeGenerator.tileToWorld(tileX, tileY);
      const distToPlayer = Math.sqrt(
        (worldPos.x - playerX) ** 2 + (worldPos.y - playerY) ** 2
      );
      if (distToPlayer < 80) continue;

      // Spawn zombie
      this.createZombie(worldPos.x, worldPos.y);
      return true;
    }
    return false;
  }

  spawnZombies(
    count: number,
    playerX: number,
    playerY: number,
    fogOfWar: FogOfWar
  ): void {
    for (let i = 0; i < count; i++) {
      this.spawnSingleZombie(playerX, playerY, fogOfWar);
    }
  }

  private createZombie(x: number, y: number): Zombie {
    const hp = Math.floor(ZOMBIE_BASE_HP * this.hpMultiplier);
    const speed = ZOMBIE_BASE_SPEED * this.speedMultiplier;

    const graphics = new Graphics();
    graphics.circle(0, 0, ZOMBIE_SIZE / 2);
    graphics.fill(0x884444);
    graphics.x = x;
    graphics.y = y;

    this.container.addChild(graphics);

    const zombie: Zombie = {
      id: this.nextId++,
      x,
      y,
      hp,
      maxHp: hp,
      speed,
      graphics,
      alive: true,
    };

    this.zombies.push(zombie);
    return zombie;
  }

  update(dt: number, playerX: number, playerY: number, fogOfWar?: FogOfWar): number {
    // Continuous spawning
    if (this.spawningEnabled && fogOfWar && this.getAliveCount() < this.maxZombiesAlive) {
      this.spawnAccumulator += dt * this.spawnRate;
      while (this.spawnAccumulator >= 1) {
        this.spawnAccumulator -= 1;
        this.spawnSingleZombie(playerX, playerY, fogOfWar);
      }
    }

    let damageToPlayer = 0;

    for (const zombie of this.zombies) {
      if (!zombie.alive) continue;

      let dirX = 0;
      let dirY = 0;

      // Determine target: attraction point > player (unless invisible)
      let targetX = playerX;
      let targetY = playerY;
      let hasTarget = !this.playerInvisible;

      if (this.attractionPoint) {
        // Gravity bomb takes priority
        targetX = this.attractionPoint.x;
        targetY = this.attractionPoint.y;
        hasTarget = true;
      }

      if (!hasTarget) {
        // Wander randomly when player is invisible and no attraction point
        const angle = Math.random() * Math.PI * 2;
        dirX = Math.cos(angle);
        dirY = Math.sin(angle);
      } else {
        // Calculate direction to target
        const dx = targetX - zombie.x;
        const dy = targetY - zombie.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 1) continue;

        // Normalize direction
        dirX = dx / dist;
        dirY = dy / dist;
      }

      // Calculate desired movement
      const moveX = dirX * zombie.speed * dt;
      const moveY = dirY * zombie.speed * dt;

      // Try to move with wall sliding
      let newX = zombie.x + moveX;
      let newY = zombie.y + moveY;

      const halfSize = ZOMBIE_SIZE / 2;

      // Check X movement
      if (!this.isWalkable(newX, zombie.y, halfSize)) {
        newX = zombie.x;
      }

      // Check Y movement
      if (!this.isWalkable(newX, newY, halfSize)) {
        newY = zombie.y;
      }

      zombie.x = newX;
      zombie.y = newY;

      // Update graphics
      zombie.graphics.x = zombie.x;
      zombie.graphics.y = zombie.y;

      // Check collision with player (damage) - but not if player is invisible
      if (!this.playerInvisible) {
        const playerDist = Math.sqrt(
          (zombie.x - playerX) ** 2 + (zombie.y - playerY) ** 2
        );
        const collisionDist = ZOMBIE_SIZE / 2 + 12; // player radius ~12

        if (playerDist < collisionDist) {
          damageToPlayer += ZOMBIE_DAMAGE_PER_SECOND * dt;
        }
      }
    }

    return damageToPlayer;
  }

  private isWalkable(x: number, y: number, radius: number): boolean {
    const corners = [
      { x: x - radius, y: y - radius },
      { x: x + radius, y: y - radius },
      { x: x - radius, y: y + radius },
      { x: x + radius, y: y + radius },
    ];

    for (const corner of corners) {
      const tile = MazeGenerator.worldToTile(corner.x, corner.y);

      if (tile.x < 0 || tile.x >= this.maze.width || tile.y < 0 || tile.y >= this.maze.height) {
        return false;
      }

      if (this.maze.tiles[tile.y][tile.x] === 1) {
        return false;
      }
    }

    return true;
  }

  damageZombie(zombieId: number, damage: number): boolean {
    const zombie = this.zombies.find(z => z.id === zombieId);
    if (!zombie || !zombie.alive) return false;

    zombie.hp -= damage;

    // Flash red on hit
    zombie.graphics.clear();
    zombie.graphics.circle(0, 0, ZOMBIE_SIZE / 2);
    zombie.graphics.fill(0xff6666);

    // Reset color after short delay
    setTimeout(() => {
      if (zombie.alive) {
        zombie.graphics.clear();
        zombie.graphics.circle(0, 0, ZOMBIE_SIZE / 2);
        zombie.graphics.fill(0x884444);
      }
    }, 50);

    if (zombie.hp <= 0) {
      zombie.alive = false;
      this.container.removeChild(zombie.graphics);
      return true; // Zombie died
    }

    return false;
  }

  getZombies(): Zombie[] {
    return this.zombies.filter(z => z.alive);
  }

  getAliveCount(): number {
    return this.zombies.filter(z => z.alive).length;
  }

  clearAll(): void {
    for (const zombie of this.zombies) {
      if (zombie.graphics.parent) {
        this.container.removeChild(zombie.graphics);
      }
    }
    this.zombies = [];
  }
}
