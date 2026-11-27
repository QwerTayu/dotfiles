// Markdown Preview: Markdown のファイルを整形して表示する。Marp のスライド（frontmatter に marp: true）は、
// marp-cli で 1 枚ずつ PNG にして見せ、「1 枚ずつめくる」と「縦に並べてスクロール」を切り替えられる。
// 開き方: コマンドパレットの「Markdown Preview」（ファイルを選ぶ）、またはターミナルで `mdview <ファイル>`（props.file）。
// ファイルを保存すると、表示も更新する。
import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex, TextView } from "gpui-base";
import { props, readTextFile, writeTextFile, watchFolder, pickFiles, exec, home, appHome, theme, settings, closeOverlay, openOverlay, nextCommand } from "herdr";

// image() は ~/.config/herdr-app からの相対パスで読むので、PNG はその下に置く（mods/ の外なので、mod の読み直しは起きない）
const CACHE_REL = "cache/md-preview";
const DIALOG_WIDTH = 860; // 手元の md へのリンクを開くダイアログの幅（px）。link.js と同じ
// 文章の字体。UDEV Gothic NF（アプリのターミナルと同じ）にする。既定の字体では太字・斜体が効かず、
// Helvetica Neue では日本語の斜体が傾かなかった。UDEV Gothic の斜体は日本語の字形も傾いているので、日本語の斜体も出る（等幅の見た目になる）
const TEXT_FONT = "UDEV Gothic NF";
const MARP = () => `${home()}/.local/share/mise/shims/marp`; // mise で入れた marp-cli（dotfiles の mise/config.toml）

