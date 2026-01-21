import { FIXED_TIMESTEP, MAX_DELTA } from '@/config/constants';

export type UpdateCallback = (dt: number) => void;
export type RenderCallback = (interpolation: number) => void;

export class GameLoop {
  private lastTime = 0;
  private accumulator = 0;
  private isRunning = false;
  private rafId = 0;

  private updateFn: UpdateCallback;
  private renderFn: RenderCallback;

  constructor(updateFn: UpdateCallback, renderFn: RenderCallback) {
    this.updateFn = updateFn;
    this.renderFn = renderFn;
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.isRunning = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
    }
  }

  private loop = (currentTime: number): void => {
    if (!this.isRunning) return;

    let delta = currentTime - this.lastTime;
    this.lastTime = currentTime;

    if (delta > MAX_DELTA) {
      delta = MAX_DELTA;
    }

    this.accumulator += delta;

    while (this.accumulator >= FIXED_TIMESTEP) {
      this.updateFn(FIXED_TIMESTEP / 1000);
      this.accumulator -= FIXED_TIMESTEP;
    }

    const interpolation = this.accumulator / FIXED_TIMESTEP;
    this.renderFn(interpolation);

    this.rafId = requestAnimationFrame(this.loop);
  };
}
