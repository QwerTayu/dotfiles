// Markdown Preview: Markdown のファイルを整形して表示する。Marp のスライド（frontmatter に marp: true）は、
// marp-cli で 1 枚ずつ PNG にして見せ、「1 枚ずつめくる」と「縦に並べてスクロール」を切り替えられる。
// 開き方: コマンドパレットの「Markdown Preview」（ファイルを選ぶ）、またはターミナルで `mdview <ファイル>`（props.file）。
// ファイルを保存すると、表示も更新する。
import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex, TextView, EditorState, Editor } from "gpui-base";
import { props, readTextFile, writeTextFile, watchFolder, pickFiles, exec, home, appHome, theme, settings, closeOverlay } from "herdr";

// image() は ~/.config/herdr-app からの相対パスで読むので、PNG はその下に置く（mods/ の外なので、mod の読み直しは起きない）
const CACHE_REL = "cache/md-preview";
// 文章の字体。UDEV Gothic NF（アプリのターミナルと同じ）にする。既定の字体では太字・斜体が効かず、
// Helvetica Neue では日本語の斜体が傾かなかった。UDEV Gothic の斜体は日本語の字形も傾いているので、日本語の斜体も出る（等幅の見た目になる）
const TEXT_FONT = "UDEV Gothic NF";
const MARP = () => `${home()}/.local/share/mise/shims/marp`; // mise で入れた marp-cli（dotfiles の mise/config.toml）

const isMarp = (text) => /^---\s*\n[\s\S]*?^marp:\s*true\s*$[\s\S]*?^---\s*$/m.test(text);
const dirname = (p) => p.slice(0, p.lastIndexOf("/")) || "/";
const basename = (p) => p.slice(p.lastIndexOf("/") + 1);

// Markdown の表示の部品は画像を描かないので、画像だけの行（![alt](src) か <img src="...">）を抜き出して、mod が image() で描く。
// image() は ~/.config/herdr-app からの相対パスしか読まないので、画像はそこにコピーする（http の画像は curl で落とす）。
const IMAGE_LINE = /^\s*(?:!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)|<img\s[^>]*src=["']([^"']+)["'][^>]*>)\s*$/i;
// コードブロックの色付け。言語の別名をそろえ、色は VS Code の Dark Modern（Dark+）に合わせる
const LANG_ALIAS = { js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript", ts: "typescript", tsx: "tsx",
  sh: "bash", shell: "bash", zsh: "bash", console: "bash", py: "python", rb: "ruby", rs: "rust", yml: "yaml", md: "markdown",
  "c++": "cpp", "c#": "csharp", cs: "csharp", kt: "kotlin", golang: "go", htm: "html", jsonc: "json" };
const SYNTAX = { keyword: "#569cd6", string: "#ce9178", "string.escape": "#d7ba7d", comment: "#6a9955", function: "#dcdcaa",
  type: "#4ec9b0", number: "#b5cea8", constant: "#4fc1ff", variable: "#9cdcfe", operator: "#d4d4d4", punctuation: "#d4d4d4",
  boolean: "#569cd6", heading: "#569cd6", strong: "#569cd6", code: "#ce9178", quote: "#6a9955", list: "#6796e6", link: "#3794ff" };
const CODE_FONT_SIZE = 13;
const CODE_LINE = 20; // コードの 1 行の高さ（px）。部品は自分の高さを決めないので、行数から高さを出す

