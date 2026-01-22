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
  sprite?: string;
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
  teleporterCount: number;
}

type PurchaseCallback = (upgrade: Upgrade) => void;
type RestartCallback = () => void;
type CloseCallback = () => void;

export class Shop {
  private container: Container;
  private background: Graphics;
  private shopPanel: Graphics;
  private contentContainer: Container;
  private titleText: Text;
  private pointsText: Text;
  private levelText: Text;
  private upgradeButtons: Container[] = [];
  private sectionLabels: Text[] = [];
  private closeButton: Container;

  // Point subtraction animation
  private pointAnimations: { text: Text; startTime: number; startY: number }[] = [];

  private upgrades: Upgrade[] = [];
  private onPurchase: PurchaseCallback;
  private onRestart: RestartCallback | null = null;
  private onClose: CloseCallback | null = null;
  private isOpen = false;
  private playerAtFullHealth = false;

  // Item slot size - balanced for readability and fit
  private readonly SLOT_SIZE = 130;
  private readonly SLOT_GAP = 12;

  // Weapon sprites
  private loadedTextures: Map<string, Texture> = new Map();

  constructor(onPurchase: PurchaseCallback) {
    this.onPurchase = onPurchase;
    this.container = new Container();
    this.container.visible = false;

    // Preload all sprites
    this.preloadSprites();

    // Semi-transparent background
    this.background = new Graphics();
    this.container.addChild(this.background);

    // Shop panel (futuristic frame)
    this.shopPanel = new Graphics();
    this.container.addChild(this.shopPanel);

    // Content container (holds all items)
    this.contentContainer = new Container();
    this.container.addChild(this.contentContainer);

    // Title - "ARMORY" in futuristic style
    const titleStyle = new TextStyle({
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: 28,
      fill: 0x44ffaa,
      fontWeight: 'bold',
      letterSpacing: 8,
    });
    this.titleText = new Text({ text: 'ARMORY', style: titleStyle });
    this.titleText.anchor.set(0.5, 0);
    this.contentContainer.addChild(this.titleText);

    // Level display - hidden but kept for compatibility
    const levelStyle = new TextStyle({
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: 16,
      fill: 0x88ff88,
    });
    this.levelText = new Text({ text: '', style: levelStyle });
    this.levelText.visible = false;

    // Points display - clean monospace
    const pointsStyle = new TextStyle({
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: 22,
      fill: 0xffcc44,
      fontWeight: 'bold',
      letterSpacing: 2,
    });
    this.pointsText = new Text({ text: '0 PTS', style: pointsStyle });
    this.pointsText.anchor.set(0.5, 0);
    this.contentContainer.addChild(this.pointsText);

    // Close button with futuristic style
    this.closeButton = this.createActionButton('CONTINUE', '[SPACE]');
    this.closeButton.on('pointerdown', () => {
      if (this.onClose) this.onClose();
    });
    this.contentContainer.addChild(this.closeButton);

    // Initialize upgrades
    this.initializeUpgrades();
  }

  private async preloadSprites(): Promise<void> {
    try {
      // Load all item sprites
      const spriteMap: Record<string, string> = {
        'pistol': '/pistol_sprite.png',
        'rifle': '/rifle_sprite.png',
        'shotgun': '/shotgun_sprite.png',
        'gatling': '/gatling_sprite.png',
        'scythe': '/scythe_sprite.png',
        'lantern': '/lantern_sprite.png',
        'flare': '/flare_sprite.png',
        'teleporter': '/teleporter_sprite.png',
        'healthpack': '/health_sprite.png',
        'torch': '/vision_sprite.png',
        'maxhp': '/aromor_sprite.png',
        'bulletdamage': '/hollow_point_sprite.png',
        'firerate': '/rapid_fire_sprite.png',
        'speed': '/speed_sprite.png',
        'shockwave': '/shockwave_sprite.png',
      };

      for (const [key, path] of Object.entries(spriteMap)) {
        try {
          const texture = await Assets.load(path);
          this.loadedTextures.set(key, texture);
        } catch (e) {
          console.warn(`Could not load sprite ${key}:`, e);
        }
      }
    } catch (e) {
      console.warn('Could not load shop sprites:', e);
    }
  }

