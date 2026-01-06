
const LS_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 #@<>{}[]+-*/";
const LS_TO_INDEX = new Int8Array(128).fill(-1);
for (let i = 0; i < LS_CHARSET.length; i++) {
  LS_TO_INDEX[LS_CHARSET.charCodeAt(i)] = i;
}

class LiteString {
  constructor(u8, jsString) {
    const len = jsString.length;
    const ptr = u8.n(2 + len);
    u8.u16(ptr, len);
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
  static fromPtr(u8, ptr) {
    const len = u8.b[ptr] | (u8.b[ptr + 1] << 8);
    const ls = Object.create(LiteString.prototype);
    ls.u8 = u8;
    ls.ptr = ptr;
    ls.length = len;
    return ls;
  }


  charAt(i) {
    return LS_CHARSET[this.u8.b[this.ptr + 2 + i]];
  }
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
    this.t = 0; 
  }
  n(n) {
    let t = this.t;
    let nt = t + n;

    if (nt > this.b.length) {

      let nl = this.b.length << 1;
      while (nl < nt) nl <<= 1;

      const nb = new Uint8Array(nl);
      nb.set(this.b);
      this.b = nb;
    }

    this.t = nt;
    return t;
  }


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


  copy(p, src, len) {
    this.b.set(src.subarray(0, len), p);
  }
}

class SmallFloat {
  constructor(value = 0) {
    this.val = value; 
  }


  set(value) {
    this.val = value;
  }


  get() {
    return this.val;
  }


  toBytes() {
    let v = Math.round(this.val * 256); 
    if (v < -32768) v = -32768;
    if (v > 32767) v = 32767;
    return Uint8Array.from([v & 0xFF, (v >> 8) & 0xFF]);
  }


  static fromBytes(bytes) {
    let v = bytes[0] | (bytes[1] << 8);
    if (v & 0x8000) v -= 0x10000;
    return new SmallFloat(v / 256);
  }
}

class ConfObject {
  constructor(data = {}) {
    this.entries = []; 
    this.index = new Map(); 
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


  resolve(key, objectsMap) {
    let val = this.get(key);
    if (typeof val === "string" && objectsMap && objectsMap[val]) {
      return objectsMap[val]; 
    }
    return val;
  }
}

class SuperUI8 {
  constructor(size = 1024) {
    this.buffer = new Uint8Array(size);
    this.length = 0; 
  }


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
    return this.length - bytes.length; 
  }


  get(index) {
    let num = 0;
    let shift = 0;
    let i = index;
    while (i < this.length) {
      const byte = this.buffer[i++];
      num += byte << shift;
      shift += 8;
      if (byte < 255) break; 
    }
    return { value: num, nextIndex: i };
  }


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


  toBytes() {
    return this.buffer.slice(0, this.length);
  }


  clear() {
    this.length = 0;
  }
}

class Flags {
  constructor(initialSize = 1) {
    this.buffer = new Uint8Array(initialSize); 
  }


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


  toBytes() {
    return this.buffer.slice();
  }


  fromBytes(bytes) {
    this.buffer = new Uint8Array(bytes);
  }


  get length() {
    return this.buffer.length * 8;
  }


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
    this.keys = [];   
    this.values = []; 
  }


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


  get(key) {
    const idx = this.keys.findIndex(k => k.toString() === key.toString());
    return idx >= 0 ? this.values[idx] : null;
  }


  has(key) {
    return this.keys.some(k => k.toString() === key.toString());
  }


  forEach(callback) {
    for (let i = 0; i < this.keys.length; i++) {
      callback(this.keys[i], this.values[i]);
    }
  }


  toBytes() {
    const chunks = [];
    for (let i = 0; i < this.keys.length; i++) {
      const keyBytes = this.keys[i].toBytes();
      chunks.push(keyBytes.length);
      chunks.push(...keyBytes);

      const val = this.values[i];

      if (val instanceof SmallFloat) {
        chunks.push(0); 
        const valBytes = val.toBytes();
        chunks.push(...valBytes); 
      } else if (val instanceof ui8 || val instanceof SuperUI8) {
        chunks.push(1); 
        const valBytes = val.toBytes();
        chunks.push(valBytes.length & 0xFF, (valBytes.length >> 8) & 0xFF); 
        chunks.push(...valBytes);
      } else if (val instanceof LiteString) {
        chunks.push(2); 
        const valBytes = val.toBytes();
        chunks.push(valBytes.length & 0xFF, (valBytes.length >> 8) & 0xFF);
        chunks.push(...valBytes);
      } else if (val instanceof Flags) {
        chunks.push(3); 
        const valBytes = val.toBytes();
        chunks.push(valBytes.length); 
        chunks.push(...valBytes);
      } else {
        throw new Error("Unsupported value type");
      }
    }
    return new Uint8Array(chunks);
  }


  static fromBytes(bytes) {
    const obj = new SConfObject();
    let i = 0;
    while (i < bytes.length) {
      const keyLen = bytes[i++];
      const keyBytes = bytes.slice(i, i + keyLen);
      const key = LiteString.fromBytes(keyBytes);
      i += keyLen;

      const typeFlag = bytes[i++];

      if (typeFlag === 0) { 
        const valBytes = bytes.slice(i, i + 2);
        const value = SmallFloat.fromBytes(valBytes);
        i += 2;
        obj.set(key, value);
      } else if (typeFlag === 1) { 
        const len = bytes[i] | (bytes[i + 1] << 8);
        i += 2;
        const valBytes = bytes.slice(i, i + len);
        const value = SuperUI8.fromBytes(valBytes);
        i += len;
        obj.set(key, value);
      } else if (typeFlag === 2) { 
        const len = bytes[i] | (bytes[i + 1] << 8);
        i += 2;
        const valBytes = bytes.slice(i, i + len);
        const value = LiteString.fromBytes(valBytes);
        i += len;
        obj.set(key, value);
      } else if (typeFlag === 3) { 
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
