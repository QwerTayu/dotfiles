/// <reference path="../types/fresh.d.ts" />
const editor = getEditor();

/**
 * File Icons
 *
 * ファイル一覧（File Explorer）の各行の頭に、ファイルの種類を表す Nerd Font のアイコンを出す。
 * VS Code の vscode-icons の代わり。アイコンと色は nvim-web-devicons をもとにしている。
 * ターミナルのフォントが Nerd Font（Ghostty の HackGen Console NF）でないと、アイコンは □ や ? になる。
 *
 * fresh の API はパスごとにアイコンを指定する作りなので、起動時にプロジェクトのファイルをたどって全部に付ける。
 * その後はファイルの保存・作成・名前変更のときに、そのファイルだけ付け直す。
 */

const NAMESPACE = "file-icons";

// 中をたどらないフォルダ（フォルダ自体にはアイコンを付ける）。
// 依存パッケージ・キャッシュ・.git のように、中身が多くて普段は開かないもの。
const SKIP_DIRS = new Set([
  "node_modules", ".git", ".venv", "venv",
  ".cache", "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache",
  ".next", ".nuxt", ".turbo", ".parcel-cache", ".svelte-kit", ".gradle",
]);

// たどるファイル数の上限（巨大なフォルダを開いたときに止まらないように）
const MAX_ENTRIES = 20000;

