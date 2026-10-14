/** Save storage: IndexedDB with a localStorage fallback, three slots plus a crash-safe "resume" snapshot. */
import { deserialize, serialize, type GameStateData } from '../sim/gamestate';

const DB = 'settimo-mondo';
const STORE = 'saves';
const LS_PREFIX = 'settimo-mondo.save.';

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export class SaveStore {
  private db: Promise<IDBDatabase | null> = openDb();

  async write(slot: number, state: GameStateData): Promise<void> {
    state.updated = Date.now();
    const text = serialize(state);
    try {
      localStorage.setItem(LS_PREFIX + slot, text);
    } catch {
      /* quota or private mode */
    }
    const db = await this.db;
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(text, `slot${slot}`);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  async read(slot: number): Promise<GameStateData | null> {
    const db = await this.db;
    let text: string | null = null;
    if (db) {
      text = await new Promise<string | null>((resolve) => {
        try {
          const tx = db.transaction(STORE, 'readonly');
          const req = tx.objectStore(STORE).get(`slot${slot}`);
          req.onsuccess = () => resolve((req.result as string) ?? null);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
    }
    if (!text) {
      try {
        text = localStorage.getItem(LS_PREFIX + slot);
      } catch {
        text = null;
      }
    }
    if (!text) return null;
    try {
      return deserialize(text);
    } catch {
      return null;
    }
  }

  async remove(slot: number): Promise<void> {
    try {
      localStorage.removeItem(LS_PREFIX + slot);
    } catch {
      /* ignore */
    }
    const db = await this.db;
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(`slot${slot}`);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  async list(): Promise<(GameStateData | null)[]> {
    return Promise.all([0, 1, 2].map((s) => this.read(s)));
  }

  /** Ask the browser not to evict our storage. */
  static async requestPersistence(): Promise<boolean> {
    try {
      if (navigator.storage?.persist) return await navigator.storage.persist();
    } catch {
      /* ignore */
    }
    return false;
  }
}
