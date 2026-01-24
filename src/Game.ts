import { Application, Graphics, Container, Text, TextStyle, Sprite, Assets } from 'pixi.js';
import { GameLoop } from '@/core/GameLoop';
import { InputManager } from '@/core/InputManager';
import { MazeGenerator, MazeData } from '@/systems/MazeGenerator';
import { FogOfWar } from '@/systems/FogOfWar';
import { CreatureManager } from '@/systems/CreatureManager';
import { CombatSystem } from '@/systems/CombatSystem';
import { PowerUpSystem, PowerUpType } from '@/systems/PowerUpSystem';
import { SoundManager } from '@/systems/SoundManager';
import { Minimap } from '@/ui/Minimap';
import { Shop, Upgrade } from '@/ui/Shop';
import { TitleScreen } from '@/ui/TitleScreen';
import { HotBar } from '@/ui/HotBar';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  COLOR_BACKGROUND,
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
  CRAWLER_SPAWN_RATE_BASE,
  CRAWLER_SPAWN_RATE_INCREMENT,
  CRAWLER_HP_SCALE_PER_LEVEL,
  CRAWLER_SPEED_SCALE_PER_LEVEL,
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
  private hullTexture: any = null;
  private hullOverlay: Sprite | null = null;
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
  private flareCount = 1;
  private teleporterCount = 0;
  private shockwaveCount = 0;

  // Teleporter state
  private isTeleporting = false;
  private teleportProgress = 0;
  private teleportStartX = 0;
  private teleportStartY = 0;
  private teleportGraphics: Graphics | null = null;

  // Shockwave state
  private shockwaveActive = false;
  private shockwaveProgress = 0;
  private shockwaveGraphics: Graphics | null = null;
  private readonly SHOCKWAVE_DURATION = 0.5; // Visual expansion time
  private readonly SHOCKWAVE_FREEZE_TIME = 4; // How long enemies stay frozen
  private readonly SHOCKWAVE_RADIUS = 300; // Radius of effect


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
  private exitAnimTime = 0;
  private exitX = 0;
  private exitY = 0;

  // Systems
  private fogOfWar: FogOfWar | null = null;
  private creatureManager: CreatureManager | null = null;
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
  private hordeTimerPanel: Graphics | null = null;
  private hordeTimerText: Text | null = null;
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

  // Level damage tracking (for no-damage bonus)
  private levelDamageTaken = 0;

  // Floating point text above player (world space)
  private playerFloatingTexts: { text: Text; lifetime: number; maxLifetime: number; offsetY: number }[] = [];

  // Delayed bonus display (for level end bonuses)
  // applyPoints: if true, points are added when this bonus displays (not before)
  private pendingBonuses: { amount: number; label: string; delay: number; applyPoints: boolean }[] = [];

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
    this.hullTexture = await Assets.load('/armory_hull.png');

    // Load sounds
    await SoundManager.load();

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

    // Z-ORDER (bottom to top):
    // 1. HUD elements (always visible during gameplay, behind shop)
    // 2. Minimap (visible during gameplay, behind shop)
    // 3. Shop (covers HUD/minimap when open)
    // 4. Hull overlay (frames everything, always on top)
    // 5. Hotbar (sits in hull's slots)

    // Create HUD FIRST (bottom layer)
    this.createHUD();

    // Minimap will be added in startLevel after HUD

    // Create shop (renders ABOVE HUD/minimap, BELOW hull)
    this.shop = new Shop(this.handlePurchase.bind(this));
    this.shop.setRestartCallback(this.goToMainMenu.bind(this));
    this.shop.setCloseCallback(this.closeShop.bind(this));
    this.uiContainer.addChild(this.shop.getContainer());

    // Create hull overlay (cockpit frame) - renders ON TOP of shop
    this.hullOverlay = new Sprite(this.hullTexture);
    this.hullOverlay.visible = false; // Hidden until game starts
    this.uiContainer.addChild(this.hullOverlay);

    // Create hotbar for consumable items - AFTER hull so it renders on top
    this.hotBar = new HotBar();
    this.uiContainer.addChild(this.hotBar.getContainer());

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
    // Resize hull overlay to cover screen
    this.updateHullOverlay();
  }

  private updateHullOverlay(): void {
    if (!this.hullOverlay) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Scale hull to cover the screen
    const scaleX = w / this.hullOverlay.texture.width;
    const scaleY = h / this.hullOverlay.texture.height;
    this.hullOverlay.scale.set(scaleX, scaleY);
    this.hullOverlay.x = 0;
    this.hullOverlay.y = 0;
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
    if (this.hordeTimerPanel) this.hordeTimerPanel.visible = true;
    if (this.hordeTimerText) this.hordeTimerText.visible = true;

    // Show power-up effects container
    if (this.powerUpSystem) {
      this.powerUpSystem.getEffectsContainer().visible = true;
    }


    // Show hull overlay
    if (this.hullOverlay) {
      this.hullOverlay.visible = true;
      this.updateHullOverlay();
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
    this.flareCount = 1;
    this.teleporterCount = 0;
    this.shockwaveCount = 0;
    this.isTeleporting = false;
    this.teleportProgress = 0;
    this.shockwaveActive = false;
    this.shockwaveProgress = 0;
    this.inShop = false;
    this.pendingBonuses = [];
    this.playerFloatingTexts = [];

    // Reset combat system
    if (this.combatSystem) {
      this.combatSystem.resetKillCount();
      this.combatSystem.resetWeapons();
      this.combatSystem.setDamageMultiplier(1);
      this.combatSystem.setFireRateMultiplier(1);
      this.combatSystem.setScytheEnabled(false);
    }

    // Recreate shop to reset purchases - add at index 0 so it's behind hull
    if (this.shop && this.uiContainer) {
      this.uiContainer.removeChild(this.shop.getContainer());
    }
    this.shop = new Shop(this.handlePurchase.bind(this));
    this.shop.setRestartCallback(this.goToMainMenu.bind(this));
    this.shop.setCloseCallback(this.closeShop.bind(this));
    this.uiContainer!.addChildAt(this.shop.getContainer(), 0);

    // Ensure hotbar stays on top of hull (re-add to top of z-order)
    if (this.hotBar && this.uiContainer) {
      this.uiContainer.removeChild(this.hotBar.getContainer());
      this.uiContainer.addChild(this.hotBar.getContainer());
    }

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
    if (this.creatureManager) {
      this.creatureManager.destroy();
      this.creatureManager = null as any;
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

    // Clear floating texts and pending bonuses
    this.playerFloatingTexts = [];
    this.pendingBonuses = [];

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
    if (this.hordeTimerPanel) this.hordeTimerPanel.visible = false;
    if (this.hordeTimerText) this.hordeTimerText.visible = false;

    // Hide minimap
    if (this.minimap) {
      this.minimap.getContainer().visible = false;
    }


    // Hide hull overlay
    if (this.hullOverlay) {
      this.hullOverlay.visible = false;
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
    this.levelDamageTaken = 0;
    this.hordeTriggeredThisLevel = false;
    this.hordeTextAnimTime = 0;
    const mapSize = this.getMapSize(level);
    // Curved time formula: bigger maps get some more time but not too much
    // Level 1 (25): 25s, Level 8 (60): ~55s
    const sizeDiff = mapSize - 25;
    this.parTime = Math.floor(25 + sizeDiff * 0.85);

    // Clear old world objects
    if (this.worldContainer) {
      this.worldContainer.removeChildren();
    }

    // Clear old floating texts (but keep pending bonuses for new level)
    this.playerFloatingTexts = [];

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

    // Initialize creature manager
    if (!this.creatureManager) {
      this.creatureManager = new CreatureManager(this.maze);
    } else {
      this.creatureManager.setMaze(this.maze);
      this.creatureManager.clearAll();
    }
    this.worldContainer!.addChild(this.creatureManager.getContainer());

    // Set creature scaling for this level
    const hpMult = 1 + (level - 1) * CRAWLER_HP_SCALE_PER_LEVEL;
    const speedMult = 1 + (level - 1) * CRAWLER_SPEED_SCALE_PER_LEVEL;
    this.creatureManager.setScaling(hpMult, speedMult);

    // Set spawn rate for this level
    const spawnRate = CRAWLER_SPAWN_RATE_BASE + (level - 1) * CRAWLER_SPAWN_RATE_INCREMENT;
    this.creatureManager.setSpawnRate(spawnRate);

    // Set current level for special creature spawning
    this.creatureManager.setLevel(level);
    this.creatureManager.resetHordeRush(); // Reset from previous level

    // Set max creatures alive for this level (scales with level, caps at 500)
    const maxCreatures = Math.min(500, 50 + (level - 1) * 30);
    this.creatureManager.setMaxCreaturesAlive(maxCreatures);

    // Initialize combat system
    if (!this.combatSystem) {
      this.combatSystem = new CombatSystem(this.creatureManager, this.fogOfWar, this.maze);
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

    // Create shockwave graphics container
    this.shockwaveGraphics = new Graphics();
    this.worldContainer!.addChild(this.shockwaveGraphics);

    // Reset teleporting state for new level
    this.isTeleporting = false;
    this.teleportProgress = 0;

    // Reset shockwave state for new level
    this.shockwaveActive = false;
    this.shockwaveProgress = 0;

    // Create torch light visual
    this.createTorchLight();

    // Add fog of war container
    this.worldContainer!.addChild(this.fogOfWar.getFogContainer());

    // Remove old minimap if exists
    if (this.minimap && this.uiContainer) {
      this.uiContainer.removeChild(this.minimap.getContainer());
    }
    // Create new minimap for this level
    // Insert BEFORE shop so it renders behind shop but above HUD
    this.minimap = new Minimap(this.maze);
    const shopIndex = this.uiContainer!.getChildIndex(this.shop!.getContainer());
    this.uiContainer!.addChildAt(this.minimap.getContainer(), shopIndex);

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

    // Start creature spawning
    this.creatureManager.startSpawning();
  }

  private renderMaze(): void {
    if (!this.maze || !this.worldContainer) return;

    this.mazeGraphics = new Graphics();

    // Seeded random for consistent tile variations
    const seededRandom = (x: number, y: number, seed: number = 0) => {
      const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
      return n - Math.floor(n);
    };

    // Check if adjacent tile is a wall
    const isWallAt = (x: number, y: number) => {
      if (x < 0 || x >= this.maze!.width || y < 0 || y >= this.maze!.height) return true;
      return this.maze!.tiles[y][x] === 1;
    };

    // Render floors - clean with subtle ambient occlusion
    for (let y = 0; y < this.maze.height; y++) {
      for (let x = 0; x < this.maze.width; x++) {
        if (this.maze.tiles[y][x] === 0) {
          const px = x * TILE_SIZE;
          const py = y * TILE_SIZE;

          // Count adjacent walls for ambient occlusion
          let wallCount = 0;
          if (isWallAt(x - 1, y)) wallCount++;
          if (isWallAt(x + 1, y)) wallCount++;
          if (isWallAt(x, y - 1)) wallCount++;
          if (isWallAt(x, y + 1)) wallCount++;

          // Subtle darkening near walls
          const darkenAmount = wallCount * 0.015;

          // Floor base color - lighter blue-gray tone to contrast with walls
          const baseR = 0x22;
          const baseG = 0x24;
          const baseB = 0x28;

          const floorR = Math.max(0, baseR - Math.floor(darkenAmount * 255));
          const floorG = Math.max(0, baseG - Math.floor(darkenAmount * 255));
          const floorB = Math.max(0, baseB - Math.floor(darkenAmount * 255));
          const floorColor = (floorR << 16) | (floorG << 8) | floorB;

          // Draw clean floor tile
          this.mazeGraphics.rect(px, py, TILE_SIZE, TILE_SIZE);
          this.mazeGraphics.fill(floorColor);
        }
      }
    }

    // Render walls - darker with rocky texture
    for (let y = 0; y < this.maze.height; y++) {
      for (let x = 0; x < this.maze.width; x++) {
        if (this.maze.tiles[y][x] === 1) {
          const px = x * TILE_SIZE;
          const py = y * TILE_SIZE;

          // Wall base color - darker brown-gray for contrast
          const baseR = 0x14;
          const baseG = 0x12;
          const baseB = 0x10;
          const variation = (seededRandom(x, y) - 0.5) * 12;
          const wallR = Math.max(0, Math.min(255, baseR + variation));
          const wallG = Math.max(0, Math.min(255, baseG + variation * 0.8));
          const wallB = Math.max(0, Math.min(255, baseB + variation * 0.6));
          const wallColor = (wallR << 16) | (wallG << 8) | wallB;

          // Draw base wall
          this.mazeGraphics.rect(px, py, TILE_SIZE, TILE_SIZE);
          this.mazeGraphics.fill(wallColor);

          // Add rocky texture bumps
          const numBumps = 2 + Math.floor(seededRandom(x, y, 10) * 3);
          for (let i = 0; i < numBumps; i++) {
            const bumpX = px + seededRandom(x, y, 11 + i * 3) * TILE_SIZE;
            const bumpY = py + seededRandom(x, y, 12 + i * 3) * TILE_SIZE;
            const bumpSize = 4 + seededRandom(x, y, 13 + i * 3) * 8;
            const bumpBright = seededRandom(x, y, 14 + i * 3) > 0.5;
            const bumpColor = bumpBright ? wallColor + 0x080808 : Math.max(0, wallColor - 0x050505);

            this.mazeGraphics.circle(bumpX, bumpY, bumpSize);
            this.mazeGraphics.fill({ color: bumpColor, alpha: 0.5 });
          }
        }
      }
    }

    // Third pass: Draw clear borders between floors and walls
    for (let y = 0; y < this.maze.height; y++) {
      for (let x = 0; x < this.maze.width; x++) {
        if (this.maze.tiles[y][x] === 0) {
          const px = x * TILE_SIZE;
          const py = y * TILE_SIZE;

          // Draw dark border on edges adjacent to walls
          if (isWallAt(x - 1, y)) {
            this.mazeGraphics.rect(px, py, 3, TILE_SIZE);
            this.mazeGraphics.fill({ color: 0x0a0a0a, alpha: 0.8 });
          }
          if (isWallAt(x + 1, y)) {
            this.mazeGraphics.rect(px + TILE_SIZE - 3, py, 3, TILE_SIZE);
            this.mazeGraphics.fill({ color: 0x0a0a0a, alpha: 0.8 });
          }
          if (isWallAt(x, y - 1)) {
            this.mazeGraphics.rect(px, py, TILE_SIZE, 3);
            this.mazeGraphics.fill({ color: 0x0a0a0a, alpha: 0.8 });
          }
          if (isWallAt(x, y + 1)) {
            this.mazeGraphics.rect(px, py + TILE_SIZE - 3, TILE_SIZE, 3);
            this.mazeGraphics.fill({ color: 0x0a0a0a, alpha: 0.8 });
          }
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

    this.exitX = exitPos.x;
    this.exitY = exitPos.y;
    this.exitAnimTime = 0;

    this.exitMarker = new Graphics();
    this.exitMarker.x = exitPos.x;
    this.exitMarker.y = exitPos.y;
    this.worldContainer.addChild(this.exitMarker);

    // Initial draw
    this.drawExitBeacon(0);
  }

  private drawExitBeacon(time: number): void {
    if (!this.exitMarker) return;

    this.exitMarker.clear();

    const pulse = Math.sin(time * 3) * 0.3 + 0.7; // 0.4 to 1.0
    const fastPulse = Math.sin(time * 6) * 0.5 + 0.5;
    const rotation = time * 1.5;

    // Outer glow (large, faint)
    this.exitMarker.circle(0, 0, TILE_SIZE * 1.8);
    this.exitMarker.fill({ color: 0x00ffaa, alpha: 0.1 * pulse });

    // Middle glow ring
    this.exitMarker.circle(0, 0, TILE_SIZE * 1.3);
    this.exitMarker.fill({ color: 0x00ffcc, alpha: 0.15 * pulse });

    // Base platform (dark with glowing edge)
    this.exitMarker.circle(0, 0, TILE_SIZE * 0.9);
    this.exitMarker.fill({ color: 0x113322, alpha: 0.9 });
    this.exitMarker.circle(0, 0, TILE_SIZE * 0.9);
    this.exitMarker.stroke({ color: 0x00ffaa, width: 3, alpha: 0.8 });

    // Inner rings (rotating effect via segments)
    const ringRadius = TILE_SIZE * 0.7;
    const segments = 8;
    for (let i = 0; i < segments; i++) {
      const angle = rotation + (Math.PI * 2 * i) / segments;
      const nextAngle = rotation + (Math.PI * 2 * (i + 0.4)) / segments;
      const alpha = (i % 2 === 0) ? 0.8 : 0.3;

      this.exitMarker.moveTo(0, 0);
      this.exitMarker.arc(0, 0, ringRadius, angle, nextAngle);
      this.exitMarker.lineTo(0, 0);
      this.exitMarker.fill({ color: 0x00ffdd, alpha: alpha * pulse });
    }

    // Center portal swirl
    const swirlRadius = TILE_SIZE * 0.5;
    this.exitMarker.circle(0, 0, swirlRadius);
    this.exitMarker.fill({ color: 0x000000, alpha: 0.8 });

    // Portal spiral effect
    for (let i = 0; i < 3; i++) {
      const spiralAngle = -rotation * 2 + (Math.PI * 2 * i) / 3;
      const armLength = swirlRadius * 0.8;
      const x1 = Math.cos(spiralAngle) * armLength * 0.2;
      const y1 = Math.sin(spiralAngle) * armLength * 0.2;
      const x2 = Math.cos(spiralAngle) * armLength;
      const y2 = Math.sin(spiralAngle) * armLength;

      this.exitMarker.moveTo(x1, y1);
      this.exitMarker.lineTo(x2, y2);
      this.exitMarker.stroke({ color: 0x44ffdd, width: 4, alpha: 0.7 * fastPulse });
    }

    // Center bright core
    this.exitMarker.circle(0, 0, TILE_SIZE * 0.15);
    this.exitMarker.fill({ color: 0xaaffee, alpha: 0.9 * fastPulse });
    this.exitMarker.circle(0, 0, TILE_SIZE * 0.08);
    this.exitMarker.fill({ color: 0xffffff, alpha: 1 });

    // Vertical beam effect (lines going up)
    const beamHeight = TILE_SIZE * 2;
    for (let i = 0; i < 4; i++) {
      const beamAngle = rotation * 0.5 + (Math.PI * 2 * i) / 4;
      const bx = Math.cos(beamAngle) * TILE_SIZE * 0.3;
      const by = Math.sin(beamAngle) * TILE_SIZE * 0.3;

      this.exitMarker.moveTo(bx, by);
      this.exitMarker.lineTo(bx * 0.5, -beamHeight * pulse);
      this.exitMarker.stroke({ color: 0x00ffaa, width: 2, alpha: 0.4 * pulse });
    }
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

    // HUD panel with futuristic frame
    this.hudPanel = new Graphics();
    this.uiContainer.addChild(this.hudPanel);

    // Level text - clean futuristic style
    const levelStyle = new TextStyle({
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: 18,
      fill: 0x44ffaa,
      fontWeight: 'bold',
      letterSpacing: 3,
    });
    this.hudLevelText = new Text({ text: 'LEVEL 1', style: levelStyle });
    this.uiContainer.addChild(this.hudLevelText);

    // Zombie count (hidden but kept for compatibility)
    const zombieStyle = new TextStyle({
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: 14,
      fill: 0xcccccc,
      fontWeight: 'bold',
    });
    this.hudZombieText = new Text({ text: '', style: zombieStyle });
    this.uiContainer.addChild(this.hudZombieText);

    // Points - clean monospace
    const pointsStyle = new TextStyle({
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: 16,
      fill: 0xffcc44,
      fontWeight: 'bold',
      letterSpacing: 1,
    });
    this.hudPointsText = new Text({ text: '0 PTS', style: pointsStyle });
    this.uiContainer.addChild(this.hudPointsText);

    // Horde warning (hidden by default)
    const hordeStyle = new TextStyle({
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: 14,
      fill: 0xff4444,
      fontWeight: 'bold',
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

    // HP text - clean monospace
    const hpTextStyle = new TextStyle({
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: 12,
      fill: 0xffffff,
      fontWeight: 'bold',
      letterSpacing: 1,
    });
    this.hpText = new Text({ text: '', style: hpTextStyle });
    this.hpText.anchor.set(0.5, 0.5);
    this.uiContainer.addChild(this.hpText);

    // Status text (teleporting, etc.)
    const style = new TextStyle({
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: 11,
      fill: 0x88ccaa,
      letterSpacing: 1,
    });
    this.hudText = new Text({ text: '', style });
    this.uiContainer.addChild(this.hudText);

    // === CENTER (Horde Timer) - Big countdown ===
    this.hordeTimerPanel = new Graphics();
    this.uiContainer.addChild(this.hordeTimerPanel);

    const timerStyle = new TextStyle({
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: 32,
      fill: 0xff4444,
      fontWeight: 'bold',
      letterSpacing: 4,
    });
    this.hordeTimerText = new Text({ text: '0:00', style: timerStyle });
    this.hordeTimerText.anchor.set(0.5, 0.5);
    this.uiContainer.addChild(this.hordeTimerText);

    // Attraction timer (shows when lantern/flare is active)
    const attractionStyle = new TextStyle({
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: 14,
      fill: 0xff8844,
      fontWeight: 'bold',
      letterSpacing: 1,
    });
    this.attractionTimerText = new Text({ text: '', style: attractionStyle });
    this.attractionTimerText.anchor.set(1, 0);
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

    // Hide minimap and hull overlay
    if (this.minimap) {
      this.minimap.getContainer().visible = false;
    }
    if (this.hullOverlay) {
      this.hullOverlay.visible = false;
    }
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
    if (this.hordeTimerPanel) this.hordeTimerPanel.visible = false;
    if (this.hordeTimerText) this.hordeTimerText.visible = false;

    const w = window.innerWidth;
    const h = window.innerHeight;

    this.deathScreen = new Container();

    // Full screen dark overlay
    const overlay = new Graphics();
    overlay.rect(0, 0, w, h);
    overlay.fill({ color: 0x000000, alpha: 0.9 });
    this.deathScreen.addChild(overlay);

    // Game Over text (styled like title screen)
    const titleStyle = new TextStyle({
      fontFamily: 'Arial Black, Impact, sans-serif',
      fontSize: 72,
      fill: 0xff4444,
      fontWeight: 'bold',
      letterSpacing: 8,
      dropShadow: {
        color: 0x000000,
        blur: 8,
        distance: 4,
      },
    });
    const titleText = new Text({ text: 'GAME OVER', style: titleStyle });
    titleText.x = w / 2 - titleText.width / 2;
    titleText.y = h * 0.25;
    this.deathScreen.addChild(titleText);

    // Stats panel background
    const kills = this.combatSystem?.getKillCount() ?? 0;
    const finalTime = this.totalTime + this.levelTime;
    const minutes = Math.floor(finalTime / 60);
    const seconds = Math.floor(finalTime % 60);
    const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    const statsStyle = new TextStyle({
      fontFamily: 'monospace',
      fontSize: 18,
      fill: 0xffffff,
      fontWeight: 'bold',
      dropShadow: {
        color: 0x000000,
        blur: 2,
        distance: 1,
      },
    });
    const statsText = new Text({
      text: `Level ${this.currentLevel}  |  Kills: ${kills}  |  Points: ${this.cumulativePoints}  |  Time: ${timeStr}`,
      style: statsStyle,
    });

    // Stats panel
    const panelPadding = 30;
    const panelWidth = statsText.width + panelPadding * 2;
    const panelHeight = 50;
    const panelX = w / 2 - panelWidth / 2;
    const panelY = h * 0.42;

    const statsPanel = new Graphics();
    statsPanel.roundRect(panelX, panelY, panelWidth, panelHeight, 6);
    statsPanel.fill({ color: 0x000000, alpha: 0.6 });
    statsPanel.stroke({ color: 0xffaa00, width: 1, alpha: 0.5 });
    this.deathScreen.addChild(statsPanel);

    statsText.x = w / 2 - statsText.width / 2;
    statsText.y = panelY + panelHeight / 2 - statsText.height / 2;
    this.deathScreen.addChild(statsText);

    // Try Again button
    const buttonWidth = 220;
    const buttonHeight = 55;
    const buttonY = h * 0.58;

    const tryAgainGlow = new Graphics();
    tryAgainGlow.roundRect(w / 2 - buttonWidth - 20 - 4, buttonY - 4, buttonWidth + 8, buttonHeight + 8, 12);
    tryAgainGlow.fill({ color: 0x66ff66, alpha: 0.3 });
    this.deathScreen.addChild(tryAgainGlow);

    const tryAgainBg = new Graphics();
    tryAgainBg.roundRect(w / 2 - buttonWidth - 20, buttonY, buttonWidth, buttonHeight, 8);
    tryAgainBg.fill(0x44aa44);
    tryAgainBg.stroke({ color: 0x66ff66, width: 2 });
    this.deathScreen.addChild(tryAgainBg);

    const buttonStyle = new TextStyle({
      fontFamily: 'Arial Black, sans-serif',
      fontSize: 18,
      fill: 0xffffff,
      fontWeight: 'bold',
      letterSpacing: 1,
    });
    const tryAgainText = new Text({ text: 'Try Again [SPACE]', style: buttonStyle });
    tryAgainText.x = w / 2 - buttonWidth - 20 + buttonWidth / 2 - tryAgainText.width / 2;
    tryAgainText.y = buttonY + buttonHeight / 2 - tryAgainText.height / 2;
    this.deathScreen.addChild(tryAgainText);

    // Main Menu button
    const menuGlow = new Graphics();
    menuGlow.roundRect(w / 2 + 20 - 4, buttonY - 4, buttonWidth + 8, buttonHeight + 8, 12);
    menuGlow.fill({ color: 0x6699ff, alpha: 0.3 });
    this.deathScreen.addChild(menuGlow);

    const menuBg = new Graphics();
    menuBg.roundRect(w / 2 + 20, buttonY, buttonWidth, buttonHeight, 8);
    menuBg.fill(0x4466aa);
    menuBg.stroke({ color: 0x6699ff, width: 2 });
    this.deathScreen.addChild(menuBg);

    const menuText = new Text({ text: 'Main Menu [M]', style: buttonStyle });
    menuText.x = w / 2 + 20 + buttonWidth / 2 - menuText.width / 2;
    menuText.y = buttonY + buttonHeight / 2 - menuText.height / 2;
    this.deathScreen.addChild(menuText);

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
    const controlsText = new Text({
      text: 'Press SPACE to try again or M for main menu',
      style: controlsStyle,
    });
    controlsText.x = w / 2 - controlsText.width / 2;
    controlsText.y = h - 60;
    this.deathScreen.addChild(controlsText);

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
    this.flareCount = 1;
    this.teleporterCount = 0;
    this.shockwaveCount = 0;
    this.isTeleporting = false;
    this.teleportProgress = 0;
    this.shockwaveActive = false;
    this.shockwaveProgress = 0;
    this.inShop = false;
    this.pendingBonuses = [];
    this.playerFloatingTexts = [];
    // Game is now active

    // Reset combat system
    if (this.combatSystem) {
      this.combatSystem.resetKillCount();
      this.combatSystem.resetWeapons();
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
        this.combatSystem?.addWeapon('rifle');
        break;
      case 'shotgun':
        this.combatSystem?.addWeapon('shotgun');
        break;
      case 'gatling':
        this.combatSystem?.addWeapon('gatling');
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
        if (this.lanternCount < 2) {
          this.lanternCount++;
        } else {
          this.points += upgrade.cost; // Refund if at max
        }
        break;
      case 'flare':
        if (this.flareCount < 1) {
          this.flareCount++;
        } else {
          this.points += upgrade.cost; // Refund if at max
        }
        break;
      case 'teleporter':
        this.teleporterCount++;
        break;
      case 'shockwave':
        if (this.shockwaveCount < 3) {
          this.shockwaveCount++;
        } else {
          this.points += upgrade.cost; // Refund if at max
        }
        break;
    }

    // Update shop display with new points and inventory
    this.shop?.updateDisplay(this.points, this.playerHP, this.playerMaxHP);

  }

  private onPowerUpStart(type: PowerUpType): void {
    switch (type) {
      case 'ghost':
        // Creatures won't target player - handled in CreatureManager
        this.creatureManager?.setPlayerInvisible(true);
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
        this.creatureManager?.setPlayerInvisible(false);
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
    this.creatureManager?.stopSpawning();

    // Add level time to total time
    this.totalTime += this.levelTime;

    // Award bonus points for completing the level (equal to map width)
    const mapSize = this.getMapSize(this.currentLevel);
    this.points += mapSize;
    this.cumulativePoints += mapSize;

    // Time bonus: extra points for escaping before horde arrives
    // Points applied when the floating text shows (not now)
    if (this.levelTime < this.parTime) {
      const timeBeforeHorde = this.parTime - this.levelTime;
      const timeBonus = Math.floor(timeBeforeHorde * 2); // 2 points per second early
      // Queue to show above player after new level starts - points applied on display
      this.pendingBonuses.push({ amount: timeBonus, label: 'BUZZER BEATER', delay: 0.5, applyPoints: true });
    }

    // No damage bonus: reward for completing level without taking damage
    // Points applied when the floating text shows (not now)
    if (this.levelDamageTaken === 0) {
      const noDamageBonus = 50 + this.currentLevel * 10; // Scales with level
      // Queue to show above player after new level starts - points applied on display
      this.pendingBonuses.push({ amount: noDamageBonus, label: 'UNSCATHED', delay: 1.0, applyPoints: true });
    }

    // Keep minimap visible during shop (don't hide it)

    // Hide only timer during shop - keep HP bar, level info, and points visible
    if (this.hordeTimerPanel) this.hordeTimerPanel.visible = false;
    if (this.hordeTimerText) this.hordeTimerText.visible = false;
    // Hide horde text when level is complete
    if (this.hudHordeText) this.hudHordeText.visible = false;

    this.shop?.open(
      this.points,
      this.currentLevel + 1,
      this.playerHP,
      this.playerMaxHP,
      {
        currentWeapon: 'pistol', // All weapons now auto-fire
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

    // Restore timer visibility before starting new level
    if (this.hordeTimerPanel) this.hordeTimerPanel.visible = true;
    if (this.hordeTimerText) this.hordeTimerText.visible = true;

    this.startLevel(this.currentLevel + 1);
  }

  private completeLevel(): void {
    // Complete level without opening shop (used for non-shop levels)
    this.creatureManager?.stopSpawning();

    // Add level time to total time
    this.totalTime += this.levelTime;

    // Award bonus points for completing the level (equal to map width)
    const mapSize = this.getMapSize(this.currentLevel);
    this.points += mapSize;
    this.cumulativePoints += mapSize;

    // Time bonus: extra points for escaping before horde arrives
    // Points applied when the floating text shows (not now)
    if (this.levelTime < this.parTime) {
      const timeBeforeHorde = this.parTime - this.levelTime;
      const timeBonus = Math.floor(timeBeforeHorde * 2); // 2 points per second early
      // Queue to show above player after new level starts - points applied on display
      this.pendingBonuses.push({ amount: timeBonus, label: 'BUZZER BEATER', delay: 0.5, applyPoints: true });
    }

    // No damage bonus: reward for completing level without taking damage
    // Points applied when the floating text shows (not now)
    if (this.levelDamageTaken === 0) {
      const noDamageBonus = 50 + this.currentLevel * 10; // Scales with level
      // Queue to show above player after new level starts - points applied on display
      this.pendingBonuses.push({ amount: noDamageBonus, label: 'UNSCATHED', delay: 1.0, applyPoints: true });
    }

    // Go directly to next level
    this.startLevel(this.currentLevel + 1);
  }

  private spawnPlayerFloatingText(amount: number, label?: string): void {
    if (!this.worldContainer) return;

    // Futuristic style matching HUD
    const style = new TextStyle({
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: label ? 22 : 18,
      fill: 0x44ffaa,
      fontWeight: 'bold',
      letterSpacing: 2,
      stroke: { color: 0x0a1a15, width: 4 },
    });

    const displayText = label ? `${label} +${amount}` : `+${amount}`;
    const text = new Text({ text: displayText, style });
    text.anchor.set(0.5, 0.5);

    // Stack multiple texts vertically
    const baseOffset = -60;
    let offsetY = baseOffset;
    for (const existing of this.playerFloatingTexts) {
      if (existing.offsetY <= offsetY + 25 && existing.offsetY >= offsetY - 25) {
        offsetY = existing.offsetY - 30;
      }
    }

    this.worldContainer.addChild(text);

    this.playerFloatingTexts.push({
      text,
      lifetime: 1.2,
      maxLifetime: 1.2,
      offsetY,
    });
  }

  private updatePlayerFloatingTexts(dt: number): void {
    if (!this.worldContainer) return;

    const toRemove: typeof this.playerFloatingTexts = [];

    for (const ft of this.playerFloatingTexts) {
      ft.lifetime -= dt;
      ft.offsetY -= 60 * dt; // Float upward

      // Position above player
      ft.text.x = this.playerX;
      ft.text.y = this.playerY + ft.offsetY;

      // Fade out
      const alpha = Math.max(0, ft.lifetime / ft.maxLifetime);
      ft.text.alpha = alpha;

      if (ft.lifetime <= 0) {
        toRemove.push(ft);
      }
    }

    for (const ft of toRemove) {
      this.worldContainer.removeChild(ft.text);
      const idx = this.playerFloatingTexts.indexOf(ft);
      if (idx > -1) this.playerFloatingTexts.splice(idx, 1);
    }
  }

  private updatePendingBonuses(dt: number): void {
    const toRemove: typeof this.pendingBonuses = [];

    for (const bonus of this.pendingBonuses) {
      bonus.delay -= dt;
      if (bonus.delay <= 0) {
        // Apply points when the text shows (if flagged)
        if (bonus.applyPoints) {
          this.points += bonus.amount;
          this.cumulativePoints += bonus.amount;
        }
        this.spawnPlayerFloatingText(bonus.amount, bonus.label);
        toRemove.push(bonus);
      }
    }

    for (const bonus of toRemove) {
      const idx = this.pendingBonuses.indexOf(bonus);
      if (idx > -1) this.pendingBonuses.splice(idx, 1);
    }
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
      this.creatureManager?.triggerHordeRush();
    }

    // Update horde text animation
    if (this.hordeTriggeredThisLevel) {
      this.hordeTextAnimTime += dt;
    }

    this.updateTeleporting(dt);
    this.updateShockwave(dt);
    this.updatePlayer(dt);
    this.updateCamera();
    this.handleInput();
    this.updateFogOfWar(dt);
    this.updateCreatures(dt);
    this.updateCombat(dt);
    this.updatePowerUps(dt);
    this.updatePoints();
    this.updateLanternAndFlareVisuals();
    this.updateExitBeacon(dt);
    this.checkExitDiscovery();
    this.checkWinCondition(dt);
    this.updateMinimap();
    this.updateHUD();
    this.updateDamageFlash(dt);
    this.updatePlayerFloatingTexts(dt);
    this.updatePendingBonuses(dt);
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

    // Can't move while rooted (hit by spitter goo)
    if (this.creatureManager?.isPlayerRooted()) {
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
        SoundManager.play('lantern', 0.4);
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

    // Teleporter - [4] to start teleporting
    if (this.input.isKeyDown('Digit4')) {
      this.input.consumeKey('Digit4');
      if (this.teleporterCount > 0 && !this.isTeleporting) {
        this.startTeleporting();
      }
    }

    // Shockwave - [5] to emit freeze wave
    if (this.input.isKeyDown('Digit5')) {
      this.input.consumeKey('Digit5');
      if (this.shockwaveCount > 0 && !this.shockwaveActive) {
        this.activateShockwave();
      }
    }

  }

  private startTeleporting(): void {
    this.isTeleporting = true;
    this.teleportProgress = 0;
    this.teleportStartX = this.playerX;
    this.teleportStartY = this.playerY;
    this.teleporterCount--;
    SoundManager.play('teleport', 0.5);
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

  private activateShockwave(): void {
    this.shockwaveActive = true;
    this.shockwaveProgress = 0;
    this.shockwaveCount--;
    SoundManager.play('shockwave', 0.5);

    // Freeze all enemies within radius
    this.creatureManager?.freezeEnemiesInRadius(
      this.playerX,
      this.playerY,
      this.SHOCKWAVE_RADIUS,
      this.SHOCKWAVE_FREEZE_TIME
    );
  }

  private updateShockwave(dt: number): void {
    if (!this.shockwaveActive) return;

    this.shockwaveProgress += dt;

    // Draw expanding shockwave visual
    if (this.shockwaveGraphics) {
      this.shockwaveGraphics.clear();

      const progress = this.shockwaveProgress / this.SHOCKWAVE_DURATION;
      const currentRadius = this.SHOCKWAVE_RADIUS * progress;
      const alpha = 0.6 * (1 - progress);

      // Outer wave ring
      this.shockwaveGraphics.circle(this.playerX, this.playerY, currentRadius);
      this.shockwaveGraphics.stroke({ color: 0x66ddff, width: 4, alpha: alpha });

      // Inner glow
      this.shockwaveGraphics.circle(this.playerX, this.playerY, currentRadius * 0.9);
      this.shockwaveGraphics.fill({ color: 0x44ccff, alpha: alpha * 0.3 });

      // Bright center pulse
      if (progress < 0.3) {
        const centerAlpha = 0.5 * (1 - progress / 0.3);
        this.shockwaveGraphics.circle(this.playerX, this.playerY, 40 * (1 - progress));
        this.shockwaveGraphics.fill({ color: 0xaaeeff, alpha: centerAlpha });
      }
    }

    // End shockwave after duration
    if (this.shockwaveProgress >= this.SHOCKWAVE_DURATION) {
      this.shockwaveActive = false;
      this.shockwaveProgress = 0;
      if (this.shockwaveGraphics) {
        this.shockwaveGraphics.clear();
      }
    }
  }

  private updateFogOfWar(dt: number): void {
    if (!this.fogOfWar) return;
    this.fogOfWar.update(this.playerX, this.playerY, dt);

    // Update attraction timers for lanterns and flares
    this.fogOfWar.updateAttractionTimers(dt);

    // Set creature attraction based on active light sources
    const attractionPoint = this.fogOfWar.getAttractionPoint();
    if (attractionPoint) {
      this.creatureManager?.setAttractionPoint(attractionPoint.x, attractionPoint.y);
    } else {
      this.creatureManager?.clearAttractionPoint();
    }
  }

  private updateCreatures(dt: number): void {
    if (!this.creatureManager || !this.fogOfWar) return;

    const damage = this.creatureManager.update(dt, this.playerX, this.playerY, this.fogOfWar);

    if (damage > 0) {
      // Shield power-up blocks damage
      if (this.powerUpSystem?.hasEffect('shield')) {
        // Flash blue instead to show shield absorbed it
        this.damageFlashAlpha = 0.2;
      } else {
        this.playerHP -= damage;
        this.levelDamageTaken += damage;
        this.damageFlashAlpha = 0.4;
        SoundManager.play('player_hit', 0.15);
      }

      if (this.playerHP <= 0) {
        this.playerHP = 0;
        this.gameOver = true;
        this.creatureManager?.stopSpawning();
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

      // Show floating points above player
      this.spawnPlayerFloatingText(earned);
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
      // Level complete! Show shop every 3 levels
      if (this.currentLevel % 3 === 0) {
        this.openShop();
      } else {
        // Skip shop, go directly to next level (but still award bonuses)
        this.completeLevel();
      }
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

  private updateExitBeacon(dt: number): void {
    this.exitAnimTime += dt;
    this.drawExitBeacon(this.exitAnimTime);
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

    const isHordeActive = this.creatureManager?.isHordeRushActive() ?? false;

    // === LEFT PANEL - Futuristic stats (inside hull frame) ===
    const panelX = 160;
    const panelY = 140;
    const panelWidth = 170;
    const panelHeight = 120;

    // Draw futuristic frame
    this.hudPanel.clear();

    // Outer glow
    this.hudPanel.roundRect(panelX - 2, panelY - 2, panelWidth + 4, panelHeight + 4, 10);
    this.hudPanel.fill({ color: 0x44ffaa, alpha: 0.06 });

    // Main background
    this.hudPanel.roundRect(panelX, panelY, panelWidth, panelHeight, 8);
    this.hudPanel.fill({ color: 0x0a1a15, alpha: 0.88 });

    // Thin border
    this.hudPanel.roundRect(panelX, panelY, panelWidth, panelHeight, 8);
    this.hudPanel.stroke({ color: 0x44ffaa, width: 1, alpha: 0.4 });

    // Corner accents - top left
    this.hudPanel.moveTo(panelX, panelY + 18);
    this.hudPanel.lineTo(panelX, panelY + 8);
    this.hudPanel.arcTo(panelX, panelY, panelX + 8, panelY, 8);
    this.hudPanel.lineTo(panelX + 18, panelY);
    this.hudPanel.stroke({ color: 0x44ffaa, width: 2, alpha: 0.7 });

    // Corner accents - top right
    this.hudPanel.moveTo(panelX + panelWidth - 18, panelY);
    this.hudPanel.lineTo(panelX + panelWidth - 8, panelY);
    this.hudPanel.arcTo(panelX + panelWidth, panelY, panelX + panelWidth, panelY + 8, 8);
    this.hudPanel.lineTo(panelX + panelWidth, panelY + 18);
    this.hudPanel.stroke({ color: 0x44ffaa, width: 2, alpha: 0.7 });

    // Corner accents - bottom left
    this.hudPanel.moveTo(panelX, panelY + panelHeight - 18);
    this.hudPanel.lineTo(panelX, panelY + panelHeight - 8);
    this.hudPanel.arcTo(panelX, panelY + panelHeight, panelX + 8, panelY + panelHeight, 8);
    this.hudPanel.lineTo(panelX + 18, panelY + panelHeight);
    this.hudPanel.stroke({ color: 0x44ffaa, width: 2, alpha: 0.7 });

    // Corner accents - bottom right
    this.hudPanel.moveTo(panelX + panelWidth - 18, panelY + panelHeight);
    this.hudPanel.lineTo(panelX + panelWidth - 8, panelY + panelHeight);
    this.hudPanel.arcTo(panelX + panelWidth, panelY + panelHeight, panelX + panelWidth, panelY + panelHeight - 8, 8);
    this.hudPanel.lineTo(panelX + panelWidth, panelY + panelHeight - 18);
    this.hudPanel.stroke({ color: 0x44ffaa, width: 2, alpha: 0.7 });

    // Level text
    if (this.hudLevelText) {
      this.hudLevelText.text = `LEVEL ${this.currentLevel}`;
      this.hudLevelText.x = panelX + 14;
      this.hudLevelText.y = panelY + 14;
      this.hudLevelText.anchor.set(0, 0);
    }

    // Hide enemies count - not needed
    if (this.hudZombieText) {
      this.hudZombieText.visible = false;
    }

    // Points
    if (this.hudPointsText) {
      this.hudPointsText.text = `${this.points} PTS`;
      this.hudPointsText.x = panelX + 14;
      this.hudPointsText.y = panelY + 40;
      this.hudPointsText.anchor.set(0, 0);
    }

    // Hide the old horde text - we use the timer now
    if (this.hudHordeText) {
      this.hudHordeText.visible = false;
    }

    // HP bar - futuristic style
    const hpBarX = panelX + 14;
    const hpBarY = panelY + 72;
    const hpBarWidth = panelWidth - 28;
    const hpBarHeight = 22;

    // HP bar outer glow
    this.hpBarBg?.clear();
    this.hpBarBg?.roundRect(hpBarX - 1, hpBarY - 1, hpBarWidth + 2, hpBarHeight + 2, 5);
    this.hpBarBg?.fill({ color: 0x44ffaa, alpha: 0.1 });

    // HP bar background
    this.hpBarBg?.roundRect(hpBarX, hpBarY, hpBarWidth, hpBarHeight, 4);
    this.hpBarBg?.fill({ color: 0x0a1510, alpha: 0.9 });

    // HP bar border
    this.hpBarBg?.roundRect(hpBarX, hpBarY, hpBarWidth, hpBarHeight, 4);
    this.hpBarBg?.stroke({ color: 0x44ffaa, width: 1, alpha: 0.3 });

    const hpPercent = this.playerHP / this.playerMaxHP;
    // Futuristic color gradient based on health
    let hpColor: number;
    let hpGlow: number;
    if (hpPercent > 0.5) {
      hpColor = 0x44ffaa;
      hpGlow = 0x44ffaa;
    } else if (hpPercent > 0.25) {
      hpColor = 0xffcc44;
      hpGlow = 0xffaa00;
    } else {
      hpColor = 0xff4444;
      hpGlow = 0xff2222;
    }

    this.hpBar.clear();
    if (hpPercent > 0) {
      // HP fill glow
      this.hpBar.roundRect(hpBarX + 2, hpBarY + 2, (hpBarWidth - 4) * hpPercent, hpBarHeight - 4, 2);
      this.hpBar.fill({ color: hpGlow, alpha: 0.3 });

      // HP fill
      this.hpBar.roundRect(hpBarX + 3, hpBarY + 3, (hpBarWidth - 6) * hpPercent, hpBarHeight - 6, 2);
      this.hpBar.fill(hpColor);
    }

    // HP text
    if (this.hpText) {
      this.hpText.text = `${Math.floor(this.playerHP)}/${Math.floor(this.playerMaxHP)}`;
      this.hpText.x = hpBarX + hpBarWidth / 2;
      this.hpText.y = hpBarY + hpBarHeight / 2;
    }

    // Status text
    if (this.hudText) {
      const teleportingText = this.isTeleporting ? `TELEPORT ${(2 - this.teleportProgress).toFixed(1)}s` : '';
      this.hudText.text = teleportingText;
      this.hudText.x = panelX + 14;
      this.hudText.y = panelY + panelHeight + 10;
    }

    // === BOTTOM LEFT (Horde Timer) - Futuristic style (inside hull frame) ===
    const timerX = 160;
    const timerWidth = 120;
    const timerHeight = 60;
    const timerY = window.innerHeight - timerHeight - 220;
    const timeRemaining = Math.max(0, this.parTime - this.levelTime);

    // Draw futuristic timer frame
    this.hordeTimerPanel?.clear();

    // Outer glow - color changes based on time
    const timerGlowColor = isHordeActive ? 0xff4444 : (timeRemaining < 10 ? 0xff6644 : 0x44ffaa);
    this.hordeTimerPanel?.roundRect(timerX - 2, timerY - 2, timerWidth + 4, timerHeight + 4, 10);
    this.hordeTimerPanel?.fill({ color: timerGlowColor, alpha: 0.08 });

    // Main background
    const timerBgColor = isHordeActive ? 0x1a0808 : 0x0a1a15;
    this.hordeTimerPanel?.roundRect(timerX, timerY, timerWidth, timerHeight, 8);
    this.hordeTimerPanel?.fill({ color: timerBgColor, alpha: 0.88 });

    // Border
    const timerBorderColor = isHordeActive ? 0xff4444 : (timeRemaining < 10 ? 0xff6644 : 0x44ffaa);
    this.hordeTimerPanel?.roundRect(timerX, timerY, timerWidth, timerHeight, 8);
    this.hordeTimerPanel?.stroke({ color: timerBorderColor, width: 1, alpha: 0.4 });

    // Corner accents
    this.hordeTimerPanel?.moveTo(timerX, timerY + 15);
    this.hordeTimerPanel?.lineTo(timerX, timerY + 8);
    this.hordeTimerPanel?.arcTo(timerX, timerY, timerX + 8, timerY, 8);
    this.hordeTimerPanel?.lineTo(timerX + 15, timerY);
    this.hordeTimerPanel?.stroke({ color: timerBorderColor, width: 2, alpha: 0.7 });

    this.hordeTimerPanel?.moveTo(timerX + timerWidth - 15, timerY);
    this.hordeTimerPanel?.lineTo(timerX + timerWidth - 8, timerY);
    this.hordeTimerPanel?.arcTo(timerX + timerWidth, timerY, timerX + timerWidth, timerY + 8, 8);
    this.hordeTimerPanel?.lineTo(timerX + timerWidth, timerY + 15);
    this.hordeTimerPanel?.stroke({ color: timerBorderColor, width: 2, alpha: 0.7 });

    this.hordeTimerPanel?.moveTo(timerX, timerY + timerHeight - 15);
    this.hordeTimerPanel?.lineTo(timerX, timerY + timerHeight - 8);
    this.hordeTimerPanel?.arcTo(timerX, timerY + timerHeight, timerX + 8, timerY + timerHeight, 8);
    this.hordeTimerPanel?.lineTo(timerX + 15, timerY + timerHeight);
    this.hordeTimerPanel?.stroke({ color: timerBorderColor, width: 2, alpha: 0.7 });

    this.hordeTimerPanel?.moveTo(timerX + timerWidth - 15, timerY + timerHeight);
    this.hordeTimerPanel?.lineTo(timerX + timerWidth - 8, timerY + timerHeight);
    this.hordeTimerPanel?.arcTo(timerX + timerWidth, timerY + timerHeight, timerX + timerWidth, timerY + timerHeight - 8, 8);
    this.hordeTimerPanel?.lineTo(timerX + timerWidth, timerY + timerHeight - 15);
    this.hordeTimerPanel?.stroke({ color: timerBorderColor, width: 2, alpha: 0.7 });

    if (!isHordeActive) {
      // Countdown mode
      const remainMinutes = Math.floor(timeRemaining / 60);
      const remainSeconds = Math.floor(timeRemaining % 60);
      const countdownStr = `${remainMinutes}:${remainSeconds.toString().padStart(2, '0')}`;

      if (this.hordeTimerText) {
        this.hordeTimerText.text = countdownStr;
        this.hordeTimerText.x = timerX + timerWidth / 2;
        this.hordeTimerText.y = timerY + timerHeight / 2;
        this.hordeTimerText.anchor.set(0.5, 0.5);

        // Color intensifies as time runs out
        if (timeRemaining > 15) {
          this.hordeTimerText.style.fill = 0x44ffaa;
        } else if (timeRemaining > 5) {
          this.hordeTimerText.style.fill = 0xffcc44;
        } else {
          // Pulse in final seconds
          const pulse = Math.sin(this.levelTime * 8) * 0.3 + 0.7;
          const intensity = Math.floor(255 * pulse);
          this.hordeTimerText.style.fill = (intensity << 16) | 0x4444;
        }
        this.hordeTimerText.alpha = 1;
        this.hordeTimerText.scale.set(1);
      }
    } else {
      // MAYDAY mode
      if (this.hordeTimerText) {
        this.hordeTimerText.text = 'MAYDAY';
        this.hordeTimerText.x = timerX + timerWidth / 2;
        this.hordeTimerText.y = timerY + timerHeight / 2;
        this.hordeTimerText.anchor.set(0.5, 0.5);
        this.hordeTimerText.style.fill = 0xff4444;

        // Flash effect
        const flashCycle = (Math.sin(this.hordeTextAnimTime * Math.PI) + 1) / 2;
        this.hordeTimerText.alpha = 0.5 + flashCycle * 0.5;
        this.hordeTimerText.scale.set(1 + flashCycle * 0.03);
      }
    }

    // === ATTRACTION TIMER (right side, below power-ups) ===
    if (this.attractionTimerText && this.fogOfWar) {
      const attraction = this.fogOfWar.getAttractionPoint();
      if (attraction) {
        this.attractionTimerText.visible = true;
        const timeLeft = attraction.timeRemaining.toFixed(1);
        this.attractionTimerText.text = `LURE: ${timeLeft}s`;
        this.attractionTimerText.x = window.innerWidth - 20;
        this.attractionTimerText.y = 160;

        const ratio = attraction.timeRemaining / attraction.maxTime;
        if (ratio > 0.5) {
          this.attractionTimerText.style.fill = 0xff8844;
        } else if (ratio > 0.25) {
          this.attractionTimerText.style.fill = 0xffaa00;
        } else {
          this.attractionTimerText.style.fill = 0xff4444;
        }
      } else {
        this.attractionTimerText.visible = false;
      }
    }

    // === UPDATE HOTBAR ===
    if (this.hotBar) {
      this.hotBar.update([
        { id: 'lantern', hotkey: 'E', label: 'Lantern', count: this.lanternCount },
        { id: 'flare', hotkey: 'F', label: 'Flare', count: this.flareCount },
        { id: 'teleporter', hotkey: '4', label: 'Teleport', count: this.teleporterCount },
        { id: 'shockwave', hotkey: '5', label: 'Shock', count: this.shockwaveCount },
      ]);
    }

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
