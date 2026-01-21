import { Graphics, Container, Text, TextStyle, Sprite, Assets, Texture } from 'pixi.js';

export interface Upgrade {
  id: string;
  name: string;
  shortName: string;
  description: string;
  cost: number;
  type: 'permanent' | 'consumable' | 'weapon';
  maxPurchases?: number;
  purchased: number;
  sprite?: string; // Path to sprite image
}

export interface ShopPurchase {
  upgradeId: string;
}

export interface InventoryState {
  currentWeapon: string;
  hasRifle: boolean;
  hasShotgun: boolean;
  hasGatling: boolean;
  hasScythe: boolean;
  lanternCount: number;
  flareCount: number;
  shovelCount: number;
}

type PurchaseCallback = (upgrade: Upgrade) => void;
type RestartCallback = () => void;
type CloseCallback = () => void;

export class Shop {
  private container: Container;
  private background: Graphics;
  private mainPanel: Graphics;
  private titleText: Text;
  private pointsText: Text;
  private levelText: Text;
  private upgradeButtons: Container[] = [];
  private sectionLabels: Text[] = [];
  private sectionPanels: Graphics[] = [];
  private closeButton: Container;
  private restartButton: Container;

  // Point subtraction animation
  private pointAnimations: { text: Text; startTime: number; startY: number }[] = [];

  // Hotbar display
  private hotbarContainer: Container;
  private hotbarSlots: Container[] = [];

  private upgrades: Upgrade[] = [];
  private onPurchase: PurchaseCallback;
  private onRestart: RestartCallback | null = null;
  private onClose: CloseCallback | null = null;
  private isOpen = false;
  private playerAtFullHealth = false;
  private inventoryState: InventoryState | null = null;

  // Item slot size
  private readonly SLOT_SIZE = 90;
  private readonly SLOT_GAP = 8;

  // Weapon sprites
  private loadedTextures: Map<string, Texture> = new Map();

