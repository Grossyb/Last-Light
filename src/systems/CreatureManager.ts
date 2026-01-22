import { Container, Sprite, Texture, Assets, Graphics } from 'pixi.js';
import { MazeData, MazeGenerator } from './MazeGenerator';
import { FogOfWar } from './FogOfWar';
import {
  CRAWLER_BASE_HP,
  CRAWLER_BASE_SPEED,
  CRAWLER_SIZE,
  CRAWLER_DAMAGE_PER_SECOND,
  MAX_CRAWLERS_ALIVE,
  TILE_SIZE,
} from '@/config/constants';

// ============================================
// CREATURE BASE INTERFACE
// ============================================
export interface Creature {
  id: number;
  type: 'crawler' | 'spitter' | 'broodmother';
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  sprite: Sprite;
  alive: boolean;
  flashTime: number;
  frozen: boolean;
  frozenTime: number;
  size: number; // Collision radius
}

// ============================================
// CRAWLER (basic enemy, mobile)
// ============================================
export interface Crawler extends Creature {
  type: 'crawler';
  lastDirX: number;
  lastDirY: number;
}

// ============================================
// SPITTER (stationary, shoots goo)
// ============================================
export interface Spitter extends Creature {
  type: 'spitter';
  attackCooldown: number;
  attackWindup: number; // Time before shot fires (telegraph)
  isWindingUp: boolean;
  targetX: number;
  targetY: number;
}

// ============================================
// BROOD MOTHER (stationary, spawns crawlers)
// ============================================
export interface BroodMother extends Creature {
  type: 'broodmother';
  spawnCooldown: number;
  spawnCount: number; // How many crawlers to spawn at once
}

// ============================================
// GOO PROJECTILE (from Spitter)
// ============================================
interface GooProjectile {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  speed: number;
  graphics: Graphics;
}

// ============================================
// GOO PUDDLE (slows/roots player)
// ============================================
interface GooPuddle {
  x: number;
  y: number;
  radius: number;
  duration: number;
  graphics: Graphics;
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

// Constants for new creatures
const SPITTER_HP = 15;
const SPITTER_ATTACK_COOLDOWN = 3; // seconds between attacks
const SPITTER_WINDUP_TIME = 0.8; // telegraph time before shooting
const SPITTER_GOO_SPEED = 300;
const SPITTER_RANGE = 250;
const GOO_PUDDLE_DURATION = 2; // seconds
const GOO_PUDDLE_RADIUS = 30;
const GOO_ROOT_DURATION = 1; // seconds player is rooted

const BROODMOTHER_HP = 80;
const BROODMOTHER_SPAWN_COOLDOWN = 5; // seconds between spawns
const BROODMOTHER_SPAWN_COUNT = 3; // crawlers per spawn
const BROODMOTHER_SIZE = CRAWLER_SIZE * 2; // 2x size

// Level thresholds for spawning special creatures
const SPITTER_START_LEVEL = 3;
const BROODMOTHER_START_LEVEL = 5;

export class CreatureManager {
  private container: Container;
  private particleContainer: Container;
  private projectileContainer: Container;
  private creatures: Creature[] = [];
  private particles: DeathParticle[] = [];
  private gooProjectiles: GooProjectile[] = [];
  private gooPuddles: GooPuddle[] = [];
  private maze: MazeData;
  private nextId = 0;
  private currentLevel = 1;

  // Reusable textures
  private crawlerFallbackTexture: Texture | null = null;
  private crawlerFlashTexture: Texture | null = null;
  private particleTexture: Texture | null = null;
  private crawlerTexture: Texture | null = null;
  private crawlerLoaded = false;
  private broodMotherTexture: Texture | null = null;
  private broodMotherLoaded = false;

  // Scaling factors
  private hpMultiplier = 1;
  private speedMultiplier = 1;
  private baseSpeedMultiplier = 1;

  // Continuous spawning
  private spawnRate = 1;
  private baseSpawnRate = 1;
  private spawnAccumulator = 0;
  private spawningEnabled = false;
  private maxCreaturesAlive = MAX_CRAWLERS_ALIVE;
  private hordeRushActive = false;

  // Special creature spawn tracking
  private spitterSpawnAccumulator = 0;
  private broodmotherSpawnAccumulator = 0;

  // Player invisibility (ghost power-up)
  private playerInvisible = false;

