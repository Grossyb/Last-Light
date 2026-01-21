import { Graphics, Container, Text, TextStyle } from 'pixi.js';
import { Zombie, ZombieManager } from './ZombieManager';
import { FogOfWar } from './FogOfWar';
import { MazeData, MazeGenerator } from './MazeGenerator';
import {
  BULLET_SPEED,
  PISTOL_DAMAGE,
  PISTOL_FIRE_RATE,
  PISTOL_RANGE,
  RIFLE_DAMAGE,
  RIFLE_FIRE_RATE,
  RIFLE_RANGE,
  SHOTGUN_DAMAGE,
  SHOTGUN_FIRE_RATE,
  SHOTGUN_PELLETS,
  SHOTGUN_SPREAD,
  SHOTGUN_RANGE,
  GATLING_DAMAGE,
  GATLING_FIRE_RATE,
  GATLING_RANGE,
  SCYTHE_DAMAGE,
  SCYTHE_ROTATION_SPEED,
  SCYTHE_HIT_COOLDOWN,
  ZOMBIE_SIZE,
  TILE_SIZE,
  TORCH_RADIUS,
} from '@/config/constants';

export type WeaponType = 'pistol' | 'rifle' | 'shotgun' | 'gatling' | 'scythe';

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  graphics: Graphics;
  lifetime: number;
}

interface DamageNumber {
  x: number;
  y: number;
  text: Text;
  lifetime: number;
  maxLifetime: number;
}

interface WeaponStats {
  damage: number;
  fireRate: number;
  range: number;
  bulletColor: number;
}

const WEAPON_STATS: Record<WeaponType, WeaponStats> = {
  pistol: {
    damage: PISTOL_DAMAGE,
    fireRate: PISTOL_FIRE_RATE,
    range: PISTOL_RANGE,
    bulletColor: 0xffff00,
  },
  rifle: {
    damage: RIFLE_DAMAGE,
    fireRate: RIFLE_FIRE_RATE,
    range: RIFLE_RANGE,
    bulletColor: 0x00ffff,
  },
  shotgun: {
    damage: SHOTGUN_DAMAGE,
    fireRate: SHOTGUN_FIRE_RATE,
    range: SHOTGUN_RANGE,
    bulletColor: 0xff8800,
  },
  gatling: {
    damage: GATLING_DAMAGE,
    fireRate: GATLING_FIRE_RATE,
    range: GATLING_RANGE,
    bulletColor: 0xff00ff,
  },
  scythe: {
    damage: SCYTHE_DAMAGE,
    fireRate: 0, // Not used - scythe is melee
    range: 0, // Uses torch radius
    bulletColor: 0x88ff88,
  },
};

export class CombatSystem {
  private container: Container;
  private bullets: Bullet[] = [];
  private zombieManager: ZombieManager;
  private fogOfWar: FogOfWar;
  private maze: MazeData;

  // Weapon system
  private currentWeapon: WeaponType = 'pistol';
  private fireCooldown = 0;

  // Damage multiplier (for upgrades)
  private damageMultiplier = 1;

  // Fire rate multiplier (for upgrades)
  private fireRateMultiplier = 1;

  // Stats tracking
  private killCount = 0;

  // Floating damage numbers
  private damageNumbers: DamageNumber[] = [];

  // Scythe state
  private scytheAngle = 0;
  private scytheGraphics: Graphics | null = null;
  private scytheHitCooldowns: Map<number, number> = new Map(); // zombie id -> cooldown
  private torchRadiusMultiplier = 1;

  constructor(zombieManager: ZombieManager, fogOfWar: FogOfWar, maze: MazeData) {
    this.zombieManager = zombieManager;
    this.fogOfWar = fogOfWar;
    this.maze = maze;
    this.container = new Container();
  }

  getContainer(): Container {
    return this.container;
  }

  setMaze(maze: MazeData): void {
    this.maze = maze;
  }

  setFogOfWar(fogOfWar: FogOfWar): void {
    this.fogOfWar = fogOfWar;
  }

  setWeapon(weapon: WeaponType): void {
    this.currentWeapon = weapon;
  }

  getWeapon(): WeaponType {
    return this.currentWeapon;
  }

  setDamageMultiplier(mult: number): void {
    this.damageMultiplier = mult;
  }

  setFireRateMultiplier(mult: number): void {
    this.fireRateMultiplier = mult;
  }

  setTorchRadiusMultiplier(mult: number): void {
    this.torchRadiusMultiplier = mult;
  }

  private getScytheRadius(): number {
    return TORCH_RADIUS * this.torchRadiusMultiplier;
  }

  private getFireInterval(): number {
    // Higher fire rate multiplier = faster shooting = shorter interval
    return 1 / (WEAPON_STATS[this.currentWeapon].fireRate * this.fireRateMultiplier);
  }

  private getRange(): number {
    return WEAPON_STATS[this.currentWeapon].range;
  }

