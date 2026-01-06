// Charset final LS
const LS_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 #@<>{}[]+-*/";
const LS_TO_INDEX = new Int8Array(128).fill(-1);
for (let i = 0; i < LS_CHARSET.length; i++) {
  LS_TO_INDEX[LS_CHARSET.charCodeAt(i)] = i;
}

class LiteString {
  constructor(u8, jsString) {
    const len = jsString.length;

    // Allocate: 2 byte length + len bytes data
    const ptr = u8.n(2 + len);

    // write length
    u8.u16(ptr, len);

    // write data
    for (let i = 0; i < len; i++) {
      const c = jsString.charCodeAt(i);
      const idx = LS_TO_INDEX[c];
      if (idx === -1) throw new Error("Unsupported char: " + jsString[i]);
      u8.u8(ptr + 2 + i, idx);
    }

    this.u8 = u8;
    this.ptr = ptr;
    this.length = len;
  }

  // create LiteString dari pointer yang sudah ada
  static fromPtr(u8, ptr) {
    const len = u8.b[ptr] | (u8.b[ptr + 1] << 8);
    const ls = Object.create(LiteString.prototype);
    ls.u8 = u8;
    ls.ptr = ptr;
    ls.length = len;
    return ls;
  }

  // baca karakter i
  charAt(i) {
    return LS_CHARSET[this.u8.b[this.ptr + 2 + i]];
  }

  // convert ke JS string
  toString() {
    const len = this.length;
    let out = "";
    const b = this.u8.b;
    const base = this.ptr + 2;
    for (let i = 0; i < len; i++) {
      out += LS_CHARSET[b[base + i]];
    }
    return out;
  }

  // bandingkan dengan LiteString lain
  equals(other) {
    if (this.length !== other.length) return false;
    const b1 = this.u8.b;
    const b2 = other.u8.b;
    const base1 = this.ptr + 2;
    const base2 = other.ptr + 2;
    for (let i = 0; i < this.length; i++) {
      if (b1[base1 + i] !== b2[base2 + i]) return false;
    }
    return true;
  }

  // hash FNV-1a 32-bit
  hash() {
    let h = 2166136261;
    const b = this.u8.b;
    const base = this.ptr + 2;
    for (let i = 0; i < this.length; i++) {
      h ^= b[base + i];
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return h >>> 0;
  }
}

class ui8 {
  constructor(size = 1024) {
    this.b = new Uint8Array(size);
    this.t = 0; // top pointer
  }

  // allocate n bytes, return ptr
  n(n) {
    let t = this.t;
    let nt = t + n;

    if (nt > this.b.length) {
      // grow: next power of two
      let nl = this.b.length << 1;
      while (nl < nt) nl <<= 1;

      const nb = new Uint8Array(nl);
      nb.set(this.b);
      this.b = nb;
    }

    this.t = nt;
    return t;
  }

  // raw writes (INLINE HOT PATH)
  u8(p, v) {
    this.b[p] = v;
  }

  u16(p, v) {
    const b = this.b;
    b[p]     = v & 255;
    b[p + 1] = v >>> 8;
  }

  u32(p, v) {
    const b = this.b;
    b[p]     = v & 255;
    b[p + 1] = (v >>> 8) & 255;
    b[p + 2] = (v >>> 16) & 255;
    b[p + 3] = v >>> 24;
  }

  // bulk copy
  copy(p, src, len) {
    this.b.set(src.subarray(0, len), p);
  }
}

class SmallFloat {
  constructor(value = 0) {
    this.val = value; // simpan JS Number
  }

  // set value
  set(value) {
    this.val = value;
  }

  // get value
  get() {
    return this.val;
  }

  // encode ke 2 byte Q8.8
  toBytes() {
    let v = Math.round(this.val * 256); // Q8.8
    if (v < -32768) v = -32768;
    if (v > 32767) v = 32767;
    return Uint8Array.from([v & 0xFF, (v >> 8) & 0xFF]);
  }

