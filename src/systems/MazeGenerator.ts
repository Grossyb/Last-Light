import { TILE_SIZE } from '@/config/constants';

export interface Room {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface MazeData {
  tiles: number[][]; // 0 = floor, 1 = wall
  rooms: Room[];
  startRoom: Room;
  exitRoom: Room;
  width: number;
  height: number;
}

export class MazeGenerator {
  private width: number;
  private height: number;
  private tiles: number[][];
  private rooms: Room[] = [];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.tiles = [];
  }

  generate(): MazeData {
    // Initialize all as walls
    this.tiles = [];
    for (let y = 0; y < this.height; y++) {
      this.tiles[y] = [];
      for (let x = 0; x < this.width; x++) {
        this.tiles[y][x] = 1; // wall
      }
    }

    this.rooms = [];

    // Scale room sizes and count based on map size
    const mapScale = Math.min(this.width, this.height);
    const roomAttempts = Math.max(10, Math.floor(mapScale * 1.5));
    const minRoomSize = Math.max(3, Math.floor(mapScale * 0.15));
    const maxRoomSize = Math.max(5, Math.floor(mapScale * 0.35));

    for (let i = 0; i < roomAttempts; i++) {
      const roomWidth = this.randomInt(minRoomSize, maxRoomSize);
      const roomHeight = this.randomInt(minRoomSize, maxRoomSize);
      const x = this.randomInt(2, this.width - roomWidth - 2);
      const y = this.randomInt(2, this.height - roomHeight - 2);

      const newRoom: Room = {
        x,
        y,
        width: roomWidth,
        height: roomHeight,
        centerX: Math.floor(x + roomWidth / 2),
        centerY: Math.floor(y + roomHeight / 2),
      };

      // Check for overlap with existing rooms (with padding)
      let overlaps = false;
      for (const room of this.rooms) {
        if (this.roomsOverlap(newRoom, room, 2)) {
          overlaps = true;
          break;
        }
      }

      if (!overlaps) {
        this.carveRoom(newRoom);
        this.rooms.push(newRoom);
      }
    }

    // Connect rooms with corridors
    this.connectRooms();

    // Add some random corridor branches for variety
    this.addExtraCorridors();

    // Find start and exit rooms (furthest apart)
    const { startRoom, exitRoom } = this.findStartAndExit();

    return {
      tiles: this.tiles,
      rooms: this.rooms,
      startRoom,
      exitRoom,
      width: this.width,
      height: this.height,
    };
  }

  private roomsOverlap(a: Room, b: Room, padding: number): boolean {
    return !(
      a.x + a.width + padding < b.x ||
      b.x + b.width + padding < a.x ||
      a.y + a.height + padding < b.y ||
      b.y + b.height + padding < a.y
    );
  }

  private carveRoom(room: Room): void {
    for (let y = room.y; y < room.y + room.height; y++) {
      for (let x = room.x; x < room.x + room.width; x++) {
        this.tiles[y][x] = 0; // floor
      }
    }
  }

  private connectRooms(): void {
    // Connect each room to the next using corridors
    for (let i = 1; i < this.rooms.length; i++) {
      const roomA = this.rooms[i - 1];
      const roomB = this.rooms[i];

      // Randomly choose horizontal-first or vertical-first
      if (Math.random() < 0.5) {
        this.carveHorizontalCorridor(roomA.centerX, roomB.centerX, roomA.centerY);
        this.carveVerticalCorridor(roomA.centerY, roomB.centerY, roomB.centerX);
      } else {
        this.carveVerticalCorridor(roomA.centerY, roomB.centerY, roomA.centerX);
        this.carveHorizontalCorridor(roomA.centerX, roomB.centerX, roomB.centerY);
      }
    }
  }

