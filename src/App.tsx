import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useState } from "react";
import type { ChangeEvent, DragEvent, ReactNode } from "react";
import { useLenis } from "./hooks/useLenis";
import type { RenderMode } from "./lib/portrait";
import {
  DARK_OPACITY,
  LIGHT_OPACITY,
  README_SNIPPET,
  autoCropAlpha,
  blobToImage,
  buildSvg,
  downloadSvg,
  makeStream,
  removeBackground,
  sampleGrid,
} from "./lib/portrait";

const DEFAULT_STACK =
  "python, react, nextjs, flask, django, aws, socketio, mysql, postgres, docker, redis, stripe, typescript, websockets, git, linux";

type PreviewTheme = "dark" | "light";
type StatusTone = "muted" | "success" | "error";

interface StatusMessage {
  text: string;
  tone: StatusTone;
}

interface PortraitResult {
  dark: string;
  light: string;
  cols: number;
  rows: number;
  kilobytes: number;
  mode: RenderMode;
}

const buttonBase =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-2.5 text-[13.5px] font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58a6ff]";

function WindowDots() {
  return (
    <div className="flex gap-1.5" aria-hidden="true">
      <span className="size-2.5 rounded-full bg-[#f8514966]" />
      <span className="size-2.5 rounded-full bg-[#d2992266]" />
      <span className="size-2.5 rounded-full bg-[#3fb95066]" />
    </div>
  );
}

