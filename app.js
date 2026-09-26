/* 打字練習場 — 逐字比對的打字測試／練習
 * 核心模型：target（目標字元陣列）+ typed（已確認輸入的字串），
 * 兩者的共同前綴就是「對的部分」。中英文共用同一套邏輯，
 * 中文靠 composition 事件把輸入法選字前的半成品單獨顯示。
 */

const PASSAGES = {
  en: [
    "the quick brown fox jumps over the lazy dog while the sun sets behind the quiet hills",
    "typing is not about speed alone it is about trusting your hands to find the keys without looking",
    "a good interface disappears you stop thinking about the tool and start thinking about the task",
    "practice does not make perfect practice makes permanent so what you repeat is what you become",
    "small steps taken every day carry further than a single great leap taken once a year",
    "the best code is the code you never wrote because it does not need to be maintained or tested",
    "learn to read before you learn to write and learn to listen before you learn to speak",
    "every expert was once a beginner who refused to quit when the work stopped being fun",
  ],
  zh: [
    "每天早上走進咖啡廳的人總會在櫃台前愣一下然後點一杯熟悉得不能再熟悉的名字",
    "把一件複雜的事寫成簡單的句子需要很久把簡單的句子讀懂只需要安靜一會兒",
    "練習打字沒有捷徑只有把同一串字母敲錯很多次之後手指自己記住正確的位置",
    "網路上的字來得太快以至於我們忘記了有些話本來應該要寫在紙上慢慢寄出去",
    "好的工具讓人專注於工作本身而不是工具的使用說明",
    "走得太急會忘記為什麼出發停下來想一想反而走得比較遠",
    "學習一門語言就是接受一整套看世界的方式",
    "他打開檔案發現當年的註解比程式碼還長讀起來像是一封寫給未來自己的信",
  ],
};

const els = {
  stage: document.getElementById('stage'),
  scroller: document.getElementById('scroller'),
  text: document.getElementById('text'),
  track: document.getElementById('track'),
  lineHold: document.getElementById('lineHold'),
  caret: document.querySelector('.caret'),
  composing: document.querySelector('.composing'),
  capture: document.getElementById('capture'),
  veil: document.getElementById('veil'),
  veilKey: document.querySelector('.veil-key'),
  timer: document.getElementById('timer'),
  mWpm: document.getElementById('m-wpm'),
  mAcc: document.getElementById('m-acc'),
  mCombo: document.getElementById('m-combo'),
  results: document.getElementById('results'),
  timeGroup: document.getElementById('time-group'),
  countGroup: document.getElementById('count-group'),
};

const state = {
  lang: 'en',
  mode: 'time',        // time | count
  seconds: 60,
  amount: 50,          // count 模式的字數／詞數
  target: [],
  typed: '',
  composing: '',
  composingActive: false,
  charEls: [],
  started: false,
  running: false,
  endAt: 0,
  startAt: 0,
  elapsed: 0,
  remain: 60,
  ticker: null,
  maxCombo: 0,
};

const isZh = () => state.lang === 'zh';

/* ---------------------------------------------------------------- text gen */

const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

function buildTarget() {
  const pool = PASSAGES[state.lang];
  // 湊足長度：把多段隨機拼起來，避免練習模式打到結尾沒字可用
  let chunks = shuffle(pool);
  let raw = chunks.join(' ');
  while (raw.replace(/\s+/g, ' ').length < 600) {
    chunks = shuffle(pool);
    raw += ' ' + chunks.join(' ');
  }
  raw = raw.replace(/\s+/g, ' ').trim();

  let out = raw;
  if (state.mode === 'count') {
    if (isZh()) {
      out = Array.from(raw).slice(0, state.amount).join('');
    } else {
      out = raw.split(' ').slice(0, state.amount).join(' ');
    }
  }
  return Array.from(out);
}

/* ----------------------------------------------------------------- render */

function renderTarget() {
  const frag = document.createDocumentFragment();
  state.charEls = [];
  let word = null;
  let openNew = true;

  state.target.forEach((ch) => {
    if (openNew) {
      word = document.createElement('span');
      word.className = 'w';
      frag.appendChild(word);
      openNew = false;
    }
    const el = document.createElement('span');
    el.className = 'ch' + (/\s/.test(ch) ? ' is-space' : '');
    el.textContent = ch;
    word.appendChild(el);
    state.charEls.push(el);
    if (/\s/.test(ch)) openNew = true;
  });

  els.text.replaceChildren(frag);
  els.track.style.transform = 'translateY(0px)';
}

function lineH() {
  return parseFloat(getComputedStyle(els.text).lineHeight) || 1;
}

