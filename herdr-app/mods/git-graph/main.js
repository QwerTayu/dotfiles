// Git Graph: 今の space のリポジトリのコミットの履歴を、枝の線つきで一覧にする（VS Code の Git Graph の代わり）。
// コマンドパレットの「Git Graph」でタブとして開く。行を押すと、下に変わったファイルの一覧を出し、ファイルを押すとその差分に切り替える（← で一覧に戻る）。
// 読むだけで、git の状態は変えない（--no-optional-locks）。
// 枝の線は git log --graph の文字を使わず、各コミットの親から列（lane）を計算して、行ごとに曲線で描く。
import { View, div, PathBuilder } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, exec, theme, settings, window as appWindow } from "herdr";

const SEP = "\x1f";
const MAX = 400; // 読むコミットの数（多すぎると描くのが重くなる）
const ROW = 24; // 行の高さ
const LANE = 14; // 列の幅
const PAD = 10; // 左の余白
const DOT = 4; // コミットの丸の半径
const DETAIL = 360; // コミットの詳細の欄の高さ（既定）。境界をドラッグで変えられ、localStorage に残す
const DETAIL_MIN = 120;
const COLORS = ["ansi12", "ansi13", "ansi10", "ansi11", "ansi14", "ansi9", "ansi4", "ansi5", "ansi2", "ansi3", "ansi6", "ansi1"];
const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false"];

function activeSpace() {
  return spaces().find((s) => s.active) ?? null;
}

const x = (lane) => PAD + lane * LANE + LANE / 2;

// コミットを新しい順に受け取り、行ごとの線（上半分・下半分）と丸の位置を決める。
// slots[i] は、列 i が次に待っているコミット（親）のハッシュ。colors[i] はその列の色。
function layout(commits) {
  const slots = [];
  const colors = [];
  let nextColor = 0;
  const takeFree = () => {
    let i = slots.indexOf(null);
    if (i < 0) { i = slots.length; slots.push(null); colors.push(0); }
    return i;
  };
  return commits.map((c) => {
    const top = []; // 上半分の線: [from x 列, to x 列, 色]
    const bottom = []; // 下半分の線
    let lane = slots.indexOf(c.hash);
    if (lane < 0) {
      lane = takeFree();
      colors[lane] = nextColor++;
    }
    const color = colors[lane];
    // 上半分: 待っている列はまっすぐ下へ。このコミットを待っていた列は、丸へ曲がって合流する。
    slots.forEach((h, i) => {
      if (h === null) return;
      if (h === c.hash) top.push([i, lane, colors[i]]);
      else top.push([i, i, colors[i]]);
    });
    slots.forEach((h, i) => { if (h === c.hash && i !== lane) slots[i] = null; });
    // 下半分: 1 つ目の親は同じ列で続ける。2 つ目からの親は、すでに待っている列か、空いた列へ曲がって出る。
    const [first, ...rest] = c.parents;
    slots[lane] = first ?? null;
    const outs = [];
    for (const p of rest) {
      let i = slots.indexOf(p);
      if (i < 0) {
        i = takeFree();
        slots[i] = p;
        colors[i] = nextColor++;
      }
      outs.push([lane, i, colors[i]]);
    }
    while (slots.length && slots[slots.length - 1] === null) { slots.pop(); colors.pop(); }
    slots.forEach((h, i) => {
      if (h === null) return;
      if (i === lane) bottom.push([lane, lane, color]);
      else if (!outs.some((o) => o[1] === i)) bottom.push([i, i, colors[i]]);
    });
    bottom.push(...outs);
    const width = Math.max(lane + 1, ...top.map((s) => Math.max(s[0], s[1]) + 1), ...bottom.map((s) => Math.max(s[0], s[1]) + 1));
    return { ...c, lane, color, top, bottom, width, merge: c.parents.length > 1 };
  });
}

function parse(text) {
  return text.split("\n").filter((l) => l.includes(SEP)).map((line) => {
    const [hash, parents, short, refs, subject, author, date] = line.split(SEP);
    return { hash, parents: parents ? parents.split(" ") : [], short, refs: refs ? refs.split(", ") : [], subject, author, date };
  });
}

export default class GitGraph extends View {
  init(_props, cx) {
    this.rows = [];
    this.width = 1;
    this.raw = null;
    this.error = null;
    this.root = null;
    this.on = null;
    this.key = null;
    this.loading = false;
    this.selected = null;
    this.detailH = DETAIL;
    try { this.detailH = Number(localStorage.getItem("detailH")) || DETAIL; } catch {}
    this.drag = null;
    this.size = null;
    this.info = null;
    this.files = [];
    this.file = null;
    this.diff = [];
    cx.timer.every(5000, (cx) => {
      if (appWindow()?.visible === false) return;
      this.refresh(cx);
    });
    this.refresh(cx);
  }

