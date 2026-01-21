import { Application, Graphics, Container, Text, TextStyle, Sprite, Assets } from 'pixi.js';
import { GameLoop } from '@/core/GameLoop';
import { InputManager } from '@/core/InputManager';
import { MazeGenerator, MazeData } from '@/systems/MazeGenerator';
import { FogOfWar } from '@/systems/FogOfWar';
import { ZombieManager } from '@/systems/ZombieManager';
import { CombatSystem } from '@/systems/CombatSystem';
import { PowerUpSystem, PowerUpType } from '@/systems/PowerUpSystem';
import { Minimap } from '@/ui/Minimap';
import { Shop, Upgrade } from '@/ui/Shop';
import { TitleScreen } from '@/ui/TitleScreen';
import { HotBar, HotBarSlot } from '@/ui/HotBar';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  COLOR_BACKGROUND,
  COLOR_WALL,
  COLOR_FLOOR,
  PLAYER_SIZE,
  PLAYER_SPEED,
  PLAYER_ACCELERATION,
  PLAYER_FRICTION,
  PLAYER_MAX_HP,
  TILE_SIZE,
  TORCH_RADIUS,
  LANTERN_RADIUS,
  FLARE_RADIUS,
  STARTING_MAP_SIZE,
  MAP_SIZE_INCREMENT,
  MAX_MAP_SIZE,
  ZOMBIE_SPAWN_RATE_BASE,
  ZOMBIE_SPAWN_RATE_INCREMENT,
  ZOMBIE_HP_SCALE_PER_LEVEL,
  ZOMBIE_SPEED_SCALE_PER_LEVEL,
  POINTS_PER_KILL,
} from '@/config/constants';

export class Game {
  private app: Application;
  private gameLoop: GameLoop;
  private input: InputManager;

  // Player state
  private player: Sprite | null = null;
  private playerTexture: any = null;

  // Additional textures
  private lanternTexture: any = null;
  private flareTexture: any = null;
  private playerX = 0;
  private playerY = 0;
  private playerVelX = 0;
  private playerVelY = 0;
  private playerHP = PLAYER_MAX_HP;
  private playerMaxHP = PLAYER_MAX_HP;

  // Upgrade multipliers
  private damageMultiplier = 1;
  private fireRateMultiplier = 1;
  private speedMultiplier = 1;
  private torchMultiplier = 1;

  // Inventory
  private lanternCount = 2;
  private flareCount = 2;
  private teleporterCount = 0;

  // Teleporter state
  private isTeleporting = false;
  private teleportProgress = 0;
  private teleportStartX = 0;
  private teleportStartY = 0;
  private teleportGraphics: Graphics | null = null;


  // Economy
  private points = 0;
  private cumulativePoints = 0; // Total points earned (not subtracted by purchases)
  private lastKillCount = 0;

  // Level system
  private currentLevel = 1;
  private inShop = false;
  private levelStartGracePeriod = 0; // Prevents instant exit on spawn

  // Maze
  private maze: MazeData | null = null;
  private mazeGraphics: Graphics | null = null;

  // Exit
  private exitMarker: Graphics | null = null;
  private exitDiscovered = false;

  // Systems
  private fogOfWar: FogOfWar | null = null;
  private zombieManager: ZombieManager | null = null;
  private combatSystem: CombatSystem | null = null;
  private powerUpSystem: PowerUpSystem | null = null;

  // UI
  private minimap: Minimap | null = null;
  private shop: Shop | null = null;
  private titleScreen: TitleScreen | null = null;
  private hotBar: HotBar | null = null;
  private onTitleScreen = true;

  // Containers
  private worldContainer: Container | null = null;
  private uiContainer: Container | null = null;

  // HUD elements
  private hudPanel: Graphics | null = null;
  private hudLevelText: Text | null = null;
  private hudZombieText: Text | null = null;
  private hudPointsText: Text | null = null;
  private hudHordeText: Text | null = null;
  private hudText: Text | null = null;
  private hpBar: Graphics | null = null;
  private hpBarBg: Graphics | null = null;
  private hpText: Text | null = null;
  private timerPanel: Graphics | null = null;
  private timerText: Text | null = null;
  private parText: Text | null = null;
  private attractionTimerText: Text | null = null;
  private damageFlash: Graphics | null = null;
  private damageFlashAlpha = 0;

  // Timer state
  private levelTime = 0;
  private totalTime = 0;
  private parTime = 30; // Base par time in seconds

  // Horde mode state
  private hordeTriggeredThisLevel = false;
  private hordeTextAnimTime = 0; // Animation timer for horde text

  // Lantern/flare visuals in world
  private lanternGraphics: Graphics | null = null;
  private flareGraphics: Graphics | null = null;
  private flyingFlareGraphics: Graphics | null = null;
  private lanternSpritesContainer: Container | null = null;
  private flareSpritesContainer: Container | null = null;
  private lanternSprites: Sprite[] = [];
  private flareSprites: Sprite[] = [];

  // Torch visual
  private torchLight: Graphics | null = null;

  // Start marker visual
  private startMarker: Graphics | null = null;

  // Game state
  private gameOver = false;
  private deathScreen: Container | null = null;

  constructor() {
    this.app = new Application();
    this.input = new InputManager();
    this.gameLoop = new GameLoop(this.update, this.render);
  }

  async init(): Promise<void> {
    await this.app.init({
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: COLOR_BACKGROUND,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      resizeTo: window,
    });

    document.body.appendChild(this.app.canvas);

    // Preload sprites
    this.playerTexture = await Assets.load('/alien_sprite.png');
    this.lanternTexture = await Assets.load('/lantern_sprite.png');
    this.flareTexture = await Assets.load('/flare_sprite.png');

    // Remove default margins/padding for true fullscreen
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'hidden';

    // Set up world container
    this.worldContainer = new Container();
    this.app.stage.addChild(this.worldContainer);

    // Set up UI container
    this.uiContainer = new Container();
    this.app.stage.addChild(this.uiContainer);

    // Create shop (hidden initially)
    this.shop = new Shop(this.handlePurchase.bind(this));
    this.shop.setRestartCallback(this.goToMainMenu.bind(this));
    this.shop.setCloseCallback(this.closeShop.bind(this));
    this.uiContainer.addChild(this.shop.getContainer());

    // Create hotbar (hidden initially)
    this.hotBar = new HotBar();
    this.hotBar.setVisible(false);
    this.uiContainer.addChild(this.hotBar.getContainer());

    // Create HUD
    this.createHUD();

    // Create damage flash overlay
    this.createDamageFlash();

    // Create title screen
    this.titleScreen = new TitleScreen();
    this.titleScreen.setCallbacks(
      () => this.startNewGame(),
      () => this.continueGame()
    );
    this.uiContainer.addChild(this.titleScreen.getContainer());

    // Start on title screen
    this.onTitleScreen = true;

    // Handle window resize for UI repositioning
    window.addEventListener('resize', this.handleResize.bind(this));

    // Start game loop
    this.gameLoop.start();
  }

  private handleResize(): void {
    // Reposition minimap
    if (this.minimap) {
      this.minimap.resize(window.innerWidth, window.innerHeight);
    }
  }

