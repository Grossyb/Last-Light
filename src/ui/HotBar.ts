import { Graphics, Container, Text, TextStyle, Sprite, Assets, Texture } from 'pixi.js';

export interface HotBarSlot {
  id: string;
  hotkey: string;
  label: string;
  count: number;
  sprite?: string;
}

export class HotBar {
  private container: Container;
  private backgroundPanel: Graphics;
  private slots: Container[] = [];
  private slotSize = 70;
  private slotGap = 12;
  private loadedTextures: Map<string, Texture> = new Map();

  constructor() {
    this.container = new Container();

    // Background panel
    this.backgroundPanel = new Graphics();
    this.container.addChild(this.backgroundPanel);

    // Preload sprites
    this.preloadSprites();
  }

  private async preloadSprites(): Promise<void> {
    try {
      const spriteMap: Record<string, string> = {
        'lantern': '/lantern_sprite.png',
        'flare': '/flare_sprite.png',
        'teleporter': '/teleporter_sprite.png',
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
      console.warn('Could not load hotbar sprites:', e);
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

    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    // Position flush with middle bottom of hull (charcoal area is ~88-97% of screen height)
    const charcoalTop = screenHeight * 0.88;
    const charcoalMidY = charcoalTop + (screenHeight * 0.045);

    const numSlots = slotData.length;
    const totalWidth = numSlots * this.slotSize + (numSlots - 1) * this.slotGap;
    const panelPadding = 16;
    const panelWidth = totalWidth + panelPadding * 2;
    const panelHeight = this.slotSize + panelPadding * 2;

    // Center horizontally
    const panelX = (screenWidth - panelWidth) / 2;
    const panelY = charcoalMidY - panelHeight / 2;

    this.container.x = panelX;
    this.container.y = panelY;

    // Draw futuristic background panel
    this.backgroundPanel.clear();

    // Outer glow
    this.backgroundPanel.roundRect(-2, -2, panelWidth + 4, panelHeight + 4, 12);
    this.backgroundPanel.fill({ color: 0x44ffaa, alpha: 0.08 });

    // Main background
    this.backgroundPanel.roundRect(0, 0, panelWidth, panelHeight, 10);
    this.backgroundPanel.fill({ color: 0x0a1a15, alpha: 0.92 });

    // Border
    this.backgroundPanel.roundRect(0, 0, panelWidth, panelHeight, 10);
    this.backgroundPanel.stroke({ color: 0x44ffaa, width: 1, alpha: 0.4 });

    // Corner accents
    const accentLen = 16;
    // Top left
    this.backgroundPanel.moveTo(0, accentLen);
    this.backgroundPanel.lineTo(0, 10);
    this.backgroundPanel.arcTo(0, 0, 10, 0, 10);
    this.backgroundPanel.lineTo(accentLen, 0);
    this.backgroundPanel.stroke({ color: 0x44ffaa, width: 2, alpha: 0.7 });
    // Top right
    this.backgroundPanel.moveTo(panelWidth - accentLen, 0);
    this.backgroundPanel.lineTo(panelWidth - 10, 0);
    this.backgroundPanel.arcTo(panelWidth, 0, panelWidth, 10, 10);
    this.backgroundPanel.lineTo(panelWidth, accentLen);
    this.backgroundPanel.stroke({ color: 0x44ffaa, width: 2, alpha: 0.7 });
    // Bottom left
    this.backgroundPanel.moveTo(0, panelHeight - accentLen);
    this.backgroundPanel.lineTo(0, panelHeight - 10);
    this.backgroundPanel.arcTo(0, panelHeight, 10, panelHeight, 10);
    this.backgroundPanel.lineTo(accentLen, panelHeight);
    this.backgroundPanel.stroke({ color: 0x44ffaa, width: 2, alpha: 0.7 });
    // Bottom right
    this.backgroundPanel.moveTo(panelWidth - accentLen, panelHeight);
    this.backgroundPanel.lineTo(panelWidth - 10, panelHeight);
    this.backgroundPanel.arcTo(panelWidth, panelHeight, panelWidth, panelHeight - 10, 10);
    this.backgroundPanel.lineTo(panelWidth, panelHeight - accentLen);
    this.backgroundPanel.stroke({ color: 0x44ffaa, width: 2, alpha: 0.7 });

    // Create slots
    for (let i = 0; i < numSlots; i++) {
      const slotX = panelPadding + i * (this.slotSize + this.slotGap);
      const slotY = panelPadding;
      const data = slotData[i];
      const slot = this.createSlot(data, slotX, slotY);
      this.slots.push(slot);
      this.container.addChild(slot);
    }
  }

  private createSlot(data: HotBarSlot, x: number, y: number): Container {
    const slot = new Container();
    slot.x = x;
    slot.y = y;

    const hasItem = data.count > 0;
    const glowColor = hasItem ? 0x44ffaa : 0x444444;

    // Slot background
    const bg = new Graphics();

    // Outer glow
    bg.roundRect(-2, -2, this.slotSize + 4, this.slotSize + 4, 8);
    bg.fill({ color: glowColor, alpha: hasItem ? 0.1 : 0.03 });

    // Main background
    bg.roundRect(0, 0, this.slotSize, this.slotSize, 6);
    bg.fill({ color: 0x0a1510, alpha: 0.95 });

    // Border
    bg.roundRect(0, 0, this.slotSize, this.slotSize, 6);
    bg.stroke({ color: glowColor, width: 1, alpha: hasItem ? 0.5 : 0.2 });

    // Corner accents if has item
    if (hasItem) {
      const accentLen = 10;
      // Top left
      bg.moveTo(0, accentLen);
      bg.lineTo(0, 6);
      bg.arcTo(0, 0, 6, 0, 6);
      bg.lineTo(accentLen, 0);
      bg.stroke({ color: glowColor, width: 2, alpha: 0.6 });
      // Top right
      bg.moveTo(this.slotSize - accentLen, 0);
      bg.lineTo(this.slotSize - 6, 0);
      bg.arcTo(this.slotSize, 0, this.slotSize, 6, 6);
      bg.lineTo(this.slotSize, accentLen);
      bg.stroke({ color: glowColor, width: 2, alpha: 0.6 });
    }
    slot.addChild(bg);

    // Item sprite
    const texture = this.loadedTextures.get(data.id);
    if (texture) {
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 0.5);
      const spriteSize = this.slotSize * 0.55;
      const scale = Math.min(spriteSize / sprite.width, spriteSize / sprite.height);
      sprite.scale.set(scale);
      sprite.x = this.slotSize / 2;
      sprite.y = this.slotSize / 2 - 4;
      sprite.alpha = hasItem ? 1 : 0.3;
      slot.addChild(sprite);
    }

    // Hotkey badge (top-left)
    const hotkeyBgSize = 20;
    const hotkeyBg = new Graphics();
    hotkeyBg.roundRect(4, 4, hotkeyBgSize, 16, 3);
    hotkeyBg.fill({ color: 0x1a1a1a, alpha: 0.9 });
    hotkeyBg.stroke({ color: hasItem ? 0x44ffaa : 0x444444, width: 1, alpha: 0.5 });
    slot.addChild(hotkeyBg);

    const hotkeyStyle = new TextStyle({
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: 11,
      fill: hasItem ? 0x44ffaa : 0x555555,
      fontWeight: 'bold',
    });
    const hotkeyText = new Text({ text: data.hotkey, style: hotkeyStyle });
    hotkeyText.anchor.set(0.5, 0.5);
    hotkeyText.x = 4 + hotkeyBgSize / 2;
    hotkeyText.y = 12;
    slot.addChild(hotkeyText);

    // Count badge (top-right)
    const countBgWidth = 22;
    const countBg = new Graphics();
    countBg.roundRect(this.slotSize - countBgWidth - 4, 4, countBgWidth, 16, 3);
    countBg.fill({ color: hasItem ? 0x1a2a1a : 0x1a1a1a, alpha: 0.9 });
    countBg.stroke({ color: hasItem ? 0x44ffaa : 0x444444, width: 1, alpha: 0.5 });
    slot.addChild(countBg);

    const countStyle = new TextStyle({
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: 11,
      fill: hasItem ? 0x44ffaa : 0x555555,
      fontWeight: 'bold',
    });
    const countText = new Text({ text: `${data.count}`, style: countStyle });
    countText.anchor.set(0.5, 0.5);
    countText.x = this.slotSize - countBgWidth / 2 - 4;
    countText.y = 12;
    slot.addChild(countText);

    // Label at bottom
    const labelStyle = new TextStyle({
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: 9,
      fill: hasItem ? 0x88ccaa : 0x444444,
      align: 'center',
    });
    const labelText = new Text({ text: data.label, style: labelStyle });
    labelText.anchor.set(0.5, 1);
    labelText.x = this.slotSize / 2;
    labelText.y = this.slotSize - 4;
    slot.addChild(labelText);

    return slot;
  }

  setVisible(visible: boolean): void {
    this.container.visible = visible;
  }
}