function positionCaret(index) {
  const el = state.charEls[Math.min(index, state.charEls.length - 1)];
  if (!el) return;

  const lh = lineH();
  // offsetTop 是「字形框」頂部，行框還要比字高大出的那一段置中，
  // 所以真正的行頂 = offsetTop - (行高 - 字高) / 2，把這一行平移到可視區頂端。
  // 一律用 offset* 系列：它們不受 transform 影響，不需要先歸零再量。
  const lineTop = el.offsetTop - (lh - el.offsetHeight) / 2;
  els.track.style.transform = `translateY(${-lineTop}px)`;

  // 游標層在 track 內、與文字一起位移，所以座標就是文字自己的 offset；
  // .text 在 track 的原點上，lineTop 展開後剛好抵銷成 el.offsetTop
  const last = index >= state.charEls.length;
  const x = el.offsetLeft + (last ? el.offsetWidth : 0);
  els.caret.style.left = `${x}px`;
  els.caret.style.top = `${el.offsetTop + (el.offsetHeight - els.caret.offsetHeight) / 2}px`;
  els.composing.style.left = `${x}px`;
  els.composing.style.top = `${el.offsetTop + (el.offsetHeight - els.composing.offsetHeight) / 2}px`;
}

/* ------------------------------------------------------------------ stats */

function measure() {
  const typed = state.typed;
  let correct = 0;
  let combo = 0;
  let maxCombo = 0;
  const n = Math.min(typed.length, state.target.length);
  for (let i = 0; i < n; i += 1) {
    if (typed[i] === state.target[i]) {
      correct += 1;
      combo += 1;
      if (combo > maxCombo) maxCombo = combo;
    } else {
      combo = 0;
    }
  }
  return { typed: n, correct, maxCombo };
}

function elapsedMinutes() {
  if (!state.started) return 1 / 60;
  const spent = state.mode === 'time'
    ? state.seconds - state.remain
    : state.elapsed;
  return Math.max(spent / 60, 1 / 60);
}

function stats() {
  const m = measure();
  const mins = elapsedMinutes();
  const cpm = m.correct / mins;
  return {
    ...m,
    cpm: Math.round(cpm),
    wpm: Math.round(cpm / (isZh() ? 1 : 5)),
    acc: m.typed ? (m.correct / m.typed) * 100 : 100,
  };
}

function paintStats() {
  const s = stats();
  state.maxCombo = Math.max(state.maxCombo, s.maxCombo);
  els.mWpm.textContent = s.wpm;
  els.mAcc.textContent = s.acc.toFixed(s.acc === 100 ? 0 : 1);
  els.mCombo.textContent = s.maxCombo;
  return s;
}

/* ------------------------------------------------------------------ paint */

function paint() {
  const typed = state.typed;
  const current = Math.min(typed.length, state.target.length);

  // 重繪範圍要同時覆蓋「上一輪」與「這一輪」的位置：
  // 只比長度會漏掉等長改字（退格後重打），那幾格的顏色就會卡在舊狀態
  const prev = paint.prevTyped || '';
  const n = Math.min(prev.length, typed.length);
  let lo = 0;
  while (lo < n && prev[lo] === typed[lo]) lo += 1;
  const hi = Math.min(Math.max(prev.length, typed.length), state.charEls.length - 1);
  for (let i = lo; i <= hi; i += 1) {
    const el = state.charEls[i];
    const cls = el.classList;
    const done = i < typed.length;
    const ok = done && typed[i] === state.target[i];
    cls.toggle('is-done', done && ok);
    cls.toggle('is-bad', done && !ok);
    cls.toggle('is-current', i === current && current < state.target.length);
  }
  paint.prevTyped = typed;

  els.composing.textContent = state.composing;
  positionCaret(current);
  if (state.mode === 'count' && state.started) els.timer.textContent = remainingUnits();
  paintStats();
}
paint.prevTyped = '';

/* ------------------------------------------------------------------ timer */

function remainingUnits() {
  const rest = state.target.slice(Math.min(state.typed.length, state.target.length)).join('');
  return isZh() ? Array.from(rest).length : rest.split(/\s+/).filter(Boolean).length;
}

function tick() {
  if (state.mode === 'time') {
    state.remain = Math.max(0, (state.endAt - Date.now()) / 1000);
    els.timer.textContent = Math.ceil(state.remain);
    els.timer.classList.toggle('is-low', state.remain <= 10);
    if (state.remain <= 0) { finish(); return; }
  } else {
    state.elapsed = (Date.now() - state.startAt) / 1000;
    els.timer.textContent = remainingUnits();
  }
  paintStats();
}

function startTimer() {
  if (state.ticker) return;
  if (state.mode === 'time') state.endAt = Date.now() + state.remain * 1000;
  else state.startAt = Date.now() - state.elapsed * 1000;
  state.ticker = setInterval(tick, 200);
}

function pauseTimer() {
  if (state.ticker) {
    if (state.mode === 'time') {
      state.remain = Math.max(0, (state.endAt - Date.now()) / 1000);
    } else {
      state.elapsed = (Date.now() - state.startAt) / 1000;
    }
    clearInterval(state.ticker);
    state.ticker = null;
  }
}

/* ------------------------------------------------------------------ round */

function reset() {
  pauseTimer();
  state.target = buildTarget();
  state.typed = '';
  state.composing = '';
  state.composingActive = false;
  state.started = false;
  state.running = false;
  state.remain = state.seconds;
  state.elapsed = 0;
  state.maxCombo = 0;
  paint.prevTyped = '';

  els.capture.value = '';
  els.timer.textContent = state.mode === 'time' ? state.seconds : remainingUnits();
  els.timer.classList.remove('is-low');
  els.results.hidden = true;
  renderTarget();
  paint();
  showVeil('點擊這裡', '開始打字 · 手機用螢幕鍵盤、電腦直接敲');
  els.veil.hidden = false;
}