  private startNewGame(): void {
    this.onTitleScreen = false;
    // Game is now active
    this.titleScreen?.hide();

    // Show HUD elements
    if (this.hudPanel) this.hudPanel.visible = true;
    if (this.hudLevelText) this.hudLevelText.visible = true;
    if (this.hudZombieText) this.hudZombieText.visible = true;
    if (this.hudPointsText) this.hudPointsText.visible = true;
    if (this.hudText) this.hudText.visible = true;
    if (this.hpBar) this.hpBar.visible = true;
    if (this.hpBarBg) this.hpBarBg.visible = true;
    if (this.hpText) this.hpText.visible = true;
    if (this.timerPanel) this.timerPanel.visible = true;
    if (this.timerText) this.timerText.visible = true;
    if (this.parText) this.parText.visible = true;

    // Show power-up effects container
    if (this.powerUpSystem) {
      this.powerUpSystem.getEffectsContainer().visible = true;
    }

    // Show hotbar
    if (this.hotBar) {
      this.hotBar.setVisible(true);
    }

    // Reset timer
    this.totalTime = 0;
    this.levelTime = 0;
    this.hordeTriggeredThisLevel = false;
    this.hordeTextAnimTime = 0;

    // Reset everything for a fresh start
    this.gameOver = false;
    this.currentLevel = 0;
    this.points = 0;
    this.cumulativePoints = 0;
    this.lastKillCount = 0;
    this.playerHP = PLAYER_MAX_HP;
    this.playerMaxHP = PLAYER_MAX_HP;
    this.damageMultiplier = 1;
    this.fireRateMultiplier = 1;
    this.speedMultiplier = 1;
    this.torchMultiplier = 1;
    this.lanternCount = 2;
    this.flareCount = 2;
    this.teleporterCount = 0;
    this.isTeleporting = false;
    this.teleportProgress = 0;
    this.inShop = false;

    // Reset combat system
    if (this.combatSystem) {
      this.combatSystem.resetKillCount();
      this.combatSystem.setWeapon('pistol');
      this.combatSystem.setDamageMultiplier(1);
      this.combatSystem.setFireRateMultiplier(1);
      this.combatSystem.setScytheEnabled(false);
    }

    // Recreate shop to reset purchases
    if (this.shop && this.uiContainer) {
      this.uiContainer.removeChild(this.shop.getContainer());
    }
    this.shop = new Shop(this.handlePurchase.bind(this));
    this.shop.setRestartCallback(this.goToMainMenu.bind(this));
    this.shop.setCloseCallback(this.closeShop.bind(this));
    this.uiContainer!.addChild(this.shop.getContainer());

    // Start level 1
    this.startLevel(1);
  }

  private continueGame(): void {
    this.onTitleScreen = false;
    this.titleScreen?.hide();
    // Game state is preserved, just hide title and continue
  }

  private goToMainMenu(): void {
    // Clean up death screen
    if (this.deathScreen && this.uiContainer) {
      this.uiContainer.removeChild(this.deathScreen);
      this.deathScreen = null;
    }

    // Reset game state
    this.gameOver = false;
    // Game is no longer active
    this.onTitleScreen = true;

    // Destroy game systems to free memory
    if (this.zombieManager) {
      this.zombieManager.destroy();
      this.zombieManager = null as any;
    }
    if (this.fogOfWar) {
      this.fogOfWar.destroy();
      this.fogOfWar = null as any;
    }
    if (this.combatSystem) {
      this.combatSystem.destroy();
      this.combatSystem = null as any;
    }

    // Clear the world
    if (this.worldContainer) {
      this.worldContainer.removeChildren();
    }

    // Clear maze reference
    this.maze = null as any;

    // Hide HUD elements
    if (this.hudPanel) this.hudPanel.visible = false;
    if (this.hudLevelText) this.hudLevelText.visible = false;
    if (this.hudZombieText) this.hudZombieText.visible = false;
    if (this.hudPointsText) this.hudPointsText.visible = false;
    if (this.hudHordeText) this.hudHordeText.visible = false;
    if (this.hudText) this.hudText.visible = false;
    if (this.hpBar) this.hpBar.visible = false;
    if (this.hpBarBg) this.hpBarBg.visible = false;
    if (this.hpText) this.hpText.visible = false;
    if (this.timerPanel) this.timerPanel.visible = false;
    if (this.timerText) this.timerText.visible = false;
    if (this.parText) this.parText.visible = false;

    // Hide minimap
    if (this.minimap) {
      this.minimap.getContainer().visible = false;
    }

    // Hide hotbar
    if (this.hotBar) {
      this.hotBar.setVisible(false);
    }

    // Hide and clear power-up effects
    if (this.powerUpSystem) {
      this.powerUpSystem.clearAllEffects();
      this.powerUpSystem.getEffectsContainer().visible = false;
    }

    // Show title screen without continue option
    this.titleScreen?.showContinueButton(false);
    this.titleScreen?.refreshHighScore();
    this.titleScreen?.show();
  }

  private getMapSize(level: number): number {
    return Math.min(MAX_MAP_SIZE, STARTING_MAP_SIZE + (level - 1) * MAP_SIZE_INCREMENT);
  }

  private startLevel(level: number): void {
    this.currentLevel = level;
    this.inShop = false;
    this.exitDiscovered = false;
    this.levelStartGracePeriod = 1.0; // 1 second grace period before exit can be triggered

    // Reset level timer and calculate par time (scales with map size)
    this.levelTime = 0;
    this.hordeTriggeredThisLevel = false;
    this.hordeTextAnimTime = 0;
    const mapSize = this.getMapSize(level);
    // Curved time formula: bigger maps get proportionally more time
    // Level 1 (25): 30s, Level 8 (60): 100s
    const sizeDiff = mapSize - 25;
    this.parTime = Math.floor(30 + sizeDiff * (1 + sizeDiff / 35));

    // Clear old world objects
    if (this.worldContainer) {
      this.worldContainer.removeChildren();
    }

    // Generate new maze
    const generator = new MazeGenerator(mapSize, mapSize);
    this.maze = generator.generate();

    // Render maze
    this.renderMaze();

    // Create exit marker
    this.createExitMarker();

    // Create graphics containers
    this.lanternGraphics = new Graphics();
    this.worldContainer!.addChild(this.lanternGraphics);

    this.flareGraphics = new Graphics();
    this.worldContainer!.addChild(this.flareGraphics);

    this.flyingFlareGraphics = new Graphics();
    this.worldContainer!.addChild(this.flyingFlareGraphics);

    // Create sprite containers for lanterns and flares
    this.lanternSpritesContainer = new Container();
    this.worldContainer!.addChild(this.lanternSpritesContainer);
    this.lanternSprites = [];

    this.flareSpritesContainer = new Container();
    this.worldContainer!.addChild(this.flareSpritesContainer);
    this.flareSprites = [];

    // Initialize fog of war
    this.fogOfWar = new FogOfWar(this.app, this.maze.width, this.maze.height);
    this.fogOfWar.setTorchRadiusMultiplier(this.torchMultiplier);

    // Initialize zombie manager
    if (!this.zombieManager) {
      this.zombieManager = new ZombieManager(this.maze);
    } else {
      this.zombieManager.setMaze(this.maze);
      this.zombieManager.clearAll();
    }
    this.worldContainer!.addChild(this.zombieManager.getContainer());

    // Set zombie scaling for this level
    const hpMult = 1 + (level - 1) * ZOMBIE_HP_SCALE_PER_LEVEL;
    const speedMult = 1 + (level - 1) * ZOMBIE_SPEED_SCALE_PER_LEVEL;
    this.zombieManager.setScaling(hpMult, speedMult);

    // Set spawn rate for this level
    const spawnRate = ZOMBIE_SPAWN_RATE_BASE + (level - 1) * ZOMBIE_SPAWN_RATE_INCREMENT;
    this.zombieManager.setSpawnRate(spawnRate);
    this.zombieManager.resetHordeRush(); // Reset from previous level

    // Set max zombies alive for this level (scales with level, caps at 500)
    const maxZombies = Math.min(500, 50 + (level - 1) * 30);
    this.zombieManager.setMaxZombiesAlive(maxZombies);

    // Initialize combat system
    if (!this.combatSystem) {
      this.combatSystem = new CombatSystem(this.zombieManager, this.fogOfWar, this.maze);
    } else {
      this.combatSystem.setMaze(this.maze);
      this.combatSystem.setFogOfWar(this.fogOfWar);
      this.combatSystem.clearBullets();
    }
    this.combatSystem.setDamageMultiplier(this.damageMultiplier);
    this.worldContainer!.addChild(this.combatSystem.getContainer());

    // Create player at start room
    this.createPlayer();

    // Create start marker (purple dot) at spawn point
    this.createStartMarker();

    // Create teleport graphics container
    this.teleportGraphics = new Graphics();
    this.worldContainer!.addChild(this.teleportGraphics);

    // Reset teleporting state for new level
    this.isTeleporting = false;
    this.teleportProgress = 0;

    // Create torch light visual
    this.createTorchLight();

    // Add fog of war container
    this.worldContainer!.addChild(this.fogOfWar.getFogContainer());

    // Remove old minimap if exists
    if (this.minimap && this.uiContainer) {
      this.uiContainer.removeChild(this.minimap.getContainer());
    }
    // Create new minimap for this level
    this.minimap = new Minimap(this.maze);
    this.uiContainer!.addChild(this.minimap.getContainer());

    // Initialize power-up system
    if (!this.powerUpSystem) {
      this.powerUpSystem = new PowerUpSystem();
      this.powerUpSystem.setCallbacks(
        (type) => this.onPowerUpStart(type),
        (type) => this.onPowerUpEnd(type)
      );
      this.uiContainer!.addChild(this.powerUpSystem.getEffectsContainer());
    }
    // Clear any previous power-up
    this.powerUpSystem.clearPowerUp();
    this.powerUpSystem.clearAllEffects();
    this.powerUpSystem.setMaze(this.maze);

    // Remove old power-up container from world and re-add
    if (this.worldContainer!.children.includes(this.powerUpSystem.getContainer())) {
      this.worldContainer!.removeChild(this.powerUpSystem.getContainer());
    }
    this.worldContainer!.addChild(this.powerUpSystem.getContainer());

    // Spawn power-up starting at level 3
    if (level >= 3) {
      this.powerUpSystem.spawnRandomPowerUp();
    }

    // Start zombie spawning
    this.zombieManager.startSpawning();
  }