// ```mermaid のブロックは mermaid-png.sh（mermaid.js を Google Chrome の headless で動かす）で PNG にして、画像と同じように出す。
// GitHub のアラート（> [!NOTE] など）。表示の部品はただの引用として描くので、mod が色付きの枠で描く。
const ALERT_START = /^\s*>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i;
const ALERTS = {
  NOTE: { label: "Note", color: "#4493f8" },
  TIP: { label: "Tip", color: "#3fb950" },
  IMPORTANT: { label: "Important", color: "#ab7df8" },
  WARNING: { label: "Warning", color: "#d29922" },
  CAUTION: { label: "Caution", color: "#f85149" },
};
// <details> と <summary>。表示の部品は開け閉めせずに中身まで出すので、mod が ▶ で開け閉めするブロックとして描く。
const DETAILS_START = /^\s*<details(\s+open)?\s*>\s*(.*)$/i;
const SUMMARY = /<summary>([\s\S]*?)<\/summary>/i;
function splitBlocks(text) {
  const blocks = [];
  let buf = [];
  let fence = false;
  const flush = () => { if (buf.join("").trim()) blocks.push({ kind: "md", text: buf.join("\n") }); buf = []; };
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // ```mermaid のブロックは、mermaid-png.sh で PNG にして図として出す
    const mermaid = !fence && line.match(/^\s*(```|~~~)\s*mermaid\s*$/i);
    if (mermaid) {
      flush();
      const code = [];
      while (i + 1 < lines.length && !new RegExp(`^\\s*${mermaid[1]}\\s*$`).test(lines[i + 1])) code.push(lines[++i]);
      i++;
      blocks.push({ kind: "mermaid", src: `mermaid:${code.join("\n")}`, code: code.join("\n") });
      continue;
    }
    // ほかの ``` のブロックは、mod が色付きのコードとして描く（言語は ``` のうしろの名前）
    const codeStart = !fence && line.match(/^\s*(```+|~~~+)\s*([^\s`]*)[^`]*$/);
    if (codeStart) {
      flush();
      const close = new RegExp(`^\\s*${codeStart[1][0] === "`" ? "`" : "~"}{${codeStart[1].length},}\\s*$`);
      const code = [];
      while (i + 1 < lines.length && !close.test(lines[i + 1])) code.push(lines[++i]);
      i++;
      blocks.push({ kind: "code", lang: codeStart[2].toLowerCase(), code: code.join("\n") });
      continue;
    }
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const details = !fence && line.match(DETAILS_START);
    if (details) {
      flush();
      const body = [details[2]];
      while (i + 1 < lines.length && !/<\/details>/i.test(lines[i + 1])) body.push(lines[++i]);
      if (i + 1 < lines.length) body.push(lines[++i].replace(/<\/details>.*$/i, ""));
      let inner = body.join("\n");
      const summary = inner.match(SUMMARY);
      inner = inner.replace(SUMMARY, "").trim();
      blocks.push({ kind: "details", summary: summary ? summary[1].trim() : "Details", text: inner, open: Boolean(details[1]) });
      continue;
    }
    const alert = !fence && line.match(ALERT_START);
    if (alert) {
      flush();
      const body = [];
      while (i + 1 < lines.length && /^\s*>/.test(lines[i + 1])) body.push(lines[++i].replace(/^\s*>\s?/, ""));
      blocks.push({ kind: "alert", type: alert[1].toUpperCase(), text: body.join("\n") });
      continue;
    }
    const m = !fence && line.match(IMAGE_LINE);
    if (m) { flush(); blocks.push({ kind: "img", alt: m[1] ?? "", src: m[2] ?? m[3] }); }
    else buf.push(line);
  }
  flush();
  return blocks;
}

export default class MdPreview extends View {
  init(_props, cx) {
    this.file = props()?.file ?? null;
    this.text = "";
    this.error = null;
    this.marp = false;
    this.slides = []; // PNG のパス（~/.config/herdr-app からの相対）
    this.ratio = 9 / 16;
    this.page = 0;
    this.rendering = false;
    this.again = false;
    this.mode = "slides";
    try { this.mode = localStorage.getItem("marpMode") || "slides"; } catch {}
    this.width = 800;
    this.handle = cx.focus_handle();
    this.watch = null;
    this.blocks = [];
    this.images = new Map(); // src -> { path, w, h } または { error }
    this.imageDir = null;
    this.opened = new Map(); // <details> の開け閉め（ブロックの番号 -> 開いているか）
    this.editors = new Map(); // コードブロックの部品（言語と中身 -> EditorState）。同じ中身なら作り直さない
    this.copied = null; // コピーしたばかりのコードブロックの番号（「Copied」を出す）
    this.popup = null; // リンクの URL のポップアップ { url, x, y }
    this.pointer = null; // ペインの中のマウスの位置（ウィンドウの px）
    this.cmd = false; // ⌘ を押しているか
    // mod の読み直しや落ちたときは close() が呼ばれず、PNG が残る。開くたびに 1 日より古いものを消す
    exec("/usr/bin/find", [`${appHome()}/${CACHE_REL}`, "-mindepth", "1", "-maxdepth", "1", "-mtime", "+0", "-exec", "/bin/rm", "-rf", "{}", "+"]).catch(() => {});
    if (this.file) this.load(cx);
  }

  async close() {
    this.watch?.cancel();
    if (this.imageDir) await exec("/bin/rm", ["-rf", `${appHome()}/${this.imageDir}`]);
    if (this.slides.length) await exec("/bin/rm", ["-rf", `${appHome()}/${dirname(this.slides[0])}`]);
  }

