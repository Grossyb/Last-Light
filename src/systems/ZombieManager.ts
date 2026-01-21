import { Container, Sprite, Texture } from 'pixi.js';
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
  sprite: Sprite;
  alive: boolean;
  flashTime: number; // Time remaining for hit flash
}

interface DeathParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  sprite: Sprite;
}

export class ZombieManager {
  private container: Container;
  private particleContainer: Container;
  private zombies: Zombie[] = [];
  private particles: DeathParticle[] = [];
  private maze: MazeData;
  private nextId = 0;

  // Reusable textures (created once)
  private zombieTexture: Texture | null = null;
  private zombieFlashTexture: Texture | null = null;
  private particleTexture: Texture | null = null;


  // Scaling factors
  private hpMultiplier = 1;
  private speedMultiplier = 1;
  private baseSpeedMultiplier = 1;

  // Continuous spawning
  private spawnRate = 1;
  private baseSpawnRate = 1;
  private spawnAccumulator = 0;
  private spawningEnabled = false;
  private maxZombiesAlive = MAX_ZOMBIES_ALIVE;
  private hordeRushActive = false;

  // Player invisibility (ghost power-up)
  private playerInvisible = false;

  // Attraction point (light sources)
  private attractionPoint: { x: number; y: number } | null = null;


  constructor(maze: MazeData) {
    this.maze = maze;
    this.container = new Container();
    this.particleContainer = new Container();
    this.container.addChild(this.particleContainer);

    // Create reusable textures
    this.createTextures();
  }

  private createTextures(): void {
    // Create zombie texture (circle) using canvas - works without renderer
    const zombieCanvas = document.createElement('canvas');
    const zombieSize = ZOMBIE_SIZE * 2; // 2x resolution
    zombieCanvas.width = zombieSize;
    zombieCanvas.height = zombieSize;
    const zombieCtx = zombieCanvas.getContext('2d')!;
    zombieCtx.fillStyle = '#884444';
    zombieCtx.beginPath();
    zombieCtx.arc(zombieSize / 2, zombieSize / 2, zombieSize / 2, 0, Math.PI * 2);
    zombieCtx.fill();
    this.zombieTexture = Texture.from(zombieCanvas);

    // Create flash texture (brighter red)
    const flashCanvas = document.createElement('canvas');
    flashCanvas.width = zombieSize;
    flashCanvas.height = zombieSize;
    const flashCtx = flashCanvas.getContext('2d')!;
    flashCtx.fillStyle = '#ff6666';
    flashCtx.beginPath();
    flashCtx.arc(zombieSize / 2, zombieSize / 2, zombieSize / 2, 0, Math.PI * 2);
    flashCtx.fill();
    this.zombieFlashTexture = Texture.from(flashCanvas);

    // Create particle texture (small square)
    const particleCanvas = document.createElement('canvas');
    const particleSize = 8; // 2x resolution for 4px particle
    particleCanvas.width = particleSize;
    particleCanvas.height = particleSize;
    const particleCtx = particleCanvas.getContext('2d')!;
    particleCtx.fillStyle = '#ff4444';
    particleCtx.fillRect(0, 0, particleSize, particleSize);
    this.particleTexture = Texture.from(particleCanvas);
  }

  // Ensure textures exist (called before first use)
  ensureTextures(): void {
    if (!this.zombieTexture || !this.zombieFlashTexture || !this.particleTexture) {
      this.createTextures();
    }
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
    this.spawnRate = this.baseSpawnRate * 3;
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
    const minSpawnDistance = fogOfWar.getEffectiveTorchRadius() + 20;

    for (let attempts = 0; attempts < maxAttempts; attempts++) {
      const tileX = Math.floor(Math.random() * this.maze.width);
      const tileY = Math.floor(Math.random() * this.maze.height);

      if (this.maze.tiles[tileY]?.[tileX] !== 0) continue;
      if (fogOfWar.isTileLit(tileX, tileY, playerX, playerY)) continue;

      const worldPos = MazeGenerator.tileToWorld(tileX, tileY);
      const distToPlayer = Math.sqrt(
        (worldPos.x - playerX) ** 2 + (worldPos.y - playerY) ** 2
      );
      if (distToPlayer < minSpawnDistance) continue;

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

  private createSprite(): Sprite {
    const sprite = new Sprite(this.zombieTexture || Texture.WHITE);
    sprite.anchor.set(0.5, 0.5);
    return sprite;
  }

  private createParticleSprite(): Sprite {
    const sprite = new Sprite(this.particleTexture || Texture.WHITE);
    sprite.anchor.set(0.5, 0.5);
    return sprite;
  }

  private createZombie(x: number, y: number): Zombie {
    // Ensure textures are created
    this.ensureTextures();

    const hp = Math.floor(ZOMBIE_BASE_HP * this.hpMultiplier);
    const speed = ZOMBIE_BASE_SPEED * this.speedMultiplier;

    const sprite = this.createSprite();
    sprite.x = x;
    sprite.y = y;

    this.container.addChild(sprite);

    const zombie: Zombie = {
      id: this.nextId++,
      x,
      y,
      hp,
      maxHp: hp,
      speed,
      sprite,
      alive: true,
      flashTime: 0,
    };

    this.zombies.push(zombie);
    return zombie;
  }

  private spawnDeathParticles(x: number, y: number): void {
    this.ensureTextures();

    const particleCount = 8 + Math.floor(Math.random() * 5); // 8-12 particles

    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.5;
      const speed = 80 + Math.random() * 120; // 80-200 pixels/sec

      const sprite = this.createParticleSprite();
      sprite.x = x + (Math.random() - 0.5) * ZOMBIE_SIZE;
      sprite.y = y + (Math.random() - 0.5) * ZOMBIE_SIZE;
      sprite.scale.set(0.8 + Math.random() * 0.6); // Varied sizes
      sprite.tint = 0xff0000 + Math.floor(Math.random() * 0x004444); // Red variations
      sprite.alpha = 1;

      this.particleContainer.addChild(sprite);

      const particle: DeathParticle = {
        x: sprite.x,
        y: sprite.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.3 + Math.random() * 0.3, // 0.3-0.6 seconds
        maxLife: 0.3 + Math.random() * 0.3,
        size: sprite.scale.x,
        sprite,
      };

      this.particles.push(particle);
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];

      // Update position with gravity
      particle.vy += 200 * dt; // Gravity
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;

      // Update life
      particle.life -= dt;

      // Update sprite
      particle.sprite.x = particle.x;
      particle.sprite.y = particle.y;

      // Fade out and shrink
      const lifeRatio = particle.life / particle.maxLife;
      particle.sprite.alpha = lifeRatio;
      particle.sprite.scale.set(particle.size * lifeRatio);

      // Remove dead particles
      if (particle.life <= 0) {
        this.particleContainer.removeChild(particle.sprite);
        particle.sprite.destroy();
        this.particles.splice(i, 1);
      }
    }
  }