  // Attraction point (light sources)
  private attractionPoint: { x: number; y: number } | null = null;

  // Player root state (from goo)
  private playerRootedTime = 0;

  constructor(maze: MazeData) {
    this.maze = maze;
    this.container = new Container();
    this.particleContainer = new Container();
    this.projectileContainer = new Container();
    this.container.addChild(this.particleContainer);
    this.container.addChild(this.projectileContainer);

    this.createTextures();
    this.loadCrawlerTexture();
    this.loadBroodMotherTexture();
  }

  private async loadCrawlerTexture(): Promise<void> {
    try {
      this.crawlerTexture = await Assets.load('/crawler_sprite.png');
      this.crawlerLoaded = true;
      // Update existing crawlers to use crawler texture
      for (const creature of this.creatures) {
        if (creature.alive && creature.type === 'crawler' && this.crawlerTexture) {
          creature.sprite.texture = this.crawlerTexture;
          const targetSize = CRAWLER_SIZE * 2.5;
          const scale = targetSize / Math.max(creature.sprite.texture.width, creature.sprite.texture.height);
          creature.sprite.scale.set(scale);
        }
      }
    } catch (e) {
      console.warn('Could not load crawler sprite, using fallback:', e);
    }
  }

  private async loadBroodMotherTexture(): Promise<void> {
    try {
      this.broodMotherTexture = await Assets.load('/mother_sprite.png');
      this.broodMotherLoaded = true;
      // Update existing brood mothers to use the texture
      for (const creature of this.creatures) {
        if (creature.alive && creature.type === 'broodmother' && this.broodMotherTexture) {
          creature.sprite.texture = this.broodMotherTexture;
          const targetSize = BROODMOTHER_SIZE * 2.5;
          const scale = targetSize / Math.max(creature.sprite.texture.width, creature.sprite.texture.height);
          creature.sprite.scale.set(scale);
        }
      }
    } catch (e) {
      console.warn('Could not load brood mother sprite, using fallback:', e);
    }
  }

  private createTextures(): void {
    // Create crawler fallback texture (circle)
    const crawlerCanvas = document.createElement('canvas');
    const crawlerSize = CRAWLER_SIZE * 2;
    crawlerCanvas.width = crawlerSize;
    crawlerCanvas.height = crawlerSize;
    const crawlerCtx = crawlerCanvas.getContext('2d')!;
    crawlerCtx.fillStyle = '#884444';
    crawlerCtx.beginPath();
    crawlerCtx.arc(crawlerSize / 2, crawlerSize / 2, crawlerSize / 2, 0, Math.PI * 2);
    crawlerCtx.fill();
    this.crawlerFallbackTexture = Texture.from(crawlerCanvas);

    // Create flash texture
    const flashCanvas = document.createElement('canvas');
    flashCanvas.width = crawlerSize;
    flashCanvas.height = crawlerSize;
    const flashCtx = flashCanvas.getContext('2d')!;
    flashCtx.fillStyle = '#ff6666';
    flashCtx.beginPath();
    flashCtx.arc(crawlerSize / 2, crawlerSize / 2, crawlerSize / 2, 0, Math.PI * 2);
    flashCtx.fill();
    this.crawlerFlashTexture = Texture.from(flashCanvas);

    // Create particle texture
    const particleCanvas = document.createElement('canvas');
    const particleSize = 8;
    particleCanvas.width = particleSize;
    particleCanvas.height = particleSize;
    const particleCtx = particleCanvas.getContext('2d')!;
    particleCtx.fillStyle = '#ff4444';
    particleCtx.fillRect(0, 0, particleSize, particleSize);
    this.particleTexture = Texture.from(particleCanvas);
  }

  ensureTextures(): void {
    if (!this.crawlerFallbackTexture || !this.crawlerFlashTexture || !this.particleTexture) {
      this.createTextures();
    }
  }

  setMaze(maze: MazeData): void {
    this.maze = maze;
  }

  setLevel(level: number): void {
    this.currentLevel = level;
  }

  setSpawnRate(rate: number): void {
    this.spawnRate = rate;
    this.baseSpawnRate = rate;
  }

  setMaxCreaturesAlive(max: number): void {
    this.maxCreaturesAlive = max;
  }

