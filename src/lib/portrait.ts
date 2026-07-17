const CELL_WIDTH = 6;
const CELL_HEIGHT = 10;
const FONT = "ui-monospace,'SF Mono',Menlo,Consolas,'Liberation Mono',monospace";

export const DARK_OPACITY = [0.14, 0.22, 0.3, 0.38, 0.47, 0.56, 0.66, 0.77, 0.88, 1];
export const LIGHT_OPACITY = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.31, 0.24, 0.18];

export type RenderMode = "color" | "monochrome";
export type SvgTheme = "dark" | "light";

export const README_SNIPPET = `<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/hero-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="./assets/hero-light.svg">
  <img alt="my portrait, rendered in my tech stack — made with stackface" src="./assets/hero-dark.svg" width="60%">
</picture>`;

export interface GlyphGrid {
  cols: number;
  rows: number;
  cells: Int8Array | null;
  colors: Uint8ClampedArray | null;
}

export interface BuildSvgOptions {
  opacity: readonly number[];
  monochromeColor: string;
  mode: RenderMode;
  theme: SvgTheme;
}

export function sampleGrid(
  image: CanvasImageSource & { width: number; height: number },
  cols: number,
  gamma: number,
  useAlpha: boolean,
  cutoff: number,
): GlyphGrid {
  const rows = Math.max(8, Math.round((image.height / image.width) * cols * (CELL_WIDTH / CELL_HEIGHT)));
  const canvas = document.createElement("canvas");
  canvas.width = cols;
  canvas.height = rows;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return { cols, rows, cells: null, colors: null };

  context.clearRect(0, 0, cols, rows);
  context.drawImage(image, 0, 0, cols, rows);
  const pixels = context.getImageData(0, 0, cols, rows).data;
  const luminance = new Float32Array(cols * rows);
  const visibility = new Uint8Array(cols * rows);
  const visiblePixels: number[] = [];

  for (let index = 0; index < cols * rows; index += 1) {
    const red = pixels[index * 4];
    const green = pixels[index * 4 + 1];
    const blue = pixels[index * 4 + 2];
    const alpha = pixels[index * 4 + 3];
    const value = (0.2126 * red + 0.7152 * green + 0.0722 * blue) * (alpha / 255);

    if (!useAlpha || alpha >= 90) {
      visibility[index] = 1;
      luminance[index] = value;
      visiblePixels.push(value);
    }
  }

  if (visiblePixels.length === 0) return { cols, rows, cells: null, colors: null };

  visiblePixels.sort((a, b) => a - b);
  const low = visiblePixels[Math.floor(visiblePixels.length * 0.01)];
  const high = visiblePixels[Math.min(visiblePixels.length - 1, Math.floor(visiblePixels.length * 0.99))];
  const span = Math.max(1, high - low);
  const cells = new Int8Array(cols * rows).fill(-1);
  const colors = new Uint8ClampedArray(cols * rows * 3);

  for (let index = 0; index < cols * rows; index += 1) {
    if (!visibility[index]) continue;
    let value = Math.min(1, Math.max(0, (luminance[index] - low) / span));
    value = Math.pow(value, gamma);
    if (!useAlpha && value < cutoff) continue;
    cells[index] = Math.min(9, Math.floor(value * 10));
    colors[index * 3] = pixels[index * 4];
    colors[index * 3 + 1] = pixels[index * 4 + 1];
    colors[index * 3 + 2] = pixels[index * 4 + 2];
  }

  return { cols, rows, cells, colors };
}

export function makeStream(raw: string): string {
  const words = raw
    .split(/[,\n]+/)
    .map((word) => word.trim().toLowerCase().replace(/\s+/g, ""))
    .filter(Boolean);

  return `${(words.length ? words : ["code"]).join(".")}.`;
}

export function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const THEME_BACKGROUND: Record<SvgTheme, readonly [number, number, number]> = {
  dark: [13, 17, 23],
  light: [255, 255, 255],
};

const THEME_CONTRAST_ANCHOR: Record<SvgTheme, readonly [number, number, number]> = {
  dark: [238, 246, 255],
  light: [17, 24, 39],
};

const COLOR_QUANTIZATION_STEP = 24;
const MIN_COLOR_CONTRAST = 3;