  update(dt: number, playerX: number, playerY: number, fogOfWar?: FogOfWar): number {
    // Update particles
    this.updateParticles(dt);

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

      // Update flash timer
      if (zombie.flashTime > 0) {
        zombie.flashTime -= dt;
        if (zombie.flashTime <= 0 && this.zombieTexture) {
          zombie.sprite.texture = this.zombieTexture;
        }
      }

      let dirX = 0;
      let dirY = 0;

      let targetX = playerX;
      let targetY = playerY;
      let hasTarget = !this.playerInvisible;

      if (this.attractionPoint) {
        targetX = this.attractionPoint.x;
        targetY = this.attractionPoint.y;
        hasTarget = true;
      }

      if (!hasTarget) {
        const angle = Math.random() * Math.PI * 2;
        dirX = Math.cos(angle);
        dirY = Math.sin(angle);
      } else {
        const dx = targetX - zombie.x;
        const dy = targetY - zombie.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 1) continue;

        dirX = dx / dist;
        dirY = dy / dist;
      }

      const moveX = dirX * zombie.speed * dt;
      const moveY = dirY * zombie.speed * dt;

      let newX = zombie.x + moveX;
      let newY = zombie.y + moveY;

      const halfSize = ZOMBIE_SIZE / 2;

      if (!this.isWalkable(newX, zombie.y, halfSize)) {
        newX = zombie.x;
      }

      if (!this.isWalkable(newX, newY, halfSize)) {
        newY = zombie.y;
      }

      zombie.x = newX;
      zombie.y = newY;

      // Update sprite position
      zombie.sprite.x = zombie.x;
      zombie.sprite.y = zombie.y;

      // Check collision with player
      if (!this.playerInvisible) {
        const playerDist = Math.sqrt(
          (zombie.x - playerX) ** 2 + (zombie.y - playerY) ** 2
        );
        const collisionDist = ZOMBIE_SIZE / 2 + 12;

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
    const zombieIndex = this.zombies.findIndex(z => z.id === zombieId);
    if (zombieIndex === -1) return false;

    const zombie = this.zombies[zombieIndex];
    if (!zombie.alive) return false;

    zombie.hp -= damage;

    // Flash effect using texture swap (no redraw!)
    if (this.zombieFlashTexture) {
      zombie.sprite.texture = this.zombieFlashTexture;
      zombie.flashTime = 0.05; // 50ms flash
    }

    if (zombie.hp <= 0) {
      zombie.alive = false;

      // Spawn death particles before removing sprite
      this.spawnDeathParticles(zombie.x, zombie.y);

      // Destroy sprite and remove from array immediately
      this.container.removeChild(zombie.sprite);
      zombie.sprite.destroy();
      this.zombies.splice(zombieIndex, 1);

      return true; // Zombie died
    }

    return false;
  }

  getZombies(): Zombie[] {
    return this.zombies.filter(z => z.alive);
  }

  getAliveCount(): number {
    return this.zombies.length;
  }

  clearAll(): void {
    // Destroy all zombie sprites
    for (const zombie of this.zombies) {
      if (zombie.sprite.parent) {
        this.container.removeChild(zombie.sprite);
      }
      zombie.sprite.destroy();
    }
    this.zombies = [];

    // Destroy all particle sprites
    for (const particle of this.particles) {
      if (particle.sprite.parent) {
        this.particleContainer.removeChild(particle.sprite);
      }
      particle.sprite.destroy();
    }
    this.particles = [];
  }

  // Destroy everything including textures (call when returning to main menu)
  destroy(): void {
    this.clearAll();

    // Destroy textures to free GPU memory
    if (this.zombieTexture) {
      this.zombieTexture.destroy(true);
      this.zombieTexture = null;
    }
    if (this.zombieFlashTexture) {
      this.zombieFlashTexture.destroy(true);
      this.zombieFlashTexture = null;
    }
    if (this.particleTexture) {
      this.particleTexture.destroy(true);
      this.particleTexture = null;
    }

    // Destroy containers
    this.particleContainer.destroy();
    this.container.destroy();
  }
}
