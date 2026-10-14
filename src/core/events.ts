/** Minimal typed event bus used by app-level services (UI, audio, render). The sim emits plain event objects into a queue instead. */
export type Listener<T> = (payload: T) => void;

export class EventBus<Events extends Record<string, unknown>> {
  private listeners = new Map<keyof Events, Set<Listener<any>>>();

  on<K extends keyof Events>(type: K, fn: Listener<Events[K]>): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(fn);
    return () => set!.delete(fn);
  }

  once<K extends keyof Events>(type: K, fn: Listener<Events[K]>): () => void {
    const off = this.on(type, (p) => {
      off();
      fn(p);
    });
    return off;
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const fn of [...set]) fn(payload);
  }

  clear(): void {
    this.listeners.clear();
  }
}
