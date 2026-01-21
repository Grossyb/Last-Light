import { Graphics, Container } from 'pixi.js';
import { MazeData } from '@/systems/MazeGenerator';

const MINIMAP_SIZE = 180;
const MINIMAP_PADDING = 10;
const MINIMAP_TILE_SIZE = 2;

export class Minimap {
  private container: Container;
  private background: Graphics;
  private tilesGraphics: Graphics;
  private playerMarker: Graphics;
  private exitMarker: Graphics;
  private lanternMarkers: Graphics;
  private flareMarkers: Graphics;

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

    // Background
    this.background = new Graphics();
    this.background.roundRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE, 4);
    this.background.fill({ color: 0x000000, alpha: 0.7 });
    this.background.stroke({ color: 0x444444, width: 2 });
    this.container.addChild(this.background);

    // Explored tiles layer
    this.tilesGraphics = new Graphics();
    this.container.addChild(this.tilesGraphics);

    // Lantern markers
    this.lanternMarkers = new Graphics();
    this.container.addChild(this.lanternMarkers);

    // Flare markers
    this.flareMarkers = new Graphics();
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

    // Position minimap in BOTTOM-right corner of game canvas
    this.container.x = window.innerWidth - MINIMAP_SIZE - MINIMAP_PADDING;
    this.container.y = window.innerHeight - MINIMAP_SIZE - MINIMAP_PADDING;
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
    this.container.x = screenWidth - MINIMAP_SIZE - MINIMAP_PADDING;
    this.container.y = screenHeight - MINIMAP_SIZE - MINIMAP_PADDING;
  }
}
