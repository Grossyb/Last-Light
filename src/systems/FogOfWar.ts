import { Graphics, Container, Application } from 'pixi.js';
import {
  TILE_SIZE,
  TORCH_RADIUS,
  LANTERN_RADIUS,
  FLARE_RADIUS,
  FOG_CREEP_SPEED,
  FLARE_FLIGHT_SPEED,
} from '@/config/constants';
import { MazeGenerator } from './MazeGenerator';

interface Lantern {
  x: number;
  y: number;
  tileX: number;
  tileY: number;
}

interface Flare {
  x: number;
  y: number;
  tileX: number;
  tileY: number;
}

interface FlyingFlare {
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetX: number;
  targetY: number;
}

export class FogOfWar {
  private width: number;
  private height: number;
  private app: Application;

  // Visibility tracking: timestamp when tile was last lit (0 = never seen)
  private lastLitTime: number[][];

  // Permanent light tracking for minimap
  private permanentlyLit: boolean[][];

  // Fog rendering
  private fogGraphics: Graphics;
  private fogContainer: Container;

  // Light sources (both permanent now)
  private lanterns: Lantern[] = [];
  private flares: Flare[] = [];
  private flyingFlares: FlyingFlare[] = [];

  // Current time for fog calculations
  private currentTime: number = 0;

  // Torch radius multiplier (for upgrades)
  private torchRadiusMultiplier: number = 1;

  setTorchRadiusMultiplier(multiplier: number): void {
    this.torchRadiusMultiplier = multiplier;
  }

  constructor(app: Application, mazeWidth: number, mazeHeight: number) {
    this.app = app;
    this.width = mazeWidth;
    this.height = mazeHeight;

    // Initialize all tiles as never seen
    this.lastLitTime = [];
    this.permanentlyLit = [];
    for (let y = 0; y < this.height; y++) {
      this.lastLitTime[y] = [];
      this.permanentlyLit[y] = [];
      for (let x = 0; x < this.width; x++) {
        this.lastLitTime[y][x] = 0;
        this.permanentlyLit[y][x] = false;
      }
    }

    this.fogContainer = new Container();
    this.fogGraphics = new Graphics();
    this.fogContainer.addChild(this.fogGraphics);
  }

  getFogContainer(): Container {
    return this.fogContainer;
  }

  update(playerX: number, playerY: number, dt: number): void {
    this.currentTime += dt * 1000; // Convert to ms

    // Update flying flares
    this.updateFlyingFlares(dt);

    // Light tiles around player (torch) - apply multiplier for upgrades
    this.lightTilesInRadius(playerX, playerY, TORCH_RADIUS * this.torchRadiusMultiplier, false);

    // Light tiles around lanterns (permanent)
    for (const lantern of this.lanterns) {
      this.lightTilesInRadius(lantern.x, lantern.y, LANTERN_RADIUS, true);
    }

    // Light tiles around flares (permanent)
    for (const flare of this.flares) {
      this.lightTilesInRadius(flare.x, flare.y, FLARE_RADIUS, true);
    }

    // Render fog
    this.renderFog(playerX, playerY);
  }

  private updateFlyingFlares(dt: number): void {
    const flaresToLand: FlyingFlare[] = [];

    for (const flare of this.flyingFlares) {
      // Move flare
      flare.x += flare.vx * dt;
      flare.y += flare.vy * dt;

      // Check if flare has reached target or hit map boundary
      const reachedTarget = this.hasReachedTarget(flare);
      const hitBoundary = this.isOutsideMapBoundary(flare.x, flare.y);

      if (reachedTarget || hitBoundary) {
        // Clamp position to map boundaries
        const clampedPos = this.clampToMapBoundary(flare.x, flare.y);
        flare.x = clampedPos.x;
        flare.y = clampedPos.y;
        flaresToLand.push(flare);
      }
    }

    // Land flares that reached destination or hit boundary
    for (const flare of flaresToLand) {
      this.landFlare(flare.x, flare.y);
      const index = this.flyingFlares.indexOf(flare);
      if (index > -1) {
        this.flyingFlares.splice(index, 1);
      }
    }
  }

  private hasReachedTarget(flare: FlyingFlare): boolean {
    const dx = flare.targetX - flare.x;
    const dy = flare.targetY - flare.y;
    const distToTarget = Math.sqrt(dx * dx + dy * dy);
    return distToTarget < FLARE_FLIGHT_SPEED * 0.02; // Close enough
  }

  private isOutsideMapBoundary(x: number, y: number): boolean {
    // Check if position is outside the outer map edges
    const padding = TILE_SIZE; // Small padding from edge
    const maxX = this.width * TILE_SIZE - padding;
    const maxY = this.height * TILE_SIZE - padding;
    return x < padding || x > maxX || y < padding || y > maxY;
  }

  private clampToMapBoundary(x: number, y: number): { x: number; y: number } {
    const padding = TILE_SIZE;
    const maxX = this.width * TILE_SIZE - padding;
    const maxY = this.height * TILE_SIZE - padding;
    return {
      x: Math.max(padding, Math.min(maxX, x)),
      y: Math.max(padding, Math.min(maxY, y)),
    };
  }

  private landFlare(x: number, y: number): void {
    const tile = MazeGenerator.worldToTile(x, y);
    this.flares.push({
      x,
      y,
      tileX: tile.x,
      tileY: tile.y,
    });
  }