// 先頭の frontmatter（ファイルの 1 行目の --- から次の --- まで）だけを見る。本文の途中の --- や marp: true では Marp にしない。
// 先頭の BOM と、中身が空の frontmatter（--- の次の行がすぐ ---）も受ける
const FRONTMATTER = /^\uFEFF?---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;
const isMarp = (text) => {
  const fm = text.match(FRONTMATTER);
  return Boolean(fm && /^marp:\s*true\s*$/m.test(fm[1] ?? ""));
};
const dirname = (p) => p.slice(0, p.lastIndexOf("/")) || "/";
// SVG の大きさ。<svg> の width・height（数字か px のとき）を使い、なければ viewBox から出す。わからなければ [0, 0]
const svgSize = (text) => {
  const tag = text.match(/<svg\b[^>]*>/i)?.[0] ?? "";
  const num = (name) => Number(tag.match(new RegExp(`\\s${name}\\s*=\\s*["']\\s*([\\d.]+)(?:px)?\\s*["']`, "i"))?.[1]) || 0;
  let w = num("width"), h = num("height");
  const vb = tag.match(/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if ((!w || !h) && vb) {
    const vw = Number(vb[1]), vh = Number(vb[2]);
    if (w && vw) h = (w * vh) / vw;
    else if (h && vh) w = (h * vw) / vh;
    else { w = vw; h = vh; }
  }
  return [Math.round(w), Math.round(h)];
};
const basename = (p) => p.slice(p.lastIndexOf("/") + 1);

// Markdown の表示の部品は画像を描かないので、画像だけの行（![alt](src) か <img src="...">）を抜き出して、mod が image() で描く。
// image() は ~/.config/herdr-app からの相対パスしか読まないので、画像はそこにコピーする（http の画像は curl で落とす）。
const IMAGE_LINE = /^\s*(?:!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)|<img\s[^>]*src=["']([^"']+)["'][^>]*>)\s*$/i;
// コードブロックの色付けは Shiki（VS Code と同じ文法の定義）に任せる。highlight.mjs を mise の Node で動かし、
// 返ってきた「文字と色」の並びを、mod が普通の文字として描く（コードエディタの部品は、最後の行の下に余白を取って
// 中でスクロールしてしまうので使わない）。Shiki は install-shiki.sh が入れる
// 版を上げるときは、install-shiki.sh の VERSION も同じ値にする（片方だけだと、見つからないフォルダを渡して色付けが黙って止まる）
const SHIKI_VERSION = "4.6.0";
const CODE_FONT_SIZE = 13;

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
    // リストの中のコードブロック（``` が字下げされている）は、その字下げを各行から取り、ブロックごと右にずらして描く
    const codeStart = !fence && line.match(/^(\s*)(```+|~~~+)\s*([^\s`]*)[^`]*$/);
    if (codeStart) {
      flush();
      const indent = codeStart[1].replace(/\t/g, "    ").length;
      const close = new RegExp(`^\\s*${codeStart[2][0] === "`" ? "`" : "~"}{${codeStart[2].length},}\\s*$`);
      const code = [];
      while (i + 1 < lines.length && !close.test(lines[i + 1])) code.push(lines[++i]);
      i++;
      // 行の頭の空白とタブ（タブは 4 文字ぶん）を、``` の字下げのぶんまで取る
      const dedent = (l) => {
        let col = 0, k = 0;
        while (k < l.length && col < indent && (l[k] === " " || l[k] === "\t")) { col += l[k] === "\t" ? 4 : 1; k++; }
        return l.slice(k);
      };
      blocks.push({ kind: "code", lang: codeStart[3].toLowerCase(), code: code.map(dedent).join("\n"), indent });
      continue;
    }
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const details = !fence && line.match(DETAILS_START);
    if (details) {
      flush();
      // 対になる </details> まで（同じ行で閉じていればその行まで）を中身にする。
      // 中の <details> は数えておき、入れ子の </details> では外側を閉じない。
      // `…` の中と ``` の囲みの中の <details> は、タグとして数えない（タグの書き方を説明している文のため）
      const body = [];
      let depth = 0;
      let inFence = false;
      let rest = details[2];
      for (;;) {
        if (/^\s*(```|~~~)/.test(rest)) inFence = !inFence;
        const scan = inFence || /^\s*(```|~~~)/.test(rest) ? "" : rest.replace(/`[^`]*`/g, (m) => " ".repeat(m.length));
        const tag = /<details\b|<\/details>/gi;
        let cut = -1, m;
        while ((m = tag.exec(scan))) {
          if (m[0][1] !== "/") depth++;
          else if (depth > 0) depth--;
          else { cut = m.index; break; }
        }
        if (cut >= 0) { body.push(rest.slice(0, cut)); break; }
        body.push(rest);
        if (i + 1 >= lines.length) break;
        rest = lines[++i];
      }
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
    this.mode = "scroll"; // Marp はいつも縦に並べた形で開く（切り替えは覚えない）
    this.width = 800;
    this.handle = cx.focus_handle();
    this.watch = null;
    this.blocks = [];
    this.images = new Map(); // 画像の key（ローカルなら絶対パス）-> { path, w, h, mtime } または { error }
    this.imageDir = null;
    this.opened = new Map(); // <details> の開け閉め（ブロックの番号 -> 開いているか）
    this.tokens = new Map(); // コードブロックの色付けの結果（言語と中身 -> 行ごとの [{t, c, s}]）。同じ中身なら色付けし直さない
    this.highlighting = false;
    this.wasFocused = false; // md-preview のペインにフォーカスが移ったら、ファイルを読み直して色付けする
    this.copied = null; // コピーしたばかりのコードブロックの番号（「Copied」を出す）
    this.popup = null; // リンクの URL のポップアップ { url, x, y }
    this.pointer = null; // ペインの中のマウスの位置（ウィンドウの px）
    this.cmd = false; // ⌘ を押しているか
    // mod の読み直しや落ちたときは close() が呼ばれず、PNG が残る。開くたびに 1 日より古いものを消す
    exec("/usr/bin/find", [`${appHome()}/${CACHE_REL}`, "-mindepth", "1", "-maxdepth", "1", "-mtime", "+0", "-exec", "/bin/rm", "-rf", "{}", "+"]).catch(() => {});
    if (this.file) this.load(cx);
    // 外からの操作（`herdr-app do md-preview.<命令>`）。マウスで押すボタンと同じことを、コマンドでもできるようにする
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        this.command(c, cx);
        cx.notify();
      }
    });
  }

  // 命令の一覧（`herdr-app do md-preview.<命令>`）
  //   slides / scroll                   Marp の見せ方を切り替える
  //   next / prev / first / last        Marp のスライドをめくる（Slides のとき）
  //   open-N / close-N / toggle-N       N 番目（1 から）の折りたたみブロックを開く・閉じる・切り替える
  //   open-all / close-all              折りたたみブロックを全部開く・閉じる
  //   focus                             （Herdr が送る）このペインにキーボードを向ける
  command(c, cx) {
    const details = this.blocks.map((b, i) => (b.kind === "details" ? i : -1)).filter((i) => i >= 0);
    const m = c.match(/^(open|close|toggle)-(\d+|all)$/);
    if (c === "focus") { this.handle.focus(); this.recheck(cx); }
    else if (c === "slides" || c === "scroll") this.setMode(c, cx);
    else if (c === "next") this.go(1, cx);
    else if (c === "prev") this.go(-1, cx);
    else if (c === "first") this.go(-this.slides.length, cx);
    else if (c === "last") this.go(this.slides.length, cx);
    else if (m) {
      const targets = m[2] === "all" ? details : [details[Number(m[2]) - 1]].filter((i) => i !== undefined);
      for (const i of targets) {
        const open = this.opened.get(i) ?? this.blocks[i].open;
        this.opened.set(i, m[1] === "open" ? true : m[1] === "close" ? false : !open);
      }
    }
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
      this.switchTo(picked[0], cx);
    });
  }

  // 別のファイルに替える。前のファイルの画像・折りたたみの開け閉め・スライドは持ち越さない
  switchTo(file, cx) {
    if (this.imageDir) exec("/bin/rm", ["-rf", `${appHome()}/${this.imageDir}`]);
    if (this.slides.length) exec("/bin/rm", ["-rf", `${appHome()}/${dirname(this.slides[0])}`]);
    this.file = file;
    this.text = "";
    this.error = null;
    this.marp = false; // 前のファイルが Marp でも、新しいファイルを marp-cli で描かない
    this.again = false;
    this.blocks = [];
    this.images = new Map();
    this.imageDir = null;
    this.opened = new Map();
    this.slides = [];
    this.page = 0;
    this.popup = null;
    this.load(cx);
  }

  // ファイルを読む。読めなければ null（readTextFile はファイルがないとき、例外を投げずに null を返す）
  async read(file) {
    try { return await readTextFile(file); } catch { return null; }
  }

  load(cx) {
    let file = this.file;
    cx.spawn(async (cx) => {
      // シンボリックリンクのパス（~/.claude/CLAUDE.md など）は、リンクをたどった本物のパスで開く。
      // macOS は本物のパスで変更を知らせてくるので、リンクのパスのまま見張ると、保存しても描き直さない。
      // 中の相対パスの画像やリンクも、本物のファイルのフォルダから見るのが正しい
      const real = (await exec("/bin/realpath", [file]).catch(() => null))?.stdout?.trim();
      if (this.file !== file) return;
      if (real && real !== file) this.file = file = real;
      const text = await this.read(file);
      if (this.file !== file) return;
      if (text == null) {
        this.error = `読めませんでした: ${file}`;
        cx.notify();
        this.follow(cx); // あとでファイルができたら、見張りで読み直す
        return;
      }
      this.text = text;
      this.error = null;
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
        // 画像のファイルだけが変わったときは、画像だけを読み直す
        if (!this.marp && changed.some((p) => this.images.has(p))) this.recheckImages(cx);
        if (changed.some((p) => p === file || p === dirname(file))) {
          await cx.sleep(150);
          const text = await this.read(file);
          if (this.file !== file) return;
          if (text == null) continue; // 一度消えた（ブランチの切り替えなど）。前の表示を残して見張り続ける
          this.text = text;
          this.error = null;
          this.marp = isMarp(this.text);
          if (this.marp) this.build(cx);
          else this.prepare(cx);
          cx.notify();
        }
      }
    });
  }

  // marp-cli でスライドを PNG にする。描いている途中に保存されたり、別のファイルに替えたりしたら、終わってから今のファイルをもう一度描く。
  build(cx) {
    if (this.rendering) { this.again = true; return; }
    this.rendering = true;
    this.again = false;
    const file = this.file;
    const rel = `${CACHE_REL}/${Date.now()}`;
    const out = `${appHome()}/${rel}`;
    cx.spawn(async (cx) => {
      try {
        const r = await exec(MARP(), ["--images", "png", "--allow-local-files", file, "-o", `${out}/slide.png`], { cwd: dirname(file), timeout: 120000 });
        if (r.code !== 0) throw new Error(r.stderr.trim() || "marp に失敗しました");
        if (this.file !== file) { exec("/bin/rm", ["-rf", out]); return; } // 描いている間に別のファイルに替わった
        const ls = await exec("/bin/ls", [out]);
        const slides = ls.stdout.split("\n").filter((n) => /^slide\.\d+\.png$/.test(n)).sort().map((n) => `${rel}/${n}`);
        if (slides.length) {
          const size = await exec("/usr/bin/sips", ["-g", "pixelWidth", "-g", "pixelHeight", `${appHome()}/${slides[0]}`]);
          const w = Number(size.stdout.match(/pixelWidth: (\d+)/)?.[1]), h = Number(size.stdout.match(/pixelHeight: (\d+)/)?.[1]);
          if (w && h) this.ratio = h / w;
        }
        const old = this.slides.length ? dirname(this.slides[0]) : null;
        this.slides = slides;
        this.page = Math.max(0, Math.min(this.page, slides.length - 1));
        this.error = null;
        if (old) exec("/bin/rm", ["-rf", `${appHome()}/${old}`]);
      } catch (e) {
        if (this.file === file) this.error = String(e);
      } finally {
        this.rendering = false;
        cx.notify();
        if ((this.again || this.file !== file) && this.file && this.marp) this.build(cx);
      }
    });
  }

  // 画像を覚えておく key。ローカルの画像は md ファイルのフォルダから見た絶対パスにする（同じ相対パスでも、ファイルが違えば別の画像）
  imageKey(b) {
    if (b.kind === "mermaid" || /^https?:\/\//.test(b.src)) return b.src;
    let src = b.src.replace(/^file:\/\//, "");
    try { src = decodeURI(src); } catch {} // 100%.png のような % は、そのままのパスとして扱う
    return src.startsWith("/") ? src : src.startsWith("~/") ? `${home()}/${src.slice(2)}` : `${dirname(this.file)}/${src}`;
  }

  // ローカルの画像を見直す。前に読んだ画像が書き換わっていたら（mtime が変わっていたら）、読めなかった画像のファイルが
  // できていたら、覚えた結果を捨てて読み直す。Mermaid の図と http の画像は、中身や URL が変わると key が変わるので、ここではやり直さない
  recheckImages(cx) {
    const local = this.blocks.filter((b) => b.kind === "img" && b.key.startsWith("/") && (this.images.get(b.key)?.mtime || this.images.get(b.key)?.error));
    if (!local.length) return;
    const file = this.file, images = this.images;
    cx.spawn(async (cx) => {
      // 小数のある秒（%Fm）で比べる。同じ 1 秒の中の書き換えも見落とさない。ないファイルは出力に出ない
      const r = await exec("/usr/bin/stat", ["-f", "%Fm %N", ...new Set(local.map((b) => b.key))]).catch(() => null);
      if (!r || this.file !== file || this.images !== images) return;
      const now = new Map(r.stdout.split("\n").filter(Boolean).map((l) => [l.slice(l.indexOf(" ") + 1), l.slice(0, l.indexOf(" "))]));
      let changed = false;
      for (const b of local) {
        const img = this.images.get(b.key);
        const stale = img?.mtime && now.get(b.key) !== img.mtime;
        const appeared = img?.error && now.has(b.key) && now.get(b.key) !== img.errorMtime;
        if (stale || appeared) { this.images.delete(b.key); changed = true; }
      }
      if (changed) this.prepare(cx);
    });
  }

  // 本文を Markdown と画像に分け、まだ用意していない画像をコピーして大きさを調べる。
  prepare(cx) {
    // Marp でないファイルの先頭の frontmatter は、本文として描かずに、枠に入れて先頭に出す
    const fm = this.text.match(FRONTMATTER);
    const rest = fm ? splitBlocks(this.text.slice(fm[0].length)) : splitBlocks(this.text);
    this.blocks = fm?.[1]?.trim() ? [{ kind: "frontmatter", text: fm[1] }, ...rest] : rest;
    for (const b of this.blocks) {
      if (b.kind === "code") b.key = `${b.lang}\n${b.code}`;
      if (b.kind === "img" || b.kind === "mermaid") b.key = this.imageKey(b);
    }
    this.highlight(cx);
    const file = this.file;
    if (!this.imageDir) this.imageDir = `${CACHE_REL}/img-${Date.now()}`;
    const dir = `${appHome()}/${this.imageDir}`;
    this.recheckImages(cx); // 読めなかった画像のファイルができていたら、やり直す
    const todo = [];
    for (const b of this.blocks) {
      if ((b.kind !== "img" && b.kind !== "mermaid") || this.images.has(b.key)) continue;
      this.images.set(b.key, { loading: true });
      todo.push(b);
    }
    if (!todo.length) return;
    // 途中で別のファイルに替わったら（images が新しい Map になったら）、結果を書かずにやめる。パスは、写した先のフォルダから作る
    const images = this.images, imageDir = this.imageDir;
    cx.spawn(async (cx) => {
      await exec("/bin/mkdir", ["-p", dir]);
      for (const [i, b] of todo.entries()) {
        if (this.images !== images) return;
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
            if (this.images !== images) return;
            this.images.set(b.key, { path: png.slice(appHome().length + 1), w: w || 600, h: h || 300 });
            if (this.file === file) cx.notify();
            continue;
          }
          let mtime = null;
          if (/^https?:\/\//.test(b.src)) {
            const r = await exec("/usr/bin/curl", ["-fsSL", "--max-time", "20", "-o", dest, b.src], { timeout: 30000 });
            if (r.code !== 0) throw new Error(r.stderr.trim() || "download failed");
          } else {
            const r = await exec("/bin/cp", [b.key, dest]);
            if (r.code !== 0) throw new Error(r.stderr.trim() || "not found");
            mtime = (await exec("/usr/bin/stat", ["-f", "%Fm", b.key])).stdout.trim() || null;
          }
          let w = 0, h = 0;
          // SVG は大きさを中から読む。読めなければ（大きすぎるなど）、既定の大きさで出す
          if (ext === "svg") [w, h] = svgSize((await readTextFile(dest).catch(() => null)) ?? "");
          else {
            const size = await exec("/usr/bin/sips", ["-g", "pixelWidth", "-g", "pixelHeight", dest]);
            w = Number(size.stdout.match(/pixelWidth: (\d+)/)?.[1]) || 0;
            h = Number(size.stdout.match(/pixelHeight: (\d+)/)?.[1]) || 0;
          }
          if (this.images !== images) return;
          this.images.set(b.key, { path: `${imageDir}/${name}`, w: w || 800, h: h || 450, mtime });
        } catch (e) {
          if (this.images !== images) return;
          // ローカルの画像なら、そのときの mtime（ファイルがなければ null）を覚え、ファイルができたか変わったときだけやり直す
          const errorMtime = b.key.startsWith("/") ? (await exec("/usr/bin/stat", ["-f", "%Fm", b.key]).catch(() => null))?.stdout?.trim() || null : null;
          if (this.images !== images) return;
          this.images.set(b.key, { error: String(e.message ?? e), errorMtime });
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
        if (this.cmd) { this.openLink(url, cx); return; }
        const zoom = settings().zoom || 1;
        this.popup = { url, x: (this.pointer?.x ?? 40) / zoom, y: (this.pointer?.y ?? 40) / zoom };
        cx.notify();
      });
  }

  // リンクの開き方を決める。http・https はブラウザで開き、手元の md はプレビューのダイアログで開き、
  // ほかのローカルのパス（相対・絶対・~/・file://）は Finder で場所を見せる。
  // 相対パスは md ファイルのフォルダから見る。#見出し・ほかのスキーム（mailto: など）は開かない（ポップアップに出すだけ）
  linkTarget(url) {
    if (/^https?:\/\//i.test(url)) return { kind: "web" };
    if (url.startsWith("#") || (/^[a-z][a-z0-9+.-]*:/i.test(url) && !/^file:\/\//i.test(url))) return { kind: "none" };
    let p = url.replace(/^file:\/\//i, "").replace(/[?#].*$/, "");
    try { p = decodeURI(p); } catch {}
    const base = this.file ? dirname(this.file) : home();
    const abs = p.startsWith("/") ? p : p.startsWith("~/") ? `${home()}/${p.slice(2)}` : `${base}/${p}`;
    // . と .. を畳んで、ポップアップに出すパスを読みやすくする
    const parts = [];
    for (const seg of abs.split("/")) {
      if (seg === "" || seg === ".") continue;
      if (seg === "..") parts.pop(); else parts.push(seg);
    }
    const path = `/${parts.join("/")}`;
    // 手元の md は、Finder ではなく md-preview のダイアログで開く（ターミナルの .md のパスを Cmd+クリックしたときと同じ）
    return { kind: /\.(md|markdown)$/i.test(path) ? "md" : "local", path };
  }

  // 開けなかったとき（リンク先のファイルがないなど）は、ポップアップで知らせる
  openLink(url, cx) {
    const t = this.linkTarget(url);
    if (t.kind === "none") return;
    cx.spawn(async (cx) => {
      let r;
      if (t.kind === "md") {
        r = await exec("/bin/test", ["-f", t.path]).catch(() => ({ code: 1 }));
        if (r.code === 0) { openOverlay({ mod: "md-preview", props: { file: t.path }, kind: "dialog", width: DIALOG_WIDTH, height: 0.85 }); return; }
      } else {
        r = await exec("/usr/bin/open", t.kind === "web" ? [url] : ["-R", t.path]).catch((e) => ({ code: 1, stderr: String(e) }));
        if (r.code === 0) return;
      }
      const zoom = settings().zoom || 1;
      this.popup = { url, x: (this.pointer?.x ?? 40) / zoom, y: (this.pointer?.y ?? 40) / zoom,
        error: t.kind === "web" ? (r.stderr?.trim() || "開けませんでした") : "ファイルがありません" };
      cx.notify();
    });
  }

  // まだ色付けしていないコードブロックを、まとめて Shiki に色付けしてもらう。失敗したブロックは、色なしで出したまま
  highlight(cx) {
    const todo = this.blocks.filter((b) => b.kind === "code" && !this.tokens.has(b.key));
    if (!todo.length || this.highlighting) return;
    this.highlighting = true;
    cx.spawn(async (cx) => {
      try {
        const dir = `${appHome()}/${CACHE_REL}/hl-${Date.now()}`;
        await exec("/bin/mkdir", ["-p", dir]);
        await writeTextFile(`${dir}/in.json`, JSON.stringify(todo.map((b) => ({ lang: b.lang, code: b.code }))), null);
        const r = await exec(`${home()}/.local/share/mise/shims/node`,
          [`${appHome()}/mods/md-preview/highlight.mjs`, `${dir}/in.json`, `${dir}/out.json`, `${home()}/.local/share/herdr-md-preview/shiki-${SHIKI_VERSION}`],
          { timeout: 60000 });
        if (r.code === 0) {
          const out = JSON.parse(await readTextFile(`${dir}/out.json`));
          todo.forEach((b, i) => this.tokens.set(b.key, out[i]));
          // 使わなくなった結果は捨てる
          const keep = new Set(this.blocks.filter((b) => b.kind === "code").map((b) => b.key));
          for (const k of [...this.tokens.keys()]) if (!keep.has(k)) this.tokens.delete(k);
        }
        exec("/bin/rm", ["-rf", dir]);
      } catch {} finally {
        this.highlighting = false;
        cx.notify();
        // 色付けの途中に増えたブロックがあれば、続けて色付けする。今回失敗したものは、次に読み直したときにもう一度試す（ここで呼び直すと止まらない）
        const tried = new Set(todo.map((b) => b.key));
        if (this.blocks.some((b) => b.kind === "code" && !this.tokens.has(b.key) && !tried.has(b.key))) this.highlight(cx);
      }
    });
  }

  // md-preview のペインにフォーカスが移ったとき: ファイルを読み直し、変わっていれば描き直す（色付けも、変わったブロックだけし直す）
  recheck(cx) {
    const file = this.file;
    if (!file) return;
    cx.spawn(async (cx) => {
      const text = await this.read(file);
      if (this.file !== file || text == null) return; // 読めなければ、前の表示を残す
      if (text !== this.text || this.error) {
        this.text = text;
        this.error = null;
        this.marp = isMarp(text);
        if (this.marp) this.build(cx);
        else this.prepare(cx);
      } else if (!this.marp) {
        this.highlight(cx);
        this.recheckImages(cx); // 画像だけを差し替えたときのため
      }
      cx.notify();
    });
  }

  copyAll(cx) {
    cx.write_to_clipboard(this.text);
    this.copiedAll = true;
    cx.notify();
    cx.spawn(async (cx) => { await cx.sleep(1500); this.copiedAll = false; cx.notify(); });
  }

  go(delta, cx) {
    if (!this.slides.length) return; // スライドを描き終わる前（または Marp でないファイル）は、めくらない
    this.page = Math.min(this.slides.length - 1, Math.max(0, this.page + delta));
    cx.notify();
  }

  setMode(mode, cx) {
    this.mode = mode;
    cx.notify();
  }

  slideImage(path, w) {
    return image(path).w(w).h(Math.round(w * this.ratio)).flex_none().rounded(4);
  }

  render(cx) {
    // このペインにフォーカスが移ったら読み直す（同じタブで横に並べて、別のペインで書き換えている使い方のため）。
    // ほかの md-preview のペインではなく、自分のキーボードのフォーカスで見る（pane.go で移ったときは "focus" の命令でも読み直す）
    const focusedNow = this.handle.is_focused();
    if (focusedNow && !this.wasFocused) this.recheck(cx);
    this.wasFocused = focusedNow;
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
        // 先頭の frontmatter は、小さな灰色の枠に、書いたままの行で出す
        if (b.kind === "frontmatter") {
          return v_flex().id(`fm-${i}`).flex_none().mb(10).px(10).py(6).rounded(5).border_1().border_color(t.border).bg(t.raised)
            .font_family(TEXT_FONT).text_size(12).text_color(t.dim)
            .children(b.text.split("\n").map((l, n) => div().id(`fm-${i}-${n}`).child(l || " "))); // 長い行は枠の中で折り返す
        }
        if (b.kind === "code") {
          const copied = this.copied === i;
          const toks = this.tokens.get(b.key);
          // 色付けの結果があれば行ごとに色の付いた文字を並べ、なければ色なしで出す。長い行は文字のかたまりの切れ目で折り返す
          const lines = toks ?? b.code.split("\n").map((l) => [{ t: l, c: null, s: 0 }]);
          const lineEl = (spans, n) => h_flex().id(`code-${i}-l${n}`).flex_wrap().min_h(CODE_FONT_SIZE * 1.6)
            .children(spans.map((sp, k) => div().id(`code-${i}-l${n}-${k}`).whitespace_nowrap().text_color(sp.c ?? t.foreground)
              .when(Boolean(sp.s & 1), (e) => e.italic()).when(Boolean(sp.s & 2), (e) => e.font_semibold())
              .when(Boolean(sp.s & 4), (e) => e.underline()).child(sp.t)));
          // flex_none: ファイルが長いとき、縦に並べたブロックが押し縮められないようにする
          // リストの中のブロックは、リストの字に揃うように右にずらす（字下げ 1 つぶんを 7px ほどとする）
          return div().id(`code-${i}`).relative().flex_none().my(8).ml(Math.min(b.indent ?? 0, 12) * 7).rounded(6).border_1().border_color(t.border).bg(t.background)
            .child(v_flex().px(14).py(12).pr(110).font_family(TEXT_FONT).text_size(CODE_FONT_SIZE)
              .children(lines.map((spans, n) => lineEl(spans, n))))
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
          return v_flex().id(`details-${i}`).flex_none().my(6).gap(6)
            .child(h_flex().id(`summary-${i}`).gap(6).px(6).py(2).ml(-6).rounded(5).items_center().cursor_pointer().text_size(14).text_color(t.foreground)
              .hover((s) => s.bg(t.hover))
              .on_click((_e, cx) => { this.opened.set(i, !open); cx.notify(); })
              .child(div().w(12).flex_none().text_size(11).text_color(t.muted).child(open ? "\u25bc" : "\u25b6"))
              .child(b.summary))
            .when(open && Boolean(b.text), (e) => e.child(div().pl(18).child(this.markdown(`details-md-${i}`, b.text, t))));
        }
        if (b.kind === "alert") {
          const a = ALERTS[b.type];
          return v_flex().id(`alert-${i}`).flex_none().my(8).pl(14).py(4).gap(6).border_l(3).border_color(a.color)
            .child(h_flex().gap(7).items_center().text_size(14).font_semibold().text_color(a.color)
              .child(svg(`mods/md-preview/icons/${b.type.toLowerCase()}.svg`).size(15).text_color(a.color))
              .child(a.label))
            .child(this.markdown(`alert-md-${i}`, b.text, t));
        }
        const img = this.images.get(b.key);
        if (!img?.path) {
          const what = b.kind === "mermaid" ? "Mermaid の図" : b.src;
          return div().id(`img-${i}`).my(6).px(10).py(6).rounded(5).border_1().border_color(img?.error ? t.ansi1 : t.border).text_size(12)
            .font_family(settings().font_family ?? settings().font ?? "JetBrains Mono").text_color(img?.error ? t.ansi1 : t.dim)
            .child(img?.error ? `${b.kind === "mermaid" ? "Mermaid の図を描けませんでした" : `画像を読めませんでした: ${b.src}`}\n${img.error}` : `読み込み中: ${what}`);
        }
        const w = Math.min(img.w, Math.max(100, this.width - 56));
        return v_flex().id(`img-${i}`).flex_none().my(8).gap(3).child(image(img.path).w(w).h(Math.round((w * img.h) / img.w)).rounded(4))
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
    const target = this.linkTarget(this.popup.url);
    const hint = target.kind === "web" ? "Click to open in the browser \u00b7 \u2318+click on the link opens it directly"
      : target.kind === "md" ? "Click to preview it \u00b7 \u2318+click on the link does the same"
      : target.kind === "local" ? "Click to show it in Finder \u00b7 \u2318+click on the link does the same"
      : "This link is not opened";
    return v_flex().id("link-popup").absolute().left(x).top(this.popup.y + 14).max_w(w).px(10).py(7).gap(3)
      .rounded(6).border_1().border_color(t.border).bg(t.popover).shadow_md()
      .on_mouse_down_out((_e, cx) => { this.popup = null; cx.notify(); })
      .child(div().id("link-url").text_size(12.5).text_color(target.kind === "none" ? t.muted : t.accent)
        .when(target.kind !== "none", (e) => e.underline().cursor_pointer().hover((s) => s.text_color(t.foreground))
          .on_click((_e, cx) => { const url = this.popup.url; this.popup = null; this.openLink(url, cx); cx.notify(); }))
        .child(target.kind === "local" || target.kind === "md" ? target.path : this.popup.url))
      .child(this.popup.error ? div().text_size(11.5).text_color(t.ansi1).child(this.popup.error) : div().text_size(11).text_color(t.dim).child(hint));
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
    .child(header)
    // ファイルを出している欄の右上に、ファイルの中身（Markdown のまま）をクリップボードに入れるボタンを置く。スクロールしても動かない
    .child(v_flex().relative().flex_1().min_h(0).child(body)
      .when(Boolean(this.file && this.text && !this.error), (el) => el.child(h_flex().id("copy-all").absolute().top(10).right(16).h(24).px(9)
        .items_center().rounded(5).bg(t.raised).border_1().border_color(t.border).text_size(12)
        .text_color(this.copiedAll ? t.ansi2 : t.muted).cursor_pointer().hover((s) => s.text_color(t.foreground))
        .on_click((_e, cx) => this.copyAll(cx))
        .child(this.copiedAll ? "Copied" : "Copy"))))
    .when(Boolean(popup), (el) => el.child(popup));
  }
}
