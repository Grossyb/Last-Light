import { Graphics, Container, Text, TextStyle } from 'pixi.js';
import { TILE_SIZE } from '@/config/constants';
import { MazeData, MazeGenerator } from './MazeGenerator';

export type PowerUpType = 'ghost' | 'berserker' | 'shield' | 'speedboost' | 'doubledamage';

interface PowerUpConfig {
  name: string;
  color: number;
  duration: number;
  description: string;
}

const POWERUP_CONFIGS: Record<PowerUpType, PowerUpConfig> = {
  ghost: {
    name: 'Ghost Mode',
    color: 0x8888ff,
    duration: 8,
    description: 'Invisible to zombies!',
  },
  berserker: {
    name: 'Berserker',
    color: 0xff8800,
    duration: 10,
    description: '2x Fire Rate!',
  },
  shield: {
    name: 'Shield',
    color: 0x44ffff,
    duration: 6,
    description: 'Invincible!',
  },
  speedboost: {
    name: 'Speed Demon',
    color: 0x44ff44,
    duration: 10,
    description: '2x Speed!',
  },
  doubledamage: {
    name: 'Double Damage',
    color: 0xff4444,
    duration: 10,
    description: '2x Damage!',
  },
};

interface SpawnedPowerUp {
  type: PowerUpType;
  x: number;
  y: number;
  graphics: Container;
}

interface ActiveEffect {
  type: PowerUpType;
  remainingTime: number;
}

export class PowerUpSystem {
  private container: Container;
  private maze: MazeData | null = null;
  private spawnedPowerUp: SpawnedPowerUp | null = null;
  private activeEffects: ActiveEffect[] = [];

  // UI for active effects
  private effectsContainer: Container;
  private effectTexts: Map<PowerUpType, Text> = new Map();

  // Callbacks for effects
  private onEffectStart: ((type: PowerUpType) => void) | null = null;
  private onEffectEnd: ((type: PowerUpType) => void) | null = null;

  constructor() {
    this.container = new Container();
    this.effectsContainer = new Container();
  }

  getContainer(): Container {
    return this.container;
  }

  getEffectsContainer(): Container {
    return this.effectsContainer;
  }

  setMaze(maze: MazeData): void {
    this.maze = maze;
  }

  setCallbacks(
    onStart: (type: PowerUpType) => void,
    onEnd: (type: PowerUpType) => void
  ): void {
    this.onEffectStart = onStart;
    this.onEffectEnd = onEnd;
  }

  spawnRandomPowerUp(): void {
    if (!this.maze) return;

    // Clear any existing power-up
    this.clearPowerUp();

    // Pick random power-up type
    const types: PowerUpType[] = ['ghost', 'berserker', 'shield', 'speedboost', 'doubledamage'];
    const type = types[Math.floor(Math.random() * types.length)];
    const config = POWERUP_CONFIGS[type];

    // Find a random floor tile that's not the start or exit room
    let attempts = 0;
    let tileX = 0;
    let tileY = 0;

    while (attempts < 100) {
      tileX = Math.floor(Math.random() * this.maze.width);
      tileY = Math.floor(Math.random() * this.maze.height);

      // Check if it's a floor tile
      if (this.maze.tiles[tileY]?.[tileX] === 0) {
        // Check it's not in start room
        const inStartRoom =
          tileX >= this.maze.startRoom.x &&
          tileX < this.maze.startRoom.x + this.maze.startRoom.width &&
          tileY >= this.maze.startRoom.y &&
          tileY < this.maze.startRoom.y + this.maze.startRoom.height;

        // Check it's not in exit room
        const inExitRoom =
          tileX >= this.maze.exitRoom.x &&
          tileX < this.maze.exitRoom.x + this.maze.exitRoom.width &&
          tileY >= this.maze.exitRoom.y &&
          tileY < this.maze.exitRoom.y + this.maze.exitRoom.height;

        if (!inStartRoom && !inExitRoom) {
          break;
        }
      }
      attempts++;
    }

    if (attempts >= 100) return; // Couldn't find valid spot

    const worldPos = MazeGenerator.tileToWorld(tileX, tileY);

    // Create power-up visual
    const graphics = new Container();

    // Glowing background
    const glow = new Graphics();
    glow.circle(0, 0, 20);
    glow.fill({ color: config.color, alpha: 0.3 });
    graphics.addChild(glow);

    // Main orb
    const orb = new Graphics();
    orb.circle(0, 0, 12);
    orb.fill(config.color);
    orb.stroke({ color: 0xffffff, width: 2 });
    graphics.addChild(orb);

    // Inner highlight
    const highlight = new Graphics();
    highlight.circle(-3, -3, 4);
    highlight.fill({ color: 0xffffff, alpha: 0.6 });
    graphics.addChild(highlight);

    // Label
    const labelStyle = new TextStyle({
      fontFamily: 'monospace',
      fontSize: 10,
      fill: 0xffffff,
      fontWeight: 'bold',
    });
    const label = new Text({ text: config.name, style: labelStyle });
    label.anchor.set(0.5, 0.5);
    label.y = -28;
    graphics.addChild(label);

    graphics.x = worldPos.x;
    graphics.y = worldPos.y;

    this.container.addChild(graphics);

    this.spawnedPowerUp = {
      type,
      x: worldPos.x,
      y: worldPos.y,
      graphics,
    };
  }

