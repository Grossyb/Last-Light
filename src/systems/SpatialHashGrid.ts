/**
 * Spatial Hash Grid for O(1) nearby entity lookups
 * This dramatically improves collision detection performance from O(n²) to O(n)
 * by only checking entities in nearby grid cells.
 */

export interface SpatialEntity {
  id: number;
  x: number;
  y: number;
}

export class SpatialHashGrid {
  private cellSize: number;
  private grid: Map<string, Set<number>> = new Map();
  private entityPositions: Map<number, { x: number; y: number; cellKey: string }> = new Map();

  constructor(cellSize: number = 80) {
    this.cellSize = cellSize;
  }

  private getCellKey(x: number, y: number): string {
    const cellX = Math.floor(x / this.cellSize);
    const cellY = Math.floor(y / this.cellSize);
    return `${cellX},${cellY}`;
  }

  /**
   * Insert an entity into the grid
   */
  insert(id: number, x: number, y: number): void {
    const cellKey = this.getCellKey(x, y);

    // Remove from old cell if exists
    const existing = this.entityPositions.get(id);
    if (existing && existing.cellKey !== cellKey) {
      const oldCell = this.grid.get(existing.cellKey);
      if (oldCell) {
        oldCell.delete(id);
        if (oldCell.size === 0) {
          this.grid.delete(existing.cellKey);
        }
      }
    }

    // Add to new cell
    if (!this.grid.has(cellKey)) {
      this.grid.set(cellKey, new Set());
    }
    this.grid.get(cellKey)!.add(id);
    this.entityPositions.set(id, { x, y, cellKey });
  }

  /**
   * Update an entity's position (optimized - only moves cells if needed)
   */
  update(id: number, x: number, y: number): void {
    const newCellKey = this.getCellKey(x, y);
    const existing = this.entityPositions.get(id);

    if (existing) {
      if (existing.cellKey === newCellKey) {
        // Same cell, just update position
        existing.x = x;
        existing.y = y;
        return;
      }

      // Different cell, need to move
      const oldCell = this.grid.get(existing.cellKey);
      if (oldCell) {
        oldCell.delete(id);
        if (oldCell.size === 0) {
          this.grid.delete(existing.cellKey);
        }
      }
    }

    // Add to new cell
    if (!this.grid.has(newCellKey)) {
      this.grid.set(newCellKey, new Set());
    }
    this.grid.get(newCellKey)!.add(id);
    this.entityPositions.set(id, { x, y, cellKey: newCellKey });
  }

  /**
   * Remove an entity from the grid
   */
  remove(id: number): void {
    const existing = this.entityPositions.get(id);
    if (existing) {
      const cell = this.grid.get(existing.cellKey);
      if (cell) {
        cell.delete(id);
        if (cell.size === 0) {
          this.grid.delete(existing.cellKey);
        }
      }
      this.entityPositions.delete(id);
    }
  }

  /**
   * Get all entity IDs within a radius of a point
   * This is the key optimization - only checks nearby cells
   */
  getNearby(x: number, y: number, radius: number): number[] {
    const results: number[] = [];
    const cellRadius = Math.ceil(radius / this.cellSize);
    const centerCellX = Math.floor(x / this.cellSize);
    const centerCellY = Math.floor(y / this.cellSize);

    // Check all cells that could contain entities within radius
    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      for (let dy = -cellRadius; dy <= cellRadius; dy++) {
        const cellKey = `${centerCellX + dx},${centerCellY + dy}`;
        const cell = this.grid.get(cellKey);
        if (cell) {
          for (const id of cell) {
            results.push(id);
          }
        }
      }
    }

    return results;
  }

  /**
   * Get all entity IDs within a radius, with actual distance filtering
   * More accurate but slightly slower than getNearby
   */
  getNearbyWithDistance(x: number, y: number, radius: number): Array<{ id: number; dist: number }> {
    const candidateIds = this.getNearby(x, y, radius);
    const results: Array<{ id: number; dist: number }> = [];
    const radiusSq = radius * radius;

    for (const id of candidateIds) {
      const pos = this.entityPositions.get(id);
      if (pos) {
        const dx = pos.x - x;
        const dy = pos.y - y;
        const distSq = dx * dx + dy * dy;
        if (distSq <= radiusSq) {
          results.push({ id, dist: Math.sqrt(distSq) });
        }
      }
    }

    return results;
  }

  /**
   * Get all entity IDs in the grid
   */
  getAllIds(): number[] {
    return Array.from(this.entityPositions.keys());
  }

  /**
   * Get entity position by ID
   */
  getPosition(id: number): { x: number; y: number } | undefined {
    const pos = this.entityPositions.get(id);
    return pos ? { x: pos.x, y: pos.y } : undefined;
  }

  /**
   * Clear all entities from the grid
   */
  clear(): void {
    this.grid.clear();
    this.entityPositions.clear();
  }

  /**
   * Get stats for debugging
   */
  getStats(): { entityCount: number; cellCount: number; avgPerCell: number } {
    const entityCount = this.entityPositions.size;
    const cellCount = this.grid.size;
    const avgPerCell = cellCount > 0 ? entityCount / cellCount : 0;
    return { entityCount, cellCount, avgPerCell };
  }
}