  private initializeUpgrades(): void {
    this.upgrades = [
      // Weapons
      { id: 'rifle', name: 'Assault Rifle', shortName: 'Rifle', description: 'Rapid automatic fire', cost: 500, type: 'weapon', maxPurchases: 1, purchased: 0, sprite: 'rifle' },
      { id: 'shotgun', name: 'Shotgun', shortName: 'Shotgun', description: '5 pellet devastation', cost: 400, type: 'weapon', maxPurchases: 1, purchased: 0, sprite: 'shotgun' },
      { id: 'gatling', name: 'Gatling Gun', shortName: 'Gatling', description: 'Insane fire rate', cost: 1000, type: 'weapon', maxPurchases: 1, purchased: 0, sprite: 'gatling' },
      { id: 'scythe', name: 'Death Scythe', shortName: 'Scythe', description: 'Passive 360 melee', cost: 800, type: 'weapon', maxPurchases: 1, purchased: 0, sprite: 'scythe' },

      // Permanent upgrades
      { id: 'firerate', name: 'Rapid Fire', shortName: 'Rapid Fire', description: '+20% attack speed', cost: 350, type: 'permanent', maxPurchases: 5, purchased: 0, sprite: 'firerate' },
      { id: 'bulletdamage', name: 'Hollow Points', shortName: 'Hollow Pts', description: '+15% damage', cost: 300, type: 'permanent', maxPurchases: 5, purchased: 0, sprite: 'bulletdamage' },
      { id: 'maxhp', name: 'Body Armor', shortName: 'Body Armor', description: '+25 max HP', cost: 200, type: 'permanent', maxPurchases: 5, purchased: 0, sprite: 'maxhp' },
      { id: 'speed', name: 'Adrenaline Shot', shortName: 'Adrenaline', description: '+15% move speed', cost: 250, type: 'permanent', maxPurchases: 4, purchased: 0, sprite: 'speed' },
      { id: 'torch', name: 'Night Vision', shortName: 'Night Vision', description: '+30% vision', cost: 150, type: 'permanent', maxPurchases: 4, purchased: 0, sprite: 'torch' },

      // Consumables
      { id: 'healthpack', name: 'Health Pack', shortName: 'Medkit', description: 'Restore 30 HP', cost: 100, type: 'consumable', purchased: 0, sprite: 'healthpack' },
      { id: 'lantern', name: 'Decoy Lantern', shortName: 'Lantern', description: 'Lure enemies [E]', cost: 300, type: 'consumable', purchased: 0, sprite: 'lantern' },
      { id: 'flare', name: 'Flare Gun', shortName: 'Flare', description: 'Lure enemies [F]', cost: 250, type: 'consumable', purchased: 0, sprite: 'flare' },
      { id: 'teleporter', name: 'Teleporter', shortName: 'Teleport', description: 'Warp away [4]', cost: 200, type: 'consumable', purchased: 0, sprite: 'teleporter' },
      { id: 'shockwave', name: 'Shockwave', shortName: 'Shock', description: 'Freeze enemies [5]', cost: 400, type: 'consumable', purchased: 0, sprite: 'shockwave' },
    ];
  }