  refresh(cx) {
    const s = activeSpace();
    if (!s || this.loading) return;
    const key = JSON.stringify([s.machine, s.folder]);
    this.loading = true;
    cx.spawn(async (cx) => {
      try {
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: s.folder, on: s.machine });
        if (key !== this.key) {
          this.key = key;
          this.selected = null;
          this.raw = null;
        }
        if (top.code !== 0) {
          this.root = null;
          this.rows = [];
          this.error = `git のリポジトリではありません: ${s.folder}`;
          return;
        }
        this.root = top.stdout.trim();
        this.on = s.machine;
        const r = await exec("git", [...READ, "log", "--all", "--date-order", `--max-count=${MAX}`, "--date=format:%Y-%m-%d %H:%M",
          `--format=%H${SEP}%P${SEP}%h${SEP}%D${SEP}%s${SEP}%an${SEP}%ad`], { cwd: this.root, on: this.on });
        if (r.code !== 0) {
          this.error = r.stderr.trim() || "git log に失敗しました";
          return;
        }
        this.error = null;
        if (r.stdout !== this.raw) {
          this.raw = r.stdout;
          this.rows = layout(parse(r.stdout));
          this.width = Math.max(1, ...this.rows.map((row) => row.width));
        }
      } catch (e) {
        this.error = String(e);
      } finally {
        this.loading = false;
        cx.notify();
      }
    });
  }

  // コミットを押すと、メッセージと変わったファイルの一覧を読む。マージは 1 つ目の親との差を出す。
  select(hash, cx) {
    if (this.selected === hash) {
      this.selected = null;
      cx.notify();
      return;
    }
    this.selected = hash;
    this.info = null;
    this.files = [];
    this.file = null;
    this.diff = [];
    cx.notify();
    const root = this.root, on = this.on;
    cx.spawn(async (cx) => {
      const [info, status, stat] = await Promise.all([
        exec("git", [...READ, "show", "-s", "--date=format:%Y-%m-%d %H:%M", "--format=%H%n%an <%ae>%n%ad%n%B", hash], { cwd: root, on }),
        exec("git", [...READ, "show", "-m", "--first-parent", "--format=", "--name-status", "--no-renames", hash], { cwd: root, on }),
        exec("git", [...READ, "show", "-m", "--first-parent", "--format=", "--numstat", "--no-renames", hash], { cwd: root, on }),
      ]);
      if (this.selected !== hash) return;
      const [full, author, date, ...message] = info.stdout.split("\n");
      this.info = { full, author, date, message: message.join("\n").trim() };
      const counts = new Map(stat.stdout.split("\n").filter(Boolean).map((l) => {
        const [add, del, ...path] = l.split("\t");
        return [path.join("\t"), { add, del }];
      }));
      this.files = status.stdout.split("\n").filter(Boolean).map((l) => {
        const [st, ...path] = l.split("\t");
        const name = path.join("\t");
        return { status: st, path: name, ...(counts.get(name) ?? { add: "-", del: "-" }) };
      });
      cx.notify();
    });
  }

  // 押したファイルの、そのコミットでの差分を読む。
  openFile(path, cx) {
    this.file = path;
    this.diff = [];
    cx.notify();
    const hash = this.selected, root = this.root, on = this.on;
    cx.spawn(async (cx) => {
      const r = await exec("git", [...READ, "show", "-m", "--first-parent", "--format=", "--no-renames", "--no-color", hash, "--", path], { cwd: root, on });
      if (this.selected !== hash || this.file !== path) return;
      const lines = r.stdout.split("\n");
      const at = lines.findIndex((l) => l.startsWith("@@"));
      this.diff = at < 0 ? [r.stdout.trim() || "（差分なし。バイナリのファイルかもしれない）"] : lines.slice(at);
      cx.notify();
    });
  }

  detailView(t, mono) {
    const info = this.info;
    const fileRow = (f, i) => {
      const on = f.path === this.file;
      const color = f.status === "A" ? t.ansi2 : f.status === "D" ? t.ansi1 : t.ansi3;
      const slash = f.path.lastIndexOf("/");
      return h_flex().id(`f-${i}`).h(22).flex_none().px(10).gap(6).items_center().cursor_pointer().text_size(12)
        .bg(on ? t.selected : t.surface).hover((s) => s.bg(on ? t.selected : t.hover))
        .on_click((_e, cx) => this.openFile(f.path, cx))
        .child(div().w(12).flex_none().text_color(color).child(f.status[0]))
        .child(div().flex_none().text_color(t.foreground).child(f.path.slice(slash + 1)))
        .child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(slash > 0 ? f.path.slice(0, slash) : ""))
        .child(div().flex_none().text_size(11).text_color(t.ansi2).child(`+${f.add}`))
        .child(div().flex_none().text_size(11).text_color(t.ansi1).child(`\u2212${f.del}`));
    };
    const diffLine = (line, i) => {
      const kind = line[0];
      return div().id(`l-${i}`).px(10).flex_none().whitespace_nowrap()
        .when(kind === "+", (e) => e.bg(t.ansi2 + "18").text_color(t.foreground))
        .when(kind === "-", (e) => e.bg(t.ansi1 + "18").text_color(t.foreground))
        .when(kind === "@", (e) => e.text_color(t.ansi6).mt(4))
        .when(kind !== "+" && kind !== "-" && kind !== "@", (e) => e.text_color(t.muted))
        .child(line.replace(/\t/g, "    ") || " ");
    };
    if (this.file) {
      const bar = h_flex().h(28).flex_none().px(6).gap(6).items_center().border_b(1).border_color(t.border).bg(t.chrome)
        .child(div().id("back").px(8).py(1).rounded(5).text_size(13).text_color(t.muted).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground))
          .on_click((_e, cx) => { this.file = null; this.diff = []; cx.notify(); }).child("\u2190"))
        .child(div().flex_1().min_w(0).truncate().text_size(12).font_family(mono).text_color(t.foreground).child(this.file));
      const lines = v_flex().id("diff").flex_1().min_h(0).overflow_y_scrollbar().py(6).font_family(mono).text_size(12)
        .children(this.diff.map(diffLine));
      return v_flex().id("detail").h(this.detailH).flex_none().border_t(1).border_color(t.border).bg(t.background).child(bar).child(lines);
    }
    return v_flex().id("detail").h(this.detailH).flex_none().border_t(1).border_color(t.border).bg(t.background)
      .child(v_flex().flex_none().p(10).gap(3).border_b(1).border_color(t.border)
        .child(div().text_size(12.5).text_color(t.foreground).child(info?.message ?? "読み込み中…"))
        .child(div().text_size(11.5).text_color(t.dim).child(info ? `${info.author} · ${info.date}` : ""))
        .child(div().text_size(11).font_family(mono).text_color(t.dim).child(info?.full ?? "")))
      .child(v_flex().id("files").flex_1().min_h(0).overflow_y_scrollbar().children(this.files.map(fileRow)));
  }

  // 1 行ぶんの枝の線と丸。上半分は行の上端から丸の高さへ、下半分は丸の高さから下端へ、列が変わるときは曲線で結ぶ。
  graph(row, t) {
    const mid = ROW / 2;
    const color = (i) => t[COLORS[i % COLORS.length]];
    const segment = ([from, to, c], y0, y1) => {
      const start = PathBuilder.stroke(2).move_to(x(from), y0);
      const p = from === to ? start.line_to(x(to), y1) : start.cubic_bezier_to(x(to), y1, x(from), (y0 + y1) / 2, x(to), (y0 + y1) / 2);
      return window.paint_path(p.build(), color(c)).absolute().top(0).left(0).size_full();
    };
    const cx0 = x(row.lane);
    const dot = PathBuilder.fill().move_to(cx0 + DOT, mid).arc_to(DOT, DOT, 0, false, true, cx0 - DOT, mid).arc_to(DOT, DOT, 0, false, true, cx0 + DOT, mid).close();
    const parts = [
      ...row.top.map((s) => segment(s, 0, mid)),
      ...row.bottom.map((s) => segment(s, mid, ROW)),
      window.paint_path(dot.build(), row.merge ? t.surface : color(row.color)).absolute().top(0).left(0).size_full(),
    ];
    if (row.merge) {
      const ring = PathBuilder.stroke(2).move_to(cx0 + DOT, mid).arc_to(DOT, DOT, 0, false, true, cx0 - DOT, mid).arc_to(DOT, DOT, 0, false, true, cx0 + DOT, mid).close();
      parts.push(window.paint_path(ring.build(), color(row.color)).absolute().top(0).left(0).size_full());
    }
    return div().relative().flex_none().w(PAD + this.width * LANE + 6).h(ROW).children(parts);
  }

  refBadge(ref, t, laneColor) {
    const head = ref.startsWith("HEAD -> ");
    const tag = ref.startsWith("tag: ");
    const remote = !head && !tag && ref.includes("/");
    const label = head ? ref.slice(8) : tag ? ref.slice(5) : ref;
    const color = tag ? t.ansi3 : laneColor;
    return h_flex().flex_none().h(18).px(6).gap(4).items_center().rounded(4).text_size(11.5)
      .when(!remote, (el) => el.bg(color).text_color("#ffffff"))
      .when(remote, (el) => el.border_1().border_color(color).text_color(color).italic())
      .when(head, (el) => el.font_semibold().child(div().text_color("#ffffff").child("●")))
      .child(tag ? `🏷 ${label}` : label);
  }

  row(r, i, t) {
    const on = r.hash === this.selected;
    const laneColor = t[COLORS[r.color % COLORS.length]];
    return h_flex().id(`row-${i}`).h(ROW).flex_none().items_center().gap(6).pr(10).text_size(12.5).cursor_pointer()
      .bg(on ? t.selected : t.surface).hover((s) => s.bg(on ? t.selected : t.hover))
      .on_click((_e, cx) => this.select(r.hash, cx))
      .child(this.graph(r, t))
      .child(h_flex().flex_none().gap(4).children(r.refs.map((ref) => this.refBadge(ref, t, laneColor))))
      .child(div().flex_1().min_w(0).truncate().text_color(r.merge ? t.muted : t.foreground).child(r.subject))
      .child(div().w(110).flex_none().truncate().text_color(t.muted).child(r.author))
      .child(div().w(112).flex_none().text_color(t.dim).child(r.date))
      .child(div().w(62).flex_none().font_family(settings().font_family ?? settings().font ?? "JetBrains Mono").text_color(t.dim).child(r.short));
  }

  render(cx) {
    const t = theme();
    const mono = settings().font_family ?? settings().font ?? "JetBrains Mono";
    const s = activeSpace();
    if (s && JSON.stringify([s.machine, s.folder]) !== this.key && !this.loading) this.refresh(cx);
    const header = h_flex().h(34).flex_none().px(12).gap(8).items_center().border_b(1).border_color(t.border).bg(t.chrome)
      .child(div().text_size(12.5).font_semibold().text_color(t.foreground).child("Git Graph"))
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.dim).child(this.root ?? s?.folder ?? ""))
      .child(div().id("refresh").px(8).py(2).rounded(5).text_size(12).text_color(t.muted).cursor_pointer()
        .hover((st) => st.bg(t.hover).text_color(t.foreground))
        .on_click((_e, cx) => this.refresh(cx)).child(this.loading ? "…" : "↻"));
    const body = this.error
      ? div().p(12).text_size(12.5).text_color(t.muted).child(this.error)
      : v_flex().id("list").flex_1().min_h(0).overflow_y_scrollbar().children(this.rows.map((r, i) => this.row(r, i, t)));
    const detail = this.selected ? this.detailView(t, mono) : null;
    // 一覧と詳細の境界。上下にドラッグすると詳細の欄の高さが変わる
    const splitter = div().id("splitter").h(5).flex_none().mt(-2).cursor_row_resize()
      .bg(this.drag ? t.accent : t.surface).hover((st) => st.bg(t.accent))
      .on_mouse_down("left", (e) => { this.drag = { y: e.position.y, h: this.detailH }; });
    return v_flex().id("root").size_full().bg(t.surface)
      .on_size_change((size, cx) => { this.size = size; cx.notify(); })
      .on_window_mouse_move((e, cx) => {
        if (!this.drag) return;
        if (e.pressed_button !== "left") { this.endDrag(cx); return; }
        const zoom = settings().zoom || 1;
        const max = Math.max(DETAIL_MIN, (this.size?.height ?? 800) / zoom - 120);
        this.detailH = Math.round(Math.min(max, Math.max(DETAIL_MIN, this.drag.h - (e.position.y - this.drag.y) / zoom)));
        cx.notify();
      })
      .on_window_mouse_up("left", (_e, cx) => this.endDrag(cx))
      .child(header).child(body)
      .when(Boolean(detail), (el) => el.child(splitter).child(detail));
  }

  endDrag(cx) {
    if (!this.drag) return;
    this.drag = null;
    try { localStorage.setItem("detailH", String(this.detailH)); } catch {}
    cx.notify();
  }
}
