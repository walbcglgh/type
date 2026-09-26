/* 打字練習 — 主程式
 * normal 一般模式：看文本打字，只比對字元（支援注音／倉頡等輸入法）
 * learn  學習模式：出注音符號，按對應實體鍵；答對才跳下一題，答錯紅燈並留在原題
 */
(function () {
  "use strict";

  var D = window.TP_DATA;
  var $ = function (id) { return document.getElementById(id); };

  var S = {
    mode: "normal",
    lang: "zh",
    timing: "time",
    duration: 60,
    strict: false,
    hint: true,
    group: "all",
    custom: false,

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
    keystrokes: 0,
    startTime: 0,
    elapsed: 0,
    timerId: 0,

    queue: [],
    qPos: 0,
    qRight: 0,
    qWrong: 0,
    qTimes: [],
    qShown: 0,
    current: null
  };

  var el = {};
  var keyMap = {};

  /* ---------- 小工具 ---------- */
  function shuffle(a) {
    var r = a.slice();
    for (var i = r.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = r[i]; r[i] = r[j]; r[j] = t;
    }
    return r;
  }

  function pickSentence() {
    var pool = S.lang === "zh" ? D.ZH_SENTENCES : D.SENTENCES;
    var s = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1 && s === S.lastSentence) s = pool[(pool.indexOf(s) + 1) % pool.length];
    S.lastSentence = s;
    return s;
  }

  function show(node, on) { node.hidden = !on; }
  function fmt(n) { return (Math.round(n * 10) / 10).toFixed(1); }

  function speedOf() {
    var mins = Math.max(S.elapsed / 60, 1 / 60);
    return S.lang === "zh" ? S.hits / mins : S.hits / 5 / mins;
  }

  function speedLabel() { return S.lang === "zh" ? "字/分" : "WPM"; }

  /* ---------- 虛擬鍵盤 ---------- */
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

  /* ---------- 文本渲染 ---------- */
  function resetView() {
    el.view.innerHTML = "";
    S.cells = []; S.target = ""; S.idx = 0;
  }

  function appendText(str) {
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
  }

  function paintCell(i, state) {
    var c = S.cells[i];
    if (!c) return;
    c.state = state;
    c.node.classList.toggle("ok", state === "ok");
    c.node.classList.toggle("bad", state === "bad");
  }

  /* ---------- 輸入處理（一般模式） ---------- */
  function commit(str) {
    if (!S.running || S.blocked || S.finished) return;
    for (var i = 0; i < str.length; i++) {
      if (S.idx >= S.target.length) {
        if (S.timing === "time") { appendText(" " + pickSentence()); }
        else { finish(); return; }
      }
      var got = str[i], want = S.target[S.idx];
      var ok = got === want;
      S.cells[S.idx].node.textContent = got === " " ? "␣" : got;
      paintCell(S.idx, ok ? "ok" : "bad");
      if (ok) S.hits++; else S.errors++;
      S.keystrokes++;
      if (!ok && S.strict) { S.blocked = true; paintCursor(); tick(); return; }
      S.idx++;
    }
    paintCursor();
    tick();
    if (S.timing === "text" && S.idx >= S.target.length) finish();
  }

  function backspace() {
    if (!S.running) return;
    // 嚴格模式卡住時：退格＝清除這格的錯誤，可重新打
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

  /* ---------- 計時 ---------- */
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
    if (S.timing === "time") {
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

  /* ---------- 一般模式流程 ---------- */
  function startNormal(text) {
    stopClock();
    S.mode = "normal";
    S.running = true; S.started = false; S.finished = false; S.blocked = false;
    S.hits = 0; S.errors = 0; S.keystrokes = 0; S.elapsed = 0;
    S.custom = !!text;

    show(el.normalPane, true);
    show(el.learnPane, false);
    show(el.keyboardWrap, false);
    show(el.results, false);
    clearKeys();

    resetView();
    appendText(text || pickSentence());

    el.unit.textContent = speedLabel();
    el.ghost.innerHTML = S.lang === "zh"
      ? "切到注音／倉頡輸入法，<b>直接開始打字</b>就會計時"
      : "切到 <b>English</b> 輸入法，直接開始打字就會計時";
    show(el.ghost, true);
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
    show(el.results, true);
    show(el.ghost, false);
  }

  function verdict(sp, acc) {
    var base = S.lang === "zh" ? 40 : 45;
    if (acc >= 98 && sp >= base) return "很穩，速度和正確率都到位了。";
    if (acc >= 95) return "正確率不錯，可以再稍微加速。";
    if (acc >= 85) return "速度可以，但錯誤偏多；慢一點、打準確會進步更快。";
    return "先求準確再求快，錯誤打太多會養成錯的肌肉記憶。";
  }

  /* ---------- 學習模式流程 ---------- */
  function startLearn() {
    stopClock();
    S.mode = "learn";
    S.running = true; S.finished = false;
    S.qRight = 0; S.qWrong = 0; S.qTimes = []; S.qPos = 0;
    S.queue = shuffle(D.GROUPS[S.group]);

    show(el.normalPane, false);
    show(el.learnPane, true);
    show(el.keyboardWrap, true);
    show(el.results, false);

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
    if (S.mode === "learn") {
      if (!S.running || S.finished || !S.current) return;
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
      return;
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
    show(el.results, true);
    el.prompt.textContent = "完成";
  }

  /* ---------- 按鍵分發 ---------- */
  function onKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === "Escape") { e.preventDefault(); restart(); return; }
    if (/^(Shift|Control|Alt|Meta|CapsLock|Tab|F\d|Arrow|Home|End|PageUp|PageDown|Insert|Delete)/.test(e.code)) return;

    if (S.mode === "learn") {
      e.preventDefault();
      if (!e.repeat) onKey(e.code);
      return;
    }

    if (S.composing || e.keyCode === 229 || e.key === "Process") return; // 交給輸入法
    if (e.code === "Backspace") {
      e.preventDefault();
      if (S.started) backspace();
      return;
    }
    if (e.key && e.key.length === 1) {
      e.preventDefault();
      beginRun();
      commit(e.key);
    }
  }

  function restart() {
    if (S.mode === "learn") startLearn();
    else startNormal(S.custom ? (el.custom.value || "").trim() : null);
  }

  /* ---------- 焦點 ---------- */
  function focusCap() {
    if (S.mode !== "normal") return;
    try { el.cap.focus({ preventScroll: true }); } catch (err) { el.cap.focus(); }
  }

  /* ---------- 選項群 ---------- */
  function seg(items, handler) {
    items.forEach(function (it) {
      it.btn.addEventListener("click", function () {
        items.forEach(function (o) { o.btn.setAttribute("aria-pressed", o === it ? "true" : "false"); });
        handler(it.val);
      });
    });
  }

  function setModeRow() {
    var learn = S.mode === "learn";
    show($("row-lang"), !learn);
    show($("row-timing"), !learn);
    show($("row-duration"), !learn && S.timing === "time");
    show($("row-strict"), !learn);
    show($("row-custom"), !learn);
    show($("row-group"), learn);
    show($("row-hint"), learn);
  }

  function setTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    el.theme.textContent = t === "light" ? "🌙 深色" : "☀️ 淺色";
    try { localStorage.setItem("tp-theme", t); } catch (err) {}
  }

  /* ---------- init ---------- */
  function init() {
    ["cap", "view", "ghost", "bar", "typer", "results", "keyboard", "keyboardWrap",
     "normalPane", "learnPane", "prompt", "feedback", "lRight", "lWrong", "lAcc",
     "lPos", "lTotal", "sSpeed", "sAcc", "sErr", "sTime", "unit", "rMain", "rMainLab",
     "rAcc", "rAccLab", "rErr", "rErrLab", "rHits", "rHitsLab", "rVerdict", "theme", "custom"
    ].forEach(function (id) { el[id] = $(id); });

    var t = "dark";
    try { t = localStorage.getItem("tp-theme") || "dark"; } catch (err) {}
    setTheme(t);
    el.theme.addEventListener("click", function () {
      setTheme(document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light");
    });

    buildKeyboard();

    seg([
      { btn: $("m-normal"), val: "normal" },
      { btn: $("m-learn"), val: "learn" }
    ], function (v) {
      S.mode = v; setModeRow();
      if (v === "learn") startLearn(); else startNormal();
    });

    seg([
      { btn: $("l-zh"), val: "zh" },
      { btn: $("l-en"), val: "en" }
    ], function (v) { S.lang = v; if (S.mode === "normal") startNormal(); });

    seg([
      { btn: $("t-time"), val: "time" },
      { btn: $("t-text"), val: "text" }
    ], function (v) {
      S.timing = v; S.custom = false; setModeRow();
      if (S.mode === "normal") startNormal();
    });

    seg([
      { btn: $("d-15"), val: 15 }, { btn: $("d-30"), val: 30 },
      { btn: $("d-60"), val: 60 }, { btn: $("d-120"), val: 120 }
    ], function (v) { S.duration = v; if (S.mode === "normal") startNormal(); });

    seg([
      { btn: $("e-go"), val: false },
      { btn: $("e-fix"), val: true }
    ], function (v) { S.strict = v; if (S.mode === "normal") startNormal(); });

    seg([
      { btn: $("g-all"), val: "all" },
      { btn: $("g-shengmu"), val: "shengmu" },
      { btn: $("g-jiemu"), val: "jiemu" },
      { btn: $("g-yunmu"), val: "yunmu" },
      { btn: $("g-tone"), val: "tone" }
    ], function (v) { S.group = v; if (S.mode === "learn") startLearn(); });

    seg([
      { btn: $("h-on"), val: true },
      { btn: $("h-off"), val: false }
    ], function (v) { S.hint = v; if (S.mode === "learn") startLearn(); });

    $("b-restart").addEventListener("click", function () { startNormal(); });
    $("b-new").addEventListener("click", startLearn);

    $("b-custom").addEventListener("click", function () {
      var v = (el.custom.value || "").replace(/\r/g, "").trim();
      if (!v) { el.custom.focus(); return; }
      S.lang = /[\u3400-\u9FFF]/.test(v) ? "zh" : "en";
      S.timing = "text";
      setModeRow();
      startNormal(v);
    });

    el.cap.addEventListener("compositionstart", function () { S.composing = true; beginRun(); });
    el.cap.addEventListener("compositionend", function (e) {
      S.composing = false;
      el.cap.value = "";
      if (e.data) commit(e.data);
    });
    el.typer.addEventListener("mousedown", function (e) { e.preventDefault(); focusCap(); });

    document.addEventListener("keydown", onKeyDown);
    // 切視窗時暫停計時，回來補回時間，避免計時模式被背景吃掉
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        stopClock();
      } else if (S.mode === "normal" && S.running && S.started && !S.finished) {
        S.startTime = Date.now() - S.elapsed * 1000;
        stopClock();
        S.timerId = setInterval(tick, 200);
      }
    });

    setModeRow();
    startNormal();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
