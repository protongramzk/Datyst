
Datyst

Datyst is a JavaScript library providing supercharged datatypes for data-focused applications, such as turn-based game engines, KV storage, or social media config/analytics. The library is designed to be memory-efficient, fast, and deterministic, with flat buffer representations for quick serialization and deserialization.

It’s perfect for managing large-scale data without the overhead of standard JavaScript objects, while remaining easy to use with familiar interfaces.


---

🔹 Key Features

Memory-efficient, flat datatypes

Fast serialization / deserialization to Uint8Array

Support for numeric, string, flag, and relational object types

Suitable for turn-based game engines, KV stores, or config/analytics systems



---

🔹 Data Types

1. ui8 / SuperUI8

UI8: Flat integer storage, 1 byte per value (0–255).
SuperUI8: Extended version capable of storing integers larger than 255 using base-256 encoding, still memory-efficient.

Use case: counters, IDs, resource pools, turn timers.

const s = new SuperUI8();
s.push(123);
s.push(9999);


---

2. LiteString

A lightweight string type storing a subset of characters (A-Z, a-z, 0-9, symbols) using Uint8Array indices for memory efficiency.

Use case: key strings for KV storage, short text, usernames, hashtags.

const name = new LiteString("Hero");
console.log(name.toString()); // "Hero"


---

3. SmallFloat

Memory-efficient floating-point (16-bit) with fixed-point precision.

Use case: metrics, HP, attack, fractional numbers.
```
const health = new SmallFloat(99.5);
console.log(health.value); // 99.5
```

---

4. Flags

A compact boolean array, 1 byte = 8 flags, auto-growing, with fast bitwise operations.

Use case: status effects, ability toggles, feature flags.

const status = new Flags();
status.set(0);      // flag 0 = true
status.toggle(5);   // flip flag 5
console.log(status.check(0)); // true


---

5. SConfObject

A super config/relational object where keys are LiteStrings and values can be SmallFloat, LiteString, SuperUI8, Flags, or ui8.

Features:

Fast key/value lookup

Serialize / deserialize to a flat buffer

Expandable and deterministic

Ideal for game engine state, KV configs, or analytics storage


const conf = new SConfObject();

const k1 = new LiteString("health");
const sf = new SmallFloat(99.5);
conf.set(k1, sf);

const k2 = new LiteString("status");
const f = new Flags();
f.set(0);
conf.set(k2, f);

const bytes = conf.toBytes();
const conf2 = SConfObject.fromBytes(bytes);
console.log(conf2.get(k2).check(0)); // true


---

🔹 When to Use This Library

Simulating turn-based game engines (deterministic, rollback, replay)

Lightweight KV storage (Redis-like)

Large-scale analytics or metric arrays

Flat and fast config/relational objects

When JS objects are too heavy or slow



---

🔹 Installation

Import as a module in your project:

import { LiteString, SmallFloat, SuperUI8, Flags, SConfObject } from 'Datyst-datatype';

Or add the source files directly to your project.


---

🔹 Advanced Example

const conf = new SConfObject();

// add mixed types
conf.set(new LiteString("health"), new SmallFloat(100));
conf.set(new LiteString("name"), new LiteString("Hero"));
conf.set(new LiteString("status"), new Flags());
conf.set(new LiteString("counters"), new SuperUI8());

// manipulate values
conf.get(new LiteString("status")).set(0);
conf.get(new LiteString("counters")).push(12345);

// serialize / deserialize
const bytes = conf.toBytes(); // dump state
const restored = SConfObject.fromBytes(bytes);
console.log(restored.get(new LiteString("counters")).get(0).value); // 12345


---

🔹 License

MIT License


# Datyst