  private createActionButton(text: string, hotkey: string): Container {
    const btn = new Container();
    const width = 200;
    const height = 50;

    // Outer glow
    const glow = new Graphics();
    glow.roundRect(-3, -3, width + 6, height + 6, 10);
    glow.fill({ color: 0x44ffaa, alpha: 0.15 });
    btn.addChild(glow);

    // Background
    const bg = new Graphics();
    bg.roundRect(0, 0, width, height, 8);
    bg.fill({ color: 0x0a1a15, alpha: 0.9 });
    bg.stroke({ color: 0x44ffaa, width: 1, alpha: 0.5 });
    btn.addChild(bg);

    // Corner accents
    const corners = new Graphics();
    // Top left
    corners.moveTo(0, 12);
    corners.lineTo(0, 8);
    corners.arcTo(0, 0, 8, 0, 8);
    corners.lineTo(12, 0);
    corners.stroke({ color: 0x44ffaa, width: 2, alpha: 0.8 });
    // Top right
    corners.moveTo(width - 12, 0);
    corners.lineTo(width - 8, 0);
    corners.arcTo(width, 0, width, 8, 8);
    corners.lineTo(width, 12);
    corners.stroke({ color: 0x44ffaa, width: 2, alpha: 0.8 });
    // Bottom left
    corners.moveTo(0, height - 12);
    corners.lineTo(0, height - 8);
    corners.arcTo(0, height, 8, height, 8);
    corners.lineTo(12, height);
    corners.stroke({ color: 0x44ffaa, width: 2, alpha: 0.8 });
    // Bottom right
    corners.moveTo(width - 12, height);
    corners.lineTo(width - 8, height);
    corners.arcTo(width, height, width, height - 8, 8);
    corners.lineTo(width, height - 12);
    corners.stroke({ color: 0x44ffaa, width: 2, alpha: 0.8 });
    btn.addChild(corners);

    const labelStyle = new TextStyle({
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: 16,
      fill: 0x44ffaa,
      fontWeight: 'bold',
      letterSpacing: 2,
    });
    const label = new Text({ text, style: labelStyle });
    label.anchor.set(0.5, 0);
    label.x = width / 2;
    label.y = 10;
    btn.addChild(label);

    const hotkeyStyle = new TextStyle({
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: 12,
      fill: 0x88ccaa,
      letterSpacing: 1,
    });
    const hotkeyLabel = new Text({ text: hotkey, style: hotkeyStyle });
    hotkeyLabel.anchor.set(0.5, 0);
    hotkeyLabel.x = width / 2;
    hotkeyLabel.y = 30;
    btn.addChild(hotkeyLabel);

    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.on('pointerover', () => btn.scale.set(1.05));
    btn.on('pointerout', () => btn.scale.set(1));

    return btn;
  }

  private drawFuturisticPanel(g: Graphics, x: number, y: number, w: number, h: number, glowColor = 0x44ffaa): void {
    // Outer glow
    g.roundRect(x - 2, y - 2, w + 4, h + 4, 12);
    g.fill({ color: glowColor, alpha: 0.08 });

    // Main background
    g.roundRect(x, y, w, h, 10);
    g.fill({ color: 0x0a1a15, alpha: 0.92 });

    // Thin border
    g.roundRect(x, y, w, h, 10);
    g.stroke({ color: glowColor, width: 1, alpha: 0.4 });

    // Corner accents
    const accentLen = 20;
    // Top left
    g.moveTo(x, y + accentLen);
    g.lineTo(x, y + 10);
    g.arcTo(x, y, x + 10, y, 10);
    g.lineTo(x + accentLen, y);
    g.stroke({ color: glowColor, width: 2, alpha: 0.7 });
    // Top right
    g.moveTo(x + w - accentLen, y);
    g.lineTo(x + w - 10, y);
    g.arcTo(x + w, y, x + w, y + 10, 10);
    g.lineTo(x + w, y + accentLen);
    g.stroke({ color: glowColor, width: 2, alpha: 0.7 });
    // Bottom left
    g.moveTo(x, y + h - accentLen);
    g.lineTo(x, y + h - 10);
    g.arcTo(x, y + h, x + 10, y + h, 10);
    g.lineTo(x + accentLen, y + h);
    g.stroke({ color: glowColor, width: 2, alpha: 0.7 });
    // Bottom right
    g.moveTo(x + w - accentLen, y + h);
    g.lineTo(x + w - 10, y + h);
    g.arcTo(x + w, y + h, x + w, y + h - 10, 10);
    g.lineTo(x + w, y + h - accentLen);
    g.stroke({ color: glowColor, width: 2, alpha: 0.7 });
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
    if (this.onRestart) this.onRestart();
  }

