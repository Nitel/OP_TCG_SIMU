/**
 * Pre-patch for jsdom@29.
 *
 * Polyfills Web APIs that some environments may not expose (File, ArrayBuffer.resizable).
 * Node.js 22+ supports require() of ESM modules natively — no module interception needed.
 *
 * Loaded via NODE_OPTIONS='--require ./src/test/pre-patch.cjs' before vitest.
 */
'use strict';

// ── Polyfill: File global (Node.js 20+ Web API) ──────────────────────────────
if (typeof globalThis.File === 'undefined') {
  globalThis.File = class File extends Blob {
    constructor(fileBits, name, options = {}) {
      super(fileBits, options);
      this.name = String(name);
      this.lastModified = options.lastModified != null ? Number(options.lastModified) : Date.now();
    }
    get [Symbol.toStringTag]() { return 'File'; }
  };
}

// ── Polyfill: ArrayBuffer.prototype.resizable / maxByteLength (Node.js 20+) ──
if (!Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')) {
  Object.defineProperty(ArrayBuffer.prototype, 'resizable', {
    get() { return false; }, configurable: true, enumerable: false,
  });
}
if (!Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'maxByteLength')) {
  Object.defineProperty(ArrayBuffer.prototype, 'maxByteLength', {
    get() { return this.byteLength; }, configurable: true, enumerable: false,
  });
}
if (typeof SharedArrayBuffer !== 'undefined') {
  if (!Object.getOwnPropertyDescriptor(SharedArrayBuffer.prototype, 'growable')) {
    Object.defineProperty(SharedArrayBuffer.prototype, 'growable', {
      get() { return false; }, configurable: true, enumerable: false,
    });
  }
  if (!Object.getOwnPropertyDescriptor(SharedArrayBuffer.prototype, 'maxByteLength')) {
    Object.defineProperty(SharedArrayBuffer.prototype, 'maxByteLength', {
      get() { return this.byteLength; }, configurable: true, enumerable: false,
    });
  }
}

// Node.js 22+ supports require() of ESM modules natively — no interception needed.
