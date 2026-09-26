/* 打字練習 — 主程式（四頁式向導）
 * 流程：首頁選模式 → 設定頁確認選項 → 練習頁 → 結果頁
 * 路由用 location.hash，瀏覽器上一頁／下一頁可正常退回。
 */
(function () {
  "use strict";

  var D = window.TP_DATA;
  var POEMS = window.TP_POEMS;
  var $ = function (id) { return document.getElementById(id); };

  var SRC_LABEL = { zh: "中文", poem: "唐詩", en: "英文" };
  var TIER_LABEL = { e: "易", m: "中", h: "難" };
  var GROUP_LABEL = { all: "全部", shengmu: "聲母", jiemu: "介音", yunmu: "韻母", tone: "聲調" };

  /* ---------------- 狀態 ---------------- */
  var S = {
    route: "home",
    mode: "normal",
    src: "zh",
    tier: "e",
    timing: "time",
    duration: 60,
    strict: false,
    hint: true,
    group: "all",
    customText: "",

    running: false,
    started: false,
    finished: false,
    blocked: false,
    composing: false,
    target: "",
    cells: [],
    idx: 0,
    hits: 0,
    errors: 0,
    startTime: 0,
    elapsed: 0,
    timerId: 0,
    credit: "",

    queue: [],
    qPos: 0,
    qRight: 0,
    qWrong: 0,
    qTimes: [],
    qShown: 0,
    current: null,
    fbTimer: 0
  };

  var el = {}, keyMap = {};

  /* ---------------- 設定持久化 ---------------- */
  function savePrefs() {
    try {
      localStorage.setItem("tp-prefs", JSON.stringify({
        mode: S.mode, src: S.src, tier: S.tier, timing: S.timing,
        duration: S.duration, strict: S.strict, hint: S.hint, group: S.group
      }));
    } catch (e) {}
  }

  function loadPrefs() {
    try {
      var p = JSON.parse(localStorage.getItem("tp-prefs") || "null");
      if (!p) return;
      ["mode", "src", "tier", "timing", "group"].forEach(function (k) { if (p[k]) S[k] = p[k]; });
      if (p.duration) S.duration = p.duration;
      S.strict = !!p.strict;
      S.hint = p.hint !== false;
    } catch (e) {}
  }

  /* ---------------- 小工具 ---------------- */
  function shuffle(a) {
    var r = a.slice();
    for (var i = r.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = r[i]; r[i] = r[j]; r[j] = t;
    }
    return r;
  }

  function isHan() {
    if (S.customText) return /[\u3400-\u9fff]/.test(S.customText);
    return S.src !== "en";
  }
  function show(node, on) { if (node) node.hidden = !on; }
  function fmt(n) { return (Math.round(n * 10) / 10).toFixed(1); }

  function activeTiming() { return S.customText ? "text" : S.timing; }

  function speedOf() {
    var mins = Math.max(S.elapsed / 60, 1 / 60);
    return isHan() ? S.hits / mins : S.hits / 5 / mins;
  }
  function speedLabel() { return isHan() ? "字/分" : "WPM"; }

  function pickPoem() {
    var list = POEMS[S.tier] || POEMS.e;
    var x = list[Math.floor(Math.random() * list.length)];
    if (list.length > 1 && x === S.lastPoem) x = list[(list.indexOf(x) + 1) % list.length];
    S.lastPoem = x;
    S.credit = (x.a ? x.a + "〈" + x.t + "〉" : x.t) + "　";
    return x.p.join("");
  }

  function pickSentence() {
    if (S.src === "poem") return pickPoem();
    var pool = S.src === "en" ? D.SENTENCES : D.ZH_SENTENCES;
    var s = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1 && s === S.lastSentence) s = pool[(pool.indexOf(s) + 1) % pool.length];
    S.lastSentence = s;
    S.credit = "";
    return s;
  }

  function nextText() {
    if (S.customText && !S.usedCustom) { S.usedCustom = true; S.credit = ""; return S.customText; }
    return pickSentence();
  }

  /* ---------------- 摘要文字 ---------------- */
  function summary() {
    if (S.mode === "learn") {
      return "注音鍵位學習・" + GROUP_LABEL[S.group] + "｜提示" + (S.hint ? "開啟" : "關閉");
    }
    var head = S.customText
      ? "自訂文本"
      : SRC_LABEL[S.src] + (S.src === "poem" ? "・" + TIER_LABEL[S.tier] : "");
    var mid = activeTiming() === "time" ? "計時 " + S.duration + " 秒" : "計字（打完整篇）";
    var tail = S.strict ? "要改對才能繼續" : "可繼續往下打";
    return head + "｜" + mid + "｜" + tail;
  }

  /* ---------------- 虛擬鍵盤 ---------------- */
  function buildKeyboard() {
    el.keyboard.innerHTML = "";
    keyMap = {};
    D.KEYCAPS.forEach(function (row) {
      var r = document.createElement("div");
      r.className = "krow";
      row.forEach(function (k) {
        var code = k[0], main = k[1], sh = k[2] || "", boo = D.BOPOMOFO[code] || "";
        var d = document.createElement("div");
        d.className = "key";
        if (code === "Space") d.classList.add("space");
        if (/^(Shift|Control|Alt|CapsLock|Tab|Backspace|Enter|Backquote)/.test(code)) d.classList.add("wide");
        if (!boo && !/^(Shift|Control|Alt)/.test(code)) d.classList.add("dead");

        var top = document.createElement("div");
        top.className = "kcap-top";
        var b = document.createElement("b"); b.textContent = main; top.appendChild(b);
        if (sh) { var i = document.createElement("i"); i.textContent = sh; top.appendChild(i); }
        d.appendChild(top);

        var z = document.createElement("div");
        z.className = "kcap-boo"; z.textContent = boo;
        d.appendChild(z);
        d.dataset.code = code;

        d.addEventListener("click", function () { onKey(code); });
        r.appendChild(d);
        (keyMap[code] = keyMap[code] || []).push(d);
      });
      el.keyboard.appendChild(r);
    });
  }

  function clearKeys() {
    Object.keys(keyMap).forEach(function (c) {
      keyMap[c].forEach(function (n) { n.classList.remove("hint", "hit", "miss"); });
    });
  }

  function markKey(code, cls, ms) {
    var nodes = keyMap[code];
    if (!nodes) return;
    nodes.forEach(function (n) { n.classList.add(cls); });
    if (ms) setTimeout(function () {
      nodes.forEach(function (n) { n.classList.remove(cls); });
    }, ms);
  }

  /* ---------------- 文本渲染 ---------------- */
  function resetView() {
    el.view.innerHTML = "";
    S.cells = []; S.target = ""; S.idx = 0; S.credit = "";
    if (el.comp && el.comp.parentNode) el.comp.parentNode.removeChild(el.comp);
  }

  function appendText(str) {
    if (S.credit) {
      var tag = document.createElement("i");
      tag.className = "pc";
      tag.textContent = S.credit;
      el.view.appendChild(tag);
    }
    S.target += str;
    for (var i = 0; i < str.length; i++) {
      var ch = str[i];
      var sp = document.createElement("span");
      sp.textContent = ch === " " ? "␣" : ch;
      sp.dataset.ch = ch;
      el.view.appendChild(sp);
      S.cells.push({ ch: ch, node: sp, state: "" });
    }
    paintCursor();
  }

  function paintCursor() {
    for (var i = 0; i < S.cells.length; i++) {
      S.cells[i].node.classList.toggle("cur", i === S.idx);
    }
    var c = S.cells[S.idx];
    if (!c) return;
    var want = c.node.offsetTop - el.view.clientHeight * 0.35;
    if (Math.abs(el.view.scrollTop - want) > 2) el.view.scrollTop = Math.max(0, want);
    // 讓隱藏 input 跟著游標走，輸入法的選字窗才會出現在你正在打的地方
    if (S.mode === "normal") {
      var r = c.node.getBoundingClientRect(), pr = el.typer.getBoundingClientRect();
      el.cap.style.left = Math.max(0, r.left - pr.left) + "px";
      el.cap.style.top = Math.max(0, r.top - pr.top) + "px";
    }
  }

  function paintCell(i, state) {
    var c = S.cells[i];
    if (!c) return;
    c.state = state;
    c.node.classList.toggle("ok", state === "ok");
    c.node.classList.toggle("bad", state === "bad");
  }

  /* ---------------- 輸入法組字緩衝顯示 ---------------- */
  // 把「還在拼的注音」顯示在游標處，否則使用者根本不知道自己按了什麼、拼到哪裡
  function showComposing(str) {
    var node = el.comp;
    if (!node) return;
    if (!str) { if (node.parentNode) node.parentNode.removeChild(node); return; }
    var cur = S.cells[S.idx] && S.cells[S.idx].node;
    if (cur) el.view.insertBefore(node, cur);
    else el.view.appendChild(node);
    if (node.textContent !== str) node.textContent = str;
  }
  /* ---------------- 輸入處理 ---------------- */
  function commit(str) {
    if (!S.running || S.blocked || S.finished) return;
    for (var i = 0; i < str.length; i++) {
      if (S.idx >= S.target.length) {
        if (activeTiming() === "time") {
          var more = pickSentence();
          appendText(isHan() ? more : " " + more);
        } else { finish(); return; }
      }
      var got = str[i], want = S.target[S.idx];
      var ok = got === want;
      S.cells[S.idx].node.textContent = got === " " ? "␣" : got;
      paintCell(S.idx, ok ? "ok" : "bad");
      if (ok) S.hits++; else S.errors++;
      if (!ok && S.strict) { S.blocked = true; paintCursor(); tick(); return; }
      S.idx++;
    }
    paintCursor();
    tick();
    if (activeTiming() === "text" && S.idx >= S.target.length) finish();
  }

  function backspace() {
    if (!S.running) return;
    if (S.blocked) {
      var cb = S.cells[S.idx];
      if (cb) {
        if (cb.state === "bad") S.errors = Math.max(0, S.errors - 1);
        cb.node.textContent = cb.ch === " " ? "␣" : cb.ch;
        paintCell(S.idx, "");
      }
      S.blocked = false;
      paintCursor(); tick();
      return;
    }
    if (S.idx === 0) return;
    S.idx--;
    var c = S.cells[S.idx];
    if (c.state === "bad") S.errors = Math.max(0, S.errors - 1);
    c.node.textContent = c.ch === " " ? "␣" : c.ch;
    paintCell(S.idx, "");
    paintCursor();
    tick();
  }

  /* ---------------- 計時 ---------------- */
  function startClock() {
    S.startTime = Date.now();
    stopClock();
    S.timerId = setInterval(tick, 200);
    tick();
  }
  function stopClock() { if (S.timerId) { clearInterval(S.timerId); S.timerId = 0; } }

  function tick() {
    if (S.mode !== "normal") return;
    S.elapsed = S.started ? (Date.now() - S.startTime) / 1000 : 0;
    if (activeTiming() === "time") {
      var left = Math.max(0, S.duration - S.elapsed);
      el.sTime.textContent = Math.ceil(left);
      el.bar.style.width = (100 * (1 - left / S.duration)) + "%";
      if (S.started && left <= 0) { finish(); return; }
    } else {
      el.sTime.textContent = Math.floor(S.elapsed);
      el.bar.style.width = (100 * S.idx / Math.max(1, S.target.length)) + "%";
    }
    el.sSpeed.textContent = Math.round(speedOf());
    var tot = S.hits + S.errors;
    el.sAcc.textContent = tot ? Math.round(100 * S.hits / tot) : 100;
    el.sErr.textContent = S.errors;
  }

  function beginRun() {
    if (S.started || S.finished || !S.running) return;
    S.started = true;
    show(el.ghost, false);
    startClock();
  }

  /* ---------------- 一般練習 ---------------- */
  function startNormal() {
    stopClock();
    S.running = true; S.started = false; S.finished = false; S.blocked = false;
    S.hits = 0; S.errors = 0; S.elapsed = 0; S.usedCustom = false;

    show(el.paneNormal, true);
    show(el.paneLearn, false);
    clearKeys();
    resetView();
    appendText(nextText());

    el.unit.textContent = speedLabel();
    el.sTimeLab.textContent = activeTiming() === "time" ? "秒" : "已用秒";
    el.ghost.innerHTML = isHan()
      ? "切到注音／中文輸入法，<b>直接開始打字</b>就會計時"
      : "切到 <b>English</b> 輸入法，直接開始打字就會計時";
    show(el.ghost, true);
    el.summaryText.textContent = summary();
    tick();
    focusCap();
  }

  function finish() {
    if (S.finished) return;
    S.finished = true; S.running = false;
    stopClock();
    var sp = speedOf(), tot = S.hits + S.errors;
    var acc = tot ? 100 * S.hits / tot : 0;
    el.rMain.textContent = Math.round(sp);
    el.rMainLab.textContent = speedLabel();
    el.rAcc.textContent = Math.round(acc) + "%";
    el.rAccLab.textContent = "正確率";
    el.rErr.textContent = S.errors;
    el.rErrLab.textContent = "打錯字數";
    el.rHits.textContent = S.hits;
    el.rHitsLab.textContent = "打對字數";
    el.rVerdict.textContent = verdict(sp, acc);
    el.resultTitle.textContent = "這一輪：「" + summary() + "」";
    go("result");
  }

  function verdict(sp, acc) {
    var base = isHan() ? 40 : 45;
    if (acc >= 98 && sp >= base) return "很穩，速度和正確率都到位了。";
    if (acc >= 95) return "正確率不錯，可以再稍微加速。";
    if (acc >= 85) return "速度可以，但錯誤偏多；慢一點、打準確會進步更快。";
    return "先求準確再求快，錯誤打太多會養成錯的肌肉記憶。";
  }

  /* ---------------- 學習模式 ---------------- */
  function startLearn() {
    stopClock();
    S.running = true; S.finished = false;
    S.qRight = 0; S.qWrong = 0; S.qTimes = []; S.qPos = 0;
    S.queue = shuffle(D.GROUPS[S.group]);

    show(el.paneNormal, false);
    show(el.paneLearn, true);
    el.summaryText.textContent = summary();
    el.lTotal.textContent = S.queue.length;
    nextQuestion();
  }

  function nextQuestion() {
    clearKeys();
    if (S.qPos >= S.queue.length) { finishLearn(); return; }
    S.current = S.queue[S.qPos];
    S.qShown = Date.now();
    el.prompt.textContent = S.current.sym;
    el.lPos.textContent = S.qPos + 1;
    el.lRight.textContent = S.qRight;
    el.lWrong.textContent = S.qWrong;
    learnAcc();
    if (S.hint) markKey(S.current.code, "hint");
    el.prompt.classList.remove("flip");
    void el.prompt.offsetWidth;
    el.prompt.classList.add("flip");
  }

  function learnAcc() {
    var t = S.qRight + S.qWrong;
    el.lAcc.textContent = t ? Math.round(100 * S.qRight / t) + "%" : "—";
  }

  function onKey(code) {
    if (S.mode !== "learn" || !S.running || S.finished || !S.current) return;
    if (code === S.current.code) {
      S.qTimes.push(Date.now() - S.qShown);
      S.qRight++; S.qPos++;
      markKey(code, "hit", 200);
      nextQuestion();
    } else {
      S.qWrong++;
      markKey(code, "miss", 500);
      el.lWrong.textContent = S.qWrong;
      learnAcc();
      el.feedback.textContent = "不對，是這個鍵 → " + S.current.sym;
      el.feedback.classList.add("on");
      clearTimeout(S.fbTimer);
      S.fbTimer = setTimeout(function () { el.feedback.classList.remove("on"); }, 1200);
    }
  }

  function finishLearn() {
    S.finished = true; S.running = false;
    clearKeys();
    var t = S.qRight + S.qWrong;
    var acc = t ? Math.round(100 * S.qRight / t) : 0;
    var avg = S.qTimes.length
      ? S.qTimes.reduce(function (a, b) { return a + b; }, 0) / S.qTimes.length / 1000 : 0;
    el.rMain.textContent = acc + "%";
    el.rMainLab.textContent = "答對率";
    el.rAcc.textContent = fmt(avg) + "s";
    el.rAccLab.textContent = "平均反應";
    el.rErr.textContent = S.qWrong;
    el.rErrLab.textContent = "按錯次數";
    el.rHits.textContent = S.qRight;
    el.rHitsLab.textContent = "答對題數";
    el.rVerdict.textContent = (acc >= 95 && avg < 0.9)
      ? "已經很熟了，把黃色提示關掉再測一次。"
      : "多跑幾輪，把常錯的鍵記起來；熟了之後關掉提示。";
    el.resultTitle.textContent = "這一輪：「" + summary() + "」";
    go("result");
  }

  /* ---------------- 路由 ---------------- */
  var PAGES = { home: 1, setup: 1, practice: 1, result: 1 };

  function route() {
    var h = (location.hash || "#/").replace(/^#\/?/, "").split("?")[0];
    if (!PAGES[h]) h = "home";
    // 重新整理進到結果頁時沒有這一輪資料，退回設定頁並修正網址
    if (h === "result" && !S.finished) {
      h = "setup";
      try { history.replaceState(null, "", "#/setup"); } catch (e) { location.hash = "#/setup"; }
    }
    // 離開練習頁時停止這輪
    if (S.route === "practice" && h !== "practice") { stopClock(); S.running = false; }
    S.route = h;
    Object.keys(PAGES).forEach(function (p) { show($("page-" + p), h === p); });
    window.scrollTo(0, 0);

    if (h === "setup") syncSetupUI();
    if (h === "practice") { S.mode === "learn" ? startLearn() : startNormal(); }
    if (h === "home") { stopClock(); S.running = false; clearKeys(); }
    if (h !== "practice") { try { el.cap.blur(); } catch (e) {} }
  }

  function go(p) {
    var want = p === "home" ? "#/" : "#/" + p;
    if (location.hash === want) route();       // hash 沒變不會觸發 hashchange，手動補一次
    else location.hash = want;                 // 同 hash 重複賦值會取代歷史紀錄，不堆疊
  }

  /* ---------------- 設定頁同步 ---------------- */
  function press(btn, on) { if (btn) btn.setAttribute("aria-pressed", on ? "true" : "false"); }

  function syncSetupUI() {
    var learn = S.mode === "learn";
    show($("setup-normal"), !learn);
    show($("setup-learn"), learn);
    $("setupTitle").textContent = learn ? "鍵位練習設定" : "練習設定";
    show($("row-tier"), !learn && S.src === "poem");
    show($("row-duration"), !learn && activeTiming() === "time");

    // 還原按鈕高亮
    [["l-zh", S.src === "zh"], ["l-poem", S.src === "poem"], ["l-en", S.src === "en"],
     ["k-e", S.tier === "e"], ["k-m", S.tier === "m"], ["k-h", S.tier === "h"],
     ["t-time", S.timing === "time"], ["t-text", S.timing === "text"],
     ["d-15", S.duration === 15], ["d-30", S.duration === 30],
     ["d-60", S.duration === 60], ["d-120", S.duration === 120],
     ["e-go", !S.strict], ["e-fix", S.strict],
     ["g-all", S.group === "all"], ["g-shengmu", S.group === "shengmu"],
     ["g-jiemu", S.group === "jiemu"], ["g-yunmu", S.group === "yunmu"], ["g-tone", S.group === "tone"],
     ["h-on", S.hint], ["h-off", !S.hint]
    ].forEach(function (x) { press($(x[0]), x[1]); });

    $("b-start").textContent = learn ? "開始練習" : "開始打字";
    $("ctaHint").textContent = summary();
  }

  /* ---------------- 按鍵分發 ---------------- */
  // 只有「輸入法正在處理」的事件才需要避開；一般按鍵絕對不能 preventDefault，
  // 否則注音的第一個鍵（常常不是 229）會被吃掉，選字、空格換字全都無法用。
  function isIME(e) { return e.keyCode === 229 || e.key === "Process" || e.isComposing; }

  var IGNORED = /^(Shift|Control|Alt|Meta|CapsLock|Tab|F\d|Arrow|Home|End|PageUp|PageDown|Insert|Delete)/;

  function onKeyDown(e) {
    if (S.route !== "practice") {
      if (e.key === "Enter" && S.route === "home" &&
          e.target && e.target.closest && !e.target.closest("button, a, textarea")) {
        $("pick-normal").click();
      }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (S.mode === "learn") {
      if (e.code === "Escape") { e.preventDefault(); go("setup"); return; }
      if (IGNORED.test(e.code)) return;
      e.preventDefault();
      if (!e.repeat) onKey(e.code);            // 用 code，作業系統輸入法狀態不影響判定
      return;
    }

    // 一般練習：文字一律從 input / composition 事件取，keydown 只負責後備鍵
    if (isIME(e)) return;
    if (e.code === "Escape") { e.preventDefault(); go("setup"); return; }
    if (IGNORED.test(e.code)) return;
    if (e.code === "Backspace") {
      e.preventDefault();
      if (S.started) backspace();
    }
  }

  function focusCap() {
    if (S.route !== "practice" || S.mode !== "normal") return;
    try { el.cap.focus({ preventScroll: true }); } catch (e) { el.cap.focus(); }
  }

  /* ---------------- 選項群 ---------------- */
  function seg(items, handler) {
    items.forEach(function (it) {
      it.btn.addEventListener("click", function () {
        items.forEach(function (o) { press(o.btn, o === it); });
        handler(it.val);
        savePrefs();
        $("ctaHint").textContent = summary();
        show($("row-tier"), S.mode !== "learn" && S.src === "poem");
        show($("row-duration"), S.mode !== "learn" && activeTiming() === "time");
      });
    });
  }

  function setTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    el.theme.textContent = t === "light" ? "🌙 深色" : "☀️ 淺色";
    try { localStorage.setItem("tp-theme", t); } catch (e) {}
  }

  /* ---------------- init ---------------- */
  function init() {
    ["cap", "view", "ghost", "bar", "typer", "keyboard", "prompt", "feedback",
     "lRight", "lWrong", "lAcc", "lPos", "lTotal", "sSpeed", "sAcc", "sErr", "sTime",
     "sTimeLab", "unit", "rMain", "rMainLab", "rAcc", "rAccLab", "rErr", "rErrLab",
     "rHits", "rHitsLab", "rVerdict", "resultTitle", "theme", "custom", "summaryText"
    ].forEach(function (id) { el[id] = $(id); });
    el.paneNormal = $("pane-normal");
    el.paneLearn = $("pane-learn");
    el.comp = document.createElement("i");
    el.comp.className = "comp";

    var t = "dark";
    try { t = localStorage.getItem("tp-theme") || "dark"; } catch (e) {}
    setTheme(t);
    el.theme.addEventListener("click", function () {
      setTheme(document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light");
    });

    loadPrefs();
    buildKeyboard();

    // 首頁選模式
    $("pick-normal").addEventListener("click", function () { S.mode = "normal"; savePrefs(); go("setup"); });
    $("pick-learn").addEventListener("click", function () { S.mode = "learn"; savePrefs(); go("setup"); });

    // 設定群
    seg([
      { btn: $("l-zh"), val: "zh" }, { btn: $("l-poem"), val: "poem" }, { btn: $("l-en"), val: "en" }
    ], function (v) { S.src = v; });

    seg([
      { btn: $("k-e"), val: "e" }, { btn: $("k-m"), val: "m" }, { btn: $("k-h"), val: "h" }
    ], function (v) { S.tier = v; });

    seg([
      { btn: $("t-time"), val: "time" }, { btn: $("t-text"), val: "text" }
    ], function (v) { S.timing = v; });

    seg([
      { btn: $("d-15"), val: 15 }, { btn: $("d-30"), val: 30 },
      { btn: $("d-60"), val: 60 }, { btn: $("d-120"), val: 120 }
    ], function (v) { S.duration = v; });

    seg([
      { btn: $("e-go"), val: false }, { btn: $("e-fix"), val: true }
    ], function (v) { S.strict = v; });

    seg([
      { btn: $("g-all"), val: "all" }, { btn: $("g-shengmu"), val: "shengmu" },
      { btn: $("g-jiemu"), val: "jiemu" }, { btn: $("g-yunmu"), val: "yunmu" },
      { btn: $("g-tone"), val: "tone" }
    ], function (v) { S.group = v; });

    seg([
      { btn: $("h-on"), val: true }, { btn: $("h-off"), val: false }
    ], function (v) { S.hint = v; });

    // 自訂文本：只影響這一輪，不改使用者的素材偏好
    el.custom.addEventListener("input", function () {
      S.customText = (el.custom.value || "").replace(/\r/g, "").trim();
      if (S.customText) {
        show($("row-tier"), false);
        show($("row-duration"), false);
      } else {
        show($("row-tier"), S.mode !== "learn" && S.src === "poem");
        show($("row-duration"), S.mode !== "learn" && S.timing === "time");
      }
      $("ctaHint").textContent = summary();
    });
    $("b-clear").addEventListener("click", function () {
      el.custom.value = "";
      S.customText = "";
      show($("row-tier"), S.mode !== "learn" && S.src === "poem");
      show($("row-duration"), S.mode !== "learn" && S.timing === "time");
      $("ctaHint").textContent = summary();
      el.custom.focus();
    });

    // 開始／再来
    $("b-start").addEventListener("click", function () { go("practice"); });
    $("b-again").addEventListener("click", function () { go("practice"); });
    $("b-change").addEventListener("click", function () { go("setup"); });

    // 練習區互動：文字一律從 input / composition 事件取，
    // 這樣輸入法的選字、空格換字、Enter 確認都交給系統處理。
    el.typer.addEventListener("mousedown", function (e) { e.preventDefault(); focusCap(); });
    el.cap.addEventListener("compositionstart", function () { S.composing = true; beginRun(); });
    el.cap.addEventListener("compositionupdate", function (e) { showComposing(e.data || el.cap.value || ""); });
    el.cap.addEventListener("compositionend", function (e) {
      S.composing = false;
      var data = e.data || "";
      el.cap.value = "";
      showComposing("");
      if (data) commit(data);
    });
    el.cap.addEventListener("input", function (e) {
      if (S.composing) return;                 // 組合中的拼音不計
      // compositionend 已處理過的組字結果不再重複入帳
      if (e && /CompositionText$/.test(e.inputType || "")) return;
      var v = el.cap.value;
      el.cap.value = "";
      if (!v) return;
      beginRun();
      commit(v);
    });
    el.cap.addEventListener("paste", function (e) { e.preventDefault(); });
    el.cap.addEventListener("blur", function () {
      if (S.route === "practice" && S.mode === "normal") focusCap();
    });

    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("hashchange", route);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stopClock();
      else if (S.route === "practice" && S.mode === "normal" && S.running && S.started && !S.finished) {
        S.startTime = Date.now() - S.elapsed * 1000;
        stopClock();
        S.timerId = setInterval(tick, 200);
      }
    });

    route();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