  open(points: number, _nextLevel: number, currentHP?: number, maxHP?: number, _inventory?: InventoryState): void {
    this.isOpen = true;
    this.container.visible = true;
    this.playerAtFullHealth = currentHP !== undefined && maxHP !== undefined && currentHP >= maxHP;

    this.updateDisplay(points);
  }

  close(): void {
    this.isOpen = false;
    this.container.visible = false;

    // Clear animations
    for (const anim of this.pointAnimations) {
      this.contentContainer.removeChild(anim.text);
    }
    this.pointAnimations = [];
  }

  isShopOpen(): boolean {
    return this.isOpen;
  }

  updateDisplay(points: number, currentHP?: number, maxHP?: number): void {
    const w = window.innerWidth;
    const h = window.innerHeight;

    if (currentHP !== undefined && maxHP !== undefined) {
      this.playerAtFullHealth = currentHP >= maxHP;
    }

    // Dark background overlay (semi-transparent to see HUD)
    this.background.clear();
    this.background.rect(0, 0, w, h);
    this.background.fill({ color: 0x000000, alpha: 0.7 });

    // Calculate shop panel size (centered, fits 5 items per row)
    const itemsPerRow = 5;
    const panelPadding = 30;
    const headerHeight = 80;
    const rowHeight = this.SLOT_SIZE + 14;
    const numRows = 3; // weapons, permanent, consumables
    const buttonHeight = 70;

    const panelWidth = itemsPerRow * this.SLOT_SIZE + (itemsPerRow - 1) * this.SLOT_GAP + panelPadding * 2;
    const panelHeight = headerHeight + numRows * rowHeight + buttonHeight + panelPadding;
    const panelX = (w - panelWidth) / 2;
    const panelY = (h - panelHeight) / 2;

    // Draw futuristic shop panel
    this.shopPanel.clear();
    this.drawFuturisticPanel(this.shopPanel, panelX, panelY, panelWidth, panelHeight);

    // Position title
    this.titleText.x = w / 2;
    this.titleText.y = panelY + 14;

    // Position points
    this.pointsText.text = `${points} PTS`;
    this.pointsText.x = w / 2;
    this.pointsText.y = panelY + 46;

    // Clear old elements
    for (const btn of this.upgradeButtons) {
      this.contentContainer.removeChild(btn);
    }
    for (const label of this.sectionLabels) {
      this.contentContainer.removeChild(label);
    }
    this.upgradeButtons = [];
    this.sectionLabels = [];

    // Group upgrades
    const weapons = this.upgrades.filter(u => u.type === 'weapon');
    const permanent = this.upgrades.filter(u => u.type === 'permanent');
    const consumables = this.upgrades.filter(u => u.type === 'consumable');

    // Draw rows
    const contentStartY = panelY + headerHeight;
    const contentCenterX = w / 2;

    this.drawItemsRowCentered(weapons, points, contentCenterX, contentStartY);
    this.drawItemsRowCentered(permanent, points, contentCenterX, contentStartY + rowHeight);
    this.drawItemsRowCentered(consumables, points, contentCenterX, contentStartY + rowHeight * 2);

    // Position continue button
    this.closeButton.x = w / 2 - 100;
    this.closeButton.y = panelY + panelHeight - buttonHeight - 10;
  }

  private drawItemsRowCentered(items: Upgrade[], points: number, centerX: number, startY: number): void {
    const totalWidth = items.length * this.SLOT_SIZE + (items.length - 1) * this.SLOT_GAP;
    const startX = centerX - totalWidth / 2;

    items.forEach((upgrade, index) => {
      const x = startX + index * (this.SLOT_SIZE + this.SLOT_GAP);
      const y = startY;

      const canAfford = points >= upgrade.cost;
      const maxedOut = upgrade.maxPurchases !== undefined && upgrade.purchased >= upgrade.maxPurchases;
      const healthPackUnavailable = upgrade.id === 'healthpack' && this.playerAtFullHealth;
      const available = canAfford && !maxedOut && !healthPackUnavailable;

      const slot = this.createItemSlot(upgrade, x, y, available, maxedOut, healthPackUnavailable);
      this.upgradeButtons.push(slot);
      this.contentContainer.addChild(slot);
    });
  }