  private lightTilesInRadius(worldX: number, worldY: number, radius: number, permanent: boolean): void {
    const centerTile = MazeGenerator.worldToTile(worldX, worldY);
    const tileRadius = Math.ceil(radius / TILE_SIZE) + 1;

    for (let dy = -tileRadius; dy <= tileRadius; dy++) {
      for (let dx = -tileRadius; dx <= tileRadius; dx++) {
        const tx = centerTile.x + dx;
        const ty = centerTile.y + dy;

        if (tx < 0 || tx >= this.width || ty < 0 || ty >= this.height) continue;

        // Check if tile center is within light radius
        const tileWorldPos = MazeGenerator.tileToWorld(tx, ty);
        const distX = tileWorldPos.x - worldX;
        const distY = tileWorldPos.y - worldY;
        const dist = Math.sqrt(distX * distX + distY * distY);

        if (dist <= radius) {
          this.lastLitTime[ty][tx] = this.currentTime;
          if (permanent) {
            this.permanentlyLit[ty][tx] = true;
          }
        }
      }
    }
  }

  private renderFog(playerX: number, playerY: number): void {
    this.fogGraphics.clear();

    // Calculate visible area (optimization - only render fog near player)
    const viewRadius = 25; // tiles - increased to cover screen edges
    const centerTile = MazeGenerator.worldToTile(playerX, playerY);

    for (let dy = -viewRadius; dy <= viewRadius; dy++) {
      for (let dx = -viewRadius; dx <= viewRadius; dx++) {
        const tx = centerTile.x + dx;
        const ty = centerTile.y + dy;

        // Areas outside maze bounds are always fully dark
        if (tx < 0 || tx >= this.width || ty < 0 || ty >= this.height) {
          this.fogGraphics.rect(
            tx * TILE_SIZE,
            ty * TILE_SIZE,
            TILE_SIZE,
            TILE_SIZE
          );
          this.fogGraphics.fill({ color: 0x000000, alpha: 1 });
          continue;
        }

        const visibility = this.getTileVisibility(tx, ty, playerX, playerY);

        if (visibility < 1) {
          // Draw fog with alpha based on visibility
          const alpha = 1 - visibility;
          this.fogGraphics.rect(
            tx * TILE_SIZE,
            ty * TILE_SIZE,
            TILE_SIZE,
            TILE_SIZE
          );
          this.fogGraphics.fill({ color: 0x000000, alpha });
        }
      }
    }
  }

  private getTileVisibility(tileX: number, tileY: number, playerX: number, playerY: number): number {
    const lastLit = this.lastLitTime[tileY][tileX];

    // Never seen
    if (lastLit === 0) return 0;

    // Permanently lit by lantern or flare
    if (this.permanentlyLit[tileY][tileX]) return 1;

    const tileWorldPos = MazeGenerator.tileToWorld(tileX, tileY);

    // Check if currently lit by torch
    const distToPlayer = Math.sqrt(
      (tileWorldPos.x - playerX) ** 2 + (tileWorldPos.y - playerY) ** 2
    );
    if (distToPlayer <= TORCH_RADIUS) return 1;

    // Calculate fog creep - visibility fades from 1 to 0 over FOG_CREEP_SPEED
    const timeSinceLit = this.currentTime - lastLit;
    const visibility = 1 - (timeSinceLit / FOG_CREEP_SPEED);

    return Math.max(0, Math.min(1, visibility));
  }

  placeLantern(worldX: number, worldY: number): void {
    const tile = MazeGenerator.worldToTile(worldX, worldY);
    this.lanterns.push({
      x: worldX,
      y: worldY,
      tileX: tile.x,
      tileY: tile.y,
    });
  }

  launchFlare(playerX: number, playerY: number, targetX: number, targetY: number): void {
    // Calculate direction from player to target
    const dx = targetX - playerX;
    const dy = targetY - playerY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 1) return; // No direction

    // Extend flare to travel further (3x the click distance, min 400 units)
    const throwDistance = Math.max(400, dist * 3);

    const dirX = dx / dist;
    const dirY = dy / dist;

    // Calculate target position (may be clamped to boundary during flight)
    const targetFlareX = playerX + dirX * throwDistance;
    const targetFlareY = playerY + dirY * throwDistance;

    // Create flying flare starting from player position
    this.flyingFlares.push({
      x: playerX,
      y: playerY,
      vx: dirX * FLARE_FLIGHT_SPEED,
      vy: dirY * FLARE_FLIGHT_SPEED,
      targetX: targetFlareX,
      targetY: targetFlareY,
    });
  }

  getLanterns(): Lantern[] {
    return this.lanterns;
  }

  getFlares(): Flare[] {
    return this.flares;
  }

  getFlyingFlares(): { x: number; y: number }[] {
    return this.flyingFlares;
  }

  // Check if a tile is currently visible (for zombie spawning logic later)
  isTileVisible(tileX: number, tileY: number, playerX: number, playerY: number): boolean {
    return this.getTileVisibility(tileX, tileY, playerX, playerY) > 0.5;
  }

  // Check if a tile is currently lit (torch, lantern, or flare)
  isTileLit(tileX: number, tileY: number, playerX: number, playerY: number): boolean {
    return this.getTileVisibility(tileX, tileY, playerX, playerY) === 1;
  }

  // Get permanently revealed tiles for minimap
  getPermanentlyLitTiles(): boolean[][] {
    return this.permanentlyLit;
  }

  // Get visibility levels for all tiles (for minimap with fog creep)
  getVisibilityMap(playerX: number, playerY: number): number[][] {
    const visibility: number[][] = [];
    for (let y = 0; y < this.height; y++) {
      visibility[y] = [];
      for (let x = 0; x < this.width; x++) {
        visibility[y][x] = this.getTileVisibility(x, y, playerX, playerY);
      }
    }
    return visibility;
  }
}