  clearPowerUp(): void {
    if (this.spawnedPowerUp) {
      this.container.removeChild(this.spawnedPowerUp.graphics);
      this.spawnedPowerUp = null;
    }
  }

  clearAllEffects(): void {
    // End all active effects
    for (const effect of this.activeEffects) {
      this.onEffectEnd?.(effect.type);
    }
    this.activeEffects = [];

    // Clear effect UI
    for (const text of this.effectTexts.values()) {
      this.effectsContainer.removeChild(text);
    }
    this.effectTexts.clear();
  }

  update(dt: number, playerX: number, playerY: number, isLit?: boolean): void {
    // Check for pickup
    if (this.spawnedPowerUp) {
      const dx = playerX - this.spawnedPowerUp.x;
      const dy = playerY - this.spawnedPowerUp.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 30) {
        this.pickupPowerUp(this.spawnedPowerUp.type);
        this.clearPowerUp();
        // Return early to avoid accessing cleared power-up
      } else {
        // Animate the power-up (gentle bob) - only if not picked up
        this.spawnedPowerUp.graphics.y = this.spawnedPowerUp.y + Math.sin(Date.now() / 200) * 3;

        // Only show power-up if in lit area (discovered by player)
        this.spawnedPowerUp.graphics.visible = isLit ?? false;
      }
    }

    // Update active effects
    const expiredEffects: ActiveEffect[] = [];

    for (const effect of this.activeEffects) {
      effect.remainingTime -= dt;

      if (effect.remainingTime <= 0) {
        expiredEffects.push(effect);
      }

      // Update UI text
      const text = this.effectTexts.get(effect.type);
      if (text) {
        const config = POWERUP_CONFIGS[effect.type];
        text.text = `${config.name}: ${Math.ceil(effect.remainingTime)}s`;
      }
    }

    // Remove expired effects
    for (const effect of expiredEffects) {
      this.onEffectEnd?.(effect.type);

      const index = this.activeEffects.indexOf(effect);
      if (index > -1) {
        this.activeEffects.splice(index, 1);
      }

      // Remove UI text
      const text = this.effectTexts.get(effect.type);
      if (text) {
        this.effectsContainer.removeChild(text);
        this.effectTexts.delete(effect.type);
      }
    }

    // Update UI positions
    this.updateEffectsUI();
  }

  private pickupPowerUp(type: PowerUpType): void {
    const config = POWERUP_CONFIGS[type];

    // Check if we already have this effect active
    const existing = this.activeEffects.find(e => e.type === type);
    if (existing) {
      // Refresh duration
      existing.remainingTime = config.duration;
    } else {
      // Add new effect
      this.activeEffects.push({
        type,
        remainingTime: config.duration,
      });

      // Trigger effect start
      this.onEffectStart?.(type);

      // Create UI text
      const textStyle = new TextStyle({
        fontFamily: 'monospace',
        fontSize: 14,
        fill: config.color,
        fontWeight: 'bold',
      });
      const text = new Text({ text: '', style: textStyle });
      this.effectsContainer.addChild(text);
      this.effectTexts.set(type, text);
    }
  }

  private updateEffectsUI(): void {
    let yOffset = 0;
    for (const [type, text] of this.effectTexts) {
      text.x = window.innerWidth - 180;
      text.y = 120 + yOffset;
      yOffset += 22;
    }
  }

  hasEffect(type: PowerUpType): boolean {
    return this.activeEffects.some(e => e.type === type);
  }

  getEffectMultiplier(type: PowerUpType): number {
    return this.hasEffect(type) ? 2 : 1;
  }

  getSpawnedPowerUpPosition(): { x: number; y: number } | null {
    if (!this.spawnedPowerUp) return null;
    return { x: this.spawnedPowerUp.x, y: this.spawnedPowerUp.y };
  }
}