  triggerHordeRush(): void {
    if (this.hordeRushActive) return;
    this.hordeRushActive = true;
    this.spawnRate = this.baseSpawnRate * 6;
    this.speedMultiplier *= 1.5;
    this.maxCreaturesAlive = Math.min(800, this.maxCreaturesAlive * 2);
    for (const creature of this.creatures) {
      if (creature.alive && creature.type === 'crawler') {
        creature.speed *= 1.5;
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
    this.spitterSpawnAccumulator = 0;
    this.broodmotherSpawnAccumulator = 0;
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

  isPlayerRooted(): boolean {
    return this.playerRootedTime > 0;
  }

  getPlayerRootedTime(): number {
    return this.playerRootedTime;
  }

  freezeEnemiesInRadius(x: number, y: number, radius: number, duration: number): void {
    for (const creature of this.creatures) {
      if (!creature.alive) continue;
      const dist = Math.sqrt((creature.x - x) ** 2 + (creature.y - y) ** 2);
      if (dist <= radius) {
        creature.frozen = true;
        creature.frozenTime = duration;
        creature.sprite.tint = 0x88ddff;
      }
    }
  }

  // ============================================
  // SPAWNING METHODS
  // ============================================

  private createCrawlerSprite(): Sprite {
    if (this.crawlerLoaded && this.crawlerTexture) {
      const sprite = new Sprite(this.crawlerTexture);
      sprite.anchor.set(0.5, 0.5);
      const targetSize = CRAWLER_SIZE * 2.5;
      const scale = targetSize / Math.max(sprite.texture.width, sprite.texture.height);
      sprite.scale.set(scale);
      return sprite;
    }
    const sprite = new Sprite(this.crawlerFallbackTexture || Texture.WHITE);
    sprite.anchor.set(0.5, 0.5);
    sprite.scale.set(0.5);
    return sprite;
  }

  private createSpitterSprite(): Sprite {
    // Green-tinted sprite for spitter (will be replaced with actual sprite later)
    const canvas = document.createElement('canvas');
    const size = CRAWLER_SIZE * 2;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#44aa44'; // Green color for spitter
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
    // Add spots to distinguish
    ctx.fillStyle = '#228822';
    ctx.beginPath();
    ctx.arc(size / 3, size / 3, size / 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(size * 2/3, size / 2, size / 6, 0, Math.PI * 2);
    ctx.fill();

    const texture = Texture.from(canvas);
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5, 0.5);
    sprite.scale.set(0.5);
    return sprite;
  }

  private createBroodMotherSprite(): Sprite {
    // Use loaded sprite if available
    if (this.broodMotherLoaded && this.broodMotherTexture) {
      const sprite = new Sprite(this.broodMotherTexture);
      sprite.anchor.set(0.5, 0.5);
      const targetSize = BROODMOTHER_SIZE * 2.5;
      const scale = targetSize / Math.max(sprite.texture.width, sprite.texture.height);
      sprite.scale.set(scale);
      return sprite;
    }

    // Fallback: Large purple-ish sprite for brood mother
    const canvas = document.createElement('canvas');
    const size = BROODMOTHER_SIZE * 2;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#664488'; // Purple for brood mother
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
    // Add egg sac pattern
    ctx.fillStyle = '#886699';
    for (let i = 0; i < 5; i++) {
      const angle = (Math.PI * 2 * i) / 5;
      const cx = size / 2 + Math.cos(angle) * size / 4;
      const cy = size / 2 + Math.sin(angle) * size / 4;
      ctx.beginPath();
      ctx.arc(cx, cy, size / 8, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = Texture.from(canvas);
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5, 0.5);
    sprite.scale.set(0.5);
    return sprite;
  }

  private createParticleSprite(): Sprite {
    const sprite = new Sprite(this.particleTexture || Texture.WHITE);
    sprite.anchor.set(0.5, 0.5);
    return sprite;
  }

  private createCrawler(x: number, y: number): Crawler {
    this.ensureTextures();
    const hp = Math.floor(CRAWLER_BASE_HP * this.hpMultiplier);
    const speed = CRAWLER_BASE_SPEED * this.speedMultiplier;

    const sprite = this.createCrawlerSprite();
    sprite.x = x;
    sprite.y = y;
    this.container.addChild(sprite);

    const crawler: Crawler = {
      id: this.nextId++,
      type: 'crawler',
      x,
      y,
      hp,
      maxHp: hp,
      speed,
      sprite,
      alive: true,
      flashTime: 0,
      lastDirX: 0,
      lastDirY: 1,
      frozen: false,
      frozenTime: 0,
      size: CRAWLER_SIZE,
    };

    this.creatures.push(crawler);
    return crawler;
  }

  private createSpitter(x: number, y: number): Spitter {
    this.ensureTextures();
    const hp = Math.floor(SPITTER_HP * this.hpMultiplier);

    const sprite = this.createSpitterSprite();
    sprite.x = x;
    sprite.y = y;
    this.container.addChild(sprite);

    const spitter: Spitter = {
      id: this.nextId++,
      type: 'spitter',
      x,
      y,
      hp,
      maxHp: hp,
      speed: 0, // Stationary
      sprite,
      alive: true,
      flashTime: 0,
      frozen: false,
      frozenTime: 0,
      size: CRAWLER_SIZE,
      attackCooldown: SPITTER_ATTACK_COOLDOWN * (0.5 + Math.random() * 0.5), // Randomize initial
      attackWindup: 0,
      isWindingUp: false,
      targetX: 0,
      targetY: 0,
    };

    this.creatures.push(spitter);
    return spitter;
  }

  private createBroodMother(x: number, y: number): BroodMother {
    this.ensureTextures();
    const hp = Math.floor(BROODMOTHER_HP * this.hpMultiplier);

    const sprite = this.createBroodMotherSprite();
    sprite.x = x;
    sprite.y = y;
    this.container.addChild(sprite);

    const broodMother: BroodMother = {
      id: this.nextId++,
      type: 'broodmother',
      x,
      y,
      hp,
      maxHp: hp,
      speed: 0, // Stationary
      sprite,
      alive: true,
      flashTime: 0,
      frozen: false,
      frozenTime: 0,
      size: BROODMOTHER_SIZE,
      spawnCooldown: BROODMOTHER_SPAWN_COOLDOWN * (0.5 + Math.random() * 0.5),
      spawnCount: BROODMOTHER_SPAWN_COUNT,
    };

    this.creatures.push(broodMother);
    return broodMother;
  }

  spawnSingleCrawler(playerX: number, playerY: number, fogOfWar: FogOfWar): boolean {
    const maxAttempts = 50;
    const torchRadius = fogOfWar.getEffectiveTorchRadius();
    const minSpawnDistance = this.hordeRushActive ? torchRadius + 40 : torchRadius + 20;
    const maxSpawnDistance = this.hordeRushActive ? torchRadius + 250 : Infinity;

    for (let attempts = 0; attempts < maxAttempts; attempts++) {
      let tileX: number;
      let tileY: number;

      if (this.hordeRushActive) {
        const angle = Math.random() * Math.PI * 2;
        const distance = minSpawnDistance + Math.random() * (maxSpawnDistance - minSpawnDistance);
        const spawnX = playerX + Math.cos(angle) * distance;
        const spawnY = playerY + Math.sin(angle) * distance;
        const tile = MazeGenerator.worldToTile(spawnX, spawnY);
        tileX = tile.x;
        tileY = tile.y;
      } else {
        tileX = Math.floor(Math.random() * this.maze.width);
        tileY = Math.floor(Math.random() * this.maze.height);
      }

      if (tileX < 0 || tileX >= this.maze.width || tileY < 0 || tileY >= this.maze.height) continue;
      if (this.maze.tiles[tileY]?.[tileX] !== 0) continue;
      if (fogOfWar.isTileLit(tileX, tileY, playerX, playerY)) continue;

      const worldPos = MazeGenerator.tileToWorld(tileX, tileY);
      const distToPlayer = Math.sqrt((worldPos.x - playerX) ** 2 + (worldPos.y - playerY) ** 2);
      if (distToPlayer < minSpawnDistance) continue;
      if (this.hordeRushActive && distToPlayer > maxSpawnDistance) continue;

      this.createCrawler(worldPos.x, worldPos.y);
      return true;
    }
    return false;
  }

  private spawnSpecialCreature(
    type: 'spitter' | 'broodmother',
    playerX: number,
    playerY: number,
    fogOfWar: FogOfWar
  ): boolean {
    const maxAttempts = 30;
    const torchRadius = fogOfWar.getEffectiveTorchRadius();
    const minSpawnDistance = torchRadius + 100; // Spawn further away

    for (let attempts = 0; attempts < maxAttempts; attempts++) {
      const tileX = Math.floor(Math.random() * this.maze.width);
      const tileY = Math.floor(Math.random() * this.maze.height);

      if (this.maze.tiles[tileY]?.[tileX] !== 0) continue;
      if (fogOfWar.isTileLit(tileX, tileY, playerX, playerY)) continue;

      const worldPos = MazeGenerator.tileToWorld(tileX, tileY);
      const distToPlayer = Math.sqrt((worldPos.x - playerX) ** 2 + (worldPos.y - playerY) ** 2);
      if (distToPlayer < minSpawnDistance) continue;

      if (type === 'spitter') {
        this.createSpitter(worldPos.x, worldPos.y);
      } else {
        this.createBroodMother(worldPos.x, worldPos.y);
      }
      return true;
    }
    return false;
  }

  // ============================================
  // UPDATE METHODS
  // ============================================

  update(dt: number, playerX: number, playerY: number, fogOfWar?: FogOfWar): number {
    // Update player root timer
    if (this.playerRootedTime > 0) {
      this.playerRootedTime -= dt;
      if (this.playerRootedTime < 0) this.playerRootedTime = 0;
    }

    // Update particles
    this.updateParticles(dt);

    // Update goo projectiles
    this.updateGooProjectiles(dt, playerX, playerY);

    // Update goo puddles
    this.updateGooPuddles(dt, playerX, playerY);

    // Continuous spawning
    if (this.spawningEnabled && fogOfWar && this.getAliveCount() < this.maxCreaturesAlive) {
      // Spawn crawlers
      this.spawnAccumulator += dt * this.spawnRate;
      while (this.spawnAccumulator >= 1) {
        this.spawnAccumulator -= 1;
        this.spawnSingleCrawler(playerX, playerY, fogOfWar);
      }

      // Spawn spitters (starting at level 3)
      if (this.currentLevel >= SPITTER_START_LEVEL) {
        this.spitterSpawnAccumulator += dt * 0.1; // 1 spitter per 10 seconds base
        if (this.spitterSpawnAccumulator >= 1) {
          this.spitterSpawnAccumulator -= 1;
          this.spawnSpecialCreature('spitter', playerX, playerY, fogOfWar);
        }
      }

      // Spawn brood mothers (starting at level 5)
      if (this.currentLevel >= BROODMOTHER_START_LEVEL) {
        this.broodmotherSpawnAccumulator += dt * 0.05; // 1 brood mother per 20 seconds base
        if (this.broodmotherSpawnAccumulator >= 1) {
          this.broodmotherSpawnAccumulator -= 1;
          this.spawnSpecialCreature('broodmother', playerX, playerY, fogOfWar);
        }
      }
    }

    let damageToPlayer = 0;

    for (const creature of this.creatures) {
      if (!creature.alive) continue;

      // Update frozen timer
      if (creature.frozen) {
        creature.frozenTime -= dt;
        if (creature.frozenTime <= 0) {
          creature.frozen = false;
          creature.frozenTime = 0;
          creature.sprite.tint = 0xffffff;
        } else {
          continue; // Frozen creatures don't act
        }
      }

      // Update flash timer
      if (creature.flashTime > 0) {
        creature.flashTime -= dt;
        if (creature.flashTime <= 0) {
          creature.sprite.tint = 0xffffff;
        }
      }

      // Type-specific updates
      switch (creature.type) {
        case 'crawler':
          damageToPlayer += this.updateCrawler(creature as Crawler, dt, playerX, playerY);
          break;
        case 'spitter':
          this.updateSpitter(creature as Spitter, dt, playerX, playerY, fogOfWar);
          break;
        case 'broodmother':
          this.updateBroodMother(creature as BroodMother, dt, playerX, playerY, fogOfWar);
          break;
      }
    }

    return damageToPlayer;
  }

  private updateCrawler(crawler: Crawler, dt: number, playerX: number, playerY: number): number {
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
      const dx = targetX - crawler.x;
      const dy = targetY - crawler.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= 1) {
        dirX = dx / dist;
        dirY = dy / dist;
      }
    }

    const moveX = dirX * crawler.speed * dt;
    const moveY = dirY * crawler.speed * dt;

    let newX = crawler.x + moveX;
    let newY = crawler.y + moveY;

    const halfSize = crawler.size / 2;

    if (!this.isWalkable(newX, crawler.y, halfSize)) {
      newX = crawler.x;
    }
    if (!this.isWalkable(newX, newY, halfSize)) {
      newY = crawler.y;
    }

    crawler.x = newX;
    crawler.y = newY;
    crawler.sprite.x = crawler.x;
    crawler.sprite.y = crawler.y;

    // Update rotation
    if (dirX !== 0 || dirY !== 0) {
      crawler.lastDirX = dirX;
      crawler.lastDirY = dirY;
      const targetRotation = Math.atan2(-dirX, dirY);
      crawler.sprite.rotation = targetRotation;
    }

    // Check collision with player
    let damageToPlayer = 0;
    if (!this.playerInvisible) {
      const playerDist = Math.sqrt((crawler.x - playerX) ** 2 + (crawler.y - playerY) ** 2);
      const collisionDist = crawler.size / 2 + 12;
      if (playerDist <= collisionDist) {
        damageToPlayer = CRAWLER_DAMAGE_PER_SECOND * dt;
      }
    }

    return damageToPlayer;
  }

  private updateSpitter(spitter: Spitter, dt: number, playerX: number, playerY: number, _fogOfWar?: FogOfWar): void {
    // Check if player is in range and visible
    const dx = playerX - spitter.x;
    const dy = playerY - spitter.y;
    const distToPlayer = Math.sqrt(dx * dx + dy * dy);

    // Check line of sight
    const hasLineOfSight = this.hasLineOfSight(spitter.x, spitter.y, playerX, playerY);

    if (spitter.isWindingUp) {
      // Continue windup
      spitter.attackWindup -= dt;

      // Visual telegraph - pulse green
      const pulse = Math.sin(spitter.attackWindup * 20) * 0.3 + 0.7;
      spitter.sprite.tint = 0x44ff44;
      spitter.sprite.scale.set(0.5 + pulse * 0.1);

      if (spitter.attackWindup <= 0) {
        // Fire the goo!
        this.fireGoo(spitter);
        spitter.isWindingUp = false;
        spitter.attackCooldown = SPITTER_ATTACK_COOLDOWN;
        spitter.sprite.tint = 0xffffff;
        spitter.sprite.scale.set(0.5);
      }
    } else {
      // Cooldown
      spitter.attackCooldown -= dt;

      if (spitter.attackCooldown <= 0 && distToPlayer <= SPITTER_RANGE && hasLineOfSight && !this.playerInvisible) {
        // Start windup
        spitter.isWindingUp = true;
        spitter.attackWindup = SPITTER_WINDUP_TIME;
        spitter.targetX = playerX;
        spitter.targetY = playerY;
      }
    }
  }

  private updateBroodMother(broodMother: BroodMother, dt: number, _playerX: number, _playerY: number, _fogOfWar?: FogOfWar): void {
    broodMother.spawnCooldown -= dt;

    // Pulse animation when about to spawn
    if (broodMother.spawnCooldown <= 1) {
      const pulse = Math.sin((1 - broodMother.spawnCooldown) * 10) * 0.1 + 1;
      broodMother.sprite.scale.set(0.5 * pulse);
    }

    if (broodMother.spawnCooldown <= 0) {
      // Spawn crawlers around the brood mother
      for (let i = 0; i < broodMother.spawnCount; i++) {
        const angle = (Math.PI * 2 * i) / broodMother.spawnCount;
        const spawnDist = BROODMOTHER_SIZE + CRAWLER_SIZE;
        const spawnX = broodMother.x + Math.cos(angle) * spawnDist;
        const spawnY = broodMother.y + Math.sin(angle) * spawnDist;

        // Check if spawn location is valid
        const tile = MazeGenerator.worldToTile(spawnX, spawnY);
        if (tile.x >= 0 && tile.x < this.maze.width &&
            tile.y >= 0 && tile.y < this.maze.height &&
            this.maze.tiles[tile.y][tile.x] === 0) {
          this.createCrawler(spawnX, spawnY);
        }
      }

      broodMother.spawnCooldown = BROODMOTHER_SPAWN_COOLDOWN;
      broodMother.sprite.scale.set(0.5);
    }
  }

  private fireGoo(spitter: Spitter): void {
    const graphics = new Graphics();
    graphics.circle(0, 0, 10);
    graphics.fill({ color: 0x44ff44, alpha: 0.8 });
    graphics.circle(0, 0, 6);
    graphics.fill({ color: 0x88ff88, alpha: 0.9 });
    graphics.x = spitter.x;
    graphics.y = spitter.y;

    this.projectileContainer.addChild(graphics);

    this.gooProjectiles.push({
      x: spitter.x,
      y: spitter.y,
      targetX: spitter.targetX,
      targetY: spitter.targetY,
      speed: SPITTER_GOO_SPEED,
      graphics,
    });
  }

  private updateGooProjectiles(dt: number, playerX: number, playerY: number): void {
    for (let i = this.gooProjectiles.length - 1; i >= 0; i--) {
      const goo = this.gooProjectiles[i];

      // Move towards target
      const dx = goo.targetX - goo.x;
      const dy = goo.targetY - goo.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 10) {
        // Reached target, create puddle
        this.createGooPuddle(goo.x, goo.y);
        this.projectileContainer.removeChild(goo.graphics);
        goo.graphics.destroy();
        this.gooProjectiles.splice(i, 1);
        continue;
      }

      // Move
      const moveX = (dx / dist) * goo.speed * dt;
      const moveY = (dy / dist) * goo.speed * dt;
      goo.x += moveX;
      goo.y += moveY;
      goo.graphics.x = goo.x;
      goo.graphics.y = goo.y;

      // Check if hit player directly
      const playerDist = Math.sqrt((goo.x - playerX) ** 2 + (goo.y - playerY) ** 2);
      if (playerDist < 20) {
        // Direct hit - root player and remove projectile
        this.playerRootedTime = GOO_ROOT_DURATION;
        this.projectileContainer.removeChild(goo.graphics);
        goo.graphics.destroy();
        this.gooProjectiles.splice(i, 1);
      }
    }
  }

  private createGooPuddle(x: number, y: number): void {
    const graphics = new Graphics();
    graphics.circle(0, 0, GOO_PUDDLE_RADIUS);
    graphics.fill({ color: 0x44aa44, alpha: 0.5 });
    graphics.circle(0, 0, GOO_PUDDLE_RADIUS * 0.7);
    graphics.fill({ color: 0x66cc66, alpha: 0.4 });
    graphics.x = x;
    graphics.y = y;

    this.projectileContainer.addChild(graphics);

    this.gooPuddles.push({
      x,
      y,
      radius: GOO_PUDDLE_RADIUS,
      duration: GOO_PUDDLE_DURATION,
      graphics,
    });
  }

  private updateGooPuddles(dt: number, playerX: number, playerY: number): void {
    for (let i = this.gooPuddles.length - 1; i >= 0; i--) {
      const puddle = this.gooPuddles[i];
      puddle.duration -= dt;

      // Fade out
      const alpha = Math.max(0, puddle.duration / GOO_PUDDLE_DURATION) * 0.5;
      puddle.graphics.alpha = alpha;

      // Check if player is in puddle
      const dist = Math.sqrt((playerX - puddle.x) ** 2 + (playerY - puddle.y) ** 2);
      if (dist < puddle.radius && this.playerRootedTime <= 0) {
        this.playerRootedTime = GOO_ROOT_DURATION * 0.5; // Shorter root from puddle
      }

      if (puddle.duration <= 0) {
        this.projectileContainer.removeChild(puddle.graphics);
        puddle.graphics.destroy();
        this.gooPuddles.splice(i, 1);
      }
    }
  }

  private hasLineOfSight(x1: number, y1: number, x2: number, y2: number): boolean {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 1) return true;

    const steps = Math.ceil(dist / (TILE_SIZE / 2));
    const stepX = dx / steps;
    const stepY = dy / steps;

    for (let i = 1; i < steps; i++) {
      const checkX = x1 + stepX * i;
      const checkY = y1 + stepY * i;
      const tile = MazeGenerator.worldToTile(checkX, checkY);

      if (tile.x < 0 || tile.x >= this.maze.width || tile.y < 0 || tile.y >= this.maze.height) {
        return false;
      }
      if (this.maze.tiles[tile.y][tile.x] === 1) {
        return false;
      }
    }

    return true;
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

  // ============================================
  // DAMAGE AND DEATH
  // ============================================

  private spawnDeathParticles(x: number, y: number, color: number = 0xff4444): void {
    this.ensureTextures();
    const particleCount = 8 + Math.floor(Math.random() * 5);

    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.5;
      const speed = 80 + Math.random() * 120;

      const sprite = this.createParticleSprite();
      sprite.x = x + (Math.random() - 0.5) * CRAWLER_SIZE;
      sprite.y = y + (Math.random() - 0.5) * CRAWLER_SIZE;
      sprite.scale.set(0.8 + Math.random() * 0.6);
      sprite.tint = color;
      sprite.alpha = 1;

      this.particleContainer.addChild(sprite);

      this.particles.push({
        x: sprite.x,
        y: sprite.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.3 + Math.random() * 0.3,
        maxLife: 0.3 + Math.random() * 0.3,
        size: sprite.scale.x,
        sprite,
      });
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      particle.vy += 200 * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.life -= dt;
      particle.sprite.x = particle.x;
      particle.sprite.y = particle.y;
      const lifeRatio = particle.life / particle.maxLife;
      particle.sprite.alpha = lifeRatio;
      particle.sprite.scale.set(particle.size * lifeRatio);

      if (particle.life <= 0) {
        this.particleContainer.removeChild(particle.sprite);
        particle.sprite.destroy();
        this.particles.splice(i, 1);
      }
    }
  }

