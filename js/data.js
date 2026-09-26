/* 打字練習 — 資料檔（普通 script，不用 ES module，方便直接開 index.html）
 * 鍵位依據：大千傳統（Windows / macOS 標準注音排列）
 * 來源：vChewing 使用手冊《注音鍵盤排列參考清單》
 * 若與你手上鍵盤貼紙不符，只改 BOPOMOFO 這一處，全站（含出題）會跟著變。
 */
window.TP_DATA = (function () {
  "use strict";

  // 按鍵 code → 注音符號。用 e.code，不受作業系統輸入法影響。
  var BOPOMOFO = {
    Digit1: "ㄅ", Digit2: "ㄉ", Digit3: "ˇ", Digit4: "ˋ", Digit5: "ㄓ",
    Digit6: "ˊ", Digit7: "˙", Digit8: "ㄚ", Digit9: "ㄞ", Digit0: "ㄢ",
    Minus: "ㄦ",

    KeyQ: "ㄆ", KeyW: "ㄊ", KeyE: "ㄍ", KeyR: "ㄐ", KeyT: "ㄔ", KeyY: "ㄗ",
    KeyU: "ㄧ", KeyI: "ㄛ", KeyO: "ㄟ", KeyP: "ㄣ",

    KeyA: "ㄇ", KeyS: "ㄋ", KeyD: "ㄎ", KeyF: "ㄑ", KeyG: "ㄕ", KeyH: "ㄘ",
    KeyJ: "ㄨ", KeyK: "ㄜ", KeyL: "ㄠ", Semicolon: "ㄤ",

    KeyZ: "ㄈ", KeyX: "ㄌ", KeyC: "ㄏ", KeyV: "ㄒ", KeyB: "ㄖ", KeyN: "ㄙ",
    KeyM: "ㄩ", Comma: "ㄝ", Period: "ㄡ", Slash: "ㄥ",

    Space: "ˉ" // 一聲（空白調）
  };

  // 鍵帽排版：每格 [code, 主字, Shift 字]，注音自動由 BOPOMOFO 帶入
  var KEYCAPS = [
    [
      ["Backquote", "`", "~"], ["Digit1", "1", "!"], ["Digit2", "2", "@"], ["Digit3", "3", "#"],
      ["Digit4", "4", "$"], ["Digit5", "5", "%"], ["Digit6", "6", "^"], ["Digit7", "7", "&"],
      ["Digit8", "8", "*"], ["Digit9", "9", "("], ["Digit0", "0", ")"], ["Minus", "-", "_"],
      ["Equal", "=", "+"], ["Backspace", "⌫", ""]
    ],
    [
      ["Tab", "Tab"], ["KeyQ", "q", "Q"], ["KeyW", "w", "W"], ["KeyE", "e", "E"],
      ["KeyR", "r", "R"], ["KeyT", "t", "T"], ["KeyY", "y", "Y"], ["KeyU", "u", "U"],
      ["KeyI", "i", "I"], ["KeyO", "o", "O"], ["KeyP", "p", "P"], ["BracketLeft", "[", "{"],
      ["BracketRight", "]", "}"], ["Backslash", "\\", "|"]
    ],
    [
      ["CapsLock", "Caps"], ["KeyA", "a", "A"], ["KeyS", "s", "S"], ["KeyD", "d", "D"],
      ["KeyF", "f", "F"], ["KeyG", "g", "G"], ["KeyH", "h", "H"], ["KeyJ", "j", "J"],
      ["KeyK", "k", "K"], ["KeyL", "l", "L"], ["Semicolon", ";", ":"], ["Quote", "'", "\""],
      ["Enter", "Enter"]
    ],
    [
      ["ShiftLeft", "Shift"], ["KeyZ", "z", "Z"], ["KeyX", "x", "X"], ["KeyC", "c", "C"],
      ["KeyV", "v", "V"], ["KeyB", "b", "B"], ["KeyN", "n", "N"], ["KeyM", "m", "M"],
      ["Comma", ",", "<"], ["Period", ".", ">"], ["Slash", "/", "?"], ["ShiftRight", "Shift"]
    ],
    [
      ["ControlLeft", "Ctrl"], ["AltLeft", "Alt"], ["Space", "Space"],
      ["AltRight", "Alt"], ["ControlRight", "Ctrl"]
    ]
  ];

  // 學習模式出題範圍：以按鍵 code 定義，符號自動反查
  var GROUP_CODES = {
    all: Object.keys(BOPOMOFO),
    shengmu: [
      "Digit1", "KeyQ", "KeyA", "KeyZ", "Digit2", "KeyW", "KeyS", "KeyX", "KeyE", "KeyD",
      "KeyC", "KeyR", "KeyF", "KeyV", "Digit5", "KeyT", "KeyG", "KeyB", "KeyY", "KeyH", "KeyN"
    ],
    jiemu: ["KeyU", "KeyJ", "KeyM"],
    yunmu: [
      "Digit8", "KeyI", "KeyK", "Comma", "Digit9", "KeyO", "KeyL", "Period", "Digit0",
      "KeyP", "Semicolon", "Slash", "Minus"
    ],
    tone: ["Space", "Digit6", "Digit3", "Digit4", "Digit7"]
  };

  var GROUPS = {};
  Object.keys(GROUP_CODES).forEach(function (name) {
    GROUPS[name] = GROUP_CODES[name]
      .map(function (c) { return { code: c, sym: BOPOMOFO[c] }; })
      .filter(function (x) { return !!x.sym; });
  });

  var GROUP_LABELS = {
    all: "全部", shengmu: "聲母", jiemu: "介音", yunmu: "韻母", tone: "聲調"
  };

  var WORDS = {
    easy: [
      "the", "and", "you", "that", "this", "with", "have", "what", "when", "your",
      "from", "they", "will", "would", "there", "their", "which", "about", "people", "know",
      "only", "want", "these", "other", "time", "could", "than", "then", "because", "over"
    ],
    hard: [
      "algorithm", "repository", "configuration", "authentication", "performance", "architecture",
      "synchronization", "asynchronous", "enumeration", "implementation", "infrastructure",
      "responsibility", "simultaneously", "threshold", "hypothesis", "paradigm", "ubiquitous",
      "meticulous", "pragmatic", "heuristic", "idempotent", "concurrency", "serialization",
      "refactoring", "middleware", "framework", "keyboard", "punctuation", "accelerator"
    ]
  };

  var SENTENCES = [
    "The quick brown fox jumps over the lazy dog while the cat watches.",
    "Practice a little every day and your fingers will remember the keys.",
    "Good typing is not about speed alone, it is about steady and accurate rhythm.",
    "She opened the laptop, read the pull request, and quietly approved the change.",
    "Every keyboard shortcut you learn saves a small trip to the menu.",
    "Typing well means looking at the screen instead of hunting for letters.",
    "He wrote a short note, fixed two typos, and shipped the page before lunch.",
    "Accuracy first, then speed; the rhythm comes from thousands of calm repeats.",
    "Small steps, done daily, beat one heroic all nighter every six months.",
    "The meeting moved to Thursday, so please update the calendar and the doc.",
    "A clean diff is a kindness to whoever reads the code next month.",
    "Look at the screen, not the keys, and let your fingers do the work."
  ];

  var ZH_SENTENCES = [
    "今天天氣不錯，我們先在原地慢跑十分鐘，再開始工作。",
    "打字是一項肌肉記憶的練習，重點不是快，而是穩定。",
    "請把這段話完整地打出來，注意標點符號也要一起輸入。",
    "好的工程師會先寫測試，再寫程式；先想清楚，再動手。",
    "讀一本書需要時間，複習一本書需要更多的時間。",
    "慢慢來，比較快。把每個字打對，速度自然會來。",
    "螢幕保持與眼睛約一臂的距離，每三十分鐘休息五分鐘。",
    "他打開檔案，改了三個錯字，然後把網頁發佈上線。",
    "練習打字的網站很多，重要的是每天固定練習十五分鐘。",
    "把複雜的事情拆成簡單的小步驟，就完成了大半。",
    "學習新技能最好的時機是三年前，再來就是現在。",
    "先把事情做完，再把它做好；完美的初稿是不存在的。"
  ];

  return {
    BOPOMOFO: BOPOMOFO,
    KEYCAPS: KEYCAPS,
    GROUPS: GROUPS,
    GROUP_LABELS: GROUP_LABELS,
    WORDS: WORDS,
    SENTENCES: SENTENCES,
    ZH_SENTENCES: ZH_SENTENCES
  };
})();