  // decode dari 2 byte Q8.8
  static fromBytes(bytes) {
    let v = bytes[0] | (bytes[1] << 8);
    if (v & 0x8000) v -= 0x10000;
    return new SmallFloat(v / 256);
  }
}

class ConfObject {
  constructor(data = {}) {
    this.entries = []; // array [key, value]
    this.index = new Map(); // quick lookup key string -> value
    this.dataMap = data;
    
    for (const k in data) {
      const v = data[k];
      this.set(k, v);
    }
  }

  set(key, value) {
    this.entries.push([key, value]);
    this.index[key] = value;
  }

  get(key) {
    return this.index[key];
  }

  // relasional: resolve if value is id of another ConfObject
  resolve(key, objectsMap) {
    let val = this.get(key);
    if (typeof val === "string" && objectsMap && objectsMap[val]) {
      return objectsMap[val]; // return linked ConfObject
    }
    return val;
  }
}

class SuperUI8 {
  constructor(size = 1024) {
    this.buffer = new Uint8Array(size);
    this.length = 0; // jumlah byte terpakai
  }

  // pastikan buffer cukup panjang
  _ensure(add) {
    const need = this.length + add;
    if (need > this.buffer.length) {
      let newSize = this.buffer.length << 1;
      while (newSize < need) newSize <<= 1;
      const newBuf = new Uint8Array(newSize);
      newBuf.set(this.buffer);
      this.buffer = newBuf;
    }
  }

  // encode number > 255 ke base-256 dan push ke buffer
  push(num) {
    if (num < 0) throw new Error("Only non-negative numbers supported");
    const bytes = [];
    do {
      bytes.push(num & 0xFF);
      num >>= 8;
    } while (num > 0);

    this._ensure(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      this.buffer[this.length++] = bytes[i];
    }
    return this.length - bytes.length; // return start index
  }

  // decode number dari posisi tertentu, kembalikan {value, nextIndex}
  get(index) {
    let num = 0;
    let shift = 0;
    let i = index;
    while (i < this.length) {
      const byte = this.buffer[i++];
      num += byte << shift;
      shift += 8;
      if (byte < 255) break; // byte < 255 menandakan akhir angka
    }
    return { value: num, nextIndex: i };
  }

  // langsung set number di posisi tertentu (overwrite, optional)
  set(index, num) {
    const bytes = [];
    do {
      bytes.push(num & 0xFF);
      num >>= 8;
    } while (num > 0);

    for (let i = 0; i < bytes.length; i++) {
      this.buffer[index + i] = bytes[i];
    }
  }

  // optional: serialize buffer sampai length
  toBytes() {
    return this.buffer.slice(0, this.length);
  }

  // reset buffer
  clear() {
    this.length = 0;
  }
}

class Flags {
  constructor(initialSize = 1) {
    this.buffer = new Uint8Array(initialSize); // 1 byte = 8 flags
  }

  // pastikan buffer cukup besar
  _ensure(index) {
    const neededBytes = Math.floor(index / 8) + 1;
    if (neededBytes > this.buffer.length) {
      let newSize = this.buffer.length;
      while (newSize < neededBytes) newSize <<= 1;
      const newBuf = new Uint8Array(newSize);
      newBuf.set(this.buffer);
      this.buffer = newBuf;
    }
  }

  set(index) {
    this._ensure(index);
    const byteIndex = Math.floor(index / 8);
    const bitIndex = index % 8;
    this.buffer[byteIndex] |= (1 << bitIndex);
  }

  clear(index) {
    this._ensure(index);
    const byteIndex = Math.floor(index / 8);
    const bitIndex = index % 8;
    this.buffer[byteIndex] &= ~(1 << bitIndex);
  }

  toggle(index) {
    this._ensure(index);
    const byteIndex = Math.floor(index / 8);
    const bitIndex = index % 8;
    this.buffer[byteIndex] ^= (1 << bitIndex);
  }

  check(index) {
    this._ensure(index);
    const byteIndex = Math.floor(index / 8);
    const bitIndex = index % 8;
    return (this.buffer[byteIndex] & (1 << bitIndex)) !== 0;
  }

  clearAll() {
    this.buffer.fill(0);
  }

  // serialize ke bytes
  toBytes() {
    return this.buffer.slice();
  }

