import { Graphics, Container, Text, TextStyle, Sprite, Assets } from 'pixi.js';

type StartCallback = () => void;
type ContinueCallback = () => void;

export interface HighScore {
  bestLevel: number;
  totalKills: number;
  bestPoints: number;
  bestTime: number;
}

export class TitleScreen {
  private container: Container;
  private backgroundOverlay: Graphics;
  private backgroundSprite: Sprite | null = null;
  private titleGlow: Text;
  private titleText: Text;
  private subtitleText: Text;
  private highScorePanel: Graphics;
  private highScoreText: Text;
  private startButton: Container;
  private continueButton: Container;
  private controlsText: Text;
  private onStart: StartCallback | null = null;
  private onContinue: ContinueCallback | null = null;
  private hasSavedGame = false;

  constructor() {
    this.container = new Container();

    // Background image (loaded async)
    this.loadBackgroundImage();

    // Gradient overlay - darker at top and bottom, lighter in middle
    this.backgroundOverlay = new Graphics();
    this.container.addChild(this.backgroundOverlay);

    // Title glow/shadow layer
    const glowStyle = new TextStyle({
      fontFamily: 'Arial Black, Impact, sans-serif',
      fontSize: 82,
      fill: 0xff6600,
      fontWeight: 'bold',
      letterSpacing: 12,
    });
    this.titleGlow = new Text({ text: 'LAST LIGHT', style: glowStyle });
    this.titleGlow.alpha = 0.6;
    this.container.addChild(this.titleGlow);

    // Title: "LAST LIGHT"
    const titleStyle = new TextStyle({
      fontFamily: 'Arial Black, Impact, sans-serif',
      fontSize: 80,
      fill: 0xffdd44,
      fontWeight: 'bold',
      letterSpacing: 12,
      dropShadow: {
        color: 0x000000,
        blur: 8,
        distance: 4,
        angle: Math.PI / 4,
      },
    });
    this.titleText = new Text({ text: 'LAST LIGHT', style: titleStyle });
    this.container.addChild(this.titleText);

    // Subtitle
    const subtitleStyle = new TextStyle({
      fontFamily: 'Georgia, serif',
      fontSize: 18,
      fill: 0xcccccc,
      fontStyle: 'italic',
      dropShadow: {
        color: 0x000000,
        blur: 4,
        distance: 2,
      },
    });
    this.subtitleText = new Text({ text: 'Escape the darkness. Survive the horde.', style: subtitleStyle });
    this.container.addChild(this.subtitleText);

    // High score panel background
    this.highScorePanel = new Graphics();
    this.container.addChild(this.highScorePanel);

    // High score display
    const highScoreStyle = new TextStyle({
      fontFamily: 'monospace',
      fontSize: 15,
      fill: 0xffffff,
      fontWeight: 'bold',
      dropShadow: {
        color: 0x000000,
        blur: 2,
        distance: 1,
      },
    });
    this.highScoreText = new Text({ text: '', style: highScoreStyle });
    this.container.addChild(this.highScoreText);
    this.updateHighScoreDisplay();

    // Start New Game button
    this.startButton = this.createButton('START GAME', 260, 55, 0x44bb44, 0x66ff66);
    this.startButton.eventMode = 'static';
    this.startButton.cursor = 'pointer';
    this.startButton.on('pointerdown', () => {
      if (this.onStart) this.onStart();
    });
    this.startButton.on('pointerover', () => {
      this.startButton.scale.set(1.05);
    });
    this.startButton.on('pointerout', () => {
      this.startButton.scale.set(1);
    });
    this.container.addChild(this.startButton);

    // Continue button (hidden by default)
    this.continueButton = this.createButton('CONTINUE', 220, 50, 0x3366aa, 0x6699ff);
    this.continueButton.eventMode = 'static';
    this.continueButton.cursor = 'pointer';
    this.continueButton.visible = false;
    this.continueButton.on('pointerdown', () => {
      if (this.onContinue) this.onContinue();
    });
    this.continueButton.on('pointerover', () => {
      this.continueButton.scale.set(1.05);
    });
    this.continueButton.on('pointerout', () => {
      this.continueButton.scale.set(1);
    });
    this.container.addChild(this.continueButton);

    // Controls hint
    const controlsStyle = new TextStyle({
      fontFamily: 'monospace',
      fontSize: 13,
      fill: 0x999999,
      dropShadow: {
        color: 0x000000,
        blur: 3,
        distance: 1,
      },
    });
    this.controlsText = new Text({
      text: '[WASD] Move  |  [E] Lantern  |  [F] Flare  |  [1-7] Weapons  |  [SPACE] Start',
      style: controlsStyle,
    });
    this.container.addChild(this.controlsText);

    // Initial layout
    this.updateLayout();
  }

  private createButton(text: string, width: number, height: number, color: number, glowColor: number): Container {
    const btn = new Container();

    // Glow effect behind button
    const glow = new Graphics();
    glow.roundRect(-4, -4, width + 8, height + 8, 12);
    glow.fill({ color: glowColor, alpha: 0.3 });
    btn.addChild(glow);

    // Button background with border
    const bg = new Graphics();
    bg.roundRect(0, 0, width, height, 8);
    bg.fill(color);
    bg.stroke({ color: glowColor, width: 2 });
    btn.addChild(bg);

    const style = new TextStyle({
      fontFamily: 'Arial Black, Impact, sans-serif',
      fontSize: 20,
      fill: 0xffffff,
      fontWeight: 'bold',
      letterSpacing: 2,
      dropShadow: {
        color: 0x000000,
        blur: 2,
        distance: 1,
      },
    });
    const label = new Text({ text, style });
    label.x = width / 2 - label.width / 2;
    label.y = height / 2 - label.height / 2;
    btn.addChild(label);

    // Set pivot for scale effect
    btn.pivot.set(width / 2, height / 2);

    return btn;
  }

