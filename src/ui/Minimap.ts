import { Graphics, Container } from 'pixi.js';
import { MazeData } from '@/systems/MazeGenerator';

const MINIMAP_SIZE = 180;
const MINIMAP_TILE_SIZE = 2;

export class Minimap {
  private container: Container;
  private tilesGraphics: Graphics;
  private playerMarker: Graphics;
  private exitMarker: Graphics;
  private lanternMarkers: Graphics;
  private flareMarkers: Graphics;
  private maskGraphics: Graphics;
  private hudFrame: Graphics;

  private maze: MazeData;
  private scale: number;
  private offsetX: number;
  private offsetY: number;

  constructor(maze: MazeData) {
    this.maze = maze;
    this.container = new Container();

    // Calculate scale to fit maze in minimap
    this.scale = Math.min(
      MINIMAP_SIZE / (maze.width * MINIMAP_TILE_SIZE),
      MINIMAP_SIZE / (maze.height * MINIMAP_TILE_SIZE)
    );
    this.offsetX = 0;
    this.offsetY = 0;

    // HUD frame - minimal Jarvis style
    this.hudFrame = new Graphics();
    this.drawHudFrame();
    this.container.addChild(this.hudFrame);

    // Create mask for tiles (to clip to minimap area)
    this.maskGraphics = new Graphics();
    this.maskGraphics.roundRect(8, 8, MINIMAP_SIZE - 16, MINIMAP_SIZE - 16, 2);
    this.maskGraphics.fill(0xffffff);
    this.container.addChild(this.maskGraphics);

    // Explored tiles layer
    this.tilesGraphics = new Graphics();
    this.tilesGraphics.mask = this.maskGraphics;
    this.container.addChild(this.tilesGraphics);

    // Lantern markers
    this.lanternMarkers = new Graphics();
    this.lanternMarkers.mask = this.maskGraphics;
    this.container.addChild(this.lanternMarkers);

    // Flare markers
    this.flareMarkers = new Graphics();
    this.flareMarkers.mask = this.maskGraphics;
    this.container.addChild(this.flareMarkers);

    // Exit marker (hidden until discovered)
    this.exitMarker = new Graphics();
    this.exitMarker.circle(0, 0, 4);
    this.exitMarker.fill(0x44ff44);
    this.exitMarker.visible = false;
    this.container.addChild(this.exitMarker);

    // Player marker
    this.playerMarker = new Graphics();
    this.playerMarker.circle(0, 0, 3);
    this.playerMarker.fill(0xffff00);
    this.container.addChild(this.playerMarker);

    // Position minimap inside hull frame
    this.container.x = window.innerWidth - MINIMAP_SIZE - 160;
    this.container.y = window.innerHeight - MINIMAP_SIZE - 200;
  }

  private drawHudFrame(): void {
    this.hudFrame.clear();

    // Outer glow effect
    this.hudFrame.roundRect(-2, -2, MINIMAP_SIZE + 4, MINIMAP_SIZE + 4, 10);
    this.hudFrame.fill({ color: 0x44ffaa, alpha: 0.08 });

    // Main background
    this.hudFrame.roundRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE, 8);
    this.hudFrame.fill({ color: 0x0a1a15, alpha: 0.85 });

