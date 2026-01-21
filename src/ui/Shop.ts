import { Graphics, Container, Text, TextStyle } from 'pixi.js';

export interface Upgrade {
  id: string;
  name: string;
  description: string;
  cost: number;
  type: 'permanent' | 'consumable' | 'weapon';
  maxPurchases?: number;
  purchased: number;
}

export interface ShopPurchase {
  upgradeId: string;
}

type PurchaseCallback = (upgrade: Upgrade) => void;
type RestartCallback = () => void;

export class Shop {
  private container: Container;
  private background: Graphics;
  private headerPanel: Graphics;
  private titleText: Text;
  private pointsText: Text;
  private levelText: Text;
  private upgradeButtons: Container[] = [];
  private sectionLabels: Text[] = [];
  private sectionPanels: Graphics[] = [];
  private closeButton: Container;
  private restartButton: Container;
  private purchaseNotification: Container;
  private purchaseText: Text;
  private purchaseTimeout: number | null = null;

  private upgrades: Upgrade[] = [];
  private onPurchase: PurchaseCallback;
  private onRestart: RestartCallback | null = null;
  private isOpen = false;
  private playerAtFullHealth = false;

  // Item slot size (1:1 aspect ratio for images)
  private readonly SLOT_SIZE = 80;
  private readonly SLOT_GAP = 10;

