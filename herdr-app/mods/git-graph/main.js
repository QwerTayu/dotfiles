// Git Graph: 今の space のリポジトリのコミットの履歴を、枝の線つきで一覧にする（VS Code の Git Graph の代わり）。
// コマンドパレットの「Git Graph」でタブとして開く。行を押すと、下に変わったファイルの一覧を出し、ファイルを押すとその差分に切り替える（← で一覧に戻る）。
// 一番上に、まだコミットしていない変更の行を出す。ブランチで絞り込み、メッセージ・作った人・ハッシュ・ブランチ名で検索できる。
// 読むだけで、git の状態は変えない（--no-optional-locks）。
// 枝の線は git log --graph の文字を使わず、各コミットの親から列（lane）を計算して、行ごとに曲線で描く。
import { View, div, svg, PathBuilder } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, ScrollHandle } from "gpui-base";
import { spaces, exec, theme, settings, window as appWindow, nextCommand } from "herdr";

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
const WIP = "*uncommitted*"; // まだコミットしていない変更の行のハッシュの代わり

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
    const created = new Set(); // この行で新しく作った列（上から来る線がない）
    for (const p of rest) {
      let i = slots.indexOf(p);
      if (i < 0) {
        i = takeFree();
        slots[i] = p;
        colors[i] = nextColor++;
        created.add(i);
      }
      outs.push([lane, i, colors[i]]);
    }
    while (slots.length && slots[slots.length - 1] === null) { slots.pop(); colors.pop(); }
    slots.forEach((h, i) => {
      if (h === null) return;
      if (i === lane) bottom.push([lane, lane, color]);
      // すでにある列は、マージの曲線が合流しても、まっすぐな線を残す（省くと丸の高さから下端まで途切れる）
      else if (!created.has(i)) bottom.push([i, i, colors[i]]);
    });
    bottom.push(...outs);
    const width = Math.max(lane + 1, ...top.map((s) => Math.max(s[0], s[1]) + 1), ...bottom.map((s) => Math.max(s[0], s[1]) + 1));
    return { ...c, lane, color, top, bottom, width, merge: c.parents.length > 1, wip: c.hash === WIP };
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
    this.branch = null; // null: すべてのブランチ
    this.branches = [];
    this.menu = false;
    this.q = "";
    this.matchAt = -1;
    this.scroll = ScrollHandle.new();
    this.search = InputState.new({ placeholder: "Search (message, author, hash, branch)" });
    this.search.on("change", (_e, cx) => { this.q = this.search.value().trim().toLowerCase(); this.matchAt = -1; cx.notify(); });
    this.search.on("submit", (_e, cx) => this.jump(1, cx));
    cx.timer.every(5000, (cx) => {
      if (appWindow()?.visible === false) return;
      this.refresh(cx);
    });
    this.refresh(cx);
    // 外からの操作（`herdr-app do git-graph.<命令>`）。マウスで押すのと同じことを、コマンドでもできるようにする
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        this.command(c, cx);
        cx.notify();
      }
    });
  }

  // 命令の一覧（`herdr-app do git-graph.<命令>`）。<hash> は短いハッシュでもよい（先頭が合うコミット）
  //   select-<hash>          そのコミットを選んで、そこまでスクロールする
  //   next / prev            選んでいるコミットの 1 つ下・上を選ぶ（何も選んでいなければ一番上）
  //   unselect               選ぶのをやめて、詳しい表示を閉じる
  //   file-N                 選んだコミットの N 番目（1 から）のファイルの差分を出す
  //   back                   差分からファイルの一覧に戻る
  //   goto-<hash>            選ばずに、そのコミットまでスクロールする
  //   top / bottom           一覧の一番上・下までスクロールする
  //   menu                   ブランチのメニューを開く・閉じる
  command(c, cx) {
    const rows = this.rows ?? [];
    const find = (h) => rows.findIndex((r) => r.hash !== WIP && h && r.hash.startsWith(h.toLowerCase()));
    const pick = (i) => {
      if (i < 0 || i >= rows.length) return;
      if (this.selected !== rows[i].hash) this.select(rows[i].hash, cx);
      this.scroll.scroll_to_item(i);
    };
    let m;
    if ((m = c.match(/^select-([0-9a-f]+)$/i))) pick(find(m[1]));
    else if ((m = c.match(/^goto-([0-9a-f]+)$/i))) { const i = find(m[1]); if (i >= 0) this.scroll.scroll_to_item(i); }
    else if (c === "next" || c === "prev") {
      const at = rows.findIndex((r) => r.hash === this.selected);
      pick(at < 0 ? 0 : at + (c === "next" ? 1 : -1));
    }
    else if (c === "unselect") this.clearSelection();
    else if ((m = c.match(/^file-(\d+)$/))) { const f = this.files[Number(m[1]) - 1]; if (f) this.openFile(f.path, cx); }
    else if (c === "back") { this.file = null; this.diff = []; }
    else if (c === "menu") this.menu = !this.menu;
    else if (c === "top") this.scroll.scroll_to_item(0);
    else if (c === "bottom" && rows.length) this.scroll.scroll_to_item(rows.length - 1);
  }

  // queue: 読み直しの途中に頼まれたら、終わってからもう一度読む（ブランチを選んだ・↻ を押したとき）。
  // 5 秒ごとの読み直しは queue を付けない。重いリポジトリで前の回と重なったら、その回は飛ばす（休みなく git を走らせない）
  refresh(cx, { queue = false } = {}) {
    const s = activeSpace();
    if (!s) return;
    if (this.loading) { if (queue) this.again = true; return; }
    const key = JSON.stringify([s.machine, s.folder]);
    // space が替わったら、先に key を変えておく（git が失敗しても、render から同じ space を何度も読み直さない）
    if (key !== this.key) {
      this.key = key;
      this.clearSelection();
      this.root = null; // 前の space のパスや行を出さない
      this.rows = [];
      this.error = null;
      this.raw = null;
      this.branch = null;
      this.menu = false;
    }
    const branch = this.branch; // 読んでいる間にブランチを選び直されても、この回の結果は、読み始めたときのブランチのもの
    // 読んでいる間に space が替わったかは、今の space と比べる（this.key は読んでいる間は変わらない）
    const moved = () => { const a = activeSpace(); return !a || JSON.stringify([a.machine, a.folder]) !== key; };
    this.loading = true;
    this.again = false;
    cx.spawn(async (cx) => {
      try {
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: s.folder, on: s.machine });
        if (moved()) return; // 読んでいる間に space が替わった（終わったあと render が読み直す）
        if (top.code !== 0) {
          this.root = null;
          this.rows = [];
          this.raw = null; // 次に読めたとき、前と同じ中身でも一覧を作り直す
          this.error = `Not a git repository: ${s.folder}`;
          return;
        }
        this.root = top.stdout.trim();
        this.on = s.machine;
        const opt = { cwd: this.root, on: this.on };
        const [r, status, head, current, refs] = await Promise.all([
          // stash（refs/stash）はコミットとして出さない。--exclude は --all より前に置く
          exec("git", [...READ, "log", ...(branch ? [branch] : ["--exclude=refs/stash", "--all"]), "--date-order", `--max-count=${MAX}`, "--date=format:%Y-%m-%d %H:%M",
            `--format=%H${SEP}%P${SEP}%h${SEP}%D${SEP}%s${SEP}%an${SEP}%ad`, "--"], opt),
          exec("git", [...READ, "status", "--porcelain=v1", "--untracked-files=all"], opt),
          exec("git", ["rev-parse", "--verify", "-q", "HEAD"], opt),
          exec("git", ["branch", "--show-current"], opt),
          exec("git", ["for-each-ref", "--format=%(refname)", "refs/heads", "refs/remotes"], opt),
        ]);
        if (moved()) return;
        if (branch !== this.branch) { this.again = true; return; } // 読んでいる間にブランチが替わった（finally で読み直す）
        const refNames = refs.stdout.split("\n").filter((x) => x && !x.endsWith("/HEAD"));
        // ローカルとリモートのブランチを分けて覚える（名前に / を含むローカルのブランチもあるので、名前では見分けない）
        this.locals = new Set(refNames.filter((x) => x.startsWith("refs/heads/")).map((x) => x.slice(11)));
        this.remotes = new Set(refNames.filter((x) => x.startsWith("refs/remotes/")).map((x) => x.slice(13)));
        this.branches = [...this.locals, ...this.remotes];
        if (this.branch && !this.branches.includes(this.branch)) { this.branch = null; this.again = true; }
        if (r.code !== 0) {
          this.error = r.stderr.trim() || "git log failed";
          return;
        }
        this.error = null;
        const dirty = status.stdout.split("\n").filter(Boolean).length;
        const headHash = head.stdout.trim();
        const showWip = dirty > 0 && headHash && (!branch || branch === current.stdout.trim());
        const raw = `${branch}\n${showWip ? status.stdout : 0}\n${headHash}\n${r.stdout}`;
        if (raw !== this.raw) {
          this.raw = raw;
          const commits = parse(r.stdout);
          if (showWip) commits.unshift({ hash: WIP, parents: [headHash], short: "", refs: [], subject: `Uncommitted Changes (${dirty})`, author: "", date: "" });
          this.rows = layout(commits);
          this.width = Math.max(1, ...this.rows.map((row) => row.width));
          // 選んでいたコミットが一覧から消えたら（コミットした・amend した、など）、詳しい表示を閉じる。
          // まだコミットしていない変更を選んでいて、中身が変わったら、ファイルの一覧を読み直す
          if (this.selected && !this.rows.some((row) => row.hash === this.selected)) this.clearSelection();
        }
        // まだコミットしていない変更を選んでいるときは、読み直すたびに中身も読み直す（同じファイルをさらに書き換えても、一覧は変わらないため）
        if (this.selected === WIP) this.loadDetail(WIP, cx);
      } catch (e) {
        if (!moved()) { this.error = String(e); this.rows = []; this.root = null; this.raw = null; }
      } finally {
        this.loading = false;
        cx.notify();
        if (this.again) this.refresh(cx, { queue: true });
      }
    });
  }

  clearSelection() {
    this.selected = null;
    this.info = null;
    this.files = [];
    this.file = null;
    this.diff = [];
  }

  // コミットを押すと、メッセージと変わったファイルの一覧を読む。マージは 1 つ目の親との差を出す。もう一度押すと閉じる。
  select(hash, cx) {
    if (this.selected === hash) {
      this.clearSelection();
      cx.notify();
      return;
    }
    this.clearSelection();
    this.selected = hash;
    cx.notify();
    this.loadDetail(hash, cx);
  }

  // 選んだコミットの詳しい表示を読む。ファイルの名前は -z（NUL 区切り）で読む（日本語などの名前を "\346..." の形にさせない）
  loadDetail(hash, cx) {
    const root = this.root, on = this.on;
    const opt = { cwd: root, on };
    if (hash === WIP) {
      cx.spawn(async (cx) => {
        const [status, stat, untracked] = await Promise.all([
          exec("git", [...READ, "diff", "HEAD", "--name-status", "--no-renames", "-z"], opt),
          exec("git", [...READ, "diff", "HEAD", "--numstat", "--no-renames", "-z"], opt),
          exec("git", [...READ, "ls-files", "--others", "--exclude-standard", "-z"], opt),
        ]);
        if (this.selected !== hash) return;
        this.info = { full: "", author: "Working tree vs HEAD", date: "", message: "Uncommitted Changes" };
        this.files = [...this.fileList(status.stdout, stat.stdout),
          ...untracked.stdout.split("\0").filter(Boolean).map((path) => ({ status: "U", path, add: "", del: "", untracked: true }))];
        // 差分を出しているファイルが、もう変更の一覧にないなら閉じる
        if (this.file && !this.files.some((f) => f.path === this.file)) { this.file = null; this.diff = []; }
        else if (this.file) this.openFile(this.file, cx, { keep: true });
        cx.notify();
      });
      return;
    }
    cx.spawn(async (cx) => {
      const [info, status, stat] = await Promise.all([
        exec("git", [...READ, "show", "-s", "--date=format:%Y-%m-%d %H:%M", "--format=%H%n%an <%ae>%n%ad%n%B", hash], opt),
        exec("git", [...READ, "show", "-m", "--first-parent", "--format=", "--name-status", "--no-renames", "-z", hash], opt),
        exec("git", [...READ, "show", "-m", "--first-parent", "--format=", "--numstat", "--no-renames", "-z", hash], opt),
      ]);
      if (this.selected !== hash) return;
      const [full, author, date, ...message] = info.stdout.split("\n");
      this.info = { full, author, date, message: message.join("\n").trim() };
      this.files = this.fileList(status.stdout, stat.stdout);
      cx.notify();
    });
  }

  // --name-status -z（「状態 NUL パス NUL」の並び）と --numstat -z（「増 TAB 減 TAB パス NUL」）を合わせて、ファイルの一覧にする。
  fileList(statusText, statText) {
    const counts = new Map();
    for (const rec of statText.split("\0")) {
      if (!rec) continue;
      const [add, del, ...path] = rec.split("\t");
      counts.set(path.join("\t"), { add, del });
    }
    const f = statusText.split("\0");
    const out = [];
    for (let i = 0; i + 1 < f.length; i += 2) {
      const status = f[i].trim();
      if (!status) break;
      const path = f[i + 1];
      out.push({ status, path, ...(counts.get(path) ?? { add: "-", del: "-" }) });
    }
    return out;
  }

  // 押したファイルの、そのコミットでの差分を読む。
  // keep: 同じファイルを読み直すときは、前の差分を出したまま、結果が来てから入れ替える（一度空にしない）
  openFile(path, cx, { keep = false } = {}) {
    this.file = path;
    if (!keep) { this.diff = []; cx.notify(); }
    const hash = this.selected, root = this.root, on = this.on;
    cx.spawn(async (cx) => {
      const untracked = hash === WIP && this.files.find((f) => f.path === path)?.untracked;
      // まだ追加していない入れ子のリポジトリ（ls-files が「名前/」で出す）は、差分を出せない
      if (untracked && path.endsWith("/")) { this.diff = ["(Nested repository)"]; cx.notify(); return; }
      const args = hash !== WIP ? [...READ, "show", "-m", "--first-parent", "--format=", "--no-renames", "--no-color", hash, "--", path]
        : untracked ? [...READ, "diff", "--no-index", "--no-color", "--", "/dev/null", path]
        : [...READ, "diff", "HEAD", "--no-renames", "--no-color", "--", path];
      const r = await exec("git", args, { cwd: root, on });
      if (this.selected !== hash || this.file !== path) return;
      const lines = r.stdout.split("\n");
      const at = lines.findIndex((l) => l.startsWith("@@"));
      // git diff --no-index は差分があると 1 で終わる。ファイルが読めないときも 1 なので、差分が出ているときだけ成功とみなす
      const ok = r.code === 0 || (untracked && r.code === 1 && r.stdout.trim() !== "");
      if (!ok) this.diff = [`git failed (exit ${r.code}): git ${args.slice(3).join(" ")}`, ...r.stderr.trim().split("\n")];
      else if (at >= 0) this.diff = lines.slice(at);
      else if (/^Binary files /m.test(r.stdout)) this.diff = ["(Binary file)"];
      else if (!r.stdout.trim()) this.diff = [`(No changes in this file. git ${args.slice(3).join(" ")})`];
      else this.diff = lines;
      cx.notify();
    });
  }

  detailView(t, mono) {
    const info = this.info;
    const fileRow = (f, i) => {
      const on = f.path === this.file;
      const color = f.status === "A" || f.status === "U" ? t.ansi2 : f.status === "D" ? t.ansi1 : t.ansi3;
      const slash = f.path.lastIndexOf("/");
      return h_flex().id(`f-${i}`).h(22).flex_none().px(10).gap(6).items_center().cursor_pointer().text_size(12)
        .bg(on ? t.selected : t.surface).hover((s) => s.bg(on ? t.selected : t.hover))
        .on_click((_e, cx) => this.openFile(f.path, cx))
        .child(div().w(12).flex_none().text_color(color).child(f.status[0]))
        .child(div().flex_none().text_color(t.foreground).child(f.path.slice(slash + 1)))
        .child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(slash > 0 ? f.path.slice(0, slash) : ""))
        .when(!f.untracked, (e) => e.child(div().flex_none().text_size(11).text_color(t.ansi2).child(`+${f.add}`))
          .child(div().flex_none().text_size(11).text_color(t.ansi1).child(`\u2212${f.del}`)));
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
        .child(div().text_size(12.5).text_color(t.foreground).child(info?.message ?? "Loading…"))
        .child(div().text_size(11.5).text_color(t.dim).child(info ? `${info.author} · ${info.date}` : ""))
        .child(div().text_size(11).font_family(mono).text_color(t.dim).child(info?.full ?? "")))
      .child(v_flex().id("files").flex_1().min_h(0).overflow_y_scrollbar().children(this.files.map(fileRow)));
  }

  // 1 行ぶんの枝の線と丸。上半分は行の上端から丸の高さへ、下半分は丸の高さから下端へ、列が変わるときは曲線で結ぶ。
  // マージとまだコミットしていない変更の丸は、中を塗らない輪にする。中を背景の色で塗ると、選んだ行や hover した行で
  // 丸の中だけ色が違って見えるので、塗らずに、この丸に入る線と出る線を輪の手前で止める。
  graph(row, t) {
    const mid = ROW / 2;
    const color = (i) => t[COLORS[i % COLORS.length]];
    const hollow = row.merge || row.wip;
    const segment = ([from, to, c], y0, y1) => {
      const start = PathBuilder.stroke(2).move_to(x(from), y0);
      const p = from === to ? start.line_to(x(to), y1) : start.cubic_bezier_to(x(to), y1, x(from), (y0 + y1) / 2, x(to), (y0 + y1) / 2);
      return window.paint_path(p.build(), color(c)).absolute().top(0).left(0).size_full();
    };
    const cx0 = x(row.lane);
    const circle = (builder) => builder.move_to(cx0 + DOT, mid).arc_to(DOT, DOT, 0, false, true, cx0 - DOT, mid).arc_to(DOT, DOT, 0, false, true, cx0 + DOT, mid).close();
    const parts = [
      ...row.top.map((s) => segment(s, 0, hollow && s[1] === row.lane ? mid - DOT : mid)),
      ...row.bottom.map((s) => segment(s, hollow && s[0] === row.lane ? mid + DOT : mid, ROW)),
    ];
    if (row.wip) parts.push(window.paint_path(circle(PathBuilder.stroke(1.5).dash_array([2, 2])).build(), t.muted).absolute().top(0).left(0).size_full());
    else if (row.merge) parts.push(window.paint_path(circle(PathBuilder.stroke(2)).build(), color(row.color)).absolute().top(0).left(0).size_full());
    else parts.push(window.paint_path(circle(PathBuilder.fill()).build(), color(row.color)).absolute().top(0).left(0).size_full());
    return div().relative().flex_none().w(PAD + this.width * LANE + 6).h(ROW).children(parts);
  }

  // コミットに付いた ref（git log の %D）を、表示するチップに分ける。
  // ローカルのブランチと、同じコミットにある同じ名前のリモートのブランチは、1 つのチップにまとめる（main | origin）。
  chips(refs) {
    const locals = this.locals ?? new Set(), remotes = this.remotes ?? new Set();
    const names = refs.filter((r) => !r.endsWith("/HEAD") && r !== "HEAD");
    const used = new Set();
    const out = [];
    for (const r of names) {
      if (!r.startsWith("HEAD -> ") && !locals.has(r)) continue;
      const name = r.startsWith("HEAD -> ") ? r.slice(8) : r;
      const with_ = [...remotes].filter((x) => names.includes(x) && x.slice(x.indexOf("/") + 1) === name);
      with_.forEach((x) => used.add(x));
      out.push({ kind: "branch", head: r.startsWith("HEAD -> "), text: name, remotes: with_.map((x) => x.slice(0, x.indexOf("/"))) });
    }
    for (const r of names) {
      if (r.startsWith("tag: ")) out.push({ kind: "tag", text: r.slice(5) });
      else if (!r.startsWith("HEAD -> ") && !locals.has(r) && !used.has(r)) out.push({ kind: "remote", text: r });
    }
    return out;
  }

  // チップ: 枠と左のアイコンで種類を出す（今のブランチ ✓ は塗りつぶし、ローカルは枝、リモートは雲、タグは札）。
  // 参考: rabeeh-ta/herdr-git-graph の見た目。コードとアイコンは自分で書いた。
  chip(c, t, laneColor, mono) {
    const edge = c.kind === "tag" ? t.ansi3 : laneColor;
    const fg = c.head ? t.background : c.kind === "tag" ? edge : c.kind === "remote" ? t.muted : t.foreground;
    const icon = c.kind === "tag" ? "tag" : c.kind === "remote" ? "cloud" : c.head ? "check" : "branch";
    // アイコンは枠と同じ色。今のブランチのチップは枠の色で塗りつぶすので、アイコンも文字と同じ色にする
    const iconColor = c.head ? t.background : edge;
    const part = (id, iconName, text, color, extra) => h_flex().id(id).h_full().flex_none().px(5).gap(4).items_center()
      .when(Boolean(extra), extra)
      .child(svg(`mods/git-graph/icons/${iconName}.svg`).size(10).flex_none().text_color(iconColor))
      .child(div().font_family(mono).text_size(11).text_color(color).when(c.head, (e) => e.font_semibold()).child(text));
    return h_flex().flex_none().h(18).rounded(5).border_1().border_color(edge).overflow_hidden()
      .when(c.head, (e) => e.bg(laneColor))
      .child(part(`chip-${c.kind}-${c.text}`, icon, c.text, fg))
      .children((c.remotes ?? []).map((r) => part(`chip-r-${c.text}-${r}`, "cloud", r, c.head ? t.background : t.muted,
        (e) => e.border_l(1).border_color(edge).bg(c.head ? t.background + "33" : edge + "1f"))));
  }

  narrow() {
    const w = (this.size?.width ?? 1000) / (settings().zoom || 1);
    return w < 640;
  }

  matches(r) {
    if (!this.q) return true;
    return [r.subject, r.author, r.hash, r.short, ...r.refs].some((v) => v && v.toLowerCase().includes(this.q));
  }

  // 検索に合う行へ順に移る（dir: 1 で次、-1 で前）。
  jump(dir, cx) {
    if (!this.q) return;
    const hits = this.rows.map((r, i) => (this.matches(r) ? i : -1)).filter((i) => i >= 0);
    if (!hits.length) return;
    const at = hits.indexOf(this.matchAt);
    this.matchAt = hits[(at < 0 ? (dir > 0 ? 0 : hits.length - 1) : (at + dir + hits.length) % hits.length)];
    this.scroll.scroll_to_item(this.matchAt);
    cx.notify();
  }

  row(r, i, t) {
    const on = r.hash === this.selected;
    const hit = this.q && this.matches(r);
    const laneColor = t[COLORS[r.color % COLORS.length]];
    const mono = settings().font_family ?? settings().font ?? "JetBrains Mono";
    return h_flex().id(`row-${i}`).h(ROW).flex_none().items_center().gap(6).pr(10).text_size(12.5).cursor_pointer()
      .bg(on ? t.selected : i === this.matchAt ? t.accent + "40" : hit ? t.accent + "1c" : t.surface).hover((s) => s.bg(on ? t.selected : t.hover))
      .when(Boolean(this.q) && !hit, (e) => e.opacity(0.35))
      .on_click((_e, cx) => this.select(r.hash, cx))
      .child(this.graph(r, t))
      .child(h_flex().flex_none().gap(4).children(this.chips(r.refs).map((c) => this.chip(c, t, laneColor, mono))))
      .child(div().flex_1().min_w(0).truncate().text_color(r.merge || r.wip ? t.muted : t.foreground).when(r.wip, (e) => e.italic()).child(r.subject))
      // 右のパネルのように狭いときは、作った人と日時を隠して、メッセージと印を優先する
      .when(!this.narrow(), (e) => e.child(div().w(110).flex_none().truncate().text_color(t.muted).child(r.author))
        .child(div().w(112).flex_none().text_color(t.dim).child(r.date)))
      .child(div().w(62).flex_none().font_family(settings().font_family ?? settings().font ?? "JetBrains Mono").text_color(t.dim).child(r.short));
  }

  render(cx) {
    const t = theme();
    const mono = settings().font_family ?? settings().font ?? "JetBrains Mono";
    const s = activeSpace();
    if (s && JSON.stringify([s.machine, s.folder]) !== this.key && !this.loading) this.refresh(cx);
    const header = h_flex().h(34).flex_none().px(12).gap(8).items_center().border_b(1).border_color(t.border).bg(t.chrome)
      .child(div().text_size(12.5).font_semibold().text_color(t.foreground).child("Git Graph"))
      .child(div().id("branch").flex_none().h(24).px(8).flex().items_center().rounded(5).border_1().border_color(t.border)
        .text_size(12).text_color(this.branch ? t.foreground : t.muted).cursor_pointer().hover((st) => st.bg(t.hover))
        .on_click((_e, cx) => {
          // メニューは押した所の下に出す（ボタンの位置は字の幅で変わるので、決め打ちしない）
          // 開いているときにこのボタンを押すと、先にメニューの外を押したとして閉じる（on_mouse_down_out）。
          // その直後のこの click で開き直さないよう、閉じたばかりなら何もしない
          if (Date.now() - (this.menuClosedAt ?? 0) < 400) return;
          const zoom = settings().zoom || 1;
          this.menuX = this.pointer ? this.pointer.x / zoom - 16 : 90;
          this.menu = !this.menu;
          cx.notify();
        })
        .child(`${this.branch ?? "All branches"}  \u25be`))
      .child(div().id("search").w(this.narrow() ? 170 : 280).flex_none().h(24).px(8).flex().items_center().rounded(5).border_1().border_color(this.q ? t.accent : t.border)
        .cursor_text().on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .child(Input.new(this.search).h_full().text_size(12).text_color(t.foreground)))
      .when(Boolean(this.q), (el) => {
        const n = this.rows.filter((r) => this.matches(r)).length;
        const nav = (id, label, dir) => div().id(id).px(5).rounded(4).text_color(t.muted).cursor_pointer()
          .hover((st) => st.bg(t.hover).text_color(t.foreground)).on_click((_e, cx) => this.jump(dir, cx)).child(label);
        return el.child(div().flex_none().text_size(11.5).text_color(t.dim).child(`${n} found`))
          .child(nav("prev", "\u2191", -1)).child(nav("next", "\u2193", 1));
      })
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.dim).child(this.root ?? s?.folder ?? ""))
      .child(div().id("refresh").px(8).py(2).rounded(5).text_size(12).text_color(t.muted).cursor_pointer()
        .hover((st) => st.bg(t.hover).text_color(t.foreground))
        .on_click((_e, cx) => this.refresh(cx, { queue: true })).child(this.loading ? "…" : "↻"));
    const body = this.error
      ? div().p(12).text_size(12.5).text_color(t.muted).child(this.error)
      : v_flex().id("list").flex_1().min_h(0).overflow_y_scrollbar().track_scroll(this.scroll).children(this.rows.map((r, i) => this.row(r, i, t)));
    const menuItem = (name, label) => div().id(`b-${label}`).h(24).flex_none().px(10).flex().items_center().text_size(12)
      .text_color(name === this.branch ? t.foreground : t.muted).bg(name === this.branch ? t.selected : t.popover)
      .cursor_pointer().hover((st) => st.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => { this.branch = name; this.menu = false; this.raw = null; this.clearSelection(); this.matchAt = -1; this.refresh(cx, { queue: true }); cx.notify(); })
      .child(label);
    const width = (this.size?.width ?? 1000) / (settings().zoom || 1);
    // 位置は外側の箱で決め、スクロールは中の箱でする（スクロールする要素に直接 absolute と top を付けると、top が効かずに下のほうに出た）
    const menu = div().id("branch-menu").absolute().top(34).left(Math.max(4, Math.min(this.menuX ?? 90, width - 324))).w(320)
      .rounded(6).border_1().border_color(t.border).bg(t.popover)
      .on_mouse_down_out((_e, cx) => { this.menu = false; this.menuClosedAt = Date.now(); cx.notify(); })
      .child(v_flex().id("branch-menu-list").max_h(360).overflow_y_scrollbar().py(4)
        .child(menuItem(null, "All branches"))
        .children(this.branches.map((b) => menuItem(b, b))));
    const detail = this.selected ? this.detailView(t, mono) : null;
    // 一覧と詳細の境界。上下にドラッグすると詳細の欄の高さが変わる
    const splitter = div().id("splitter").h(5).flex_none().mt(-2).cursor_row_resize()
      .bg(this.drag ? t.accent : t.surface).hover((st) => st.bg(t.accent))
      .on_mouse_down("left", (e) => { this.drag = { y: e.position.y, h: this.detailH }; });
    return v_flex().id("root").relative().size_full().bg(t.surface)
      .on_size_change((size, cx) => { this.size = size; cx.notify(); })
      .on_window_mouse_move((e, cx) => {
        if (e.local_position) this.pointer = e.local_position; // ブランチのメニューを出す位置に使う
        if (!this.drag) return;
        if (e.pressed_button !== "left") { this.endDrag(cx); return; }
        const zoom = settings().zoom || 1;
        const max = Math.max(DETAIL_MIN, (this.size?.height ?? 800) / zoom - 120);
        this.detailH = Math.round(Math.min(max, Math.max(DETAIL_MIN, this.drag.h - (e.position.y - this.drag.y) / zoom)));
        cx.notify();
      })
      .on_window_mouse_up("left", (_e, cx) => this.endDrag(cx))
      .child(header).child(body)
      .when(Boolean(detail), (el) => el.child(splitter).child(detail))
      .when(this.menu, (el) => el.child(menu));
  }

  endDrag(cx) {
    if (!this.drag) return;
    this.drag = null;
    try { localStorage.setItem("detailH", String(this.detailH)); } catch {}
    cx.notify();
  }
}