    // Thin border
    this.hudFrame.roundRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE, 8);
    this.hudFrame.stroke({ color: 0x44ffaa, width: 1, alpha: 0.5 });

    // Corner accents - top left
    this.hudFrame.moveTo(0, 20);
    this.hudFrame.lineTo(0, 8);
    this.hudFrame.arcTo(0, 0, 8, 0, 8);
    this.hudFrame.lineTo(20, 0);
    this.hudFrame.stroke({ color: 0x44ffaa, width: 2, alpha: 0.8 });

    // Corner accents - top right
    this.hudFrame.moveTo(MINIMAP_SIZE - 20, 0);
    this.hudFrame.lineTo(MINIMAP_SIZE - 8, 0);
    this.hudFrame.arcTo(MINIMAP_SIZE, 0, MINIMAP_SIZE, 8, 8);
    this.hudFrame.lineTo(MINIMAP_SIZE, 20);
    this.hudFrame.stroke({ color: 0x44ffaa, width: 2, alpha: 0.8 });

    // Corner accents - bottom left
    this.hudFrame.moveTo(0, MINIMAP_SIZE - 20);
    this.hudFrame.lineTo(0, MINIMAP_SIZE - 8);
    this.hudFrame.arcTo(0, MINIMAP_SIZE, 8, MINIMAP_SIZE, 8);
    this.hudFrame.lineTo(20, MINIMAP_SIZE);
    this.hudFrame.stroke({ color: 0x44ffaa, width: 2, alpha: 0.8 });

    // Corner accents - bottom right
    this.hudFrame.moveTo(MINIMAP_SIZE - 20, MINIMAP_SIZE);
    this.hudFrame.lineTo(MINIMAP_SIZE - 8, MINIMAP_SIZE);
    this.hudFrame.arcTo(MINIMAP_SIZE, MINIMAP_SIZE, MINIMAP_SIZE, MINIMAP_SIZE - 8, 8);
    this.hudFrame.lineTo(MINIMAP_SIZE, MINIMAP_SIZE - 20);
    this.hudFrame.stroke({ color: 0x44ffaa, width: 2, alpha: 0.8 });
  }

  getContainer(): Container {
    return this.container;
  }

  update(
    playerTileX: number,
    playerTileY: number,
    visibilityMap: number[][],
    exitDiscovered: boolean,
    lanterns: { tileX: number; tileY: number }[],
    flares: { tileX: number; tileY: number }[]
  ): void {
    // Center minimap on player
    this.offsetX = MINIMAP_SIZE / 2 - playerTileX * MINIMAP_TILE_SIZE * this.scale;
    this.offsetY = MINIMAP_SIZE / 2 - playerTileY * MINIMAP_TILE_SIZE * this.scale;

    // Redraw tiles based on visibility
    this.tilesGraphics.clear();

    for (let y = 0; y < this.maze.height; y++) {
      for (let x = 0; x < this.maze.width; x++) {
        const visibility = visibilityMap[y]?.[x] ?? 0;
        if (visibility > 0) {
          const screenX = this.offsetX + x * MINIMAP_TILE_SIZE * this.scale;
          const screenY = this.offsetY + y * MINIMAP_TILE_SIZE * this.scale;

          // Skip if outside minimap bounds
          if (screenX < 0 || screenX > MINIMAP_SIZE || screenY < 0 || screenY > MINIMAP_SIZE) {
            continue;
          }

          // Color based on tile type, alpha based on visibility
          const isFloor = this.maze.tiles[y][x] === 0;
          const baseColor = isFloor ? 0x44aa44 : 0x226622;

          this.tilesGraphics.rect(
            screenX,
            screenY,
            MINIMAP_TILE_SIZE * this.scale,
            MINIMAP_TILE_SIZE * this.scale
          );
          this.tilesGraphics.fill({ color: baseColor, alpha: visibility });
        }
      }
    }

    // Update player marker (always centered)
    this.playerMarker.x = MINIMAP_SIZE / 2;
    this.playerMarker.y = MINIMAP_SIZE / 2;

    // Update exit marker
    if (exitDiscovered) {
      this.exitMarker.visible = true;
      this.exitMarker.x = this.offsetX + this.maze.exitRoom.centerX * MINIMAP_TILE_SIZE * this.scale;
      this.exitMarker.y = this.offsetY + this.maze.exitRoom.centerY * MINIMAP_TILE_SIZE * this.scale;
    }

    // Update lantern markers (orange dots)
    this.lanternMarkers.clear();
    for (const lantern of lanterns) {
      const screenX = this.offsetX + lantern.tileX * MINIMAP_TILE_SIZE * this.scale;
      const screenY = this.offsetY + lantern.tileY * MINIMAP_TILE_SIZE * this.scale;
      if (screenX >= 0 && screenX <= MINIMAP_SIZE && screenY >= 0 && screenY <= MINIMAP_SIZE) {
        this.lanternMarkers.circle(screenX, screenY, 3);
        this.lanternMarkers.fill(0xffaa00);
      }
    }

    // Update flare markers (red dots)
    this.flareMarkers.clear();
    for (const flare of flares) {
      const screenX = this.offsetX + flare.tileX * MINIMAP_TILE_SIZE * this.scale;
      const screenY = this.offsetY + flare.tileY * MINIMAP_TILE_SIZE * this.scale;
      if (screenX >= 0 && screenX <= MINIMAP_SIZE && screenY >= 0 && screenY <= MINIMAP_SIZE) {
        this.flareMarkers.circle(screenX, screenY, 4);
        this.flareMarkers.fill(0xff4400);
      }
    }
  }

  resize(screenWidth: number, screenHeight: number): void {
    this.container.x = screenWidth - MINIMAP_SIZE - 160;
    this.container.y = screenHeight - MINIMAP_SIZE - 200;
  }
}
