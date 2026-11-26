// md-preview の mod が呼ぶ、コードブロックの色付け（Shiki）。
// 使い方: node highlight.mjs <入力の JSON> <出力の JSON> <Shiki を入れたフォルダ>
//   入力: [{ "lang": "js", "code": "..." }, ...]
//   出力: [[[{ "t": 文字, "c": "#rrggbb", "s": 字の飾り（1 斜体・2 太字・4 下線） }, ...（1 行ぶん）], ...（1 ブロックぶん）], ...]
// テーマは VS Code の Dark+（Dark Modern と同じ構文の色）。知らない言語は色を付けない（text）。
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const [input, output, shikiDir] = process.argv.slice(2);
const shiki = await import(pathToFileURL(`${shikiDir}/node_modules/shiki/dist/index.mjs`).href);
const blocks = JSON.parse(readFileSync(input, "utf8"));
const THEME = "dark-plus";

const known = new Set(Object.keys(shiki.bundledLanguages));
const aliases = new Map(shiki.bundledLanguagesInfo.flatMap((l) => (l.aliases ?? []).map((a) => [a, l.id])));
const resolve = (lang) => {
  const l = (lang || "").toLowerCase();
  if (known.has(l)) return l;
  if (aliases.has(l)) return aliases.get(l);
  return "text";
};
const langs = [...new Set(blocks.map((b) => resolve(b.lang)).filter((l) => l !== "text"))];
const hl = await shiki.createHighlighter({ themes: [THEME], langs });

const out = blocks.map((b) => {
  const lang = resolve(b.lang);
  const { tokens } = hl.codeToTokens(b.code, { lang, theme: THEME });
  return tokens.map((line) => line.map((tk) => ({ t: tk.content, c: tk.color, s: tk.fontStyle || 0 })));
});
writeFileSync(output, JSON.stringify(out));
