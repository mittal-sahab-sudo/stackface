# stackface

**Your face, rendered in your stack.**

Turn a photo into a GitHub-ready ASCII portrait where every glyph is a letter from your own tech stack — `python.react.aws.docker…` — with matching dark & light mode SVGs for your profile README.

**→ Try it live: [mittal-sahab-sudo.github.io/stackface](https://mittal-sahab-sudo.github.io/stackface/)**

## Why

I built [my GitHub profile README](https://github.com/mittal-sahab-sudo) this way and people kept asking how. So here's the generator — free, open source, no signup.

## How it works

Everything runs **100% in your browser**. Your photo never touches a server.

1. **Background removal** — an ONNX segmentation model ([@imgly/background-removal](https://github.com/imgly/background-removal-js)) runs client-side via WASM to isolate you from the background
2. **Glyph sampling** — the photo is downsampled to a character grid; each cell's luminance is auto-contrast-stretched and gamma-corrected, then quantized into 10 opacity buckets
3. **Stack stream** — your keywords flow through the visible cells as one continuous string, so zoomed in, your face is literally made of your tools
4. **Theme-aware output** — two SVGs are generated: *dark* maps bright pixels → bright glyphs (like a screen), *light* maps dark pixels → heavy ink (like newsprint). Glyph runs use `textLength` so the grid never drifts across fonts and platforms

## Use it in your README

Download both SVGs, drop them in an `assets/` folder in your `<username>/<username>` repo, and paste:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/hero-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="./assets/hero-light.svg">
  <img alt="my portrait, rendered in my tech stack" src="./assets/hero-dark.svg" width="60%">
</picture>
```

GitHub swaps dark/light automatically.

## Run / deploy your own

It's a single `index.html` — no build step, no dependencies to install.

```bash
git clone https://github.com/mittal-sahab-sudo/stackface
cd stackface
python3 -m http.server   # open http://localhost:8000
```

Deploy anywhere static files live: GitHub Pages, Vercel, Netlify, an S3 bucket.

## Credits

Built by [Abhishek Mittal](https://mittalsahab.com) — full-stack engineer (Python · Next.js · AWS).
Background removal by [@imgly/background-removal](https://github.com/imgly/background-removal-js) (loaded from CDN at runtime).

If this made your profile cooler, a ⭐ helps more people find it.

## License

MIT
