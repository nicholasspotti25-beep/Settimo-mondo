/** Audio factory. The full synthesized SFX + generative music engine lives in src/audio/**. */
import type { AudioDirector } from '../app/interfaces';

class SilentAudio implements AudioDirector {
  unlock(): void {}
  suspend(): void {}
  resume(): void {}
  setVolumes(): void {}
  onEvent(): void {}
  update(): void {}
  playUi(): void {}
}

export function createAudio(): AudioDirector {
  return new SilentAudio();
}