  update(dt: number, playerX: number, playerY: number): void {
    // Handle scythe separately (melee weapon)
    if (this.currentWeapon === 'scythe') {
      this.updateScythe(dt, playerX, playerY);
    } else {
      // Hide scythe graphics when not using scythe
      if (this.scytheGraphics) {
        this.scytheGraphics.visible = false;
      }

      // Update fire cooldown
      this.fireCooldown -= dt;

      // Auto-shoot at nearest VISIBLE zombie in range
      if (this.fireCooldown <= 0) {
        const target = this.findNearestVisibleZombie(playerX, playerY);
        if (target) {
          this.shoot(playerX, playerY, target);
          this.fireCooldown = this.getFireInterval();
        }
      }
    }

    // Update bullets
    this.updateBullets(dt);

    // Update floating damage numbers
    this.updateDamageNumbers(dt);
  }

  private updateScythe(dt: number, playerX: number, playerY: number): void {
    // Create scythe graphics if needed
    if (!this.scytheGraphics) {
      this.scytheGraphics = new Graphics();
      this.container.addChild(this.scytheGraphics);
    }
    this.scytheGraphics.visible = true;

    // Update scythe rotation
    this.scytheAngle += dt * SCYTHE_ROTATION_SPEED * Math.PI * 2;

    // Calculate scythe blade position
    const radius = this.getScytheRadius();
    const bladeX = playerX + Math.cos(this.scytheAngle) * radius;
    const bladeY = playerY + Math.sin(this.scytheAngle) * radius;

    // Draw scythe
    this.scytheGraphics.clear();

    // Draw the rotating arm
    this.scytheGraphics.moveTo(playerX, playerY);
    this.scytheGraphics.lineTo(bladeX, bladeY);
    this.scytheGraphics.stroke({ color: 0x666666, width: 3 });

    // Draw the blade (arc at the end)
    const bladeLength = 40;
    const bladeAngle1 = this.scytheAngle + Math.PI / 2;
    const bladeAngle2 = this.scytheAngle - Math.PI / 2;
    const blade1X = bladeX + Math.cos(bladeAngle1) * bladeLength / 2;
    const blade1Y = bladeY + Math.sin(bladeAngle1) * bladeLength / 2;
    const blade2X = bladeX + Math.cos(bladeAngle2) * bladeLength / 2;
    const blade2Y = bladeY + Math.sin(bladeAngle2) * bladeLength / 2;

    this.scytheGraphics.moveTo(blade1X, blade1Y);
    this.scytheGraphics.lineTo(blade2X, blade2Y);
    this.scytheGraphics.stroke({ color: 0x88ff88, width: 6 });

    // Glow effect
    this.scytheGraphics.circle(bladeX, bladeY, 15);
    this.scytheGraphics.fill({ color: 0x88ff88, alpha: 0.3 });

    // Update hit cooldowns
    for (const [zombieId, cooldown] of this.scytheHitCooldowns) {
      const newCooldown = cooldown - dt;
      if (newCooldown <= 0) {
        this.scytheHitCooldowns.delete(zombieId);
      } else {
        this.scytheHitCooldowns.set(zombieId, newCooldown);
      }
    }

    // Check for zombie collisions with blade
    const zombies = this.zombieManager.getZombies();
    const bladeHitRadius = 30;

    for (const zombie of zombies) {
      // Skip if on cooldown
      if (this.scytheHitCooldowns.has(zombie.id)) continue;

      const dx = zombie.x - bladeX;
      const dy = zombie.y - bladeY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < bladeHitRadius + ZOMBIE_SIZE / 2) {
        const damage = Math.floor(SCYTHE_DAMAGE * this.damageMultiplier);
        const killed = this.zombieManager.damageZombie(zombie.id, damage);
        this.spawnDamageNumber(zombie.x, zombie.y, damage);

        if (killed) {
          this.killCount++;
        }

        // Set hit cooldown
        this.scytheHitCooldowns.set(zombie.id, SCYTHE_HIT_COOLDOWN);
      }
    }
  }

  private findNearestVisibleZombie(playerX: number, playerY: number): Zombie | null {
    const zombies = this.zombieManager.getZombies();
    let nearest: Zombie | null = null;
    let nearestDist = this.getRange();

    for (const zombie of zombies) {
      const dx = zombie.x - playerX;
      const dy = zombie.y - playerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist >= nearestDist) continue;

      // Check if zombie is in a lit tile (visible)
      const zombieTile = MazeGenerator.worldToTile(zombie.x, zombie.y);
      if (!this.fogOfWar.isTileLit(zombieTile.x, zombieTile.y, playerX, playerY)) {
        continue;
      }

      // Check line of sight
      if (!this.hasLineOfSight(playerX, playerY, zombie.x, zombie.y)) {
        continue;
      }

      nearestDist = dist;
      nearest = zombie;
    }

    return nearest;
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

  private shoot(playerX: number, playerY: number, target: Zombie): void {
    const dx = target.x - playerX;
    const dy = target.y - playerY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 1) return;

    const baseAngle = Math.atan2(dy, dx);
    const stats = WEAPON_STATS[this.currentWeapon];

    if (this.currentWeapon === 'shotgun') {
      // Shotgun fires multiple smaller pellets in a spread
      for (let i = 0; i < SHOTGUN_PELLETS; i++) {
        const spreadOffset = (i - (SHOTGUN_PELLETS - 1) / 2) * (SHOTGUN_SPREAD / SHOTGUN_PELLETS);
        const angle = baseAngle + spreadOffset;
        this.createBullet(playerX, playerY, angle, stats.damage, stats.bulletColor, 2);
      }
    } else {
      // Single bullet weapons
      this.createBullet(playerX, playerY, baseAngle, stats.damage, stats.bulletColor);
    }
  }

  private createBullet(x: number, y: number, angle: number, damage: number, color: number, size = 4): void {
    const graphics = new Graphics();
    graphics.circle(0, 0, size);
    graphics.fill(color);
    graphics.x = x;
    graphics.y = y;

    this.container.addChild(graphics);

    const bullet: Bullet = {
      x,
      y,
      vx: Math.cos(angle) * BULLET_SPEED,
      vy: Math.sin(angle) * BULLET_SPEED,
      damage,
      graphics,
      lifetime: 0.7,
    };

    this.bullets.push(bullet);
  }

  private updateBullets(dt: number): void {
    const zombies = this.zombieManager.getZombies();
    const bulletsToRemove: Bullet[] = [];

    for (const bullet of this.bullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.lifetime -= dt;

      bullet.graphics.x = bullet.x;
      bullet.graphics.y = bullet.y;

      if (bullet.lifetime <= 0) {
        bulletsToRemove.push(bullet);
        continue;
      }

      // Wall collision
      const tile = MazeGenerator.worldToTile(bullet.x, bullet.y);
      if (
        tile.x < 0 || tile.x >= this.maze.width ||
        tile.y < 0 || tile.y >= this.maze.height ||
        this.maze.tiles[tile.y]?.[tile.x] === 1
      ) {
        bulletsToRemove.push(bullet);
        continue;
      }

      // Zombie collision
      for (const zombie of zombies) {
        const dx = bullet.x - zombie.x;
        const dy = bullet.y - zombie.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const hitRadius = ZOMBIE_SIZE / 2 + 4;

        if (dist < hitRadius) {
          const damage = Math.floor(bullet.damage * this.damageMultiplier);
          const killed = this.zombieManager.damageZombie(zombie.id, damage);

          // Show floating damage number
          this.spawnDamageNumber(zombie.x, zombie.y, damage);

          if (killed) {
            this.killCount++;
          }

          bulletsToRemove.push(bullet);
          break;
        }
      }
    }

    for (const bullet of bulletsToRemove) {
      this.container.removeChild(bullet.graphics);
      const index = this.bullets.indexOf(bullet);
      if (index > -1) {
        this.bullets.splice(index, 1);
      }
    }
  }

  getKillCount(): number {
    return this.killCount;
  }

  resetKillCount(): void {
    this.killCount = 0;
  }

  clearBullets(): void {
    for (const bullet of this.bullets) {
      this.container.removeChild(bullet.graphics);
    }
    this.bullets = [];
  }

  private spawnDamageNumber(x: number, y: number, damage: number): void {
    const style = new TextStyle({
      fontFamily: 'monospace',
      fontSize: 16,
      fontWeight: 'bold',
      fill: 0xff4444,
      stroke: { color: 0x000000, width: 3 },
    });

    const text = new Text({ text: `-${damage}`, style });
    text.anchor.set(0.5, 0.5);
    text.x = x + (Math.random() - 0.5) * 20; // Slight random offset
    text.y = y;

    this.container.addChild(text);

    this.damageNumbers.push({
      x: text.x,
      y: text.y,
      text,
      lifetime: 0.6,
      maxLifetime: 0.6,
    });
  }

  private updateDamageNumbers(dt: number): void {
    const toRemove: DamageNumber[] = [];

    for (const dn of this.damageNumbers) {
      dn.lifetime -= dt;
      dn.y -= 50 * dt; // Float upward
      dn.text.y = dn.y;

      // Fade out based on remaining lifetime
      const alpha = Math.max(0, dn.lifetime / dn.maxLifetime);
      dn.text.alpha = alpha;

      if (dn.lifetime <= 0) {
        toRemove.push(dn);
      }
    }

    for (const dn of toRemove) {
      this.container.removeChild(dn.text);
      const index = this.damageNumbers.indexOf(dn);
      if (index > -1) {
        this.damageNumbers.splice(index, 1);
      }
    }
  }
}