  private createItemSlot(upgrade: Upgrade, x: number, y: number, available: boolean, maxedOut: boolean, fullHealth: boolean): Container {
    const slot = new Container();
    slot.x = x;
    slot.y = y;
    (slot as any).upgradeId = upgrade.id;
    (slot as any).available = available;

    // Futuristic slot background
    const bg = new Graphics();
    const glowColor = maxedOut ? 0x44ff44 : (available ? 0x44ffaa : 0x444444);

    // Outer glow
    bg.roundRect(-2, -2, this.SLOT_SIZE + 4, this.SLOT_SIZE + 4, 10);
    bg.fill({ color: glowColor, alpha: available ? 0.12 : 0.05 });

    // Main background
    bg.roundRect(0, 0, this.SLOT_SIZE, this.SLOT_SIZE, 8);
    bg.fill({ color: 0x0a1510, alpha: 0.95 });

    // Border
    bg.roundRect(0, 0, this.SLOT_SIZE, this.SLOT_SIZE, 8);
    bg.stroke({ color: glowColor, width: 1, alpha: available ? 0.5 : 0.2 });

    // Corner accents if available
    if (available || maxedOut) {
      const accentLen = 12;
      // Top left
      bg.moveTo(0, accentLen);
      bg.lineTo(0, 8);
      bg.arcTo(0, 0, 8, 0, 8);
      bg.lineTo(accentLen, 0);
      bg.stroke({ color: glowColor, width: 2, alpha: 0.6 });
      // Top right
      bg.moveTo(this.SLOT_SIZE - accentLen, 0);
      bg.lineTo(this.SLOT_SIZE - 8, 0);
      bg.arcTo(this.SLOT_SIZE, 0, this.SLOT_SIZE, 8, 8);
      bg.lineTo(this.SLOT_SIZE, accentLen);
      bg.stroke({ color: glowColor, width: 2, alpha: 0.6 });
    }
    slot.addChild(bg);

    // Item sprite
    const texture = upgrade.sprite ? this.loadedTextures.get(upgrade.sprite) : null;
    const spriteSize = this.SLOT_SIZE * 0.45;
    const spriteY = 18;

    if (texture) {
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 0.5);
      const scale = Math.min(spriteSize / sprite.width, spriteSize / sprite.height);
      sprite.scale.set(scale);
      sprite.x = this.SLOT_SIZE / 2;
      sprite.y = spriteY + spriteSize / 2;
      sprite.alpha = available ? 1 : 0.35;
      slot.addChild(sprite);
    }

    // Item name
    const nameStyle = new TextStyle({
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: 14,
      fill: available ? 0x44ffaa : 0x555555,
      fontWeight: 'bold',
      align: 'center',
    });
    const nameText = new Text({ text: upgrade.shortName, style: nameStyle });
    nameText.anchor.set(0.5, 0);
    nameText.x = this.SLOT_SIZE / 2;
    nameText.y = spriteY + spriteSize + 6;
    slot.addChild(nameText);

    // Description
    const descStyle = new TextStyle({
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: 11,
      fill: available ? 0x88ccaa : 0x444444,
      align: 'center',
      wordWrap: true,
      wordWrapWidth: this.SLOT_SIZE - 16,
    });
    const descText = new Text({ text: upgrade.description, style: descStyle });
    descText.anchor.set(0.5, 0);
    descText.x = this.SLOT_SIZE / 2;
    descText.y = spriteY + spriteSize + 24;
    slot.addChild(descText);

    // Cost badge (top-right)
    const costBadgeWidth = 50;
    const costBadgeHeight = 22;
    const costBg = new Graphics();
    costBg.roundRect(this.SLOT_SIZE - costBadgeWidth - 8, 8, costBadgeWidth, costBadgeHeight, 4);