  private carveHorizontalCorridor(x1: number, x2: number, y: number): void {
    const startX = Math.min(x1, x2);
    const endX = Math.max(x1, x2);
    const corridorWidth = 3; // Wider corridors for kiting

    for (let x = startX; x <= endX; x++) {
      for (let dy = 0; dy < corridorWidth; dy++) {
        const ty = y + dy;
        if (ty >= 0 && ty < this.height) {
          this.tiles[ty][x] = 0;
        }
      }
    }
  }

  private carveVerticalCorridor(y1: number, y2: number, x: number): void {
    const startY = Math.min(y1, y2);
    const endY = Math.max(y1, y2);
    const corridorWidth = 3;

    for (let y = startY; y <= endY; y++) {
      for (let dx = 0; dx < corridorWidth; dx++) {
        const tx = x + dx;
        if (tx >= 0 && tx < this.width) {
          this.tiles[y][tx] = 0;
        }
      }
    }
  }

  private addExtraCorridors(): void {
    // More connections = more decision points and loops
    const extraConnections = Math.floor(this.rooms.length / 2);

    for (let i = 0; i < extraConnections; i++) {
      const roomA = this.rooms[this.randomInt(0, this.rooms.length - 1)];
      const roomB = this.rooms[this.randomInt(0, this.rooms.length - 1)];

      if (roomA !== roomB) {
        if (Math.random() < 0.5) {
          this.carveHorizontalCorridor(roomA.centerX, roomB.centerX, roomA.centerY);
          this.carveVerticalCorridor(roomA.centerY, roomB.centerY, roomB.centerX);
        } else {
          this.carveVerticalCorridor(roomA.centerY, roomB.centerY, roomA.centerX);
          this.carveHorizontalCorridor(roomA.centerX, roomB.centerX, roomB.centerY);
        }
      }
    }
  }

  private findStartAndExit(): { startRoom: Room; exitRoom: Room } {
    let maxDist = 0;
    let startRoom = this.rooms[0];
    let exitRoom = this.rooms[this.rooms.length - 1];

    // Calculate minimum required distance (at least 40% of map diagonal)
    const mapDiagonal = Math.sqrt(this.width * this.width + this.height * this.height);
    const minRequiredDist = mapDiagonal * 0.4;

    // Find the two rooms that are furthest apart
    for (let i = 0; i < this.rooms.length; i++) {
      for (let j = i + 1; j < this.rooms.length; j++) {
        const dist = this.roomDistance(this.rooms[i], this.rooms[j]);
        if (dist > maxDist) {
          maxDist = dist;
          startRoom = this.rooms[i];
          exitRoom = this.rooms[j];
        }
      }
    }

    // If best distance is still too small, try to place exit in opposite corner
    if (maxDist < minRequiredDist && this.rooms.length >= 2) {
      // Find room closest to top-left for start
      let minStartDist = Infinity;
      for (const room of this.rooms) {
        const dist = Math.sqrt(room.centerX * room.centerX + room.centerY * room.centerY);
        if (dist < minStartDist) {
          minStartDist = dist;
          startRoom = room;
        }
      }

      // Find room closest to bottom-right for exit
      let minExitDist = Infinity;
      for (const room of this.rooms) {
        if (room === startRoom) continue;
        const dx = this.width - room.centerX;
        const dy = this.height - room.centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minExitDist) {
          minExitDist = dist;
          exitRoom = room;
        }
      }
    }

    return { startRoom, exitRoom };
  }

  private roomDistance(a: Room, b: Room): number {
    const dx = a.centerX - b.centerX;
    const dy = a.centerY - b.centerY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Helper to convert tile coords to world coords
  static tileToWorld(tileX: number, tileY: number): { x: number; y: number } {
    return {
      x: tileX * TILE_SIZE + TILE_SIZE / 2,
      y: tileY * TILE_SIZE + TILE_SIZE / 2,
    };
  }

  // Helper to convert world coords to tile coords
  static worldToTile(worldX: number, worldY: number): { x: number; y: number } {
    return {
      x: Math.floor(worldX / TILE_SIZE),
      y: Math.floor(worldY / TILE_SIZE),
    };
  }
}
