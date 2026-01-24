// Sound Manager for Last Light
// Handles loading and playing game sound effects

type SoundName =
  | 'pistol'
  | 'rifle'
  | 'shotgun'
  | 'gatling'
  | 'scythe'
  | 'scythe_hit'
  | 'enemy_hit'
  | 'enemy_killed'
  | 'player_hit'
  | 'teleport'
  | 'shockwave'
  | 'lantern';

class SoundManagerClass {
  private sounds: Map<SoundName, HTMLAudioElement> = new Map();
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;

    const soundFiles: Record<SoundName, string> = {
      pistol: '/pistol_sound.wav',
      rifle: '/rifle_sound.wav',
      shotgun: '/shotgun_sound.wav',
      gatling: '/gatling_soundwav.wav',
      scythe: '/scythe_sound.wav',
      scythe_hit: '/scyhte_hit_enemy_sound.wav',
      enemy_hit: '/enemy_hit_sound.wav',
      enemy_killed: '/enemy_killed_sound.wav',
      player_hit: '/player_hit_sound.wav',
      teleport: '/teleport_sound.wav',
      shockwave: '/shockwave_sound.wav',
      lantern: '/lantern_sound.wav',
    };

    const loadPromises = Object.entries(soundFiles).map(([name, path]) => {
      return new Promise<void>((resolve) => {
        const audio = new Audio(path);
        audio.preload = 'auto';
        audio.addEventListener('canplaythrough', () => resolve(), { once: true });
        audio.addEventListener('error', () => {
          console.warn(`Failed to load sound: ${path}`);
          resolve();
        });
        this.sounds.set(name as SoundName, audio);
      });
    });

    await Promise.all(loadPromises);
    this.loaded = true;
  }

  play(name: SoundName, volume = 0.5): void {
    const sound = this.sounds.get(name);
    if (!sound) return;

    // Clone the audio to allow overlapping sounds
    const clone = sound.cloneNode() as HTMLAudioElement;
    clone.volume = Math.max(0, Math.min(1, volume));
    clone.play().catch(() => {
      // Ignore autoplay errors
    });
  }
}

export const SoundManager = new SoundManagerClass();