  private async loadBackgroundImage(): Promise<void> {
    try {
      const texture = await Assets.load('/last_light_desktop_image.png');
      this.backgroundSprite = new Sprite(texture);
      this.container.addChildAt(this.backgroundSprite, 0);
      this.updateLayout();
    } catch (e) {
      console.error('Failed to load background image:', e);
    }
  }

  private updateLayout(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;

    // Background image - cover the screen
    if (this.backgroundSprite) {
      const texture = this.backgroundSprite.texture;
      const scaleX = w / texture.width;
      const scaleY = h / texture.height;
      const scale = Math.max(scaleX, scaleY);
      this.backgroundSprite.scale.set(scale);
      this.backgroundSprite.x = (w - texture.width * scale) / 2;
      this.backgroundSprite.y = (h - texture.height * scale) / 2;
    }

    // Subtle vignette overlay
    this.backgroundOverlay.clear();
    this.backgroundOverlay.rect(0, 0, w, h);
    this.backgroundOverlay.fill({ color: 0x000000, alpha: 0.35 });

    // Title glow (offset slightly)
    this.titleGlow.x = w / 2 - this.titleGlow.width / 2 + 3;
    this.titleGlow.y = h * 0.18 + 3;

    // Title
    this.titleText.x = w / 2 - this.titleText.width / 2;
    this.titleText.y = h * 0.18;

    // Subtitle
    this.subtitleText.x = w / 2 - this.subtitleText.width / 2;
    this.subtitleText.y = this.titleText.y + 100;

    // High score panel - size based on text
    const panelPadding = 30;
    const panelWidth = this.highScoreText.width + panelPadding * 2;
    const panelHeight = 45;
    const panelX = w / 2 - panelWidth / 2;
    const panelY = this.subtitleText.y + 50;

    this.highScorePanel.clear();
    if (this.highScoreText.text) {
      this.highScorePanel.roundRect(panelX, panelY, panelWidth, panelHeight, 6);
      this.highScorePanel.fill({ color: 0x000000, alpha: 0.6 });
      this.highScorePanel.stroke({ color: 0xffaa00, width: 1, alpha: 0.5 });
    }

    // High score text
    this.highScoreText.x = w / 2 - this.highScoreText.width / 2;
    this.highScoreText.y = panelY + panelHeight / 2 - this.highScoreText.height / 2;

    // Start button (centered with pivot)
    this.startButton.x = w / 2;
    this.startButton.y = h * 0.58;

    // Continue button (centered with pivot)
    this.continueButton.x = w / 2;
    this.continueButton.y = h * 0.58 + 70;

    // Controls
    this.controlsText.x = w / 2 - this.controlsText.width / 2;
    this.controlsText.y = h - 50;
  }

  getContainer(): Container {
    return this.container;
  }

  setCallbacks(onStart: StartCallback, onContinue: ContinueCallback): void {
    this.onStart = onStart;
    this.onContinue = onContinue;
  }

  showContinueButton(show: boolean): void {
    this.hasSavedGame = show;
    this.continueButton.visible = show;
  }

  show(): void {
    this.updateLayout();
    this.container.visible = true;
  }

  hide(): void {
    this.container.visible = false;
  }

  isVisible(): boolean {
    return this.container.visible;
  }

  private updateHighScoreDisplay(): void {
    const highScore = TitleScreen.loadHighScore();
    if (highScore.bestLevel > 0) {
      const minutes = Math.floor(highScore.bestTime / 60);
      const seconds = Math.floor(highScore.bestTime % 60);
      const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      this.highScoreText.text = `BEST: Level ${highScore.bestLevel}  |  Kills: ${highScore.totalKills}  |  Points: ${highScore.bestPoints}  |  Time: ${timeStr}`;
    } else {
      this.highScoreText.text = '';
    }
  }

  refreshHighScore(): void {
    this.updateHighScoreDisplay();
    this.updateLayout();
  }

  static loadHighScore(): HighScore {
    try {
      const saved = localStorage.getItem('lastlight_highscore');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          bestLevel: parsed.bestLevel ?? 0,
          totalKills: parsed.totalKills ?? 0,
          bestPoints: parsed.bestPoints ?? 0,
          bestTime: parsed.bestTime ?? 0,
        };
      }
    } catch (e) {
      console.error('Failed to load high score:', e);
    }
    return { bestLevel: 0, totalKills: 0, bestPoints: 0, bestTime: 0 };
  }

  static saveHighScore(level: number, kills: number, cumulativePoints: number, totalTime: number): void {
    try {
      const current = TitleScreen.loadHighScore();
      let bestTime = current.bestTime;
      if (level > current.bestLevel || (level === current.bestLevel && (current.bestTime === 0 || totalTime < current.bestTime))) {
        bestTime = totalTime;
      }
      const newHighScore: HighScore = {
        bestLevel: Math.max(current.bestLevel, level),
        totalKills: Math.max(current.totalKills, kills),
        bestPoints: Math.max(current.bestPoints, cumulativePoints),
        bestTime: bestTime,
      };
      localStorage.setItem('lastlight_highscore', JSON.stringify(newHighScore));
    } catch (e) {
      console.error('Failed to save high score:', e);
    }
  }
}
