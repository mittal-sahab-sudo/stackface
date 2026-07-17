import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DARK_OPACITY,
  LIGHT_OPACITY,
  buildSvg,
  contrastRatio,
  sampleGrid,
  themeAdjustedColor,
} from "./portrait";
import type { GlyphGrid } from "./portrait";

function rgbFromHex(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

const colorGrid: GlyphGrid = {
  cols: 4,
  rows: 1,
  cells: new Int8Array([5, 5, 5, -1]),
  colors: new Uint8ClampedArray([
    255,
    0,
    0,
    255,
    0,
    0,
    0,
    96,
    255,
    0,
    0,
    0,
  ]),
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sampleGrid", () => {
  it("captures the RGB value beneath every visible glyph cell", () => {
    const pixels = new Uint8ClampedArray(2 * 8 * 4);
    for (let index = 0; index < 2 * 8; index += 1) {
      const isRed = index % 2 === 0;
      pixels[index * 4] = isRed ? 255 : 0;
      pixels[index * 4 + 1] = 0;
      pixels[index * 4 + 2] = isRed ? 0 : 255;
      pixels[index * 4 + 3] = 255;
    }

    const context = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: pixels })),
    };
    vi.stubGlobal("document", {
      createElement: vi.fn(() => ({
        width: 0,
        height: 0,
        getContext: vi.fn(() => context),
      })),
    });

    const grid = sampleGrid({ width: 2, height: 8 } as CanvasImageSource & { width: number; height: number }, 2, 1, false, 0);

    expect(grid.rows).toBe(8);
    expect(Array.from(grid.colors?.slice(0, 6) ?? [])).toEqual([255, 0, 0, 0, 0, 255]);
    expect(Array.from(grid.cells?.slice(0, 2) ?? [])).toEqual([9, 0]);
  });
});

describe("themeAdjustedColor", () => {
  it("raises dark colors to readable contrast on the dark theme", () => {
    const color = rgbFromHex(themeAdjustedColor(0, 0, 0, "dark"));
    expect(contrastRatio(color, [13, 17, 23])).toBeGreaterThanOrEqual(3);
  });

  it("darkens light colors to readable contrast on the light theme", () => {
    const color = rgbFromHex(themeAdjustedColor(255, 255, 255, "light"));
    expect(contrastRatio(color, [255, 255, 255])).toBeGreaterThanOrEqual(3);
  });

  it("keeps a source color unchanged when it already has enough contrast", () => {
    expect(themeAdjustedColor(255, 0, 0, "dark")).toBe("#ff0000");
  });
});

describe("buildSvg", () => {
  it("creates distinct, merged SVG runs from sampled image colors", () => {
    const svg = buildSvg(colorGrid, "stack.", {
      opacity: DARK_OPACITY,
      monochromeColor: "#e6edf3",
      mode: "color",
      theme: "dark",
    });

    expect(svg.match(/<tspan/g)).toHaveLength(2);
    expect(svg).toContain('fill="#ff0000"');
    expect(svg).toContain(`fill="${themeAdjustedColor(0, 96, 255, "dark")}"`);
    expect(svg).toContain('textLength="12"');
  });

  it("keeps monochrome output compact even when sampled colors differ", () => {
    const svg = buildSvg(colorGrid, "stack.", {
      opacity: LIGHT_OPACITY,
      monochromeColor: "#1f2328",
      mode: "monochrome",
      theme: "light",
    });

    expect(svg.match(/<tspan/g)).toHaveLength(1);
    expect(svg).toContain('fill="#1f2328"');
    expect(svg).not.toContain('fill="#ff0000"');
  });
});
