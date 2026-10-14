import contentJson from '../src/generated/content.json';
import { setContent, type Content } from '../src/core/content';
import type { ContentBundle } from '../src/core/types';
import { Sim } from '../src/sim/sim';
import { emptyInput, type PlayerInput } from '../src/sim/types';
import { BEHAVIORS } from '../src/generated/registry.sim';

let c: Content | null = null;
export function loadContent(): Content {
  if (!c) c = setContent(contentJson as unknown as ContentBundle);
  return c;
}

export function makeSim(seed = 1): Sim {
  return new Sim(loadContent(), { behaviors: BEHAVIORS, seed, headless: true });
}

export function run(sim: Sim, seconds: number, input: (sim: Sim) => PlayerInput = () => emptyInput()): void {
  const steps = Math.round(seconds / sim.dt);
  for (let i = 0; i < steps; i++) sim.step(input(sim));
}

export function press(btn: number, base: PlayerInput = emptyInput()): PlayerInput {
  return { ...base, presses: btn };
}
