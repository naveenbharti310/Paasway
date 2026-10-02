const clone = (value) => value === undefined ? undefined : structuredClone(value);

class Snapshot {
  constructor(ref, value) { this.ref = ref; this.id = ref.id; this.exists = value !== undefined; this.value = clone(value); }
  data() { return clone(this.value); }
}
class Reference {
  constructor(db, path) { this.db = db; this.path = path; this.id = path.split('/').pop(); }
  collection(name) { return new Query(this.db, `${this.path}/${name}`); }
  async get() { const snap = new Snapshot(this, this.db.values.get(this.path)); this.db.afterRead?.(this.path); return snap; }
}
class Query {
  constructor(db, path, cap = Infinity, cursor = '') { this.db = db; this.path = path; this.cap = cap; this.cursor = cursor; }
  doc(id = `auto${String(++this.db.sequence).padStart(6, '0')}`) { return new Reference(this.db, `${this.path}/${id}`); }
  orderBy() { return this; }
  limit(cap) { return new Query(this.db, this.path, cap, this.cursor); }
  startAfter(snapshot) { return new Query(this.db, this.path, this.cap, snapshot.id); }
}
class MemoryFirestore {
  constructor() { this.values = new Map(); this.sequence = 0; this.queue = Promise.resolve(); this.pageWrites = []; }
  collection(name) { return new Query(this, name); }
  seed(path, data) { this.values.set(path, clone(data)); return this; }
  read(path) { return clone(this.values.get(path)); }
  async runTransaction(callback) {
    const previous = this.queue;
    let release;
    this.queue = new Promise((resolve) => { release = resolve; });
    await previous;
    const values = new Map([...this.values].map(([path, value]) => [path, clone(value)]));
    let writes = 0;
    const tx = {
      get: async (ref) => {
        if (writes) throw new Error('Transaction reads must precede writes.');
        if (ref instanceof Reference) return new Snapshot(ref, values.get(ref.path));
        const docs = [...values.entries()].filter(([path]) => path.startsWith(`${ref.path}/`) && path.slice(ref.path.length + 1).indexOf('/') === -1)
          .sort(([a], [b]) => a.localeCompare(b)).map(([path, data]) => new Snapshot(new Reference(this, path), data))
          .filter((snap) => snap.id > ref.cursor).slice(0, ref.cap);
        return { docs };
      },
      create: (ref, data) => { writes++; if (values.has(ref.path)) throw new Error('Document already exists.'); values.set(ref.path, clone(data)); },
      set: (ref, data) => { writes++; values.set(ref.path, clone(data)); },
      update: (ref, data) => { writes++; if (!values.has(ref.path)) throw new Error('Document does not exist.'); values.set(ref.path, { ...values.get(ref.path), ...clone(data) }); },
    };
    try {
      const result = await callback(tx);
      if (writes > 500) throw new Error('Write limit exceeded.');
      this.values = values;
      this.pageWrites.push(writes);
      return result;
    } finally { release(); }
  }
}
module.exports = { MemoryFirestore };
