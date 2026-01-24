import { Graphics, Container, Text, TextStyle } from 'pixi.js';
import { Creature, CreatureManager } from './CreatureManager';
import { FogOfWar } from './FogOfWar';
import { MazeData, MazeGenerator } from './MazeGenerator';
import { SoundManager } from './SoundManager';
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
  SCYTHE_RADIUS,
  TILE_SIZE,
} from '@/config/constants';

export type WeaponType = 'pistol' | 'rifle' | 'shotgun' | 'gatling';

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
};

// Weapon priority for targeting (higher = better, used first)
const WEAPON_PRIORITY: Record<WeaponType, number> = {
  gatling: 4,  // Highest DPS - primary weapon
  rifle: 3,    // High damage - secondary
  shotgun: 2,  // Spread damage - close range
  pistol: 1,   // Backup weapon
};

export class CombatSystem {
  private container: Container;
  private bullets: Bullet[] = [];
  private creatureManager: CreatureManager;
  private fogOfWar: FogOfWar;
  private maze: MazeData;

  // Multi-weapon system - all owned weapons fire simultaneously
  private ownedWeapons: Set<WeaponType> = new Set(['pistol']); // Pistol always owned
  private fireCooldowns: Map<WeaponType, number> = new Map();

  // Damage multiplier (for upgrades)
  private damageMultiplier = 1;

  // Fire rate multiplier (for upgrades)
  private fireRateMultiplier = 1;

  // Stats tracking
  private killCount = 0;

  // Floating damage numbers
  private damageNumbers: DamageNumber[] = [];

  // Scythe state (passive melee ability)
  private hasScythe = false;
  private scytheAngle = 0;
  private scytheGraphics: Graphics | null = null;
  private scytheHitCooldowns: Map<number, number> = new Map(); // creature id -> cooldown
  private scytheSoundCooldown = 0;

  constructor(creatureManager: CreatureManager, fogOfWar: FogOfWar, maze: MazeData) {
    this.creatureManager = creatureManager;
    this.fogOfWar = fogOfWar;
    this.maze = maze;
    this.container = new Container();

    // Initialize cooldowns for all weapons
    for (const weapon of ['pistol', 'rifle', 'shotgun', 'gatling'] as WeaponType[]) {
      this.fireCooldowns.set(weapon, 0);
    }
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

  addWeapon(weapon: WeaponType): void {
    this.ownedWeapons.add(weapon);
  }

  hasWeapon(weapon: WeaponType): boolean {
    return this.ownedWeapons.has(weapon);
  }

  getOwnedWeapons(): WeaponType[] {
    return Array.from(this.ownedWeapons);
  }

  resetWeapons(): void {
    // Reset to just pistol (always owned)
    this.ownedWeapons.clear();
    this.ownedWeapons.add('pistol');
    // Reset all cooldowns
    for (const weapon of ['pistol', 'rifle', 'shotgun', 'gatling'] as WeaponType[]) {
      this.fireCooldowns.set(weapon, 0);
    }
  }

  setDamageMultiplier(mult: number): void {
    this.damageMultiplier = mult;
  }

  setFireRateMultiplier(mult: number): void {
    this.fireRateMultiplier = mult;
  }

  setScytheEnabled(enabled: boolean): void {
    this.hasScythe = enabled;
  }

  hasScytheEnabled(): boolean {
    return this.hasScythe;
  }

  private getScytheRadius(): number {
    return SCYTHE_RADIUS;
  }

  private getFireInterval(weapon: WeaponType): number {
    // Higher fire rate multiplier = faster shooting = shorter interval
    return 1 / (WEAPON_STATS[weapon].fireRate * this.fireRateMultiplier);
  }

  private getRange(weapon: WeaponType): number {
    return WEAPON_STATS[weapon].range;
  }

  update(dt: number, playerX: number, playerY: number): void {
    // Handle scythe as passive melee (always active when owned)
    if (this.hasScythe) {
      this.updateScythe(dt, playerX, playerY);
    } else {
      // Hide scythe graphics when not owned
      if (this.scytheGraphics) {
        this.scytheGraphics.visible = false;
      }
    }

    // Update all weapon cooldowns first
    for (const weapon of this.ownedWeapons) {
      const currentCooldown = this.fireCooldowns.get(weapon) ?? 0;
      this.fireCooldowns.set(weapon, currentCooldown - dt);
    }

    // Get all visible creatures in range, sorted by distance (nearest first)
    const visibleCreatures = this.getAllVisibleCreaturesSortedByDistance(playerX, playerY);
    const numTargets = visibleCreatures.length;

    if (numTargets === 0) {
      // No targets, just update bullets and damage numbers
      this.updateBullets(dt);
      this.updateDamageNumbers(dt);
      return;
    }

    // Sort owned weapons by priority (highest first)
    const sortedWeapons = Array.from(this.ownedWeapons).sort(
      (a, b) => WEAPON_PRIORITY[b] - WEAPON_PRIORITY[a]
    );

    // Track creatures targeted this frame to create spray effect
    const targetedThisFrame: Set<number> = new Set();

    // Determine max weapons that can fire (limited by available targets)
    const maxWeaponsToFire = Math.min(numTargets, sortedWeapons.length);
    let weaponsFired = 0;

    // Each weapon picks the nearest available target (Vampire Survivors style)
    for (const weapon of sortedWeapons) {
      // Limit weapons firing to number of targets (spray effect)
      if (weaponsFired >= maxWeaponsToFire) break;

      // Check if weapon can fire (cooldown ready)
      const cooldown = this.fireCooldowns.get(weapon) ?? 0;
      if (cooldown > 0) continue;

      // Find nearest creature not already targeted this frame, within this weapon's range
      const target = this.findNearestAvailableTarget(weapon, visibleCreatures, targetedThisFrame);
      if (target) {
        this.shootWithWeapon(playerX, playerY, target, weapon);
        this.fireCooldowns.set(weapon, this.getFireInterval(weapon));
        targetedThisFrame.add(target.id);
        weaponsFired++;
      }
    }

    // Update bullets
    this.updateBullets(dt);

    // Update floating damage numbers
    this.updateDamageNumbers(dt);
  }

  // Get all visible creatures sorted by distance (nearest first)
  private getAllVisibleCreaturesSortedByDistance(playerX: number, playerY: number): Array<Creature & { dist: number }> {
    const creatures = this.creatureManager.getCreatures();
    const visibleCreatures: Array<Creature & { dist: number }> = [];

    // Find max range among owned weapons
    let maxRange = 0;
    for (const weapon of this.ownedWeapons) {
      maxRange = Math.max(maxRange, this.getRange(weapon));
    }

    for (const creature of creatures) {
      const dx = creature.x - playerX;
      const dy = creature.y - playerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist >= maxRange) continue;

      // Check if creature is in a lit tile (visible)
      const creatureTile = MazeGenerator.worldToTile(creature.x, creature.y);
      if (!this.fogOfWar.isTileLit(creatureTile.x, creatureTile.y, playerX, playerY)) {
        continue;
      }

      // Check line of sight
      if (!this.hasLineOfSight(playerX, playerY, creature.x, creature.y)) {
        continue;
      }

      visibleCreatures.push({ ...creature, dist });
    }

    // Sort by distance (nearest first)
    visibleCreatures.sort((a, b) => a.dist - b.dist);

    return visibleCreatures;
  }

