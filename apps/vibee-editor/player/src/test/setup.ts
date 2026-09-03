// Deterministic storage for Node 22+/jsdom. Node's experimental global
// localStorage can be present but unavailable without --localstorage-file;
// tests must never inherit that host-dependent state.
const memoryStorage = new Map<string, string>()
const testStorage: Storage = {
  get length() {
    return memoryStorage.size
  },
  clear() {
    memoryStorage.clear()
  },
  getItem(key) {
    return memoryStorage.get(String(key)) ?? null
  },
  key(index) {
    return [...memoryStorage.keys()][index] ?? null
  },
  removeItem(key) {
    memoryStorage.delete(String(key))
  },
  setItem(key, value) {
    memoryStorage.set(String(key), String(value))
  },
}

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: testStorage,
})
