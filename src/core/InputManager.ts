export class InputManager {
  private keys: Set<string> = new Set();
  private mouseX = 0;
  private mouseY = 0;
  private mouseDown = false;

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onMouseMove = (e: MouseEvent): void => {
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
  };

  private onMouseDown = (): void => {
    this.mouseDown = true;
  };

  private onMouseUp = (): void => {
    this.mouseDown = false;
  };

  isKeyDown(code: string): boolean {
    return this.keys.has(code);
  }

  getMovementVector(): { x: number; y: number } {
    let x = 0;
    let y = 0;

    if (this.isKeyDown('KeyW') || this.isKeyDown('ArrowUp')) y -= 1;
    if (this.isKeyDown('KeyS') || this.isKeyDown('ArrowDown')) y += 1;
    if (this.isKeyDown('KeyA') || this.isKeyDown('ArrowLeft')) x -= 1;
    if (this.isKeyDown('KeyD') || this.isKeyDown('ArrowRight')) x += 1;

    // Normalize diagonal movement
    if (x !== 0 && y !== 0) {
      const len = Math.sqrt(x * x + y * y);
      x /= len;
      y /= len;
    }

    return { x, y };
  }

  getMousePosition(): { x: number; y: number } {
    return { x: this.mouseX, y: this.mouseY };
  }

  isMouseDown(): boolean {
    return this.mouseDown;
  }

  // Consume a key press (for one-shot actions like placing lanterns)
  consumeKey(code: string): void {
    this.keys.delete(code);
  }

  // Consume mouse click (for one-shot actions like launching flares)
  consumeClick(): void {
    this.mouseDown = false;
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
  }
}