  open(cx) {
    cx.spawn(async (cx) => {
      const picked = await pickFiles({ prompt: "Markdown のファイルを選ぶ", multiple: false });
      if (!picked?.length) return;
      this.file = picked[0];
      this.page = 0;
      this.load(cx);
    });
  }

  load(cx) {
    const file = this.file;
    cx.spawn(async (cx) => {
      try {
        this.text = await readTextFile(file);
        this.error = null;
      } catch (e) {
        this.error = `読めませんでした: ${file}\n${e}`;
        cx.notify();
        return;
      }
      this.marp = isMarp(this.text);
      if (!this.marp) this.prepare(cx);
      cx.notify();
      if (this.marp) this.build(cx);
      this.follow(cx);
    });
  }

  // ファイルのあるフォルダを見張り、このファイルが変わったら読み直す。
  follow(cx) {
    this.watch?.cancel();
    const file = this.file;
    cx.spawn(async (cx) => {
      while (this.file === file) {
        let changed;
        try {
          this.watch = watchFolder(dirname(file));
          changed = await this.watch;
        } catch {
          await cx.sleep(2000);
          changed = [file];
        }
        if (this.file !== file) return;
        if (!changed.length) return; // cancel された
        if (changed.some((p) => p === file || p === dirname(file))) {
          await cx.sleep(150);
          try { this.text = await readTextFile(file); } catch { continue; }
          this.marp = isMarp(this.text);
          if (this.marp) this.build(cx);
          else this.prepare(cx);
          cx.notify();
        }
      }
    });
  }

  // marp-cli でスライドを PNG にする。描いている途中に保存されたら、終わってからもう一度描く。
  build(cx) {
    if (this.rendering) { this.again = true; return; }
    this.rendering = true;
    const file = this.file;
    const rel = `${CACHE_REL}/${Date.now()}`;
    const out = `${appHome()}/${rel}`;
    cx.spawn(async (cx) => {
      try {
        const r = await exec(MARP(), ["--images", "png", "--allow-local-files", file, "-o", `${out}/slide.png`], { cwd: dirname(file), timeout: 120000 });
        if (r.code !== 0) throw new Error(r.stderr.trim() || "marp に失敗しました");
        const ls = await exec("/bin/ls", [out]);
        const slides = ls.stdout.split("\n").filter((n) => /^slide\.\d+\.png$/.test(n)).sort().map((n) => `${rel}/${n}`);
        if (slides.length) {
          const size = await exec("/usr/bin/sips", ["-g", "pixelWidth", "-g", "pixelHeight", `${appHome()}/${slides[0]}`]);
          const w = Number(size.stdout.match(/pixelWidth: (\d+)/)?.[1]), h = Number(size.stdout.match(/pixelHeight: (\d+)/)?.[1]);
          if (w && h) this.ratio = h / w;
        }
        const old = this.slides.length ? dirname(this.slides[0]) : null;
        this.slides = slides;
        this.page = Math.min(this.page, Math.max(0, slides.length - 1));
        this.error = null;
        if (old) exec("/bin/rm", ["-rf", `${appHome()}/${old}`]);
      } catch (e) {
        this.error = String(e);
      } finally {
        this.rendering = false;
        cx.notify();
        if (this.again && this.file === file) { this.again = false; this.build(cx); }
      }
    });
  }

