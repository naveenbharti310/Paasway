const clone = (value) => value === undefined ? undefined : structuredClone(value);

class Snapshot {
  constructor(ref, value) { this.ref = ref; this.id = ref.id; this.exists = value !== undefined; this.value = clone(value); }
  data() { return clone(this.value); }
}
class Reference {
  constructor(db, path) { this.db = db; this.path = path; this.id = path.split('/').pop(); }
  collection(name) { return new Query(this.db, `${this.path}/${name}`); }
  async get() { const snap = new Snapshot(this, this.db.values.get(this.path)); this.db.afterRead?.(this.path); return snap; }
  async delete() { this.db.values.delete(this.path); }
}
const OPS = { '==': (a, b) => a === b, '<': (a, b) => a < b, '>': (a, b) => a > b, '<=': (a, b) => a <= b, '>=': (a, b) => a >= b };
function list(db, values, query) {
  return [...values.entries()].filter(([path]) => path.startsWith(`${query.path}/`) && path.slice(query.path.length + 1).indexOf('/') === -1)
    .filter(([, data]) => query.filters.every(([field, op, value]) => OPS[op](data[field], value)))
    .sort(([a], [b]) => a.localeCompare(b)).map(([path, data]) => new Snapshot(new Reference(db, path), data))
    .filter((snap) => snap.id > query.cursor).slice(0, query.cap);
}
class Query {
  constructor(db, path, cap = Infinity, cursor = '', filters = []) { this.db = db; this.path = path; this.cap = cap; this.cursor = cursor; this.filters = filters; }
  where(field, op, value) { return new Query(this.db, this.path, this.cap, this.cursor, [...this.filters, [field, op, value]]); }
  async get() { const docs = list(this.db, this.db.values, this); return { docs, empty: docs.length === 0, size: docs.length }; }
  doc(id = `auto${String(++this.db.sequence).padStart(6, '0')}`) { return new Reference(this.db, `${this.path}/${id}`); }
  orderBy() { return this; }
  limit(cap) { return new Query(this.db, this.path, cap, this.cursor, this.filters); }
  startAfter(snapshot) { return new Query(this.db, this.path, this.cap, snapshot.id, this.filters); }
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
        return { docs: list(this, values, ref) };
      },
      create: (ref, data) => { writes++; if (values.has(ref.path)) throw new Error('Document already exists.'); values.set(ref.path, clone(data)); },
      set: (ref, data) => { writes++; values.set(ref.path, clone(data)); },
      delete: (ref) => { writes++; values.delete(ref.path); },
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
