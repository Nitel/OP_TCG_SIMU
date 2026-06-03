/**
 * Vitest setup — runs before each test file.
 *
 * Mocks PixiJS (canvas-based, not testable in jsdom) and GSAP.
 * @testing-library/jest-dom extends expect with DOM matchers.
 */
import '@testing-library/jest-dom';

// ── PixiJS mock ───────────────────────────────────────────────────────────────
// PixiJS uses WebGL / Canvas APIs not available in node. Mock it so components
// that import pixi.js can still be type-checked and unit-tested.
vi.mock('pixi.js', () => ({
  Application: vi.fn().mockImplementation(() => ({
    init: vi.fn().mockResolvedValue(undefined),
    canvas: { width: 1920, height: 1080 },
    stage: { addChild: vi.fn(), removeChild: vi.fn(), children: [] },
    destroy: vi.fn(),
    ticker: { add: vi.fn(), remove: vi.fn() },
    renderer: { resize: vi.fn() },
  })),
  Container: vi.fn().mockImplementation(() => ({
    addChild: vi.fn(),
    removeChild: vi.fn(),
    removeChildren: vi.fn(),
    children: [],
    destroy: vi.fn(),
    zIndex: 0,
  })),
  Graphics: vi.fn().mockImplementation(() => ({
    clear: vi.fn().mockReturnThis(),
    rect: vi.fn().mockReturnThis(),
    roundRect: vi.fn().mockReturnThis(),
    circle: vi.fn().mockReturnThis(),
    fill: vi.fn().mockReturnThis(),
    stroke: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
    eventMode: 'none',
    on: vi.fn(),
  })),
  Sprite: vi.fn().mockImplementation(() => ({
    destroy: vi.fn(),
    anchor: { set: vi.fn() },
  })),
  Text: vi.fn().mockImplementation(() => ({
    destroy: vi.fn(),
    anchor: { set: vi.fn() },
    text: '',
    style: {},
  })),
  Assets: { load: vi.fn().mockResolvedValue(null) },
  Texture: { from: vi.fn().mockReturnValue(null), EMPTY: null },
}));

// ── GSAP mock ─────────────────────────────────────────────────────────────────
vi.mock('gsap', () => ({
  default: {
    to: vi.fn(),
    from: vi.fn(),
    fromTo: vi.fn(),
    set: vi.fn(),
    killTweensOf: vi.fn(),
    timeline: vi.fn(() => ({ to: vi.fn(), from: vi.fn() })),
  },
  gsap: {
    to: vi.fn(),
    from: vi.fn(),
    fromTo: vi.fn(),
    set: vi.fn(),
    killTweensOf: vi.fn(),
  },
}));

// ── socket.io-client mock ─────────────────────────────────────────────────────
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    connected: false,
  })),
}));