function Terminal({ title, controls, children }: { title: string; controls?: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[10px] border border-[#1f2733] bg-[#11161d] shadow-[0_18px_70px_rgba(0,0,0,0.18)]">
      <div className="flex min-h-10 items-center gap-2 border-b border-[#1f2733] bg-[#0e1319] px-3 py-2 text-xs text-[#8b949e]">
        <WindowDots />
        <span>{title}</span>
        {controls}
      </div>
      {children}
    </section>
  );
}

function FieldLabel({ name, children }: { name: string; children: ReactNode }) {
  return (
    <span className="mb-1.5 block text-xs text-[#8b949e]">
      <span className="text-[#f778ba]">{name}:</span> {children}
    </span>
  );
}

function RangeField({
  name,
  description,
  hint,
  min,
  max,
  value,
  displayValue,
  onChange,
}: {
  name: string;
  description: string;
  hint?: string;
  min: number;
  max: number;
  value: number;
  displayValue: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="mb-4 block">
      <FieldLabel name={name}>
        {description} {hint && <span className="text-[11.5px] text-[#57606a]">({hint})</span>}
      </FieldLabel>
      <span className="flex items-center gap-2.5">
        <input
          className="w-full grow cursor-pointer accent-[#3fb950]"
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <span className="min-w-[38px] text-right text-xs text-[#d29922]">{displayValue}</span>
      </span>
    </label>
  );
}

function App() {
  useLenis();
  const reduceMotion = useReducedMotion();
  const [file, setFile] = useState<File | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [cutout, setCutout] = useState<HTMLImageElement | HTMLCanvasElement | null>(null);
  const [stack, setStack] = useState(DEFAULT_STACK);
  const [renderMode, setRenderMode] = useState<RenderMode>("color");
  const [removeBg, setRemoveBg] = useState(true);
  const [cols, setCols] = useState(78);
  const [gamma, setGamma] = useState(85);
  const [cutoff, setCutoff] = useState(8);
  const [theme, setTheme] = useState<PreviewTheme>("dark");
  const [result, setResult] = useState<PortraitResult | null>(null);
  const [status, setStatus] = useState<StatusMessage>({ text: "waiting for a photo…", tone: "muted" });
  const [isDragging, setIsDragging] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const loadFile = useCallback(async (nextFile: File) => {
    if (!nextFile.type.startsWith("image/")) {
      setStatus({ text: "that is not an image", tone: "error" });
      return;
    }

    try {
      const nextImage = await blobToImage(nextFile);
      setFile(nextFile);
      setImage(nextImage);
      setCutout(null);
      setResult(null);
      setStatus({ text: "photo loaded — hit generate", tone: "success" });
    } catch {
      setStatus({ text: "that image could not be loaded", tone: "error" });
    }
  }, []);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0];
    if (nextFile) void loadFile(nextFile);
    event.target.value = "";
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const nextFile = event.dataTransfer.files?.[0];
    if (nextFile) void loadFile(nextFile);
  };

  const generate = async () => {
    if (!file || !image) return;
    setIsGenerating(true);

    try {
      let source: HTMLImageElement | HTMLCanvasElement = image;
      let usesAlpha = false;

      if (removeBg) {
        let nextCutout = cutout;
        if (!nextCutout) {
          const blob = await removeBackground(file, (text) => setStatus({ text, tone: "muted" }));
          if (blob) {
            nextCutout = autoCropAlpha(await blobToImage(blob));
            setCutout(nextCutout);
          } else {
            setStatus({
              text: "background removal unavailable — generating without it",
              tone: "error",
            });
          }
        }
        if (nextCutout) {
          source = nextCutout;
          usesAlpha = true;
        }
      }

      setStatus({ text: "sampling glyph grid…", tone: "muted" });
      await new Promise<void>((resolve) => window.setTimeout(resolve, 20));

      const grid = sampleGrid(source, cols, gamma / 100, usesAlpha, cutoff / 100);
      if (!grid.cells) {
        setStatus({ text: "could not read any visible pixels from that image", tone: "error" });
        return;
      }

      const stream = makeStream(stack);
      const dark = buildSvg(grid, stream, {
        opacity: DARK_OPACITY,
        monochromeColor: "#e6edf3",
        mode: renderMode,
        theme: "dark",
      });
      const light = buildSvg(grid, stream, {
        opacity: LIGHT_OPACITY,
        monochromeColor: "#1f2328",
        mode: renderMode,
        theme: "light",
      });
      const nextResult = {
        dark,
        light,
        cols: grid.cols,
        rows: grid.rows,
        kilobytes: Math.round(dark.length / 1024),
        mode: renderMode,
      };
      setResult(nextResult);
      setStatus({
        text: `done — ${nextResult.mode === "color" ? "image colors" : "monochrome"} · ${nextResult.cols}×${nextResult.rows} glyphs · ~${nextResult.kilobytes} KB per SVG`,
        tone: "success",
      });
    } catch (error) {
      console.error(error);
      setStatus({
        text: `something broke: ${error instanceof Error ? error.message : String(error)}`,
        tone: "error",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const copySnippet = async () => {
    try {
      await navigator.clipboard.writeText(README_SNIPPET);
      setStatus({ text: "README snippet copied — paste it into your profile README", tone: "success" });
    } catch {
      setStatus({ text: "clipboard access was blocked — copy the snippet below", tone: "error" });
    }
  };

  const activeSvg = result ? (theme === "dark" ? result.dark : result.light) : null;
  const entrance = reduceMotion ? {} : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 } };

  return (
    <main className="mx-auto min-h-screen max-w-[1240px] px-5 pt-7 pb-14 sm:px-7 sm:pt-10">
      <motion.header {...entrance} transition={{ duration: 0.45, ease: "easeOut" }} className="mb-7">
        <div className="text-[13px] sm:text-sm">
          <span className="font-semibold text-[#3fb950]">you@github</span>
          <span className="text-[#8b949e]">:</span>
          <span className="text-[#58a6ff]">~</span>
          <span className="text-[#8b949e]">$</span> stackface --init
        </div>
        <h1 className="mt-1.5 mb-1 flex items-center text-[clamp(26px,4vw,38px)] leading-tight font-bold tracking-[-0.5px]">
          stackface
          <span className="ml-1.5 inline-block h-[1.05em] w-[0.55em] animate-[blink_1.1s_steps(1)_infinite] bg-[#3fb950] align-[-0.15em]" />
        </h1>
        <p className="max-w-5xl text-[#8b949e]">
          your face, rendered in <strong className="font-semibold text-[#d29922]">your stack</strong> — a GitHub-ready
          ASCII portrait, generated from a photo. 100% client-side: your photo never leaves this tab.
        </p>
      </motion.header>

      <div className="grid items-start gap-[18px] lg:grid-cols-[340px_minmax(0,1fr)]">
        <motion.div
          {...entrance}
          transition={{ duration: 0.45, delay: reduceMotion ? 0 : 0.08, ease: "easeOut" }}
        >
          <Terminal title="stackface.config">
            <div className="p-4">
              <div className="mb-4">
                <FieldLabel name="photo">a clear, front-facing shot works best</FieldLabel>
                <label
                  className={`block cursor-pointer rounded-lg border-[1.5px] border-dashed px-3 py-[18px] text-center transition ${
                    isDragging
                      ? "border-[#3fb950] bg-[#3fb95010] text-[#e6edf3]"
                      : "border-[#1f2733] text-[#8b949e] hover:border-[#3fb950] hover:bg-[#3fb95010] hover:text-[#e6edf3]"
                  }`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                >
                  <input className="hidden" type="file" accept="image/*" onChange={onFileChange} />
                  {file ? (
                    <>
                      <span className="text-[#3fb950]">✓ {file.name}</span>
                      <br />
                      <span className="text-[11.5px] text-[#57606a]">click to change</span>
                    </>
                  ) : (
                    <>
                      drop your photo here
                      <br />
                      <span className="text-[11.5px] text-[#57606a]">or click to browse</span>
                    </>
                  )}
                </label>
              </div>

              <label className="mb-4 block">
                <FieldLabel name="stack">the words your portrait is made of</FieldLabel>
                <textarea
                  className="min-h-20 w-full resize-y rounded-md border border-[#1f2733] bg-[#0b0f14] px-2.5 py-2 text-[13px] text-[#e6edf3] outline-none transition focus:border-[#58a6ff]"
                  value={stack}
                  spellCheck={false}
                  onChange={(event) => setStack(event.target.value)}
                />
              </label>

              <div className="mb-4">
                <FieldLabel name="palette">choose how the glyphs are colored</FieldLabel>
                <div className="grid grid-cols-2 rounded-md border border-[#1f2733] bg-[#0b0f14] p-1">
                  {(["color", "monochrome"] as RenderMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={`flex cursor-pointer items-center justify-center gap-2 rounded px-2 py-2 text-xs font-semibold transition ${
                        renderMode === mode
                          ? "bg-[#1f2733] text-[#e6edf3] shadow-sm"
                          : "text-[#8b949e] hover:text-[#e6edf3]"
                      }`}
                      aria-pressed={renderMode === mode}
                      onClick={() => setRenderMode(mode)}
                    >
                      {mode === "color" ? (
                        <span className="flex" aria-hidden="true">
                          <span className="size-2.5 rounded-l-sm bg-[#f85149]" />
                          <span className="size-2.5 bg-[#3fb950]" />
                          <span className="size-2.5 rounded-r-sm bg-[#58a6ff]" />
                        </span>
                      ) : (
                        <span className="h-2.5 w-7 rounded-sm bg-[#8b949e]" aria-hidden="true" />
                      )}
                      {mode === "color" ? "image colors" : "mono"}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[11.5px] text-[#57606a]">
                  image colors sample each glyph cell and rebalance contrast for both GitHub themes.
                </p>
              </div>

              <div className="mb-4">
                <label className="flex cursor-pointer items-center gap-2 select-none">
                  <input
                    className="size-[15px] accent-[#3fb950]"
                    type="checkbox"
                    checked={removeBg}
                    onChange={(event) => setRemoveBg(event.target.checked)}
                  />
                  remove background (recommended)
                </label>
                <p className="mt-1 text-[11.5px] text-[#57606a]">
                  runs a ~40 MB AI model in your browser, one-time download. uncheck if your photo already has a plain
                  background.
                </p>
              </div>

              <RangeField
                name="width"
                description="characters across"
                hint="more = sharper, heavier file"
                min={48}
                max={110}
                value={cols}
                displayValue={String(cols)}
                onChange={setCols}
              />
              <RangeField
                name="brightness"
                description="lift midtones if your photo is dark"
                min={50}
                max={130}
                value={gamma}
                displayValue={(gamma / 100).toFixed(2)}
                onChange={setGamma}
              />
              <RangeField
                name="cutoff"
                description="hide near-invisible cells"
                hint="only used when background removal is off"
                min={0}
                max={40}
                value={cutoff}
                displayValue={`${cutoff}%`}
                onChange={setCutoff}
              />

              <button
                type="button"
                className={`${buttonBase} w-full bg-[#3fb950] text-[#04110a] hover:brightness-110 disabled:cursor-wait disabled:bg-[#2ea04366] disabled:text-[#0b0f14]`}
                disabled={!image || isGenerating}
                onClick={() => void generate()}
              >
                {isGenerating ? "generating…" : "▸ generate portrait"}
              </button>
              <p
                className={`mt-2.5 min-h-4 text-xs ${
                  status.tone === "success"
                    ? "text-[#3fb950]"
                    : status.tone === "error"
                      ? "text-[#f85149]"
                      : "text-[#8b949e]"
                }`}
                role="status"
                aria-live="polite"
              >
                {status.text}
              </p>
            </div>
          </Terminal>
        </motion.div>

        <motion.div
          {...entrance}
          transition={{ duration: 0.45, delay: reduceMotion ? 0 : 0.16, ease: "easeOut" }}
        >
          <Terminal
            title="preview.svg"
            controls={
              <div className="ml-auto flex">
                {(["dark", "light"] as PreviewTheme[]).map((previewTheme) => (
                  <button
                    key={previewTheme}
                    type="button"
                    className={`border border-[#1f2733] px-3 py-1 text-xs transition first:rounded-l-md last:rounded-r-md ${
                      theme === previewTheme ? "bg-[#1f2733] text-[#e6edf3]" : "cursor-pointer text-[#8b949e]"
                    }`}
                    aria-pressed={theme === previewTheme}
                    onClick={() => setTheme(previewTheme)}
                  >
                    {previewTheme}
                  </button>
                ))}
              </div>
            }
          >
            <div
              className={`flex min-h-[420px] items-center justify-center overflow-hidden p-5 transition-colors sm:p-[22px] ${
                theme === "dark" ? "bg-[#0d1117]" : "bg-white"
              }`}
            >
              <AnimatePresence mode="wait" initial={false}>
                {activeSvg ? (
                  <motion.div
                    key={theme}
                    initial={reduceMotion ? false : { opacity: 0, scale: 0.985 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={reduceMotion ? undefined : { opacity: 0, scale: 1.015 }}
                    transition={{ duration: 0.2 }}
                    className="flex w-full items-center justify-center [&_svg]:h-auto [&_svg]:max-w-full"
                    dangerouslySetInnerHTML={{ __html: activeSvg }}
                  />
                ) : (
                  <motion.div key="empty" exit={{ opacity: 0 }} className="text-center text-[#57606a]">
                    <div className="mb-2.5 text-[40px] leading-none">░▒▓</div>
                    upload a photo and hit <span className="text-[#3fb950]">generate</span>
                    <br />
                    <span className="text-xs">your portrait renders here, exactly as it will on GitHub</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <AnimatePresence initial={false}>
              {result && (
                <motion.div
                  initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <div className="flex flex-wrap gap-2.5 border-t border-[#1f2733] px-4 py-3.5">
                    <button
                      type="button"
                      className={`${buttonBase} bg-[#3fb950] text-[#04110a] hover:brightness-110`}
                      onClick={() => downloadSvg("hero-dark.svg", result.dark)}
                    >
                      ↓ hero-dark.svg
                    </button>
                    <button
                      type="button"
                      className={`${buttonBase} border border-[#1f2733] text-[#e6edf3] hover:border-[#8b949e]`}
                      onClick={() => downloadSvg("hero-light.svg", result.light)}
                    >
                      ↓ hero-light.svg
                    </button>
                    <button
                      type="button"
                      className={`${buttonBase} border border-[#1f2733] text-[#e6edf3] hover:border-[#8b949e]`}
                      onClick={() => void copySnippet()}
                    >
                      ⧉ copy README snippet
                    </button>
                  </div>
                  <pre className="overflow-x-auto whitespace-pre-wrap break-all border-t border-[#1f2733] bg-[#0b0f14] px-4 py-3.5 text-xs text-[#8b949e]">
                    {`// README.md — put the SVGs in assets/\n${README_SNIPPET}`}
                  </pre>
                </motion.div>
              )}
            </AnimatePresence>
          </Terminal>
        </motion.div>
      </div>

      <motion.footer
        {...entrance}
        transition={{ duration: 0.45, delay: reduceMotion ? 0 : 0.22, ease: "easeOut" }}
        className="mt-9 text-center text-[12.5px] text-[#57606a]"
      >
        open source ·{" "}
        <a
          className="text-[#8b949e] transition hover:text-[#58a6ff] hover:underline"
          href="https://github.com/mittal-sahab-sudo/stackface"
          target="_blank"
          rel="noreferrer"
        >
          star it on GitHub
        </a>{" "}
        · original by{" "}
        <a
          className="text-[#8b949e] transition hover:text-[#58a6ff] hover:underline"
          href="https://mittalsahab.com"
          target="_blank"
          rel="noreferrer"
        >
          Abhishek Mittal
        </a>{" "}
        — whose{" "}
        <a
          className="text-[#8b949e] transition hover:text-[#58a6ff] hover:underline"
          href="https://github.com/mittal-sahab-sudo"
          target="_blank"
          rel="noreferrer"
        >
          README
        </a>{" "}
        started this · React + color rebuild by{" "}
        <a
          className="text-[#8b949e] transition hover:text-[#58a6ff] hover:underline"
          href="https://clh.lol"
          target="_blank"
          rel="noreferrer"
        >
          Charlie Harper
        </a>
      </motion.footer>
    </main>
  );
}

export default App;
