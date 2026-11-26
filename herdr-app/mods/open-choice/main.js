// open-choice: Cmd+クリックしたローカルのパスを、どう開くか選ぶダイアログ（link.js が開く）。
//   1. 既定のアプリで開く（open）   2. Finder でファイルの場所を開く（open -R）
// 1・2 のキーでも選べる。Enter は 1、Esc で閉じる。
import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, exec, theme, closeOverlay } from "herdr";

const basename = (p) => p.replace(/\/+$/, "").split("/").pop() || p;

export default class OpenChoice extends View {
  init(_props, cx) {
    this.path = props()?.path ?? "";
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.error = null;
  }

  async run(args, cx) {
    const r = await exec("/usr/bin/open", args).catch((e) => ({ code: 1, stderr: String(e) }));
    if (r.code !== 0) { this.error = r.stderr.trim() || "Could not open it"; cx.notify(); return; }
    closeOverlay(props().overlay);
  }

  choose(n, cx) {
    if (n === 1) cx.spawn(async (cx) => this.run([this.path], cx));
    if (n === 2) cx.spawn(async (cx) => this.run(["-R", this.path], cx));
  }

  render(_cx) {
    const t = theme();
    const option = (n, label, hint) => h_flex().id(`opt-${n}`).h(40).px(12).gap(10).items_center().rounded(7).cursor_pointer()
      .bg(t.raised).hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => this.choose(n, cx))
      .child(div().w(18).flex_none().text_size(12).text_color(t.dim).child(String(n)))
      .child(v_flex().flex_1().min_w(0)
        .child(div().text_size(13).text_color(t.foreground).child(label))
        .child(div().text_size(11.5).text_color(t.dim).truncate().child(hint)));
    return v_flex().id("root").w_full().p(14).gap(8).bg(t.popover).track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "1" || e.key === "enter") { this.choose(1, cx); cx.stop_propagation(); }
        else if (e.key === "2") { this.choose(2, cx); cx.stop_propagation(); }
      })
      .child(div().text_size(14).font_semibold().text_color(t.foreground).truncate().child(basename(this.path)))
      .child(div().text_size(11.5).text_color(t.dim).truncate().child(this.path))
      .child(div().h(4))
      .child(option(1, "Open with the default app", "open"))
      .child(option(2, "Reveal in Finder", "open -R"))
      .when(Boolean(this.error), (e) => e.child(div().text_size(12).text_color(t.ansi1).child(this.error)));
  }
}