function linearChannel(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(red: number, green: number, blue: number): number {
  return 0.2126 * linearChannel(red) + 0.7152 * linearChannel(green) + 0.0722 * linearChannel(blue);
}

export function contrastRatio(
  first: readonly [number, number, number],
  second: readonly [number, number, number],
): number {
  const lighter = Math.max(relativeLuminance(...first), relativeLuminance(...second));
  const darker = Math.min(relativeLuminance(...first), relativeLuminance(...second));
  return (lighter + 0.05) / (darker + 0.05);
}

function quantizeChannel(channel: number): number {
  return Math.min(255, Math.round(channel / COLOR_QUANTIZATION_STEP) * COLOR_QUANTIZATION_STEP);
}

function mixColor(
  color: readonly [number, number, number],
  target: readonly [number, number, number],
  amount: number,
): [number, number, number] {
  return color.map((channel, index) => Math.round(channel + (target[index] - channel) * amount)) as [
    number,
    number,
    number,
  ];
}

function toHex(color: readonly [number, number, number]): string {
  return `#${color.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

export function themeAdjustedColor(red: number, green: number, blue: number, theme: SvgTheme): string {
  const source: [number, number, number] = [
    quantizeChannel(red),
    quantizeChannel(green),
    quantizeChannel(blue),
  ];
  const background = THEME_BACKGROUND[theme];

  if (contrastRatio(source, background) >= MIN_COLOR_CONTRAST) return toHex(source);

  const anchor = THEME_CONTRAST_ANCHOR[theme];
  let low = 0;
  let high = 1;
  let adjusted = source;

  for (let iteration = 0; iteration < 10; iteration += 1) {
    const amount = (low + high) / 2;
    const candidate = mixColor(source, anchor, amount);
    if (contrastRatio(candidate, background) >= MIN_COLOR_CONTRAST) {
      adjusted = candidate;
      high = amount;
    } else {
      low = amount;
    }
  }

  return toHex(adjusted);
}

function cellColor(grid: GlyphGrid, index: number, options: BuildSvgOptions): string {
  if (options.mode === "monochrome" || !grid.colors) return options.monochromeColor;
  return themeAdjustedColor(
    grid.colors[index * 3],
    grid.colors[index * 3 + 1],
    grid.colors[index * 3 + 2],
    options.theme,
  );
}

export function buildSvg(grid: GlyphGrid, stream: string, options: BuildSvgOptions): string {
  if (!grid.cells) throw new Error("The glyph grid contains no visible pixels.");

  const { cols, rows, cells } = grid;
  const width = cols * CELL_WIDTH;
  const height = rows * CELL_HEIGHT;
  const lines: string[] = [];
  const fills =
    options.mode === "color" && grid.colors
      ? Array.from({ length: cells.length }, (_, index) =>
          cells[index] < 0 ? "" : cellColor(grid, index, options),
        )
      : null;
  let streamIndex = 0;

  for (let row = 0; row < rows; row += 1) {
    const spans: string[] = [];
    let column = 0;

    while (column < cols) {
      const bucket = cells[row * cols + column];
      if (bucket < 0) {
        column += 1;
        continue;
      }

      const start = column;
      const fill = fills?.[row * cols + column] || options.monochromeColor;
      let characters = "";
      while (
        column < cols &&
        cells[row * cols + column] === bucket &&
        (fills?.[row * cols + column] || options.monochromeColor) === fill
      ) {
        characters += stream[streamIndex % stream.length];
        streamIndex += 1;
        column += 1;
      }

      spans.push(
        `<tspan x="${start * CELL_WIDTH}" textLength="${characters.length * CELL_WIDTH}" lengthAdjust="spacingAndGlyphs" fill="${fill}" fill-opacity="${options.opacity[bucket]}">${escapeXml(characters)}</tspan>`,
      );
    }

    if (spans.length > 0) {
      lines.push(`<text y="${(row + 1) * CELL_HEIGHT}">${spans.join("")}</text>`);
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width + 12}" height="${height + 12}" viewBox="0 0 ${width + 12} ${height + 12}" role="img" aria-label="ASCII portrait rendered from a tech stack — made with stackface">
<style>text{font-family:${FONT};font-size:10px}</style>
<g transform="translate(6,6)">
${lines.join("\n")}
</g>
</svg>`;
}

interface BackgroundRemovalModule {
  removeBackground: (
    file: Blob,
    options: { progress: (key: string, current: number, total: number) => void },
  ) => Promise<Blob>;
}

const BACKGROUND_REMOVAL_URL = "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.5/+esm";
let backgroundRemovalModule: BackgroundRemovalModule | null = null;
let backgroundRemovalFailed = false;

export async function removeBackground(file: File, onProgress: (message: string) => void): Promise<Blob | null> {
  if (!backgroundRemovalModule && !backgroundRemovalFailed) {
    try {
      onProgress("loading background-removal model…");
      backgroundRemovalModule = (await import(
        /* @vite-ignore */ BACKGROUND_REMOVAL_URL
      )) as BackgroundRemovalModule;
    } catch (error) {
      backgroundRemovalFailed = true;
      console.warn("Background removal is unavailable:", error);
    }
  }

  if (!backgroundRemovalModule) return null;

  return backgroundRemovalModule.removeBackground(file, {
    progress: (key, current, total) => {
      if (total) {
        onProgress(`background removal: ${key.split(":").pop()} ${Math.round((current / total) * 100)}%`);
      }
    },
  });
}

export function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = (event) => {
      URL.revokeObjectURL(url);
      reject(event);
    };
    image.src = url;
  });
}

export function autoCropAlpha(image: HTMLImageElement): HTMLImageElement | HTMLCanvasElement {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return image;
  context.drawImage(image, 0, 0);

  const pixels = context.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  const step = Math.max(1, Math.round(Math.max(width, height) / 800));

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (pixels[(y * width + x) * 4 + 3] > 60) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < 0) return image;

  const padding = Math.round((maxX - minX) * 0.03);
  const sourceX = Math.max(0, minX - padding);
  const sourceY = Math.max(0, minY - padding);
  const sourceWidth = Math.min(width, maxX + padding) - sourceX;
  const sourceHeight = Math.min(height, maxY + padding) - sourceY;
  if (sourceWidth < 20 || sourceHeight < 20) return image;

  const output = document.createElement("canvas");
  output.width = sourceWidth;
  output.height = sourceHeight;
  output.getContext("2d")?.drawImage(
    canvas,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    sourceWidth,
    sourceHeight,
  );
  return output;
}

export function downloadSvg(filename: string, svg: string): void {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