  // Find the nearest creature not already targeted, within weapon range
  private findNearestAvailableTarget(
    weapon: WeaponType,
    sortedCreatures: Array<Creature & { dist: number }>,
    excludeIds: Set<number>
  ): Creature | null {
    const weaponRange = this.getRange(weapon);

    // Creatures are already sorted by distance, so first valid one is nearest
    for (const creature of sortedCreatures) {
      // Skip if out of this weapon's range
      if (creature.dist >= weaponRange) continue;

      // Skip if already targeted by another weapon this frame
      if (excludeIds.has(creature.id)) continue;

      return creature;
    }

    return null;
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

    // Play scythe swing sound periodically
    this.scytheSoundCooldown -= dt;
    if (this.scytheSoundCooldown <= 0) {
      SoundManager.play('scythe', 0.15);
      this.scytheSoundCooldown = 0.5; // Play every 0.5 seconds
    }

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
    for (const [creatureId, cooldown] of this.scytheHitCooldowns) {
      const newCooldown = cooldown - dt;
      if (newCooldown <= 0) {
        this.scytheHitCooldowns.delete(creatureId);
      } else {
        this.scytheHitCooldowns.set(creatureId, newCooldown);
      }
    }

    // Check for creature collisions with blade
    const creatures = this.creatureManager.getCreatures();
    const bladeHitRadius = 30;

    for (const creature of creatures) {
      // Skip if on cooldown
      if (this.scytheHitCooldowns.has(creature.id)) continue;

      const dx = creature.x - bladeX;
      const dy = creature.y - bladeY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < bladeHitRadius + creature.size / 2) {
        const damage = Math.floor(SCYTHE_DAMAGE * this.damageMultiplier);
        const killed = this.creatureManager.damageCreature(creature.id, damage);
        this.spawnDamageNumber(creature.x, creature.y, damage);

        // Play scythe hit sound
        SoundManager.play('scythe_hit', 0.25);

        if (killed) {
          this.killCount++;
          SoundManager.play('enemy_killed', 0.4);
        }

        // Set hit cooldown
        this.scytheHitCooldowns.set(creature.id, SCYTHE_HIT_COOLDOWN);
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

  private shootWithWeapon(playerX: number, playerY: number, target: Creature, weapon: WeaponType): void {
    const dx = target.x - playerX;
    const dy = target.y - playerY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // If creature is at exact player position, pick a random direction
    const baseAngle = dist < 1 ? Math.random() * Math.PI * 2 : Math.atan2(dy, dx);
    const stats = WEAPON_STATS[weapon];

    // Play weapon sound
    SoundManager.play(weapon, 0.3);

    if (weapon === 'shotgun') {
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
    const creatures = this.creatureManager.getCreatures();
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

      // Creature collision
      for (const creature of creatures) {
        const dx = bullet.x - creature.x;
        const dy = bullet.y - creature.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const hitRadius = creature.size / 2 + 4;

        if (dist < hitRadius) {
          const damage = Math.floor(bullet.damage * this.damageMultiplier);
          const killed = this.creatureManager.damageCreature(creature.id, damage);

          // Show floating damage number
          this.spawnDamageNumber(creature.x, creature.y, damage);

          // Play hit/kill sounds
          if (killed) {
            this.killCount++;
            SoundManager.play('enemy_killed', 0.4);
          } else {
            SoundManager.play('enemy_hit', 0.25);
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

  // Destroy and free all resources
  destroy(): void {
    // Destroy all bullets
    for (const bullet of this.bullets) {
      bullet.graphics.destroy();
    }
    this.bullets = [];

    // Destroy all damage numbers
    for (const dn of this.damageNumbers) {
      dn.text.destroy();
    }
    this.damageNumbers = [];

    // Destroy scythe graphics
    if (this.scytheGraphics) {
      this.scytheGraphics.destroy();
      this.scytheGraphics = null;
    }

    // Destroy container
    if (this.container) {
      this.container.destroy();
    }
  }
}