    if (maxedOut || fullHealth) {
      costBg.fill({ color: 0x227722, alpha: 0.9 });
      costBg.stroke({ color: 0x44ff44, width: 1, alpha: 0.5 });
    } else {
      costBg.fill({ color: available ? 0x554400 : 0x222211, alpha: 0.9 });
      costBg.stroke({ color: available ? 0xffcc44 : 0x444433, width: 1, alpha: 0.5 });
    }
    slot.addChild(costBg);

    const costStyle = new TextStyle({
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: 12,
      fill: available || maxedOut || fullHealth ? 0xffffff : 0x555555,
      fontWeight: 'bold',
    });
    const costLabel = maxedOut ? 'MAX' : (fullHealth ? 'FULL' : `${upgrade.cost}`);
    const costText = new Text({ text: costLabel, style: costStyle });
    costText.anchor.set(0.5, 0.5);
    costText.x = this.SLOT_SIZE - costBadgeWidth / 2 - 8;
    costText.y = 8 + costBadgeHeight / 2;
    slot.addChild(costText);

    // Purchase count (top-left)
    if (upgrade.maxPurchases !== undefined && upgrade.maxPurchases > 1) {
      const countBadgeWidth = 40;
      const countBadgeHeight = 22;
      const countBg = new Graphics();
      countBg.roundRect(8, 8, countBadgeWidth, countBadgeHeight, 4);
      countBg.fill({ color: 0x1a1a1a, alpha: 0.9 });
      countBg.stroke({ color: upgrade.purchased > 0 ? 0x44ffaa : 0x444444, width: 1, alpha: 0.5 });
      slot.addChild(countBg);

      const countStyle = new TextStyle({
        fontFamily: 'Consolas, Monaco, monospace',
        fontSize: 11,
        fill: upgrade.purchased > 0 ? 0x44ffaa : 0x666666,
        fontWeight: 'bold',
      });
      const countText = new Text({ text: `${upgrade.purchased}/${upgrade.maxPurchases}`, style: countStyle });
      countText.anchor.set(0.5, 0.5);
      countText.x = 8 + countBadgeWidth / 2;
      countText.y = 8 + countBadgeHeight / 2;
      slot.addChild(countText);
    }

    // Make interactive
    slot.eventMode = 'static';
    slot.cursor = available ? 'pointer' : 'default';

    if (available) {
      slot.on('pointerover', () => slot.scale.set(1.05));
      slot.on('pointerout', () => slot.scale.set(1));
      slot.on('pointerdown', () => {
        this.purchaseUpgrade(upgrade, x + this.SLOT_SIZE / 2, y);
      });
    }

    return slot;
  }

  private purchaseUpgrade(upgrade: Upgrade, animX: number, animY: number): void {
    const cost = upgrade.cost;
    upgrade.purchased++;

    this.showPointSubtraction(cost, animX, animY);
    this.onPurchase(upgrade);
  }

  private showPointSubtraction(amount: number, x: number, y: number): void {
    const style = new TextStyle({
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: 24,
      fill: 0xff6644,
      fontWeight: 'bold',
    });

    const text = new Text({ text: `-${amount}`, style });
    text.anchor.set(0.5, 0.5);
    text.x = x;
    text.y = y;
    this.contentContainer.addChild(text);

    this.pointAnimations.push({
      text,
      startTime: Date.now(),
      startY: y,
    });

    const animate = () => {
      for (let i = this.pointAnimations.length - 1; i >= 0; i--) {
        const anim = this.pointAnimations[i];
        const animElapsed = Date.now() - anim.startTime;
        const duration = 1000;

        if (animElapsed >= duration) {
          this.contentContainer.removeChild(anim.text);
          this.pointAnimations.splice(i, 1);
        } else {
          const progress = animElapsed / duration;
          anim.text.y = anim.startY - 60 * progress;
          anim.text.alpha = 1 - progress;
        }
      }

      if (this.pointAnimations.length > 0 && this.isOpen) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
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