  damageCreature(creatureId: number, damage: number): boolean {
    const creatureIndex = this.creatures.findIndex(c => c.id === creatureId);
    if (creatureIndex === -1) return false;

    const creature = this.creatures[creatureIndex];
    if (!creature.alive) return false;

    creature.hp -= damage;
    creature.sprite.tint = 0xff6666;
    creature.flashTime = 0.05;

    if (creature.hp <= 0) {
      creature.alive = false;

      // Death particles with color based on type
      let particleColor = 0xff4444;
      if (creature.type === 'spitter') particleColor = 0x44ff44;
      if (creature.type === 'broodmother') particleColor = 0x8844ff;
      this.spawnDeathParticles(creature.x, creature.y, particleColor);

      this.container.removeChild(creature.sprite);
      creature.sprite.destroy();
      this.creatures.splice(creatureIndex, 1);

      return true;
    }

    return false;
  }

  // Legacy method name for compatibility
  damageZombie(zombieId: number, damage: number): boolean {
    return this.damageCreature(zombieId, damage);
  }

  // ============================================
  // GETTERS
  // ============================================

  getCreatures(): Creature[] {
    return this.creatures.filter(c => c.alive);
  }

  // Legacy method for compatibility with CombatSystem
  getZombies(): Creature[] {
    return this.getCreatures();
  }

