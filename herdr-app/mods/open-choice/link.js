// ターミナルに出たローカルのパスを Cmd を押しながらクリックしたら、開き方を選ぶダイアログ（main.js）を出す。
// .md は、layout の link_handlers で先にある md-preview が引き受ける。リモートのパスや解決できないものは "pass" して、普通の開き方に任せる。
import { openOverlay } from "herdr";

export async function handleLink(click) {
  const path = click?.link?.path;
  if (!path || click?.source?.machine) return "pass";
  openOverlay({ mod: "open-choice", props: { path }, kind: "dialog", width: 460 });
  return "handled";
}
