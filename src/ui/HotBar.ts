import { Graphics, Container, Text, TextStyle, Sprite, Assets, Texture } from 'pixi.js';

export interface HotBarSlot {
  id: string;
  hotkey: string;
  label: string;
  type: 'weapon' | 'gadget' | 'utility';
  count?: number;
  owned: boolean;
  active?: boolean;
  sprite?: string; // Path to sprite image
}

export class HotBar {
  private container: Container;
  private backgroundPanel: Graphics;
  private slots: Container[] = [];
  private slotSize = 70;
  private slotGap = 10;
  private sectionGap = 24;
  private loadedTextures: Map<string, Texture> = new Map();

  constructor() {
    this.container = new Container();

    // Background panel
    this.backgroundPanel = new Graphics();
    this.container.addChild(this.backgroundPanel);

    // Preload weapon sprites
    this.preloadSprites();
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

  getContainer(): Container {
    return this.container;
  }

  update(slotData: HotBarSlot[]): void {
    // Clear existing slots
    for (const slot of this.slots) {
      this.container.removeChild(slot);
    }
    this.slots = [];

    const weapons = slotData.filter(s => s.type === 'weapon');
    const gadgets = slotData.filter(s => s.type === 'gadget');
    const utilities = slotData.filter(s => s.type === 'utility');

    // Calculate total width
    const weaponWidth = weapons.length * this.slotSize + (weapons.length - 1) * this.slotGap;
    const gadgetWidth = gadgets.length * this.slotSize + (gadgets.length - 1) * this.slotGap;
    const utilityWidth = utilities.length * this.slotSize + (utilities.length - 1) * this.slotGap;
    const totalWidth = weaponWidth + this.sectionGap + gadgetWidth + this.sectionGap + utilityWidth;

    // Position container at bottom center
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    const panelPadding = 12;
    const panelWidth = totalWidth + panelPadding * 2;
    const panelHeight = this.slotSize + panelPadding * 2;

    this.container.x = (screenWidth - panelWidth) / 2;
    this.container.y = screenHeight - panelHeight - 10;

    // Draw background panel (matching title screen style)
    this.backgroundPanel.clear();
    this.backgroundPanel.roundRect(0, 0, panelWidth, panelHeight, 8);
    this.backgroundPanel.fill({ color: 0x000000, alpha: 0.7 });
    this.backgroundPanel.stroke({ color: 0xffaa00, width: 1, alpha: 0.6 });

    let xOffset = panelPadding;

    // Draw weapons section
    for (let i = 0; i < weapons.length; i++) {
      const slot = this.createSlot(weapons[i], xOffset, panelPadding);
      this.slots.push(slot);
      this.container.addChild(slot);
      xOffset += this.slotSize + this.slotGap;
    }

    xOffset += this.sectionGap - this.slotGap;

    // Draw gadgets section
    for (let i = 0; i < gadgets.length; i++) {
      const slot = this.createSlot(gadgets[i], xOffset, panelPadding);
      this.slots.push(slot);
      this.container.addChild(slot);
      xOffset += this.slotSize + this.slotGap;
    }

    xOffset += this.sectionGap - this.slotGap;

    // Draw utilities section
    for (let i = 0; i < utilities.length; i++) {
      const slot = this.createSlot(utilities[i], xOffset, panelPadding);
      this.slots.push(slot);
      this.container.addChild(slot);
      xOffset += this.slotSize + this.slotGap;
    }
  }

  private createSlot(data: HotBarSlot, x: number, y: number): Container {
    const slot = new Container();
    slot.x = x;
    slot.y = y;

    // Background with matching style
    const bg = new Graphics();
    bg.roundRect(0, 0, this.slotSize, this.slotSize, 6);

    // Colors based on state
    let borderColor: number;
    let borderAlpha: number;

    if (data.active) {
      bg.fill({ color: 0x1a3a1a, alpha: 0.9 });
      borderColor = 0x66ff66;
      borderAlpha = 1;
    } else if (!data.owned || (data.count !== undefined && data.count <= 0)) {
      bg.fill({ color: 0x111111, alpha: 0.6 });
      borderColor = 0x444444;
      borderAlpha = 0.5;
    } else {
      bg.fill({ color: 0x1a1a1a, alpha: 0.8 });
      borderColor = 0x888888;
      borderAlpha = 0.6;
    }

    bg.stroke({ color: borderColor, width: 2, alpha: borderAlpha });
    slot.addChild(bg);

    // Add weapon sprite if available
    const texture = this.loadedTextures.get(data.id);
    if (texture && data.owned) {
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 0.5);
      // Scale sprite to fit in slot - 2x bigger
      const maxSize = this.slotSize - 16;
      const scale = Math.min(maxSize / sprite.width, maxSize / sprite.height) * 1.6;
      sprite.scale.set(scale);
      sprite.x = this.slotSize / 2;
      sprite.y = this.slotSize / 2 - 2;
      sprite.alpha = data.active ? 1 : 0.7;
      slot.addChild(sprite);
    }

    // Hotkey label (top-left corner badge)
    const hotkeyBg = new Graphics();
    hotkeyBg.roundRect(3, 3, 22, 20, 4);
    hotkeyBg.fill({ color: data.active ? 0xffaa00 : 0x333333, alpha: 0.9 });
    slot.addChild(hotkeyBg);

    const hotkeyStyle = new TextStyle({
      fontFamily: 'Arial Black, sans-serif',
      fontSize: 13,
      fill: data.active ? 0x000000 : 0xcccccc,
      fontWeight: 'bold',
    });
    const hotkeyText = new Text({ text: data.hotkey, style: hotkeyStyle });
    hotkeyText.x = 14;
    hotkeyText.y = 13;
    hotkeyText.anchor.set(0.5, 0.5);
    slot.addChild(hotkeyText);

    // Item label (center-bottom)
    const labelStyle = new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: 11,
      fill: data.owned ? 0xffffff : 0x666666,
      fontWeight: 'bold',
      align: 'center',
      dropShadow: {
        color: 0x000000,
        blur: 2,
        distance: 1,
      },
    });
    const labelText = new Text({ text: data.label, style: labelStyle });
    labelText.anchor.set(0.5, 1);
    labelText.x = this.slotSize / 2;
    labelText.y = this.slotSize - 5;
    slot.addChild(labelText);

    // Count (bottom-right) for items with quantities
    if (data.count !== undefined) {
      const countBg = new Graphics();
      countBg.roundRect(this.slotSize - 26, this.slotSize - 22, 24, 20, 4);
      countBg.fill({ color: data.count > 0 ? 0x227722 : 0x442222, alpha: 0.9 });
      slot.addChild(countBg);

      const countStyle = new TextStyle({
        fontFamily: 'Arial Black, sans-serif',
        fontSize: 13,
        fill: data.count > 0 ? 0x88ff88 : 0x886666,
        fontWeight: 'bold',
      });
      const countText = new Text({ text: `${data.count}`, style: countStyle });
      countText.anchor.set(0.5, 0.5);
      countText.x = this.slotSize - 14;
      countText.y = this.slotSize - 12;
      slot.addChild(countText);
    }

    return slot;
  }

  setVisible(visible: boolean): void {
    this.container.visible = visible;
  }
}