  // 本文を Markdown と画像に分け、まだ用意していない画像をコピーして大きさを調べる。
  prepare(cx) {
    this.blocks = splitBlocks(this.text);
    // コードブロックの部品を作る（作るのは描く前の、ここでだけ）。使わなくなったものは捨てる
    const keep = new Set();
    for (const b of this.blocks) {
      if (b.kind !== "code") continue;
      b.key = `${b.lang}\n${b.code}`;
      keep.add(b.key);
      if (this.editors.has(b.key)) continue;
      const lang = LANG_ALIAS[b.lang] ?? b.lang;
      const opts = { value: b.code, readonly: true, line_numbers: false, folding: false, soft_wrap: false,
        font_family: TEXT_FONT, font_size: CODE_FONT_SIZE, syntax: SYNTAX };
      let state;
      try { state = EditorState.new(lang ? { ...opts, language: lang } : opts); }
      catch { state = EditorState.new(opts); } // 知らない言語は色を付けずに出す
      this.editors.set(b.key, state);
    }
    for (const [key, state] of this.editors) if (!keep.has(key)) { state.release(); this.editors.delete(key); }
    const file = this.file;
    if (!this.imageDir) this.imageDir = `${CACHE_REL}/img-${Date.now()}`;
    const dir = `${appHome()}/${this.imageDir}`;
    const todo = this.blocks.filter((b) => (b.kind === "img" || b.kind === "mermaid") && !this.images.has(b.src));
    if (!todo.length) return;
    for (const b of todo) this.images.set(b.src, { loading: true });
    cx.spawn(async (cx) => {
      await exec("/bin/mkdir", ["-p", dir]);
      for (const [i, b] of todo.entries()) {
        const ext = (b.src.match(/\.(png|jpe?g|gif|webp|svg)(?:[?#].*)?$/i)?.[1] ?? "png").toLowerCase();
        const name = `${Date.now()}-${i}.${ext}`;
        const dest = `${dir}/${name}`;
        try {
          if (b.kind === "mermaid") {
            const srcFile = `${dir}/${Date.now()}-${i}.mmd`;
            const png = `${dir}/${Date.now()}-${i}.png`;
            await writeTextFile(srcFile, b.code, null);
            const r = await exec(`${appHome()}/mods/md-preview/mermaid-png.sh`, [srcFile, png], { timeout: 120000 });
            if (r.code !== 0) throw new Error(r.stderr.trim() || "Mermaid の図を描けませんでした");
            const [w, h] = r.stdout.trim().split(" ").map(Number);
            this.images.set(b.src, { path: png.slice(appHome().length + 1), w: w || 600, h: h || 300 });
            if (this.file === file) cx.notify();
            continue;
          }
          if (/^https?:\/\//.test(b.src)) {
            const r = await exec("/usr/bin/curl", ["-fsSL", "--max-time", "20", "-o", dest, b.src], { timeout: 30000 });
            if (r.code !== 0) throw new Error(r.stderr.trim() || "download failed");
          } else {
            const src = decodeURI(b.src.replace(/^file:\/\//, ""));
            const abs = src.startsWith("/") ? src : src.startsWith("~/") ? `${home()}/${src.slice(2)}` : `${dirname(file)}/${src}`;
            const r = await exec("/bin/cp", [abs, dest]);
            if (r.code !== 0) throw new Error(r.stderr.trim() || "not found");
          }
          let w = 0, h = 0;
          if (ext !== "svg") {
            const size = await exec("/usr/bin/sips", ["-g", "pixelWidth", "-g", "pixelHeight", dest]);
            w = Number(size.stdout.match(/pixelWidth: (\d+)/)?.[1]) || 0;
            h = Number(size.stdout.match(/pixelHeight: (\d+)/)?.[1]) || 0;
          }
          this.images.set(b.src, { path: `${this.imageDir}/${name}`, w: w || 800, h: h || 450 });
        } catch (e) {
          this.images.set(b.src, { error: String(e.message ?? e) });
        }
        if (this.file === file) cx.notify();
      }
    });
  }

  // 文章の部品。リンクを押しても開かず、押した所のそばに URL を出す（⌘ を押しながらなら、そのままブラウザで開く）。
  // 部品はマウスを乗せたことを知らせないので、押したときに出す。押した位置は、ペイン全体で見ているマウスの位置を使う。
  markdown(id, text, t) {
    return TextView.markdown(id, text).selectable(true).font_family(TEXT_FONT).text_size(14).text_color(t.foreground)
      .on_link_click((url, cx) => {
        if (this.cmd) { this.openUrl(url); return; }
        const zoom = settings().zoom || 1;
        this.popup = { url, x: (this.pointer?.x ?? 40) / zoom, y: (this.pointer?.y ?? 40) / zoom };
        cx.notify();
      });
  }

  openUrl(url) {
    exec("/usr/bin/open", [url]);
  }

  go(delta, cx) {
    this.page = Math.min(this.slides.length - 1, Math.max(0, this.page + delta));
    cx.notify();
  }

  setMode(mode, cx) {
    this.mode = mode;
    try { localStorage.setItem("marpMode", mode); } catch {}
    cx.notify();
  }

  slideImage(path, w) {
    return image(path).w(w).h(Math.round(w * this.ratio)).flex_none().rounded(4);
  }

  render(_cx) {
  const t = theme();
  const mono = settings().font_family ?? settings().font ?? "JetBrains Mono";
  const button = (id, label, onClick, active = false) => div().id(id).h(24).px(8).flex().items_center().rounded(5).text_size(12)
    .cursor_pointer().bg(active ? t.selected : t.chrome).text_color(active ? t.foreground : t.muted)
    .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click((_e, cx) => onClick(cx)).child(label);
  const header = h_flex().h(34).flex_none().px(12).gap(8).items_center().border_b(1).border_color(t.border).bg(t.chrome)
    .child(div().flex_none().text_size(12.5).font_semibold().text_color(t.foreground).child(this.file ? basename(this.file) : "Markdown Preview"))
    .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.dim).child(this.file ? dirname(this.file) : ""))
    .when(this.marp, (el) => el
      .child(div().flex_none().text_size(11.5).text_color(t.dim).child(this.rendering ? "rendering…" : `${this.slides.length} slides`))
      .child(button("mode-slides", "Slides", (cx) => this.setMode("slides", cx), this.mode === "slides"))
      .child(button("mode-scroll", "Scroll", (cx) => this.setMode("scroll", cx), this.mode === "scroll")))
    .child(button("open", "Open…", (cx) => this.open(cx)))
    // ダイアログで開いたとき（.md のパスを Cmd+クリック）は、閉じるボタンも出す（Esc でも閉じる）
    .when(Boolean(props()?.overlay), (el) => el.child(button("close", "\u00d7", () => closeOverlay(props().overlay))));

  let body;
  if (!this.file) {
    body = v_flex().flex_1().items_center().justify_center().gap(10).text_color(t.muted).text_size(13)
      .child("Markdown のファイルを選んでください")
      .child(button("open-center", "Open…", (cx) => this.open(cx)));
  } else if (this.error) {
    body = div().p(14).font_family(mono).text_size(12).text_color(t.ansi1).child(this.error);
  } else if (!this.marp) {
    body = v_flex().id("md").flex_1().min_h(0).overflow_y_scrollbar().px(28).py(20)
      .children(this.blocks.map((b, i) => {
        if (b.kind === "md") return this.markdown(`md-${i}`, b.text, t);
        if (b.kind === "code") {
          const state = this.editors.get(b.key);
          const lines = Math.max(1, b.code.split("\n").length);
          const copied = this.copied === i;
          return div().id(`code-${i}`).relative().my(8).rounded(6).border_1().border_color(t.border).bg(t.background).overflow_hidden()
            .child(div().h(lines * CODE_LINE + 20).py(10).px(4).when(Boolean(state), (e) => e.child(Editor.new(state))))
            .child(h_flex().id(`copy-${i}`).absolute().top(6).right(6).h(22).px(8).gap(5).items_center().rounded(5)
              .bg(t.raised).border_1().border_color(t.border).text_size(11.5).text_color(copied ? t.ansi2 : t.muted).cursor_pointer()
              .hover((s) => s.text_color(t.foreground))
              .on_click((_e, cx) => {
                cx.write_to_clipboard(b.code);
                this.copied = i;
                cx.notify();
                cx.spawn(async (cx) => { await cx.sleep(1500); if (this.copied === i) { this.copied = null; cx.notify(); } });
              })
              .child(copied ? "Copied" : "Copy"))
            .when(Boolean(b.lang), (e) => e.child(div().absolute().top(9).right(70).text_size(11).text_color(t.dim).child(b.lang)));
        }
        if (b.kind === "details") {
          const open = this.opened.get(i) ?? b.open;
          return v_flex().id(`details-${i}`).my(6).gap(6)
            .child(h_flex().id(`summary-${i}`).gap(6).px(6).py(2).ml(-6).rounded(5).items_center().cursor_pointer().text_size(14).text_color(t.foreground)
              .hover((s) => s.bg(t.hover))
              .on_click((_e, cx) => { this.opened.set(i, !open); cx.notify(); })
              .child(div().w(12).flex_none().text_size(11).text_color(t.muted).child(open ? "\u25bc" : "\u25b6"))
              .child(b.summary))
            .when(open && Boolean(b.text), (e) => e.child(div().pl(18).child(this.markdown(`details-md-${i}`, b.text, t))));
        }
        if (b.kind === "alert") {
          const a = ALERTS[b.type];
          return v_flex().id(`alert-${i}`).my(8).pl(14).py(4).gap(6).border_l(3).border_color(a.color)
            .child(h_flex().gap(7).items_center().text_size(14).font_semibold().text_color(a.color)
              .child(svg(`mods/md-preview/icons/${b.type.toLowerCase()}.svg`).size(15).text_color(a.color))
              .child(a.label))
            .child(this.markdown(`alert-md-${i}`, b.text, t));
        }
        const img = this.images.get(b.src);
        if (!img?.path) {
          const what = b.kind === "mermaid" ? "Mermaid の図" : b.src;
          return div().id(`img-${i}`).my(6).px(10).py(6).rounded(5).border_1().border_color(img?.error ? t.ansi1 : t.border).text_size(12)
            .font_family(settings().font_family ?? settings().font ?? "JetBrains Mono").text_color(img?.error ? t.ansi1 : t.dim)
            .child(img?.error ? `${b.kind === "mermaid" ? "Mermaid の図を描けませんでした" : `画像を読めませんでした: ${b.src}`}\n${img.error}` : `読み込み中: ${what}`);
        }
        const w = Math.min(img.w, Math.max(100, this.width - 56));
        return v_flex().id(`img-${i}`).my(8).gap(3).child(image(img.path).w(w).h(Math.round((w * img.h) / img.w)).rounded(4))
          .when(Boolean(b.alt), (e) => e.child(div().text_size(11.5).text_color(t.dim).child(b.alt)));
      }));
  } else if (!this.slides.length) {
    body = v_flex().flex_1().items_center().justify_center().text_color(t.muted).text_size(13).child(this.rendering ? "rendering…" : "スライドがありません");
  } else if (this.mode === "scroll") {
    const w = Math.max(200, Math.min(1280, this.width - 56));
    body = v_flex().id("scroll").flex_1().min_h(0).overflow_y_scrollbar().items_center().py(20).gap(16)
      .children(this.slides.map((p, i) => v_flex().id(`s-${i}`).flex_none().items_center().gap(4)
        .child(this.slideImage(p, w))
        .child(div().text_size(11).text_color(t.dim).child(`${i + 1} / ${this.slides.length}`))));
  } else {
    const w = Math.max(200, Math.min(1600, this.width - 56));
    body = v_flex().flex_1().min_h(0).items_center().justify_center().gap(10).py(12)
      .child(this.slideImage(this.slides[this.page], w))
      .child(h_flex().gap(10).items_center()
        .child(button("prev", "←", (cx) => this.go(-1, cx)))
        .child(div().text_size(12).text_color(t.muted).child(`${this.page + 1} / ${this.slides.length}`))
        .child(button("next", "→", (cx) => this.go(1, cx))));
  }

  const popup = this.popup && (() => {
    const w = Math.min(460, Math.max(200, this.width - 24));
    const x = Math.max(8, Math.min(this.popup.x - 12, this.width - w - 8));
    return v_flex().id("link-popup").absolute().left(x).top(this.popup.y + 14).max_w(w).px(10).py(7).gap(3)
      .rounded(6).border_1().border_color(t.border).bg(t.popover).shadow_md()
      .on_mouse_down_out((_e, cx) => { this.popup = null; cx.notify(); })
      .child(div().id("link-url").text_size(12.5).text_color(t.accent).underline().cursor_pointer()
        .hover((s) => s.text_color(t.foreground))
        .on_click((_e, cx) => { this.openUrl(this.popup.url); this.popup = null; cx.notify(); })
        .child(this.popup.url))
      .child(div().text_size(11).text_color(t.dim).child("Click to open · \u2318+click on the link opens it directly"));
  })();
  return v_flex().id("root").relative().size_full().bg(t.background).track_focus(this.handle)
    .on_window_mouse_move((e) => { this.pointer = e.local_position; this.cmd = e.modifiers.platform; })
    .on_modifiers_changed((e) => { this.cmd = e.modifiers.platform; })
    .on_size_change((size, cx) => { const w = size.width / (settings().zoom || 1); if (Math.abs(w - this.width) > 4) { this.width = w; cx.notify(); } })
    .on_mouse_down("left", () => this.handle.focus())
    .on_key_down((e, cx) => {
      if (!this.marp || this.mode !== "slides") return;
      if (["right", "down", "space", "pagedown"].includes(e.key)) { this.go(1, cx); cx.stop_propagation(); }
      if (["left", "up", "pageup"].includes(e.key)) { this.go(-1, cx); cx.stop_propagation(); }
    })
    .child(header).child(body)
    .when(Boolean(popup), (el) => el.child(popup));
  }
}
