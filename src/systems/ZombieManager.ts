import { Graphics, Container, Sprite, Texture, Rectangle } from 'pixi.js';
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

  // Object pool for dead zombie sprites
  private spritePool: Sprite[] = [];
  private particlePool: Sprite[] = [];

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

  // Cleanup timer
  private cleanupTimer = 0;
  private readonly CLEANUP_INTERVAL = 2; // seconds

  constructor(maze: MazeData) {
    this.maze = maze;
    this.container = new Container();
    this.particleContainer = new Container();
    this.container.addChild(this.particleContainer);

    // Create reusable textures
    this.createTextures();
  }

  private createTextures(): void {
    // Create zombie texture (circle)
    const zombieGraphics = new Graphics();
    zombieGraphics.circle(ZOMBIE_SIZE / 2, ZOMBIE_SIZE / 2, ZOMBIE_SIZE / 2);
    zombieGraphics.fill(0x884444);

    const renderer = this.getRenderer();
    if (renderer) {
      this.zombieTexture = renderer.generateTexture({
        target: zombieGraphics,
        resolution: 2,
        frame: new Rectangle(0, 0, ZOMBIE_SIZE, ZOMBIE_SIZE),
      });
    }

    // Create flash texture (brighter red)
    const flashGraphics = new Graphics();
    flashGraphics.circle(ZOMBIE_SIZE / 2, ZOMBIE_SIZE / 2, ZOMBIE_SIZE / 2);
    flashGraphics.fill(0xff6666);

    if (renderer) {
      this.zombieFlashTexture = renderer.generateTexture({
        target: flashGraphics,
        resolution: 2,
        frame: new Rectangle(0, 0, ZOMBIE_SIZE, ZOMBIE_SIZE),
      });
    }

    // Create particle texture (small square)
    const particleGraphics = new Graphics();
    particleGraphics.rect(0, 0, 4, 4);
    particleGraphics.fill(0xff4444);

    if (renderer) {
      this.particleTexture = renderer.generateTexture({
        target: particleGraphics,
        resolution: 2,
        frame: new Rectangle(0, 0, 4, 4),
      });
    }

    // Clean up temp graphics
    zombieGraphics.destroy();
    flashGraphics.destroy();
    particleGraphics.destroy();
  }

  private getRenderer(): any {
    // Try to get renderer from any existing sprite's parent
    let parent: Container | null = this.container;
    while (parent) {
      if ((parent as any).app?.renderer) {
        return (parent as any).app.renderer;
      }
      parent = parent.parent as Container | null;
    }
    return null;
  }

  // Lazy texture creation when we have a renderer
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

  private getPooledSprite(): Sprite {
    // Reuse from pool if available
    if (this.spritePool.length > 0) {
      const sprite = this.spritePool.pop()!;
      sprite.visible = true;
      return sprite;
    }

    // Create new sprite
    const sprite = new Sprite(this.zombieTexture || Texture.WHITE);
    sprite.anchor.set(0.5, 0.5);
    return sprite;
  }

  private returnSpriteToPool(sprite: Sprite): void {
    sprite.visible = false;
    this.spritePool.push(sprite);
  }

  private getPooledParticleSprite(): Sprite {
    if (this.particlePool.length > 0) {
      const sprite = this.particlePool.pop()!;
      sprite.visible = true;
      return sprite;
    }

    const sprite = new Sprite(this.particleTexture || Texture.WHITE);
    sprite.anchor.set(0.5, 0.5);
    return sprite;
  }

  private returnParticleToPool(sprite: Sprite): void {
    sprite.visible = false;
    this.particlePool.push(sprite);
  }

  private createZombie(x: number, y: number): Zombie {
    // Ensure textures are created
    this.ensureTextures();

    const hp = Math.floor(ZOMBIE_BASE_HP * this.hpMultiplier);
    const speed = ZOMBIE_BASE_SPEED * this.speedMultiplier;

    const sprite = this.getPooledSprite();
    if (this.zombieTexture) {
      sprite.texture = this.zombieTexture;
    }
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

      const sprite = this.getPooledParticleSprite();
      sprite.x = x + (Math.random() - 0.5) * ZOMBIE_SIZE;
      sprite.y = y + (Math.random() - 0.5) * ZOMBIE_SIZE;
      sprite.scale.set(0.8 + Math.random() * 0.6); // Varied sizes
      sprite.tint = 0xff0000 + Math.floor(Math.random() * 0x004444); // Red variations

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
        this.returnParticleToPool(particle.sprite);
        this.particles.splice(i, 1);
      }
    }
  }

  update(dt: number, playerX: number, playerY: number, fogOfWar?: FogOfWar): number {
    // Update particles
    this.updateParticles(dt);

    // Periodic cleanup of dead zombies from array
    this.cleanupTimer += dt;
    if (this.cleanupTimer >= this.CLEANUP_INTERVAL) {
      this.cleanupTimer = 0;
      this.cleanupDeadZombies();
    }

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
    const zombie = this.zombies.find(z => z.id === zombieId);
    if (!zombie || !zombie.alive) return false;

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

      // Return sprite to pool instead of destroying
      this.container.removeChild(zombie.sprite);
      this.returnSpriteToPool(zombie.sprite);

      return true; // Zombie died
    }

    return false;
  }

  private cleanupDeadZombies(): void {
    // Remove dead zombies from array to prevent memory growth
    // Keep only alive zombies
    this.zombies = this.zombies.filter(z => z.alive);
  }

  getZombies(): Zombie[] {
    return this.zombies.filter(z => z.alive);
  }

  getAliveCount(): number {
    let count = 0;
    for (const zombie of this.zombies) {
      if (zombie.alive) count++;
    }
    return count;
  }

  clearAll(): void {
    // Return all sprites to pool
    for (const zombie of this.zombies) {
      if (zombie.sprite.parent) {
        this.container.removeChild(zombie.sprite);
        this.returnSpriteToPool(zombie.sprite);
      }
    }
    this.zombies = [];

    // Clear particles
    for (const particle of this.particles) {
      if (particle.sprite.parent) {
        this.particleContainer.removeChild(particle.sprite);
        this.returnParticleToPool(particle.sprite);
      }
    }
    this.particles = [];
  }
}