  // load dari bytes
  fromBytes(bytes) {
    this.buffer = new Uint8Array(bytes);
  }

  // Array-like access
  get length() {
    return this.buffer.length * 8;
  }

  // support flags[i] = true / false
  getFlag(index) {
    return this.check(index);
  }

  setFlag(index, value) {
    if (value) this.set(index);
    else this.clear(index);
  }
}
class SConfObject {
  constructor() {
    this.keys = [];   // LiteString[]
    this.values = []; // SmallFloat | ui8/SuperUI8 | LiteString | Flags
  }

  // set key/value
  set(key, value) {
    if (!(key instanceof LiteString)) throw new Error("Key must be LiteString");

    const idx = this.keys.findIndex(k => k.toString() === key.toString());
    if (idx >= 0) {
      this.values[idx] = value;
    } else {
      this.keys.push(key);
      this.values.push(value);
    }
  }

  // get value
  get(key) {
    const idx = this.keys.findIndex(k => k.toString() === key.toString());
    return idx >= 0 ? this.values[idx] : null;
  }

  // check existence
  has(key) {
    return this.keys.some(k => k.toString() === key.toString());
  }

  // iterate
  forEach(callback) {
    for (let i = 0; i < this.keys.length; i++) {
      callback(this.keys[i], this.values[i]);
    }
  }

  // serialize
  toBytes() {
    const chunks = [];
    for (let i = 0; i < this.keys.length; i++) {
      const keyBytes = this.keys[i].toBytes();
      chunks.push(keyBytes.length);
      chunks.push(...keyBytes);

      const val = this.values[i];

      if (val instanceof SmallFloat) {
        chunks.push(0); // type 0 = SmallFloat
        const valBytes = val.toBytes();
        chunks.push(...valBytes); // fixed 2 bytes
      } else if (val instanceof ui8 || val instanceof SuperUI8) {
        chunks.push(1); // type 1 = ui8/SuperUI8
        const valBytes = val.toBytes();
        chunks.push(valBytes.length & 0xFF, (valBytes.length >> 8) & 0xFF); // 2 bytes length
        chunks.push(...valBytes);
      } else if (val instanceof LiteString) {
        chunks.push(2); // type 2 = LiteString
        const valBytes = val.toBytes();
        chunks.push(valBytes.length & 0xFF, (valBytes.length >> 8) & 0xFF);
        chunks.push(...valBytes);
      } else if (val instanceof Flags) {
        chunks.push(3); // type 3 = Flags
        const valBytes = val.toBytes();
        chunks.push(valBytes.length); // 1 byte length
        chunks.push(...valBytes);
      } else {
        throw new Error("Unsupported value type");
      }
    }
    return new Uint8Array(chunks);
  }

  // deserialize
  static fromBytes(bytes) {
    const obj = new SConfObject();
    let i = 0;
    while (i < bytes.length) {
      const keyLen = bytes[i++];
      const keyBytes = bytes.slice(i, i + keyLen);
      const key = LiteString.fromBytes(keyBytes);
      i += keyLen;

      const typeFlag = bytes[i++];

      if (typeFlag === 0) { // SmallFloat
        const valBytes = bytes.slice(i, i + 2);
        const value = SmallFloat.fromBytes(valBytes);
        i += 2;
        obj.set(key, value);
      } else if (typeFlag === 1) { // ui8/SuperUI8
        const len = bytes[i] | (bytes[i + 1] << 8);
        i += 2;
        const valBytes = bytes.slice(i, i + len);
        const value = SuperUI8.fromBytes(valBytes);
        i += len;
        obj.set(key, value);
      } else if (typeFlag === 2) { // LiteString
        const len = bytes[i] | (bytes[i + 1] << 8);
        i += 2;
        const valBytes = bytes.slice(i, i + len);
        const value = LiteString.fromBytes(valBytes);
        i += len;
        obj.set(key, value);
      } else if (typeFlag === 3) { // Flags
        const len = bytes[i++];
        const valBytes = bytes.slice(i, i + len);
        const value = new Flags();
        value.fromBytes(valBytes);
        i += len;
        obj.set(key, value);
      }
    }
    return obj;
  }
}