  constructor(onPurchase: PurchaseCallback) {
    this.onPurchase = onPurchase;
    this.container = new Container();
    this.container.visible = false;

    // Semi-transparent background
    this.background = new Graphics();
    this.container.addChild(this.background);

    // Header panel
    this.headerPanel = new Graphics();
    this.container.addChild(this.headerPanel);

    // Title
    const titleStyle = new TextStyle({
      fontFamily: 'Arial Black, Impact, sans-serif',
      fontSize: 36,
      fill: 0xffdd44,
      fontWeight: 'bold',
      letterSpacing: 4,
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
      fontSize: 16,
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
      fontSize: 22,
      fill: 0xffaa00,
      fontWeight: 'bold',
      dropShadow: {
        color: 0x000000,
        blur: 2,
        distance: 1,
      },
    });
    this.pointsText = new Text({ text: '0 PTS', style: pointsStyle });
    this.container.addChild(this.pointsText);

    // Close button
    this.closeButton = this.createActionButton('CONTINUE', 0x44aa44, 0x66ff66);
    this.container.addChild(this.closeButton);

    // Main Menu button
    this.restartButton = this.createActionButton('MAIN MENU', 0x3366aa, 0x6699ff);
    this.container.addChild(this.restartButton);

    // Purchase notification
    this.purchaseNotification = new Container();
    this.purchaseNotification.visible = false;
    const notifBg = new Graphics();
    notifBg.roundRect(0, 0, 280, 45, 6);
    notifBg.fill({ color: 0x227722, alpha: 0.95 });
    notifBg.stroke({ color: 0x66ff66, width: 1 });
    this.purchaseNotification.addChild(notifBg);
    const notifStyle = new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: 16,
      fill: 0xffffff,
      fontWeight: 'bold',
    });
    this.purchaseText = new Text({ text: '', style: notifStyle });
    this.purchaseText.x = 140;
    this.purchaseText.y = 22;
    this.purchaseText.anchor.set(0.5, 0.5);
    this.purchaseNotification.addChild(this.purchaseText);
    this.container.addChild(this.purchaseNotification);

    // Initialize upgrades
    this.initializeUpgrades();
  }

  private initializeUpgrades(): void {
    this.upgrades = [
      // Weapons (one-time purchase each)
      { id: 'rifle', name: 'Rifle', description: 'Fast fire rate', cost: 500, type: 'weapon', maxPurchases: 1, purchased: 0 },
      { id: 'shotgun', name: 'Shotgun', description: '5 pellet spread', cost: 400, type: 'weapon', maxPurchases: 1, purchased: 0 },
      { id: 'gatling', name: 'Gatling', description: 'Insane fire rate', cost: 1000, type: 'weapon', maxPurchases: 1, purchased: 0 },
      { id: 'scythe', name: 'Scythe', description: '360° melee', cost: 800, type: 'weapon', maxPurchases: 1, purchased: 0 },

      // Permanent upgrades
      { id: 'firerate', name: 'Fire Rate', description: '+20% speed', cost: 350, type: 'permanent', maxPurchases: 5, purchased: 0 },
      { id: 'bulletdamage', name: 'Damage', description: '+15% damage', cost: 300, type: 'permanent', maxPurchases: 5, purchased: 0 },
      { id: 'maxhp', name: 'Max HP', description: '+25 HP', cost: 200, type: 'permanent', maxPurchases: 5, purchased: 0 },
      { id: 'speed', name: 'Speed', description: '+15% move', cost: 250, type: 'permanent', maxPurchases: 4, purchased: 0 },
      { id: 'torch', name: 'Light', description: '+30% radius', cost: 150, type: 'permanent', maxPurchases: 4, purchased: 0 },

      // Consumables
      { id: 'healthpack', name: 'Health', description: '+30 HP', cost: 100, type: 'consumable', purchased: 0 },
      { id: 'lantern', name: 'Lantern', description: '+1 lantern', cost: 75, type: 'consumable', purchased: 0 },
      { id: 'flare', name: 'Flare', description: '+1 flare', cost: 50, type: 'consumable', purchased: 0 },
      { id: 'shovel', name: 'Shovel', description: 'Teleport [4]', cost: 200, type: 'consumable', purchased: 0 },
      { id: 'gravitybomb', name: 'G-Bomb', description: 'Explode [5]', cost: 250, type: 'consumable', purchased: 0 },
    ];
  }

  private createActionButton(text: string, color: number, glowColor: number): Container {
    const btn = new Container();
    const width = 160;
    const height = 45;

    const glow = new Graphics();
    glow.roundRect(-3, -3, width + 6, height + 6, 10);
    glow.fill({ color: glowColor, alpha: 0.25 });
    btn.addChild(glow);

    const bg = new Graphics();
    bg.roundRect(0, 0, width, height, 6);
    bg.fill(color);
    bg.stroke({ color: glowColor, width: 2 });
    btn.addChild(bg);

    const style = new TextStyle({
      fontFamily: 'Arial Black, sans-serif',
      fontSize: 16,
      fill: 0xffffff,
      fontWeight: 'bold',
      letterSpacing: 1,
    });
    const label = new Text({ text, style });
    label.x = width / 2 - label.width / 2;
    label.y = height / 2 - label.height / 2;
    btn.addChild(label);

    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.on('pointerover', () => btn.scale.set(1.03));
    btn.on('pointerout', () => btn.scale.set(1));

    return btn;
  }

  getContainer(): Container {
    return this.container;
  }

  setRestartCallback(callback: RestartCallback): void {
    this.onRestart = callback;
  }

  triggerRestart(): void {
    if (this.onRestart) {
      this.onRestart();
    }
  }

  open(points: number, nextLevel: number, currentHP?: number, maxHP?: number): void {
    this.isOpen = true;
    this.container.visible = true;
    this.playerAtFullHealth = currentHP !== undefined && maxHP !== undefined && currentHP >= maxHP;

    const w = window.innerWidth;
    const h = window.innerHeight;

    // Dark background
    this.background.clear();
    this.background.rect(0, 0, w, h);
    this.background.fill({ color: 0x000000, alpha: 0.85 });

    // Header panel
    const headerWidth = 400;
    const headerHeight = 90;
    this.headerPanel.clear();
    this.headerPanel.roundRect(w / 2 - headerWidth / 2, 15, headerWidth, headerHeight, 8);
    this.headerPanel.fill({ color: 0x000000, alpha: 0.7 });
    this.headerPanel.stroke({ color: 0xffaa00, width: 1, alpha: 0.6 });

    // Position header elements
    this.titleText.x = w / 2 - this.titleText.width / 2;
    this.titleText.y = 25;

    this.levelText.text = `Next Level: ${nextLevel}`;
    this.levelText.x = w / 2 - this.levelText.width / 2;
    this.levelText.y = 68;

    this.pointsText.x = w / 2 + headerWidth / 2 - this.pointsText.width - 20;
    this.pointsText.y = 25;

    // Button positions
    this.closeButton.x = w / 2 - 175;
    this.closeButton.y = h - 65;

    this.restartButton.x = w / 2 + 15;
    this.restartButton.y = h - 65;

    this.updateDisplay(points);
  }

  close(): void {
    this.isOpen = false;
    this.container.visible = false;
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

    const startY = 120;
    let currentY = startY;

    // Draw each section
    currentY = this.drawSection('WEAPONS', weapons, points, w, currentY, 0xaa66ff);
    currentY = this.drawSection('UPGRADES', permanent, points, w, currentY + 15, 0xffaa66);
    currentY = this.drawSection('ITEMS', consumables, points, w, currentY + 15, 0x66ffaa);
  }

  private drawSection(title: string, items: Upgrade[], points: number, screenWidth: number, startY: number, accentColor: number): number {
    const sectionWidth = items.length * this.SLOT_SIZE + (items.length - 1) * this.SLOT_GAP + 40;
    const sectionX = (screenWidth - sectionWidth) / 2;

    // Section panel
    const panel = new Graphics();
    panel.roundRect(sectionX, startY, sectionWidth, this.SLOT_SIZE + 60, 8);
    panel.fill({ color: 0x000000, alpha: 0.6 });
    panel.stroke({ color: accentColor, width: 1, alpha: 0.5 });
    this.container.addChild(panel);
    this.sectionPanels.push(panel);

    // Section label
    const labelStyle = new TextStyle({
      fontFamily: 'Arial Black, sans-serif',
      fontSize: 12,
      fill: accentColor,
      fontWeight: 'bold',
      letterSpacing: 2,
    });
    const label = new Text({ text: title, style: labelStyle });
    label.x = sectionX + 15;
    label.y = startY + 8;
    this.container.addChild(label);
    this.sectionLabels.push(label);

    // Draw item slots
    const itemsStartX = sectionX + 20;
    const itemsStartY = startY + 30;

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

    return startY + this.SLOT_SIZE + 60;
  }

  private createItemSlot(upgrade: Upgrade, x: number, y: number, available: boolean, maxedOut: boolean, fullHealth: boolean, accentColor: number): Container {
    const slot = new Container();
    slot.x = x;
    slot.y = y;
    (slot as any).upgradeId = upgrade.id;
    (slot as any).available = available;

    // Slot background (1:1 aspect ratio)
    const bg = new Graphics();
    bg.roundRect(0, 0, this.SLOT_SIZE, this.SLOT_SIZE, 6);

    let bgAlpha = 0.8;
    let borderColor = accentColor;
    let borderAlpha = 0.6;

    if (maxedOut) {
      bg.fill({ color: 0x222222, alpha: 0.9 });
      borderColor = 0x44aa44;
      borderAlpha = 1;
    } else if (!available) {
      bg.fill({ color: 0x111111, alpha: 0.6 });
      borderColor = 0x444444;
      borderAlpha = 0.4;
    } else {
      bg.fill({ color: 0x1a1a1a, alpha: bgAlpha });
    }

    bg.stroke({ color: borderColor, width: 2, alpha: borderAlpha });
    slot.addChild(bg);

    // Image placeholder area (center of slot - will be replaced with actual images later)
    const imgArea = new Graphics();
    const imgSize = this.SLOT_SIZE - 24;
    imgArea.roundRect((this.SLOT_SIZE - imgSize) / 2, 6, imgSize, imgSize - 10, 4);
    imgArea.fill({ color: 0x222222, alpha: 0.5 });
    slot.addChild(imgArea);

    // Item name (bottom)
    const nameStyle = new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: 9,
      fill: available ? 0xffffff : 0x666666,
      fontWeight: 'bold',
      align: 'center',
    });
    const nameText = new Text({ text: upgrade.name, style: nameStyle });
    nameText.anchor.set(0.5, 1);
    nameText.x = this.SLOT_SIZE / 2;
    nameText.y = this.SLOT_SIZE - 3;
    slot.addChild(nameText);

    // Cost badge (top-right)
    const costBadgeWidth = 35;
    const costBg = new Graphics();
    costBg.roundRect(this.SLOT_SIZE - costBadgeWidth - 3, 3, costBadgeWidth, 14, 3);

    if (maxedOut) {
      costBg.fill({ color: 0x227722, alpha: 0.9 });
    } else if (fullHealth) {
      costBg.fill({ color: 0x227722, alpha: 0.9 });
    } else {
      costBg.fill({ color: available ? 0x886600 : 0x442200, alpha: 0.9 });
    }
    slot.addChild(costBg);

    const costStyle = new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: 9,
      fill: available || maxedOut || fullHealth ? 0xffffff : 0x888888,
      fontWeight: 'bold',
    });
    const costLabel = maxedOut ? 'MAX' : (fullHealth ? 'FULL' : `${upgrade.cost}`);
    const costText = new Text({ text: costLabel, style: costStyle });
    costText.anchor.set(0.5, 0.5);
    costText.x = this.SLOT_SIZE - costBadgeWidth / 2 - 3;
    costText.y = 10;
    slot.addChild(costText);

    // Purchase count for limited upgrades (bottom-left)
    if (upgrade.maxPurchases !== undefined && upgrade.maxPurchases > 1) {
      const countBg = new Graphics();
      countBg.roundRect(3, this.SLOT_SIZE - 17, 22, 14, 3);
      countBg.fill({ color: 0x333333, alpha: 0.9 });
      slot.addChild(countBg);

      const countStyle = new TextStyle({
        fontFamily: 'Arial, sans-serif',
        fontSize: 9,
        fill: 0xaaaaaa,
        fontWeight: 'bold',
      });
      const countText = new Text({ text: `${upgrade.purchased}/${upgrade.maxPurchases}`, style: countStyle });
      countText.x = 14;
      countText.y = this.SLOT_SIZE - 10;
      countText.anchor.set(0.5, 0.5);
      slot.addChild(countText);
    }

    // Make interactive
    slot.eventMode = 'static';
    slot.cursor = available ? 'pointer' : 'default';

    if (available) {
      slot.on('pointerover', () => {
        slot.scale.set(1.08);
        slot.y = y - 3;
      });
      slot.on('pointerout', () => {
        slot.scale.set(1);
        slot.y = y;
      });
      slot.on('pointerdown', () => {
        this.purchaseUpgrade(upgrade);
      });
    }

    return slot;
  }

  private purchaseUpgrade(upgrade: Upgrade): void {
    upgrade.purchased++;
    this.showPurchaseNotification(upgrade.name);
    this.onPurchase(upgrade);
  }

  private showPurchaseNotification(itemName: string): void {
    this.purchaseText.text = `Purchased ${itemName}!`;
    this.purchaseNotification.x = window.innerWidth / 2 - 140;
    this.purchaseNotification.y = window.innerHeight - 120;
    this.purchaseNotification.visible = true;
    this.purchaseNotification.alpha = 1;

    if (this.purchaseTimeout !== null) {
      clearTimeout(this.purchaseTimeout);
    }

    this.purchaseTimeout = window.setTimeout(() => {
      this.purchaseNotification.visible = false;
      this.purchaseTimeout = null;
    }, 1500);
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