function begin() {
  if (state.started) return;
  state.started = true;
  state.running = true;
  els.veil.hidden = true;
  els.stage.classList.add('is-typing');
  // 兩種模式都要跑 ticker：限時用它倒數，練習用它累計實際花掉的時間，
  // 否則練習模式的 WPM 會拿 0 秒去除，算出幾千的怪數字
  startTimer();
}

function finish() {
  pauseTimer();
  state.running = false;
  els.stage.classList.remove('is-typing');
  const s = stats();
  document.getElementById('r-wpm').textContent = s.wpm;
  document.getElementById('r-wpm-unit').textContent = isZh() ? '字／分' : 'WPM';
  document.getElementById('r-acc').textContent = s.acc.toFixed(1);
  document.getElementById('r-cpm').textContent = s.cpm;
  document.getElementById('r-correct').textContent = s.correct;
  document.getElementById('r-wrong').textContent = Math.max(0, s.typed - s.correct);
  document.getElementById('r-combo').textContent = state.maxCombo;
  els.results.hidden = false;
  els.capture.blur();
}

/* ------------------------------------------------------------------- veil */

function showVeil(title, sub) {
  els.veilKey.textContent = title;
  els.veil.querySelector('.veil-sub').textContent = sub;
}

function focusCapture() {
  els.capture.focus({ preventScroll: true });
}

/* ------------------------------------------------------------------ input */

function syncFromInput() {
  const raw = els.capture.value;
  // 不讓輸入長到爆掉目標太多，避免無意義的溢出
  state.typed = raw.slice(0, state.target.length + 20);
  if (state.typed !== raw) els.capture.value = state.typed;
}

els.capture.addEventListener('input', (e) => {
  if (state.composingActive) return;
  syncFromInput();
  if (!state.typed.length) return;
  begin();
  paint();
  if (state.mode === 'count' && state.typed.length >= state.target.length) finish();
});

els.capture.addEventListener('compositionstart', () => {
  state.composingActive = true;
  state.composing = '';
});

els.capture.addEventListener('compositionupdate', (e) => {
  state.composing = e.data || '';
  if (!state.started) begin();
  paint();
});

els.capture.addEventListener('compositionend', (e) => {
  state.composingActive = false;
  state.composing = '';
  syncFromInput();
  begin();
  paint();
  if (state.mode === 'count' && state.typed.length >= state.target.length) finish();
});

els.capture.addEventListener('blur', () => {
  if (!state.running) return;
  pauseTimer();
  showVeil('繼續', '視窗失去焦點，點一下接回去');
  els.veil.hidden = false;
});

els.veil.addEventListener('click', () => {
  focusCapture();
  if (state.started) {
    els.veil.hidden = true;
    if (state.running) startTimer();
    tick();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    reset();
    focusCapture();
    return;
  }
  if (e.key === 'Escape' && !els.results.hidden) {
    els.results.hidden = true;
  }
  // 沒焦点時直接開打
  if (!state.started && document.activeElement !== els.capture
      && /^[a-z0-9]$/i.test(e.key)) {
    focusCapture();
    els.veil.hidden = true;
  }
});

els.stage.addEventListener('pointerdown', () => {
  if (els.veil.hidden) focusCapture();
});

/* ---------------------------------------------------------------- controls */

function activate(group, btn) {
  group.querySelectorAll('.chip').forEach((c) => c.classList.remove('is-active'));
  btn.classList.add('is-active');
  btn.setAttribute('aria-selected', 'true');
  group.querySelectorAll('.chip[aria-selected]').forEach((c) => {
    if (c !== btn) c.setAttribute('aria-selected', 'false');
  });
}

document.getElementById('mode-group').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-mode]');
  if (!btn) return;
  activate(e.currentTarget, btn);
  state.mode = btn.dataset.mode;
  els.timeGroup.hidden = state.mode !== 'time';
  els.countGroup.hidden = state.mode !== 'count';
  reset();
});

document.getElementById('time-group').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-time]');
  if (!btn) return;
  activate(e.currentTarget, btn);
  state.seconds = Number(btn.dataset.time);
  reset();
});

document.getElementById('count-group').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-count]');
  if (!btn) return;
  activate(e.currentTarget, btn);
  state.amount = Number(btn.dataset.count);
  reset();
});

document.querySelector('.lang-switch').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-lang]');
  if (!btn) return;
  activate(e.currentTarget, btn);
  state.lang = btn.dataset.lang;
  document.documentElement.lang = isZh() ? 'zh-Hant' : 'en';
  reset();
});

document.getElementById('restart').addEventListener('click', () => {
  reset();
  focusCapture();
});

document.getElementById('again').addEventListener('click', () => {
  reset();
  focusCapture();
});

document.getElementById('close-results').addEventListener('click', () => {
  els.results.hidden = true;
});

/* ----------------------------------------------------------------------- go */

els.countGroup.hidden = true;
reset();