  constructor(onPurchase: PurchaseCallback) {
    this.onPurchase = onPurchase;
    this.container = new Container();
    this.container.visible = false;

    // Preload weapon sprites
    this.preloadSprites();

    // Semi-transparent background
    this.background = new Graphics();
    this.container.addChild(this.background);

    // Main panel (contains everything)
    this.mainPanel = new Graphics();
    this.container.addChild(this.mainPanel);

    // Title
    const titleStyle = new TextStyle({
      fontFamily: 'Arial Black, Impact, sans-serif',
      fontSize: 42,
      fill: 0xffdd44,
      fontWeight: 'bold',
      letterSpacing: 6,
      dropShadow: {
        color: 0x000000,
        blur: 4,
        distance: 2,
      },
    });
    this.titleText = new Text({ text: 'SHOP', style: titleStyle });
    this.container.addChild(this.titleText);

    // Level display
    const levelStyle = new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: 18,
      fill: 0x88ff88,
      fontWeight: 'bold',
      dropShadow: {
        color: 0x000000,
        blur: 2,
        distance: 1,
      },
    });
    this.levelText = new Text({ text: 'Next Level: 2', style: levelStyle });
    this.container.addChild(this.levelText);

    // Points display
    const pointsStyle = new TextStyle({
      fontFamily: 'Arial Black, sans-serif',
      fontSize: 28,
      fill: 0xffaa00,
      fontWeight: 'bold',
      dropShadow: {
        color: 0x000000,
        blur: 3,
        distance: 1,
      },
    });
    this.pointsText = new Text({ text: '0 PTS', style: pointsStyle });
    this.container.addChild(this.pointsText);

    // Close button
    this.closeButton = this.createActionButton('CONTINUE', '[SPACE]', 0x44aa44, 0x66ff66);
    this.closeButton.on('pointerdown', () => {
      if (this.onClose) {
        this.onClose();
      }
    });
    this.container.addChild(this.closeButton);

    // Main Menu button
    this.restartButton = this.createActionButton('MAIN MENU', '[M]', 0x3366aa, 0x6699ff);
    this.restartButton.on('pointerdown', () => {
      if (this.onRestart) {
        this.onRestart();
      }
    });
    this.container.addChild(this.restartButton);

    // Hotbar container
    this.hotbarContainer = new Container();
    this.container.addChild(this.hotbarContainer);

    // Initialize upgrades
    this.initializeUpgrades();
  }

  private async preloadSprites(): Promise<void> {
    try {
      const pistolTexture = await Assets.load('/pistol_sprite.png');
      this.loadedTextures.set('pistol', pistolTexture);

      const rifleTexture = await Assets.load('/rifle_sprite.png');
      this.loadedTextures.set('rifle', rifleTexture);
    } catch (e) {
      console.warn('Could not load weapon sprites:', e);
    }
  }

  private initializeUpgrades(): void {
    this.upgrades = [
      // Weapons (one-time purchase each)
      { id: 'rifle', name: 'Assault Rifle', shortName: 'Rifle', description: 'Fast automatic fire', cost: 500, type: 'weapon', maxPurchases: 1, purchased: 0, sprite: 'rifle' },
      { id: 'shotgun', name: 'Shotgun', shortName: 'Shotgun', description: '5 pellet spread shot', cost: 400, type: 'weapon', maxPurchases: 1, purchased: 0 },
      { id: 'gatling', name: 'Gatling Gun', shortName: 'Gatling', description: 'Insane fire rate', cost: 1000, type: 'weapon', maxPurchases: 1, purchased: 0 },
      { id: 'scythe', name: 'Death Scythe', shortName: 'Scythe', description: '360 degree melee', cost: 800, type: 'weapon', maxPurchases: 1, purchased: 0 },

      // Permanent upgrades
      { id: 'firerate', name: 'Fire Rate', shortName: 'Rate', description: '+20% attack speed', cost: 350, type: 'permanent', maxPurchases: 5, purchased: 0 },
      { id: 'bulletdamage', name: 'Bullet Damage', shortName: 'Damage', description: '+15% damage dealt', cost: 300, type: 'permanent', maxPurchases: 5, purchased: 0 },
      { id: 'maxhp', name: 'Max Health', shortName: 'HP', description: '+25 max HP', cost: 200, type: 'permanent', maxPurchases: 5, purchased: 0 },
      { id: 'speed', name: 'Movement Speed', shortName: 'Speed', description: '+15% move speed', cost: 250, type: 'permanent', maxPurchases: 4, purchased: 0 },
      { id: 'torch', name: 'Torch Radius', shortName: 'Light', description: '+30% vision range', cost: 150, type: 'permanent', maxPurchases: 4, purchased: 0 },

      // Consumables
      { id: 'healthpack', name: 'Health Pack', shortName: 'Heal', description: 'Restore 30 HP', cost: 100, type: 'consumable', purchased: 0 },
      { id: 'lantern', name: 'Lantern', shortName: 'Lantern', description: 'Lure zombies [E]', cost: 150, type: 'consumable', purchased: 0 },
      { id: 'flare', name: 'Flare Gun', shortName: 'Flare', description: 'Lure zombies [F]', cost: 125, type: 'consumable', purchased: 0 },
      { id: 'shovel', name: 'Magic Shovel', shortName: 'Shovel', description: 'Dig & teleport [4]', cost: 200, type: 'consumable', purchased: 0 },
    ];
  }

  private createActionButton(text: string, hotkey: string, color: number, glowColor: number): Container {
    const btn = new Container();
    const width = 180;
    const height = 50;

    const glow = new Graphics();
    glow.roundRect(-3, -3, width + 6, height + 6, 10);
    glow.fill({ color: glowColor, alpha: 0.25 });
    btn.addChild(glow);

    const bg = new Graphics();
    bg.roundRect(0, 0, width, height, 6);
    bg.fill(color);
    bg.stroke({ color: glowColor, width: 2 });
    btn.addChild(bg);

    const labelStyle = new TextStyle({
      fontFamily: 'Arial Black, sans-serif',
      fontSize: 16,
      fill: 0xffffff,
      fontWeight: 'bold',
      letterSpacing: 1,
    });
    const label = new Text({ text, style: labelStyle });
    label.x = width / 2 - label.width / 2;
    label.y = 8;
    btn.addChild(label);

    const hotkeyStyle = new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: 12,
      fill: 0xcccccc,
    });
    const hotkeyLabel = new Text({ text: hotkey, style: hotkeyStyle });
    hotkeyLabel.x = width / 2 - hotkeyLabel.width / 2;
    hotkeyLabel.y = 30;
    btn.addChild(hotkeyLabel);

    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.on('pointerover', () => btn.scale.set(1.05));
    btn.on('pointerout', () => btn.scale.set(1));

    return btn;
  }

  getContainer(): Container {
    return this.container;
  }

  setRestartCallback(callback: RestartCallback): void {
    this.onRestart = callback;
  }

  setCloseCallback(callback: CloseCallback): void {
    this.onClose = callback;
  }

  triggerRestart(): void {
    if (this.onRestart) {
      this.onRestart();
    }
  }

  open(points: number, nextLevel: number, currentHP?: number, maxHP?: number, inventory?: InventoryState): void {
    this.isOpen = true;
    this.container.visible = true;
    this.playerAtFullHealth = currentHP !== undefined && maxHP !== undefined && currentHP >= maxHP;
    this.inventoryState = inventory || null;

    const w = window.innerWidth;
    const h = window.innerHeight;

    // Calculate main panel size and position (centered, leaving room for buttons)
    const panelWidth = 620;
    const panelHeight = 460;
    const panelX = (w - panelWidth) / 2;
    const panelY = 100;

    // Dark background - leave top-left corner clear for HUD
    this.background.clear();
    // Draw background in sections to avoid covering HUD
    // Top strip (right of HUD)
    this.background.rect(200, 0, w - 200, 120);
    this.background.fill({ color: 0x000000, alpha: 0.85 });
    // Main area below HUD
    this.background.rect(0, 120, w, h - 120);
    this.background.fill({ color: 0x000000, alpha: 0.85 });

    // Main panel background
    this.mainPanel.clear();
    this.mainPanel.roundRect(panelX, panelY, panelWidth, panelHeight, 12);
    this.mainPanel.fill({ color: 0x111111, alpha: 0.95 });
    this.mainPanel.stroke({ color: 0xffaa00, width: 2, alpha: 0.8 });

    // Title (centered at top of panel)
    this.titleText.x = w / 2 - this.titleText.width / 2;
    this.titleText.y = panelY + 15;

    // Points (right side of title)
    this.pointsText.text = `${points} PTS`;
    this.pointsText.x = panelX + panelWidth - this.pointsText.width - 25;
    this.pointsText.y = panelY + 22;

    // Level (below title)
    this.levelText.text = `Next Level: ${nextLevel}`;
    this.levelText.x = w / 2 - this.levelText.width / 2;
    this.levelText.y = panelY + 60;

    // Button positions (well below panel)
    this.closeButton.x = w / 2 - 195;
    this.closeButton.y = panelY + panelHeight + 20;

    this.restartButton.x = w / 2 + 15;
    this.restartButton.y = panelY + panelHeight + 20;

    this.updateDisplay(points);
    this.updateHotbarDisplay();
  }

  close(): void {
    this.isOpen = false;
    this.container.visible = false;
    // Clear any ongoing animations
    for (const anim of this.pointAnimations) {
      this.container.removeChild(anim.text);
    }
    this.pointAnimations = [];
  }

  isShopOpen(): boolean {
    return this.isOpen;
  }

  updateDisplay(points: number, currentHP?: number, maxHP?: number): void {
    const w = window.innerWidth;

    if (currentHP !== undefined && maxHP !== undefined) {
      this.playerAtFullHealth = currentHP >= maxHP;
    }

    this.pointsText.text = `${points} PTS`;

    // Clear old elements
    for (const btn of this.upgradeButtons) {
      this.container.removeChild(btn);
    }
    for (const label of this.sectionLabels) {
      this.container.removeChild(label);
    }
    for (const panel of this.sectionPanels) {
      this.container.removeChild(panel);
    }
    this.upgradeButtons = [];
    this.sectionLabels = [];
    this.sectionPanels = [];

    // Group upgrades by type
    const weapons = this.upgrades.filter(u => u.type === 'weapon');
    const permanent = this.upgrades.filter(u => u.type === 'permanent');
    const consumables = this.upgrades.filter(u => u.type === 'consumable');

    // Calculate panel position (must match open() dimensions)
    const panelWidth = 620;
    const panelX = (w - panelWidth) / 2;
    const panelY = 100;

    let currentY = panelY + 85;

    // Draw each section
    currentY = this.drawSection('WEAPONS', weapons, points, panelX, panelWidth, currentY, 0xaa66ff);
    currentY = this.drawSection('UPGRADES', permanent, points, panelX, panelWidth, currentY + 6, 0xffaa66);
    currentY = this.drawSection('ITEMS', consumables, points, panelX, panelWidth, currentY + 6, 0x66ffaa);

    // Update hotbar after purchases
    this.updateHotbarDisplay();
  }

  private drawSection(title: string, items: Upgrade[], points: number, panelX: number, panelWidth: number, startY: number, accentColor: number): number {
    const sectionPadding = 10;
    const sectionWidth = panelWidth - 30;
    const sectionX = panelX + 15;
    const sectionHeight = this.SLOT_SIZE + 28;

    // Section panel
    const panel = new Graphics();
    panel.roundRect(sectionX, startY, sectionWidth, sectionHeight, 8);
    panel.fill({ color: 0x0a0a0a, alpha: 0.8 });
    panel.stroke({ color: accentColor, width: 1, alpha: 0.6 });
    this.container.addChild(panel);
    this.sectionPanels.push(panel);

    // Section label
    const labelStyle = new TextStyle({
      fontFamily: 'Arial Black, sans-serif',
      fontSize: 13,
      fill: accentColor,
      fontWeight: 'bold',
      letterSpacing: 3,
    });
    const label = new Text({ text: title, style: labelStyle });
    label.x = sectionX + sectionPadding;
    label.y = startY + 8;
    this.container.addChild(label);
    this.sectionLabels.push(label);

    // Calculate items layout (centered)
    const totalItemsWidth = items.length * this.SLOT_SIZE + (items.length - 1) * this.SLOT_GAP;
    const itemsStartX = sectionX + (sectionWidth - totalItemsWidth) / 2;
    const itemsStartY = startY + 22;

    items.forEach((upgrade, index) => {
      const x = itemsStartX + index * (this.SLOT_SIZE + this.SLOT_GAP);
      const y = itemsStartY;

      const canAfford = points >= upgrade.cost;
      const maxedOut = upgrade.maxPurchases !== undefined && upgrade.purchased >= upgrade.maxPurchases;
      const healthPackUnavailable = upgrade.id === 'healthpack' && this.playerAtFullHealth;
      const available = canAfford && !maxedOut && !healthPackUnavailable;

      const slot = this.createItemSlot(upgrade, x, y, available, maxedOut, healthPackUnavailable, accentColor);
      this.upgradeButtons.push(slot);
      this.container.addChild(slot);
    });

    return startY + sectionHeight;
  }

  private createItemSlot(upgrade: Upgrade, x: number, y: number, available: boolean, maxedOut: boolean, fullHealth: boolean, accentColor: number): Container {
    const slot = new Container();
    slot.x = x;
    slot.y = y;
    (slot as any).upgradeId = upgrade.id;
    (slot as any).available = available;

    // Slot background
    const bg = new Graphics();
    bg.roundRect(0, 0, this.SLOT_SIZE, this.SLOT_SIZE, 8);

    let borderColor = accentColor;
    let borderAlpha = 0.6;

    if (maxedOut) {
      bg.fill({ color: 0x1a2a1a, alpha: 0.9 });
      borderColor = 0x44aa44;
      borderAlpha = 1;
    } else if (!available) {
      bg.fill({ color: 0x0a0a0a, alpha: 0.7 });
      borderColor = 0x333333;
      borderAlpha = 0.5;
    } else {
      bg.fill({ color: 0x1a1a1a, alpha: 0.9 });
    }

    bg.stroke({ color: borderColor, width: 2, alpha: borderAlpha });
    slot.addChild(bg);

    // Image area - show sprite if available, otherwise placeholder
    const imgSize = 60;
    const texture = upgrade.sprite ? this.loadedTextures.get(upgrade.sprite) : null;

    if (texture) {
      // Show weapon sprite - 2x bigger
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 0.5);
      const scale = Math.min(imgSize / sprite.width, imgSize / sprite.height) * 1.8;
      sprite.scale.set(scale);
      sprite.x = this.SLOT_SIZE / 2;
      sprite.y = 6 + imgSize / 2;
      sprite.alpha = available ? 1 : 0.4;
      slot.addChild(sprite);
    } else {
      // Image placeholder area
      const imgArea = new Graphics();
      imgArea.roundRect((this.SLOT_SIZE - imgSize) / 2, 6, imgSize, imgSize, 6);
      imgArea.fill({ color: 0x222222, alpha: 0.6 });
      slot.addChild(imgArea);
    }

    // Item name (full name)
    const nameStyle = new TextStyle({
      fontFamily: 'Arial Black, sans-serif',
      fontSize: 10,
      fill: available ? 0xffffff : 0x666666,
      fontWeight: 'bold',
      align: 'center',
    });
    const nameText = new Text({ text: upgrade.shortName, style: nameStyle });
    nameText.anchor.set(0.5, 0);
    nameText.x = this.SLOT_SIZE / 2;
    nameText.y = 62;
    slot.addChild(nameText);

    // Description
    const descStyle = new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: 8,
      fill: available ? 0xaaaaaa : 0x555555,
      align: 'center',
      wordWrap: true,
      wordWrapWidth: this.SLOT_SIZE - 10,
    });
    const descText = new Text({ text: upgrade.description, style: descStyle });
    descText.anchor.set(0.5, 0);
    descText.x = this.SLOT_SIZE / 2;
    descText.y = 76;
    slot.addChild(descText);

    // Cost badge (top-right)
    const costBadgeWidth = 40;
    const costBg = new Graphics();
    costBg.roundRect(this.SLOT_SIZE - costBadgeWidth - 4, 4, costBadgeWidth, 16, 4);

    if (maxedOut) {
      costBg.fill({ color: 0x227722, alpha: 0.95 });
    } else if (fullHealth) {
      costBg.fill({ color: 0x227722, alpha: 0.95 });
    } else {
      costBg.fill({ color: available ? 0x886600 : 0x332200, alpha: 0.95 });
    }
    slot.addChild(costBg);

    const costStyle = new TextStyle({
      fontFamily: 'Arial Black, sans-serif',
      fontSize: 10,
      fill: available || maxedOut || fullHealth ? 0xffffff : 0x666666,
      fontWeight: 'bold',
    });
    const costLabel = maxedOut ? 'MAX' : (fullHealth ? 'FULL' : `${upgrade.cost}`);
    const costText = new Text({ text: costLabel, style: costStyle });
    costText.anchor.set(0.5, 0.5);
    costText.x = this.SLOT_SIZE - costBadgeWidth / 2 - 4;
    costText.y = 12;
    slot.addChild(costText);

    // Purchase count for limited upgrades (top-left)
    if (upgrade.maxPurchases !== undefined && upgrade.maxPurchases > 1) {
      const countBg = new Graphics();
      countBg.roundRect(4, 4, 28, 16, 4);
      countBg.fill({ color: 0x333333, alpha: 0.95 });
      slot.addChild(countBg);

      const countStyle = new TextStyle({
        fontFamily: 'Arial, sans-serif',
        fontSize: 10,
        fill: upgrade.purchased > 0 ? 0x88ff88 : 0x888888,
        fontWeight: 'bold',
      });
      const countText = new Text({ text: `${upgrade.purchased}/${upgrade.maxPurchases}`, style: countStyle });
      countText.x = 18;
      countText.y = 12;
      countText.anchor.set(0.5, 0.5);
      slot.addChild(countText);
    }

    // Make interactive
    slot.eventMode = 'static';
    slot.cursor = available ? 'pointer' : 'default';

    if (available) {
      slot.on('pointerover', () => {
        slot.scale.set(1.05);
      });
      slot.on('pointerout', () => {
        slot.scale.set(1);
      });
      slot.on('pointerdown', () => {
        this.purchaseUpgrade(upgrade, x + this.SLOT_SIZE / 2, y);
      });
    }

    return slot;
  }

  private purchaseUpgrade(upgrade: Upgrade, animX: number, animY: number): void {
    const cost = upgrade.cost;
    upgrade.purchased++;

    // Show point subtraction animation
    this.showPointSubtraction(cost, animX, animY);

    this.onPurchase(upgrade);
  }

  private showPointSubtraction(amount: number, x: number, y: number): void {
    const style = new TextStyle({
      fontFamily: 'Arial Black, sans-serif',
      fontSize: 18,
      fill: 0xff6644,
      fontWeight: 'bold',
      dropShadow: {
        color: 0x000000,
        blur: 3,
        distance: 1,
      },
    });

    const text = new Text({ text: `-${amount}`, style });
    text.anchor.set(0.5, 0.5);
    text.x = x;
    text.y = y;
    this.container.addChild(text);

    this.pointAnimations.push({
      text,
      startTime: Date.now(),
      startY: y,
    });

    // Animate over time
    const animate = () => {
      const elapsed = Date.now() - this.pointAnimations[this.pointAnimations.length - 1]?.startTime;
      if (!elapsed) return;

      for (let i = this.pointAnimations.length - 1; i >= 0; i--) {
        const anim = this.pointAnimations[i];
        const animElapsed = Date.now() - anim.startTime;
        const duration = 1000;

        if (animElapsed >= duration) {
          this.container.removeChild(anim.text);
          this.pointAnimations.splice(i, 1);
        } else {
          const progress = animElapsed / duration;
          anim.text.y = anim.startY - 40 * progress;
          anim.text.alpha = 1 - progress;
        }
      }

      if (this.pointAnimations.length > 0 && this.isOpen) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }

  private updateHotbarDisplay(): void {
    // Clear existing hotbar slots
    for (const slot of this.hotbarSlots) {
      this.hotbarContainer.removeChild(slot);
    }
    this.hotbarSlots = [];

    if (!this.inventoryState) return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const slotSize = 50;
    const slotGap = 8;

    const slots = [
      { id: 'pistol', label: 'Pistol', hotkey: '1', owned: true, active: this.inventoryState.currentWeapon === 'pistol' },
      { id: 'rifle', label: 'Rifle', hotkey: '2', owned: this.inventoryState.hasRifle, active: this.inventoryState.currentWeapon === 'rifle' },
      { id: 'shotgun', label: 'Shotgun', hotkey: '3', owned: this.inventoryState.hasShotgun, active: this.inventoryState.currentWeapon === 'shotgun' },
      { id: 'shovel', label: 'Shovel', hotkey: '4', owned: this.inventoryState.shovelCount > 0, count: this.inventoryState.shovelCount },
      { id: 'gatling', label: 'Gatling', hotkey: '5', owned: this.inventoryState.hasGatling, active: this.inventoryState.currentWeapon === 'gatling' },
      { id: 'scythe', label: 'Scythe', hotkey: '6', owned: this.inventoryState.hasScythe, active: this.inventoryState.currentWeapon === 'scythe' },
      { id: 'lantern', label: 'Lantern', hotkey: 'E', owned: this.inventoryState.lanternCount > 0, count: this.inventoryState.lanternCount },
      { id: 'flare', label: 'Flare', hotkey: 'F', owned: this.inventoryState.flareCount > 0, count: this.inventoryState.flareCount },
    ];

    const totalWidth = slots.length * slotSize + (slots.length - 1) * slotGap;
    const startX = (w - totalWidth) / 2;
    const startY = h - slotSize - 25;

    // Background panel
    const panelPadding = 10;
    const panelBg = new Graphics();
    panelBg.roundRect(-panelPadding, -panelPadding, totalWidth + panelPadding * 2, slotSize + panelPadding * 2, 8);
    panelBg.fill({ color: 0x000000, alpha: 0.8 });
    panelBg.stroke({ color: 0xffaa00, width: 1, alpha: 0.6 });
    this.hotbarContainer.addChild(panelBg);
    this.hotbarSlots.push(panelBg as any);

    this.hotbarContainer.x = startX;
    this.hotbarContainer.y = startY;

    slots.forEach((slotData, index) => {
      const x = index * (slotSize + slotGap);
      const slotContainer = new Container();
      slotContainer.x = x;

      const bg = new Graphics();
      bg.roundRect(0, 0, slotSize, slotSize, 6);

      if (slotData.active) {
        bg.fill({ color: 0x1a3a1a, alpha: 0.9 });
        bg.stroke({ color: 0x66ff66, width: 2 });
      } else if (!slotData.owned) {
        bg.fill({ color: 0x111111, alpha: 0.6 });
        bg.stroke({ color: 0x333333, width: 1 });
      } else {
        bg.fill({ color: 0x1a1a1a, alpha: 0.8 });
        bg.stroke({ color: 0x666666, width: 1 });
      }
      slotContainer.addChild(bg);

      // Add weapon sprite if available - 2x bigger
      const texture = this.loadedTextures.get(slotData.id);
      if (texture && slotData.owned) {
        const sprite = new Sprite(texture);
        sprite.anchor.set(0.5, 0.5);
        const maxSize = slotSize - 14;
        const scale = Math.min(maxSize / sprite.width, maxSize / sprite.height) * 1.6;
        sprite.scale.set(scale);
        sprite.x = slotSize / 2;
        sprite.y = slotSize / 2 - 2;
        sprite.alpha = slotData.active ? 1 : 0.7;
        slotContainer.addChild(sprite);
      }

      // Hotkey
      const hotkeyBg = new Graphics();
      hotkeyBg.roundRect(2, 2, 16, 14, 3);
      hotkeyBg.fill({ color: slotData.active ? 0xffaa00 : 0x333333, alpha: 0.9 });
      slotContainer.addChild(hotkeyBg);

      const hotkeyStyle = new TextStyle({
        fontFamily: 'Arial Black, sans-serif',
        fontSize: 9,
        fill: slotData.active ? 0x000000 : 0xaaaaaa,
        fontWeight: 'bold',
      });
      const hotkeyText = new Text({ text: slotData.hotkey, style: hotkeyStyle });
      hotkeyText.x = 10;
      hotkeyText.y = 9;
      hotkeyText.anchor.set(0.5, 0.5);
      slotContainer.addChild(hotkeyText);

      // Label
      const labelStyle = new TextStyle({
        fontFamily: 'Arial, sans-serif',
        fontSize: 8,
        fill: slotData.owned ? 0xffffff : 0x555555,
        fontWeight: 'bold',
      });
      const labelText = new Text({ text: slotData.label, style: labelStyle });
      labelText.anchor.set(0.5, 1);
      labelText.x = slotSize / 2;
      labelText.y = slotSize - 3;
      slotContainer.addChild(labelText);

      // Count (if applicable)
      if (slotData.count !== undefined) {
        const countBg = new Graphics();
        countBg.roundRect(slotSize - 18, slotSize - 16, 16, 14, 3);
        countBg.fill({ color: slotData.count > 0 ? 0x227722 : 0x442222, alpha: 0.9 });
        slotContainer.addChild(countBg);

        const countStyle = new TextStyle({
          fontFamily: 'Arial Black, sans-serif',
          fontSize: 10,
          fill: slotData.count > 0 ? 0x88ff88 : 0x886666,
          fontWeight: 'bold',
        });
        const countText = new Text({ text: `${slotData.count}`, style: countStyle });
        countText.anchor.set(0.5, 0.5);
        countText.x = slotSize - 10;
        countText.y = slotSize - 9;
        slotContainer.addChild(countText);
      }

      this.hotbarContainer.addChild(slotContainer);
      this.hotbarSlots.push(slotContainer);
    });
  }

  // Update inventory state when purchases are made
  updateInventory(inventory: InventoryState): void {
    this.inventoryState = inventory;
    this.updateHotbarDisplay();
  }

  getUpgrade(id: string): Upgrade | undefined {
    return this.upgrades.find(u => u.id === id);
  }

  getUpgradePurchaseCount(id: string): number {
    return this.upgrades.find(u => u.id === id)?.purchased ?? 0;
  }

  hasWeapon(weaponId: string): boolean {
    const upgrade = this.upgrades.find(u => u.id === weaponId);
    return upgrade ? upgrade.purchased > 0 : false;
  }
}