  private renderMaze(): void {
    if (!this.maze || !this.worldContainer) return;

    this.mazeGraphics = new Graphics();

    for (let y = 0; y < this.maze.height; y++) {
      for (let x = 0; x < this.maze.width; x++) {
        if (this.maze.tiles[y][x] === 0) {
          this.mazeGraphics.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          this.mazeGraphics.fill(COLOR_FLOOR);
        }
      }
    }

    for (let y = 0; y < this.maze.height; y++) {
      for (let x = 0; x < this.maze.width; x++) {
        if (this.maze.tiles[y][x] === 1) {
          this.mazeGraphics.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          this.mazeGraphics.fill(COLOR_WALL);
        }
      }
    }

    this.worldContainer.addChild(this.mazeGraphics);
  }

  private createExitMarker(): void {
    if (!this.maze || !this.worldContainer) return;

    const exitPos = MazeGenerator.tileToWorld(
      this.maze.exitRoom.centerX,
      this.maze.exitRoom.centerY
    );

    this.exitMarker = new Graphics();
    this.exitMarker.rect(-TILE_SIZE, -TILE_SIZE, TILE_SIZE * 2, TILE_SIZE * 2);
    this.exitMarker.fill(0x44ff44);
    this.exitMarker.x = exitPos.x;
    this.exitMarker.y = exitPos.y;
    this.worldContainer.addChild(this.exitMarker);
  }

  private createPlayer(): void {
    if (!this.maze || !this.worldContainer) return;

    const startPos = MazeGenerator.tileToWorld(
      this.maze.startRoom.centerX,
      this.maze.startRoom.centerY
    );

    this.playerX = startPos.x;
    this.playerY = startPos.y;
    this.playerVelX = 0;
    this.playerVelY = 0;

    // Create sprite from preloaded texture
    this.player = new Sprite(this.playerTexture);
    this.player.anchor.set(0.5, 0.5); // Center the sprite

    // Scale sprite to match player size (adjust as needed)
    const targetSize = PLAYER_SIZE * 2; // Make it a bit bigger than the old circle
    const scale = targetSize / Math.max(this.player.width, this.player.height);
    this.player.scale.set(scale);

    this.player.x = this.playerX;
    this.player.y = this.playerY;
    this.worldContainer.addChild(this.player);
  }

  private createTorchLight(): void {
    if (!this.worldContainer) return;

    this.torchLight = new Graphics();
    this.updateTorchGraphics();
    this.worldContainer.addChild(this.torchLight);
  }

  private updateTorchGraphics(): void {
    if (!this.torchLight) return;
    this.torchLight.clear();
    this.torchLight.circle(0, 0, TORCH_RADIUS * this.torchMultiplier);
    this.torchLight.fill({ color: 0xffdd88, alpha: 0.1 });
  }

  private createStartMarker(): void {
    if (!this.maze || !this.worldContainer) return;

    const startPos = MazeGenerator.tileToWorld(
      this.maze.startRoom.centerX,
      this.maze.startRoom.centerY
    );

    this.startMarker = new Graphics();
    // Outer glow
    this.startMarker.circle(0, 0, 18);
    this.startMarker.fill({ color: 0xaa44ff, alpha: 0.3 });
    // Inner dot
    this.startMarker.circle(0, 0, 8);
    this.startMarker.fill(0xaa44ff);
    // Bright center
    this.startMarker.circle(0, 0, 3);
    this.startMarker.fill(0xddaaff);

    this.startMarker.x = startPos.x;
    this.startMarker.y = startPos.y;
    this.worldContainer.addChild(this.startMarker);
  }