  getAliveCount(): number {
    return this.creatures.length;
  }

  getCrawlerCount(): number {
    return this.creatures.filter(c => c.type === 'crawler' && c.alive).length;
  }

  getSpitterCount(): number {
    return this.creatures.filter(c => c.type === 'spitter' && c.alive).length;
  }

  getBroodMotherCount(): number {
    return this.creatures.filter(c => c.type === 'broodmother' && c.alive).length;
  }

  // ============================================
  // CLEANUP
  // ============================================

  clearAll(): void {
    for (const creature of this.creatures) {
      if (creature.sprite.parent) {
        this.container.removeChild(creature.sprite);
      }
      creature.sprite.destroy();
    }
    this.creatures = [];

    for (const particle of this.particles) {
      if (particle.sprite.parent) {
        this.particleContainer.removeChild(particle.sprite);
      }
      particle.sprite.destroy();
    }
    this.particles = [];

    for (const goo of this.gooProjectiles) {
      this.projectileContainer.removeChild(goo.graphics);
      goo.graphics.destroy();
    }
    this.gooProjectiles = [];

    for (const puddle of this.gooPuddles) {
      this.projectileContainer.removeChild(puddle.graphics);
      puddle.graphics.destroy();
    }
    this.gooPuddles = [];

    this.playerRootedTime = 0;
  }

  destroy(): void {
    this.clearAll();

    if (this.crawlerFallbackTexture) {
      this.crawlerFallbackTexture.destroy(true);
      this.crawlerFallbackTexture = null;
    }
    if (this.crawlerFlashTexture) {
      this.crawlerFlashTexture.destroy(true);
      this.crawlerFlashTexture = null;
    }
    if (this.particleTexture) {
      this.particleTexture.destroy(true);
      this.particleTexture = null;
    }

    this.particleContainer.destroy();
    this.projectileContainer.destroy();
    this.container.destroy();
  }
}

// Re-export types for compatibility
export type { Creature as Zombie };
