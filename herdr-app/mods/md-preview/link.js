// ターミナルに出た .md のパスを Cmd を押しながらクリックしたら、md-preview をダイアログで開く。
// リモートのパスや、ファイルとして解決できないものは "pass" して、Herdr の普通の開き方に任せる。
import { openOverlay } from "herdr";

const DIALOG_WIDTH = 860; // ダイアログの幅（px）。読み物に向く幅

export async function handleLink(click) {
  const path = click?.link?.path;
  if (!path) return "pass";
  // 幅は px で決める（割合だと横に広い窓で広くなりすぎる。mod からは窓の大きさを読めないので、割合に上限は付けられない）
  openOverlay({ mod: "md-preview", props: { file: path }, kind: "dialog", width: DIALOG_WIDTH, height: 0.85 });
  return "handled";
}