  private createHUD(): void {
    if (!this.uiContainer) return;

    // === LEFT PANEL (Stats) ===
    this.hudPanel = new Graphics();
    this.uiContainer.addChild(this.hudPanel);

    // Level text
    const levelStyle = new TextStyle({
      fontFamily: 'Arial Black, sans-serif',
      fontSize: 22,
      fill: 0xffdd44,
      fontWeight: 'bold',
      dropShadow: { color: 0x000000, blur: 2, distance: 1 },
    });
    this.hudLevelText = new Text({ text: 'LEVEL 1', style: levelStyle });
    this.uiContainer.addChild(this.hudLevelText);

    // Zombie count
    const zombieStyle = new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: 14,
      fill: 0xcccccc,
      dropShadow: { color: 0x000000, blur: 2, distance: 1 },
    });
    this.hudZombieText = new Text({ text: 'Zombies: 0', style: zombieStyle });
    this.uiContainer.addChild(this.hudZombieText);

    // Points
    const pointsStyle = new TextStyle({
      fontFamily: 'Arial Black, sans-serif',
      fontSize: 16,
      fill: 0xffaa00,
      fontWeight: 'bold',
      dropShadow: { color: 0x000000, blur: 2, distance: 1 },
    });
    this.hudPointsText = new Text({ text: '0 PTS', style: pointsStyle });
    this.uiContainer.addChild(this.hudPointsText);

    // Horde warning (hidden by default)
    const hordeStyle = new TextStyle({
      fontFamily: 'Arial Black, sans-serif',
      fontSize: 14,
      fill: 0xff4444,
      fontWeight: 'bold',
      dropShadow: { color: 0x000000, blur: 3, distance: 1 },
    });
    this.hudHordeText = new Text({ text: 'HORDE INCOMING!', style: hordeStyle });
    this.hudHordeText.visible = false;
    this.uiContainer.addChild(this.hudHordeText);

    // HP bar background
    this.hpBarBg = new Graphics();
    this.uiContainer.addChild(this.hpBarBg);

    // HP bar fill
    this.hpBar = new Graphics();
    this.uiContainer.addChild(this.hpBar);

    // HP text
    const hpTextStyle = new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: 11,
      fill: 0xffffff,
      fontWeight: 'bold',
    });
    this.hpText = new Text({ text: '', style: hpTextStyle });
    this.hpText.anchor.set(0.5, 0.5);
    this.uiContainer.addChild(this.hpText);

    // Legacy hudText (kept for digging status, etc.)
    const style = new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: 12,
      fill: 0xaaaaaa,
      dropShadow: { color: 0x000000, blur: 2, distance: 1 },
    });
    this.hudText = new Text({ text: '', style });
    this.uiContainer.addChild(this.hudText);

    // === CENTER PANEL (Timer) ===
    this.timerPanel = new Graphics();
    this.uiContainer.addChild(this.timerPanel);

    const timerStyle = new TextStyle({
      fontFamily: 'Arial Black, sans-serif',
      fontSize: 24,
      fill: 0x44ff44,
      fontWeight: 'bold',
      dropShadow: { color: 0x000000, blur: 3, distance: 1 },
    });
    this.timerText = new Text({ text: '0:00', style: timerStyle });
    this.timerText.anchor.set(0.5, 0.5);
    this.uiContainer.addChild(this.timerText);

    const parStyle = new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: 12,
      fill: 0x888888,
      dropShadow: { color: 0x000000, blur: 2, distance: 1 },
    });
    this.parText = new Text({ text: 'HORDE IN: 0:00', style: parStyle });
    this.parText.anchor.set(0.5, 0.5);
    this.uiContainer.addChild(this.parText);

    // Attraction timer (shows when lantern/flare is active)
    const attractionStyle = new TextStyle({
      fontFamily: 'Arial Black, sans-serif',
      fontSize: 16,
      fill: 0xff8844,
      fontWeight: 'bold',
      dropShadow: { color: 0x000000, blur: 3, distance: 1 },
    });
    this.attractionTimerText = new Text({ text: '', style: attractionStyle });
    this.attractionTimerText.anchor.set(1, 0); // Right-aligned
    this.attractionTimerText.visible = false;
    this.uiContainer.addChild(this.attractionTimerText);
  }

  private createDamageFlash(): void {
    if (!this.uiContainer) return;

    this.damageFlash = new Graphics();
    this.damageFlash.rect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.damageFlash.fill({ color: 0xff0000, alpha: 0.3 });
    this.damageFlash.alpha = 0;
    this.uiContainer.addChild(this.damageFlash);
  }

  private showDeathScreen(): void {
    if (!this.uiContainer) return;

    this.deathScreen = new Container();

    // Dark overlay
    const overlay = new Graphics();
    overlay.rect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    overlay.fill({ color: 0x000000, alpha: 0.85 });
    this.deathScreen.addChild(overlay);

    // Game Over text
    const titleStyle = new TextStyle({
      fontFamily: 'monospace',
      fontSize: 48,
      fill: 0xff4444,
      fontWeight: 'bold',
    });
    const titleText = new Text({ text: 'GAME OVER', style: titleStyle });
    titleText.x = GAME_WIDTH / 2 - titleText.width / 2;
    titleText.y = 200;
    this.deathScreen.addChild(titleText);

    // Stats
    const statsStyle = new TextStyle({
      fontFamily: 'monospace',
      fontSize: 20,
      fill: 0xffffff,
    });
    const statsText = new Text({
      text: `Reached Level ${this.currentLevel}\nTotal Kills: ${this.combatSystem?.getKillCount() ?? 0}\nPoints Earned: ${this.cumulativePoints}`,
      style: statsStyle,
    });
    statsText.x = GAME_WIDTH / 2 - statsText.width / 2;
    statsText.y = 280;
    this.deathScreen.addChild(statsText);

    // Try Again button
    const tryAgainBg = new Graphics();
    tryAgainBg.roundRect(GAME_WIDTH / 2 - 215, 400, 200, 50, 8);
    tryAgainBg.fill(0x44aa44);
    this.deathScreen.addChild(tryAgainBg);

    const buttonStyle = new TextStyle({
      fontFamily: 'monospace',
      fontSize: 16,
      fill: 0xffffff,
      fontWeight: 'bold',
    });
    const tryAgainText = new Text({ text: 'Try Again [SPACE]', style: buttonStyle });
    tryAgainText.x = GAME_WIDTH / 2 - 215 + 100 - tryAgainText.width / 2;
    tryAgainText.y = 413;
    this.deathScreen.addChild(tryAgainText);

    // Main Menu button
    const menuBg = new Graphics();
    menuBg.roundRect(GAME_WIDTH / 2 + 15, 400, 200, 50, 8);
    menuBg.fill(0x4466aa);
    this.deathScreen.addChild(menuBg);

    const menuText = new Text({ text: 'Main Menu [M]', style: buttonStyle });
    menuText.x = GAME_WIDTH / 2 + 15 + 100 - menuText.width / 2;
    menuText.y = 413;
    this.deathScreen.addChild(menuText);

    this.uiContainer.addChild(this.deathScreen);
  }

  private restartGame(): void {
    // Remove death screen if shown
    if (this.deathScreen && this.uiContainer) {
      this.uiContainer.removeChild(this.deathScreen);
      this.deathScreen = null;
    }

    // Reset all game state
    this.gameOver = false;
    this.currentLevel = 0;
    this.points = 0;
    this.cumulativePoints = 0;
    this.lastKillCount = 0;
    this.playerHP = PLAYER_MAX_HP;
    this.playerMaxHP = PLAYER_MAX_HP;
    this.damageMultiplier = 1;
    this.fireRateMultiplier = 1;
    this.speedMultiplier = 1;
    this.torchMultiplier = 1;
    this.lanternCount = 2;
    this.flareCount = 2;
    this.teleporterCount = 0;
    this.isTeleporting = false;
    this.teleportProgress = 0;
    this.inShop = false;
    // Game is now active

    // Reset combat system
    if (this.combatSystem) {
      this.combatSystem.resetKillCount();
      this.combatSystem.setWeapon('pistol');
      this.combatSystem.setDamageMultiplier(1);
      this.combatSystem.setFireRateMultiplier(1);
      this.combatSystem.setScytheEnabled(false);
    }

    // Close and recreate shop to reset purchases
    if (this.shop && this.uiContainer) {
      this.shop.close();
      this.uiContainer.removeChild(this.shop.getContainer());
    }
    this.shop = new Shop(this.handlePurchase.bind(this));
    this.shop.setRestartCallback(this.goToMainMenu.bind(this));
    this.shop.setCloseCallback(this.closeShop.bind(this));
    this.uiContainer!.addChild(this.shop.getContainer());

    // Start fresh at level 1
    this.startLevel(1);
  }

  private handlePurchase(upgrade: Upgrade): void {
    if (this.points < upgrade.cost) return;

    this.points -= upgrade.cost;

    switch (upgrade.id) {
      case 'rifle':
        this.combatSystem?.setWeapon('rifle');
        break;
      case 'shotgun':
        this.combatSystem?.setWeapon('shotgun');
        break;
      case 'gatling':
        this.combatSystem?.setWeapon('gatling');
        break;
      case 'scythe':
        this.combatSystem?.setScytheEnabled(true);
        break;
      case 'firerate':
        this.fireRateMultiplier += 0.20;
        this.combatSystem?.setFireRateMultiplier(this.fireRateMultiplier);
        break;
      case 'bulletdamage':
        this.damageMultiplier += 0.15;
        this.combatSystem?.setDamageMultiplier(this.damageMultiplier);
        break;
      case 'maxhp':
        this.playerMaxHP += 25;
        this.playerHP += 25;
        break;
      case 'speed':
        this.speedMultiplier += 0.15;
        break;
      case 'torch':
        this.torchMultiplier += 0.30;
        this.updateTorchGraphics();
        this.fogOfWar?.setTorchRadiusMultiplier(this.torchMultiplier);
        break;
      case 'healthpack':
        this.playerHP = Math.min(this.playerHP + 30, this.playerMaxHP);
        break;
      case 'lantern':
        this.lanternCount++;
        break;
      case 'flare':
        this.flareCount++;
        break;
      case 'teleporter':
        this.teleporterCount++;
        break;
    }

    // Update shop display with new points and inventory
    this.shop?.updateDisplay(this.points, this.playerHP, this.playerMaxHP);

    // Update shop's inventory display (hotbar)
    const currentWeapon = this.combatSystem?.getWeapon() ?? 'pistol';
    this.shop?.updateInventory({
      currentWeapon,
      hasRifle: this.shop?.hasWeapon('rifle') ?? false,
      hasShotgun: this.shop?.hasWeapon('shotgun') ?? false,
      hasGatling: this.shop?.hasWeapon('gatling') ?? false,
      hasScythe: this.shop?.hasWeapon('scythe') ?? false,
      lanternCount: this.lanternCount,
      flareCount: this.flareCount,
      teleporterCount: this.teleporterCount,
    });
  }

  private onPowerUpStart(type: PowerUpType): void {
    switch (type) {
      case 'ghost':
        // Zombies won't target player - handled in ZombieManager
        this.zombieManager?.setPlayerInvisible(true);
        break;
      case 'berserker':
        // 2x fire rate
        this.combatSystem?.setFireRateMultiplier(this.fireRateMultiplier * 2);
        break;
      case 'shield':
        // Invincibility - handled in damage calculation
        break;
      case 'speedboost':
        // 2x speed - handled in updatePlayer
        break;
      case 'doubledamage':
        // 2x damage
        this.combatSystem?.setDamageMultiplier(this.damageMultiplier * 2);
        break;
    }
  }

  private onPowerUpEnd(type: PowerUpType): void {
    switch (type) {
      case 'ghost':
        this.zombieManager?.setPlayerInvisible(false);
        break;
      case 'berserker':
        this.combatSystem?.setFireRateMultiplier(this.fireRateMultiplier);
        break;
      case 'shield':
        break;
      case 'speedboost':
        break;
      case 'doubledamage':
        this.combatSystem?.setDamageMultiplier(this.damageMultiplier);
        break;
    }
  }

  private openShop(): void {
    if (this.inShop) return; // Prevent multiple calls

    this.inShop = true;
    this.zombieManager?.stopSpawning();

    // Add level time to total time
    this.totalTime += this.levelTime;

    // Award bonus points for completing the level (equal to map width)
    const mapSize = this.getMapSize(this.currentLevel);
    this.points += mapSize;
    this.cumulativePoints += mapSize;

    // Time bonus: extra points for escaping before horde arrives
    if (this.levelTime < this.parTime) {
      const timeBeforeHorde = this.parTime - this.levelTime;
      const timeBonus = Math.floor(timeBeforeHorde * 2); // 2 points per second early
      this.points += timeBonus;
      this.cumulativePoints += timeBonus;
    }

    // Hide minimap during shop
    if (this.minimap) {
      this.minimap.getContainer().visible = false;
    }

    // Hide only timer during shop - keep HP bar and level info visible
    if (this.timerPanel) this.timerPanel.visible = false;
    if (this.timerText) this.timerText.visible = false;
    if (this.parText) this.parText.visible = false;
    // Hide points from HUD since shop shows points
    if (this.hudPointsText) this.hudPointsText.visible = false;
    // Hide horde text when level is complete
    if (this.hudHordeText) this.hudHordeText.visible = false;

    // Get current weapon for shop hotbar display
    const currentWeapon = this.combatSystem?.getWeapon() ?? 'pistol';

    this.shop?.open(
      this.points,
      this.currentLevel + 1,
      this.playerHP,
      this.playerMaxHP,
      {
        currentWeapon,
        hasRifle: this.shop?.hasWeapon('rifle') ?? false,
        hasShotgun: this.shop?.hasWeapon('shotgun') ?? false,
        hasGatling: this.shop?.hasWeapon('gatling') ?? false,
        hasScythe: this.shop?.hasWeapon('scythe') ?? false,
        lanternCount: this.lanternCount,
        flareCount: this.flareCount,
        teleporterCount: this.teleporterCount,
      }
    );
  }

  private closeShop(): void {
    if (!this.inShop) return; // Prevent double calls

    this.shop?.close();
    this.inShop = false;

    // Restore timer and points visibility before starting new level
    if (this.timerPanel) this.timerPanel.visible = true;
    if (this.timerText) this.timerText.visible = true;
    if (this.parText) this.parText.visible = true;
    if (this.hudPointsText) this.hudPointsText.visible = true;

    this.startLevel(this.currentLevel + 1);
  }

  private update = (dt: number): void => {
    // Title screen - space starts new game
    if (this.onTitleScreen) {
      if (this.input.isKeyDown('Space')) {
        this.input.consumeKey('Space');
        this.startNewGame();
      }
      return;
    }

    // Handle restart from death screen
    if (this.gameOver) {
      if (this.input.isKeyDown('Space')) {
        this.input.consumeKey('Space');
        this.restartGame();
      }
      if (this.input.isKeyDown('KeyM')) {
        this.input.consumeKey('KeyM');
        this.goToMainMenu();
      }
      return;
    }

    // Handle shop input
    if (this.inShop) {
      if (this.input.isKeyDown('KeyM')) {
        this.input.consumeKey('KeyM');
        this.input.consumeKey('Space');
        this.shop?.close();
        this.inShop = false;
        this.goToMainMenu();
        return;
      }
      if (this.input.isKeyDown('Space')) {
        this.input.consumeKey('Space');
        this.closeShop();
        return;
      }
      // Still update HUD to show health changes from health packs
      this.updateHUD();
      return;
    }

    // Update level timer
    this.levelTime += dt;

    // Trigger horde mode when par time is exceeded
    if (!this.hordeTriggeredThisLevel && this.levelTime >= this.parTime) {
      this.hordeTriggeredThisLevel = true;
      this.hordeTextAnimTime = 0;
      this.zombieManager?.triggerHordeRush();
    }

    // Update horde text animation
    if (this.hordeTriggeredThisLevel) {
      this.hordeTextAnimTime += dt;
    }

    this.updateTeleporting(dt);
    this.updatePlayer(dt);
    this.updateCamera();
    this.handleInput();
    this.updateFogOfWar(dt);
    this.updateZombies(dt);
    this.updateCombat(dt);
    this.updatePowerUps(dt);
    this.updatePoints();
    this.updateLanternAndFlareVisuals();
    this.checkExitDiscovery();
    this.checkWinCondition(dt);
    this.updateMinimap();
    this.updateHUD();
    this.updateDamageFlash(dt);
  };

  private updatePowerUps(dt: number): void {
    if (!this.powerUpSystem) return;

    // Check if power-up is in a lit tile
    let isPowerUpLit = false;
    const powerUpPos = this.powerUpSystem.getSpawnedPowerUpPosition();
    if (powerUpPos && this.fogOfWar) {
      const tile = MazeGenerator.worldToTile(powerUpPos.x, powerUpPos.y);
      isPowerUpLit = this.fogOfWar.isTileLit(tile.x, tile.y, this.playerX, this.playerY);
    }

    this.powerUpSystem.update(dt, this.playerX, this.playerY, isPowerUpLit);
  }

  private updatePlayer(dt: number): void {
    // Can't move while teleporting
    if (this.isTeleporting) {
      this.playerVelX = 0;
      this.playerVelY = 0;
      return;
    }

    const movement = this.input.getMovementVector();
    const speedBoostMultiplier = this.powerUpSystem?.hasEffect('speedboost') ? 2 : 1;
    const effectiveSpeed = PLAYER_SPEED * this.speedMultiplier * speedBoostMultiplier;

    // Update player rotation based on movement direction
    // Sprite faces down by default (positive Y)
    if (movement.x !== 0 || movement.y !== 0) {
      // Calculate angle from movement vector
      // Negate x to flip left/right rotation direction
      const targetRotation = Math.atan2(-movement.x, movement.y);
      if (this.player) {
        this.player.rotation = targetRotation;
      }
    }

    if (movement.x !== 0 || movement.y !== 0) {
      this.playerVelX += movement.x * PLAYER_ACCELERATION * dt;
      this.playerVelY += movement.y * PLAYER_ACCELERATION * dt;
    } else {
      const speed = Math.sqrt(this.playerVelX ** 2 + this.playerVelY ** 2);
      if (speed > 0) {
        const frictionAmount = PLAYER_FRICTION * dt;
        if (frictionAmount >= speed) {
          this.playerVelX = 0;
          this.playerVelY = 0;
        } else {
          const scale = (speed - frictionAmount) / speed;
          this.playerVelX *= scale;
          this.playerVelY *= scale;
        }
      }
    }

    const currentSpeed = Math.sqrt(this.playerVelX ** 2 + this.playerVelY ** 2);
    if (currentSpeed > effectiveSpeed) {
      const scale = effectiveSpeed / currentSpeed;
      this.playerVelX *= scale;
      this.playerVelY *= scale;
    }

    let newX = this.playerX + this.playerVelX * dt;
    let newY = this.playerY + this.playerVelY * dt;

    const halfSize = PLAYER_SIZE / 2;

    if (!this.isWalkable(newX, this.playerY, halfSize)) {
      newX = this.playerX;
      this.playerVelX = 0;
    }

    if (!this.isWalkable(newX, newY, halfSize)) {
      newY = this.playerY;
      this.playerVelY = 0;
    }

    this.playerX = newX;
    this.playerY = newY;
  }

  private isWalkable(x: number, y: number, radius: number): boolean {
    if (!this.maze) return false;

    const corners = [
      { x: x - radius, y: y - radius },
      { x: x + radius, y: y - radius },
      { x: x - radius, y: y + radius },
      { x: x + radius, y: y + radius },
    ];

    for (const corner of corners) {
      const tile = MazeGenerator.worldToTile(corner.x, corner.y);

      if (tile.x < 0 || tile.x >= this.maze.width || tile.y < 0 || tile.y >= this.maze.height) {
        return false;
      }

      if (this.maze.tiles[tile.y][tile.x] === 1) {
        return false;
      }
    }

    return true;
  }

  private handleInput(): void {
    if (this.input.isKeyDown('KeyE')) {
      this.input.consumeKey('KeyE');
      if (this.lanternCount > 0 && this.fogOfWar) {
        this.fogOfWar.placeLantern(this.playerX, this.playerY);
        this.lanternCount--;
      }
    }

    if (this.input.isKeyDown('KeyF')) {
      this.input.consumeKey('KeyF');
      if (this.flareCount > 0 && this.fogOfWar && this.worldContainer) {
        const mouse = this.input.getMousePosition();
        const targetX = mouse.x - this.worldContainer.x;
        const targetY = mouse.y - this.worldContainer.y;
        this.fogOfWar.launchFlare(this.playerX, this.playerY, targetX, targetY);
        this.flareCount--;
      }
    }

    // Weapon switching with number keys
    if (this.input.isKeyDown('Digit1')) {
      this.input.consumeKey('Digit1');
      this.combatSystem?.setWeapon('pistol');
    }
    if (this.input.isKeyDown('Digit2') && this.shop?.hasWeapon('rifle')) {
      this.input.consumeKey('Digit2');
      this.combatSystem?.setWeapon('rifle');
    }
    if (this.input.isKeyDown('Digit3') && this.shop?.hasWeapon('shotgun')) {
      this.input.consumeKey('Digit3');
      this.combatSystem?.setWeapon('shotgun');
    }
    if (this.input.isKeyDown('Digit5') && this.shop?.hasWeapon('gatling')) {
      this.input.consumeKey('Digit5');
      this.combatSystem?.setWeapon('gatling');
    }

    // Teleporter - [4] to start teleporting
    if (this.input.isKeyDown('Digit4')) {
      this.input.consumeKey('Digit4');
      if (this.teleporterCount > 0 && !this.isTeleporting) {
        this.startTeleporting();
      }
    }

  }

  private startTeleporting(): void {
    this.isTeleporting = true;
    this.teleportProgress = 0;
    this.teleportStartX = this.playerX;
    this.teleportStartY = this.playerY;
    this.teleporterCount--;
  }

  private updateTeleporting(dt: number): void {
    if (!this.isTeleporting) return;

    this.teleportProgress += dt;

    // Update teleport visual (light blue glow that grows, similar to gravity bomb)
    if (this.teleportGraphics) {
      this.teleportGraphics.clear();
      const progress = Math.min(this.teleportProgress / 2, 1); // 2 seconds to complete

      // Outer glow (pulsing)
      const pulseScale = 1 + Math.sin(this.teleportProgress * 10) * 0.1;
      const outerRadius = 40 * progress * pulseScale;
      this.teleportGraphics.circle(this.teleportStartX, this.teleportStartY, outerRadius);
      this.teleportGraphics.fill({ color: 0x44ccff, alpha: 0.15 * progress });

      // Middle ring
      const middleRadius = 30 * progress;
      this.teleportGraphics.circle(this.teleportStartX, this.teleportStartY, middleRadius);
      this.teleportGraphics.fill({ color: 0x66ddff, alpha: 0.25 * progress });

      // Inner core
      const innerRadius = 15 * progress;
      this.teleportGraphics.circle(this.teleportStartX, this.teleportStartY, innerRadius);
      this.teleportGraphics.fill({ color: 0x88eeff, alpha: 0.5 * progress });

      // Progress ring
      this.teleportGraphics.circle(this.teleportStartX, this.teleportStartY, 35);
      this.teleportGraphics.stroke({ color: 0x44ccff, width: 2, alpha: 0.6 });
    }

    // Check if teleporting complete (2 seconds)
    if (this.teleportProgress >= 2) {
      this.completeTeleporting();
    }
  }

  private completeTeleporting(): void {
    if (!this.maze) return;

    // Flash effect before teleport
    if (this.teleportGraphics) {
      this.teleportGraphics.clear();
      // Bright flash
      this.teleportGraphics.circle(this.teleportStartX, this.teleportStartY, 60);
      this.teleportGraphics.fill({ color: 0xffffff, alpha: 0.8 });
    }

    // Teleport player to random floor tile
    this.teleportToRandomLocation();

    // Clear graphics after a short delay (handled in render or cleared immediately)
    if (this.teleportGraphics) {
      this.teleportGraphics.clear();
    }

    this.isTeleporting = false;
    this.teleportProgress = 0;
  }

  private teleportToRandomLocation(): void {
    if (!this.maze) return;

    // Find a random floor tile that's not in start or exit room
    let attempts = 0;
    while (attempts < 100) {
      const tileX = Math.floor(Math.random() * this.maze.width);
      const tileY = Math.floor(Math.random() * this.maze.height);

      // Must be a floor tile
      if (this.maze.tiles[tileY]?.[tileX] !== 0) {
        attempts++;
        continue;
      }

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
        const worldPos = MazeGenerator.tileToWorld(tileX, tileY);
        this.playerX = worldPos.x;
        this.playerY = worldPos.y;
        this.playerVelX = 0;
        this.playerVelY = 0;
        return;
      }

      attempts++;
    }
  }


  private updateFogOfWar(dt: number): void {
    if (!this.fogOfWar) return;
    this.fogOfWar.update(this.playerX, this.playerY, dt);

    // Update attraction timers for lanterns and flares
    this.fogOfWar.updateAttractionTimers(dt);

    // Set zombie attraction based on active light sources
    const attractionPoint = this.fogOfWar.getAttractionPoint();
    if (attractionPoint) {
      this.zombieManager?.setAttractionPoint(attractionPoint.x, attractionPoint.y);
    } else {
      this.zombieManager?.clearAttractionPoint();
    }
  }

  private updateZombies(dt: number): void {
    if (!this.zombieManager || !this.fogOfWar) return;

    const damage = this.zombieManager.update(dt, this.playerX, this.playerY, this.fogOfWar);

    if (damage > 0) {
      // Shield power-up blocks damage
      if (this.powerUpSystem?.hasEffect('shield')) {
        // Flash blue instead to show shield absorbed it
        this.damageFlashAlpha = 0.2;
      } else {
        this.playerHP -= damage;
        this.damageFlashAlpha = 0.4;
      }

      if (this.playerHP <= 0) {
        this.playerHP = 0;
        this.gameOver = true;
        this.zombieManager?.stopSpawning();
        // Save high score (add current level time to total)
        const finalTime = this.totalTime + this.levelTime;
        const kills = this.combatSystem?.getKillCount() ?? 0;
        TitleScreen.saveHighScore(this.currentLevel, kills, this.cumulativePoints, finalTime);
        this.showDeathScreen();
      }
    }
  }

  private updateCombat(dt: number): void {
    if (!this.combatSystem) return;
    this.combatSystem.update(dt, this.playerX, this.playerY);
  }

  private updatePoints(): void {
    if (!this.combatSystem) return;

    const killCount = this.combatSystem.getKillCount();
    const newKills = killCount - this.lastKillCount;

    if (newKills > 0) {
      const earned = newKills * POINTS_PER_KILL;
      this.points += earned;
      this.cumulativePoints += earned;
      this.lastKillCount = killCount;
    }
  }

  private checkWinCondition(dt: number): void {
    if (!this.maze || !this.exitMarker) return;

    // Grace period to prevent instant exit on spawn
    if (this.levelStartGracePeriod > 0) {
      this.levelStartGracePeriod -= dt;
      return;
    }

    const exitPos = MazeGenerator.tileToWorld(
      this.maze.exitRoom.centerX,
      this.maze.exitRoom.centerY
    );

    const dist = Math.sqrt(
      (this.playerX - exitPos.x) ** 2 + (this.playerY - exitPos.y) ** 2
    );

    if (dist < TILE_SIZE) {
      // Level complete! Open shop for next level
      this.openShop();
    }
  }

  private updateLanternAndFlareVisuals(): void {
    if (!this.fogOfWar || !this.lanternGraphics || !this.flareGraphics || !this.flyingFlareGraphics) return;

    const lanterns = this.fogOfWar.getLanterns();
    const flares = this.fogOfWar.getFlares();

    // Draw lantern glow effects
    this.lanternGraphics.clear();
    for (const lantern of lanterns) {
      this.lanternGraphics.circle(lantern.x, lantern.y, LANTERN_RADIUS);
      this.lanternGraphics.fill({ color: 0xffaa00, alpha: 0.08 });
    }

    // Update lantern sprites - add new ones or remove old ones as needed
    while (this.lanternSprites.length < lanterns.length) {
      const sprite = new Sprite(this.lanternTexture);
      sprite.anchor.set(0.5, 0.5);
      const spriteSize = 40;
      const scale = spriteSize / Math.max(sprite.width, sprite.height);
      sprite.scale.set(scale);
      this.lanternSpritesContainer!.addChild(sprite);
      this.lanternSprites.push(sprite);
    }
    while (this.lanternSprites.length > lanterns.length) {
      const sprite = this.lanternSprites.pop()!;
      this.lanternSpritesContainer!.removeChild(sprite);
      sprite.destroy();
    }
    // Update lantern sprite positions
    for (let i = 0; i < lanterns.length; i++) {
      this.lanternSprites[i].x = lanterns[i].x;
      this.lanternSprites[i].y = lanterns[i].y;
    }

    // Draw flare glow effects
    this.flareGraphics.clear();
    for (const flare of flares) {
      this.flareGraphics.circle(flare.x, flare.y, FLARE_RADIUS);
      this.flareGraphics.fill({ color: 0xff4400, alpha: 0.08 });
    }

    // Update flare sprites - add new ones or remove old ones as needed
    while (this.flareSprites.length < flares.length) {
      const sprite = new Sprite(this.flareTexture);
      sprite.anchor.set(0.5, 0.5);
      const spriteSize = 35;
      const scale = spriteSize / Math.max(sprite.width, sprite.height);
      sprite.scale.set(scale);
      this.flareSpritesContainer!.addChild(sprite);
      this.flareSprites.push(sprite);
    }
    while (this.flareSprites.length > flares.length) {
      const sprite = this.flareSprites.pop()!;
      this.flareSpritesContainer!.removeChild(sprite);
      sprite.destroy();
    }
    // Update flare sprite positions
    for (let i = 0; i < flares.length; i++) {
      this.flareSprites[i].x = flares[i].x;
      this.flareSprites[i].y = flares[i].y;
    }

    // Draw flying flares (still use graphics for these since they move)
    this.flyingFlareGraphics.clear();
    for (const flare of this.fogOfWar.getFlyingFlares()) {
      this.flyingFlareGraphics.circle(flare.x, flare.y, 12);
      this.flyingFlareGraphics.fill({ color: 0xff6600, alpha: 0.3 });
      this.flyingFlareGraphics.circle(flare.x, flare.y, 5);
      this.flyingFlareGraphics.fill(0xffaa00);
    }
  }

  private checkExitDiscovery(): void {
    if (this.exitDiscovered || !this.maze || !this.fogOfWar) return;

    const exitTileX = this.maze.exitRoom.centerX;
    const exitTileY = this.maze.exitRoom.centerY;

    if (this.fogOfWar.isTileVisible(exitTileX, exitTileY, this.playerX, this.playerY)) {
      this.exitDiscovered = true;
    }
  }

  private updateMinimap(): void {
    if (!this.minimap || !this.fogOfWar || !this.maze) return;

    const playerTile = MazeGenerator.worldToTile(this.playerX, this.playerY);
    const visibilityMap = this.fogOfWar.getVisibilityMap(this.playerX, this.playerY);
    const lanterns = this.fogOfWar.getLanterns();
    const flares = this.fogOfWar.getFlares();

    this.minimap.update(
      playerTile.x,
      playerTile.y,
      visibilityMap,
      this.exitDiscovered,
      lanterns,
      flares
    );
  }

  private updateHUD(): void {
    if (!this.hudPanel || !this.hpBar) return;

    if (this.gameOver) return;

    const zombieCount = this.zombieManager?.getAliveCount() ?? 0;
    const isHordeActive = this.zombieManager?.isHordeRushActive() ?? false;

    // === TIMER PANEL DIMENSIONS (needed early for horde text positioning) ===
    const timerPanelWidth = 140;
    const timerPanelHeight = 55;
    const timerPanelX = window.innerWidth / 2 - timerPanelWidth / 2;
    const timerPanelY = 10;

    // === LEFT PANEL ===
    const panelX = 10;
    const panelY = 10;
    const panelWidth = 180;
    const panelHeight = 95;

    // Draw panel background
    this.hudPanel.clear();
    this.hudPanel.roundRect(panelX, panelY, panelWidth, panelHeight, 8);
    this.hudPanel.fill({ color: 0x000000, alpha: 0.7 });
    this.hudPanel.stroke({ color: 0xffaa00, width: 1, alpha: 0.6 });

    // Level text
    if (this.hudLevelText) {
      this.hudLevelText.text = `LEVEL ${this.currentLevel}`;
      this.hudLevelText.x = panelX + 12;
      this.hudLevelText.y = panelY + 8;
    }

    // Zombie count
    if (this.hudZombieText) {
      this.hudZombieText.text = `Enemies: ${zombieCount}`;
      this.hudZombieText.x = panelX + 12;
      this.hudZombieText.y = panelY + 34;
    }

    // Points (second row, right side)
    if (this.hudPointsText) {
      this.hudPointsText.text = `${this.points} PTS`;
      this.hudPointsText.x = panelX + panelWidth - 12;
      this.hudPointsText.y = panelY + 34;
      this.hudPointsText.anchor.set(1, 0);
    }

    // Horde warning - positioned under timer panel with animation
    if (this.hudHordeText) {
      this.hudHordeText.visible = isHordeActive && !this.inShop;
      if (isHordeActive && !this.inShop) {
        // Position under timer panel (center)
        this.hudHordeText.x = window.innerWidth / 2;
        this.hudHordeText.y = timerPanelY + timerPanelHeight + 8;
        this.hudHordeText.anchor.set(0.5, 0);

        // Animate in: scale from 0 to 1 over 0.3s, then pulse
        const animTime = this.hordeTextAnimTime;
        if (animTime < 0.3) {
          // Scale in animation
          const t = animTime / 0.3;
          const scale = t * t * (3 - 2 * t); // Smooth ease-in-out
          this.hudHordeText.scale.set(scale);
          this.hudHordeText.alpha = scale;
        } else {
          // Pulsing effect after initial animation
          const pulse = 1 + Math.sin((animTime - 0.3) * 6) * 0.1;
          this.hudHordeText.scale.set(pulse);
          this.hudHordeText.alpha = 1;
        }
      }
    }

    // HP bar
    const hpBarX = panelX + 12;
    const hpBarY = panelY + 58;
    const hpBarWidth = panelWidth - 24;
    const hpBarHeight = 22;

    this.hpBarBg?.clear();
    this.hpBarBg?.roundRect(hpBarX, hpBarY, hpBarWidth, hpBarHeight, 4);
    this.hpBarBg?.fill({ color: 0x222222, alpha: 0.9 });
    this.hpBarBg?.stroke({ color: 0x444444, width: 1 });

    const hpPercent = this.playerHP / this.playerMaxHP;
    const hpColor = hpPercent > 0.5 ? 0x44aa44 : hpPercent > 0.25 ? 0xaaaa44 : 0xaa4444;
    this.hpBar.clear();
    if (hpPercent > 0) {
      this.hpBar.roundRect(hpBarX + 2, hpBarY + 2, (hpBarWidth - 4) * hpPercent, hpBarHeight - 4, 3);
      this.hpBar.fill(hpColor);
    }

    // HP text
    if (this.hpText) {
      this.hpText.text = `${Math.floor(this.playerHP)} / ${Math.floor(this.playerMaxHP)}`;
      this.hpText.x = hpBarX + hpBarWidth / 2;
      this.hpText.y = hpBarY + hpBarHeight / 2;
    }

    // Status text (teleporting, etc.)
    if (this.hudText) {
      const teleportingText = this.isTeleporting ? `TELEPORTING... ${(2 - this.teleportProgress).toFixed(1)}s` : '';
      this.hudText.text = teleportingText;
      this.hudText.x = panelX + 12;
      this.hudText.y = panelY + panelHeight + 8;
    }

    // === CENTER PANEL (Timer) ===
    this.timerPanel?.clear();
    this.timerPanel?.roundRect(timerPanelX, timerPanelY, timerPanelWidth, timerPanelHeight, 8);
    this.timerPanel?.fill({ color: 0x000000, alpha: 0.7 });
    this.timerPanel?.stroke({ color: 0xffaa00, width: 1, alpha: 0.6 });

    if (this.timerText) {
      const minutes = Math.floor(this.levelTime / 60);
      const seconds = Math.floor(this.levelTime % 60);
      const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

      const underPar = this.levelTime < this.parTime;
      this.timerText.style.fill = underPar ? 0x44ff44 : 0xff6644;
      this.timerText.text = timeStr;
      this.timerText.x = window.innerWidth / 2;
      this.timerText.y = timerPanelY + 20;
    }

    if (this.parText) {
      // Show countdown to horde, hide once horde is active
      if (isHordeActive) {
        this.parText.visible = false;
      } else {
        this.parText.visible = true;
        const timeRemaining = Math.max(0, this.parTime - this.levelTime);
        const remainMinutes = Math.floor(timeRemaining / 60);
        const remainSeconds = Math.floor(timeRemaining % 60);
        const countdownStr = `HORDE IN: ${remainMinutes}:${remainSeconds.toString().padStart(2, '0')}`;
        this.parText.text = countdownStr;

        // Color changes as time runs out
        if (timeRemaining > 15) {
          this.parText.style.fill = 0x888888;
        } else if (timeRemaining > 5) {
          this.parText.style.fill = 0xffaa44;
        } else {
          this.parText.style.fill = 0xff4444;
        }
      }
      this.parText.x = window.innerWidth / 2;
      this.parText.y = timerPanelY + 43;
    }

    // === ATTRACTION TIMER (right side, below power-ups) ===
    if (this.attractionTimerText && this.fogOfWar) {
      const attraction = this.fogOfWar.getAttractionPoint();
      if (attraction) {
        this.attractionTimerText.visible = true;
        const timeLeft = attraction.timeRemaining.toFixed(1);
        this.attractionTimerText.text = `🔥 LURE: ${timeLeft}s`;
        this.attractionTimerText.x = window.innerWidth - 20;
        this.attractionTimerText.y = 160; // Below power-up effects area

        // Change color as time runs out
        const ratio = attraction.timeRemaining / attraction.maxTime;
        if (ratio > 0.5) {
          this.attractionTimerText.style.fill = 0xff8844; // Orange
        } else if (ratio > 0.25) {
          this.attractionTimerText.style.fill = 0xffaa00; // Yellow-orange
        } else {
          this.attractionTimerText.style.fill = 0xff4444; // Red (fading)
        }
      } else {
        this.attractionTimerText.visible = false;
      }
    }

    // Update hotbar
    this.updateHotBar();
  }

  private updateHotBar(): void {
    if (!this.hotBar) return;

    const currentWeapon = this.combatSystem?.getWeapon() ?? 'pistol';

    const slots: HotBarSlot[] = [
      // Weapon slots - one per weapon
      {
        id: 'pistol',
        hotkey: '1',
        label: 'Pistol',
        type: 'weapon',
        owned: true,
        active: currentWeapon === 'pistol',
      },
      {
        id: 'rifle',
        hotkey: '2',
        label: 'Rifle',
        type: 'weapon',
        owned: this.shop?.hasWeapon('rifle') ?? false,
        active: currentWeapon === 'rifle',
      },
      {
        id: 'shotgun',
        hotkey: '3',
        label: 'Shotgun',
        type: 'weapon',
        owned: this.shop?.hasWeapon('shotgun') ?? false,
        active: currentWeapon === 'shotgun',
      },
      // Gadget slots
      {
        id: 'teleporter',
        hotkey: '4',
        label: 'Teleporter',
        type: 'gadget',
        count: this.teleporterCount,
        owned: this.teleporterCount > 0,
      },
      {
        id: 'gatling',
        hotkey: '5',
        label: 'Gatling',
        type: 'weapon',
        owned: this.shop?.hasWeapon('gatling') ?? false,
        active: currentWeapon === 'gatling',
      },
      {
        id: 'scythe',
        hotkey: '6',
        label: 'Scythe',
        type: 'passive',
        owned: this.shop?.hasWeapon('scythe') ?? false,
        active: this.combatSystem?.hasScytheEnabled() ?? false,
      },
      // Utility slots
      {
        id: 'lantern',
        hotkey: 'E',
        label: 'Lantern',
        type: 'utility',
        count: this.lanternCount,
        owned: this.lanternCount > 0,
      },
      {
        id: 'flare',
        hotkey: 'F',
        label: 'Flare',
        type: 'utility',
        count: this.flareCount,
        owned: this.flareCount > 0,
      },
    ];

    this.hotBar.update(slots);
  }

  private updateDamageFlash(dt: number): void {
    if (this.damageFlashAlpha > 0) {
      this.damageFlashAlpha -= dt * 2;
      if (this.damageFlashAlpha < 0) this.damageFlashAlpha = 0;
    }

    if (this.damageFlash) {
      this.damageFlash.alpha = this.damageFlashAlpha;
    }
  }

  private updateCamera(): void {
    if (!this.worldContainer) return;

    this.worldContainer.x = window.innerWidth / 2 - this.playerX;
    this.worldContainer.y = window.innerHeight / 2 - this.playerY;
  }

  private render = (_interpolation: number): void => {
    if (this.player) {
      this.player.x = this.playerX;
      this.player.y = this.playerY;
    }

    if (this.torchLight) {
      this.torchLight.x = this.playerX;
      this.torchLight.y = this.playerY;
    }
  };
}