type Icon = [string, [number, number, number]];
const hex = (h: string): [number, number, number] =>
  [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const icon = (glyph: string, color: string): Icon => [glyph, hex(color)];

const DEFAULT_FILE = icon("", "#6d8086");
const DEFAULT_DIR = icon("", "#90a4ae");

// フォルダ名で決まるアイコン
const DIR_ICONS: Record<string, Icon> = {
  ".git": icon("", "#f54d27"),
  ".github": icon("", "#90a4ae"),
  ".vscode": icon("", "#0078d4"),
  "node_modules": icon("", "#cb3837"),
  ".venv": icon("", "#ffbc03"),
  "venv": icon("", "#ffbc03"),
};

// ファイル名で決まるアイコン（拡張子より優先）
const NAME_ICONS: Record<string, Icon> = {
  "package.json": icon("", "#e8274b"),
  "package-lock.json": icon("", "#7a0d21"),
  "Dockerfile": icon("", "#458ee6"),
  "docker-compose.yml": icon("", "#458ee6"),
  "Makefile": icon("", "#6d8086"),
  "Brewfile": icon("", "#701516"),
  "LICENSE": icon("", "#d0bf41"),
  ".gitignore": icon("", "#f54d27"),
  ".gitattributes": icon("", "#f54d27"),
  ".gitmodules": icon("", "#f54d27"),
  ".env": icon("", "#faf743"),
  "bashrc": icon("", "#89e051"),
  "bash_profile": icon("", "#89e051"),
  ".bashrc": icon("", "#89e051"),
  ".bash_profile": icon("", "#89e051"),
  "gitconfig": icon("", "#f54d27"),
};

// 拡張子（小文字、ドットなし）で決まるアイコン
const EXT_ICONS: Record<string, Icon> = {
  ts: icon("", "#519aba"),
  mts: icon("", "#519aba"),
  cts: icon("", "#519aba"),
  tsx: icon("", "#1354bf"),
  js: icon("", "#cbcb41"),
  mjs: icon("", "#f1e05a"),
  cjs: icon("", "#cbcb41"),
  jsx: icon("", "#20c2e3"),
  json: icon("", "#cbcb41"),
  jsonc: icon("", "#cbcb41"),
  md: icon("", "#dddddd"),
  mdx: icon("", "#519aba"),
  py: icon("", "#ffbc03"),
  go: icon("", "#00add8"),
  rs: icon("", "#dea584"),
  sh: icon("", "#89e051"),
  bash: icon("", "#89e051"),
  zsh: icon("", "#89e051"),
  yml: icon("", "#6d8086"),
  yaml: icon("", "#6d8086"),
  toml: icon("", "#9c4221"),
  html: icon("", "#e44d26"),
  css: icon("", "#42a5f5"),
  scss: icon("", "#f55385"),
  vue: icon("", "#8dc149"),
  svelte: icon("", "#ff3e00"),
  astro: icon("", "#e23f67"),
  c: icon("", "#599eff"),
  h: icon("", "#a074c4"),
  cpp: icon("", "#519aba"),
  hpp: icon("", "#a074c4"),
  cs: icon("\u{f031b}", "#596706"),
  java: icon("", "#cc3e44"),
  rb: icon("", "#701516"),
  php: icon("", "#a074c4"),
  sql: icon("", "#dad8d8"),
  prisma: icon("", "#5a67d8"),
  tex: icon("", "#3d6117"),
  lock: icon("", "#bbbbbb"),
  svg: icon("\u{f0721}", "#ffb13b"),
  png: icon("", "#a074c4"),
  jpg: icon("", "#a074c4"),
  jpeg: icon("", "#a074c4"),
  gif: icon("", "#a074c4"),
  webp: icon("", "#a074c4"),
  ico: icon("", "#cbcb41"),
  pdf: icon("", "#b30b00"),
  txt: icon("", "#89e051"),
  csv: icon("", "#89e051"),
  log: icon("", "#dddddd"),
  xml: icon("\u{f05c0}", "#e37933"),
  plist: icon("\u{f05c0}", "#e37933"),
  ghostty: icon("", "#cccccc"),
  rayconfig: icon("", "#ff6363"),
};

function iconFor(name: string, isDir: boolean): Icon {
  if (isDir) return DIR_ICONS[name] ?? DEFAULT_DIR;
  if (NAME_ICONS[name]) return NAME_ICONS[name];
  if (name.startsWith(".env.")) return NAME_ICONS[".env"];
  if (/^readme(\.|$)/i.test(name)) return icon("", "#519aba");
  const dot = name.lastIndexOf(".");
  if (dot > 0) {
    const ext = name.slice(dot + 1).toLowerCase();
    if (EXT_ICONS[ext]) return EXT_ICONS[ext];
  }
  return DEFAULT_FILE;
}

// パス → アイコンの行。setFileExplorerSlots は名前空間ごと全部を置き換えるので、全体をここに持つ。
const slots = new Map<string, Record<string, unknown>>();

function setIcon(path: string, isDir: boolean) {
  const [glyph, color] = iconFor(editor.pathBasename(path), isDir);
  slots.set(path, { path, leading: { text: glyph + " ", color, minWidth: 2 }, priority: 10 });
}

let scanToken = 0;

// root 以下をたどってアイコンを付ける。数百フォルダごとに休んで、その間も編集できるようにする。
async function scan(root: string, token: number) {
  const stack = [root];
  let dirs = 0;
  while (stack.length > 0 && slots.size < MAX_ENTRIES) {
    if (token !== scanToken) return; // 新しいスキャンが始まったら古いほうはやめる
    const dir = stack.pop()!;
    for (const e of editor.readDir(dir)) {
      const path = editor.pathJoin(dir, e.name);
      setIcon(path, e.is_dir);
      if (e.is_dir && !SKIP_DIRS.has(e.name)) stack.push(path);
    }
    if (++dirs % 200 === 0) await editor.delay(0);
  }
}

function apply() {
  editor.setFileExplorerSlots(NAMESPACE, Array.from(slots.values()));
}

async function rescanAll() {
  const token = ++scanToken;
  slots.clear();
  await scan(editor.getCwd(), token);
  if (token === scanToken) apply();
}

// 保存・作成・名前変更されたパスだけ付け直す（フォルダならその中もたどる）
async function refreshPath(path: string | undefined) {
  if (!path) return;
  const entries = editor.readDir(path);
  if (entries.length > 0 || !editor.fileExists(path)) {
    // フォルダ（または消えたパス）。消えたものは古い行が残るだけで害はないので、そのままにする
    if (editor.fileExists(path)) {
      setIcon(path, true);
      if (!SKIP_DIRS.has(editor.pathBasename(path))) await scan(path, scanToken);
    }
  } else {
    setIcon(path, false);
  }
  apply();
}

// どの非同期処理も、例外を外に出すとプラグイン全体が止まるので握りつぶしてログに残す
const safe = (f: () => Promise<void>) => {
  f().catch((e) => editor.debug(`file_icons: ${e}`));
};

registerHandler("file_icons_rescan", () => safe(rescanAll));
registerHandler("file_icons_on_change", (ev: { path?: string }) => safe(() => refreshPath(ev?.path)));

editor.on("editor_initialized", "file_icons_rescan");
editor.on("after_file_save", "file_icons_on_change");
editor.on("after_file_explorer_change", "file_icons_on_change");

// fresh の外（git checkout など）で増えたファイルにも付けたいときに使う
editor.registerCommand("File Icons: Refresh", "Re-scan the project and refresh file explorer icons", "file_icons_rescan", null);

// プラグインを読み込み直したとき（editor_initialized が来ない）にも付ける
safe(rescanAll);
