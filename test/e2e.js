/* 四頁向導 E2E：首頁選模式 → 設定頁 → 練習頁 → 結果頁
 * 執行：node test/e2e.js（需已安裝 playwright 與 /usr/bin/chromium）
 */
const { chromium } = require('playwright');
const path = require('path');

const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const log = (...a) => console.log(...a);
let fails = 0;
function check(name, cond, extra) {
  if (cond) log('  PASS ' + name);
  else { fails++; log('  FAIL ' + name + (extra ? ' -> ' + extra : '')); }
}

/* 用隱藏 input 的 composition 事件模擬注音／倉頡輸入法 */
async function typeChars(page, chars) {
  for (const ch of chars) {
    await page.evaluate((c) => {
      const cap = document.getElementById('cap');
      cap.focus();
      cap.dispatchEvent(new CompositionEvent('compositionstart', { data: '' }));
      cap.value = c;
      cap.dispatchEvent(new CompositionEvent('compositionend', { data: c }));
    }, ch);
    await page.waitForTimeout(25);
  }
}
const targetChars = (page) =>
  page.evaluate(() => Array.from(document.querySelectorAll('#view span')).map(s => s.dataset.ch));
const codeOfSym = (page, sym) =>
  page.evaluate(s => {
    const D = window.TP_DATA;
    return Object.keys(D.BOPOMOFO).find(k => D.BOPOMOFO[k] === s);
  }, sym);

async function visible(page, sel) { return page.locator(sel).isVisible(); }
async function hidden(page, sel) { return !(await page.locator(sel).isVisible()); }

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await page.goto(URL);
  await page.waitForTimeout(400);

  /* ---------- 1. 首頁 ---------- */
  log('\n[1] 首頁：只看到模式選擇');
  check('標題正確', (await page.title()).includes('打字練習'));
  check('首頁可見', await visible(page, '#page-home'));
  check('設定頁隱藏', await hidden(page, '#page-setup'));
  check('練習頁隱藏', await hidden(page, '#page-practice'));
  check('結果頁隱藏', await hidden(page, '#page-result'));
  check('預設停在首頁', ['', '#/'].includes(await page.evaluate(() => location.hash)));
  check('兩張模式卡', (await page.locator('.mode-card').count()) === 2);

  /* ---------- 2. 設定頁（一般模式） ---------- */
  log('\n[2] 一般模式 → 設定頁');
  await page.click('#pick-normal');
  await page.waitForTimeout(300);
  check('hash 變 #/setup', (await page.evaluate(() => location.hash)) === '#/setup');
  check('設定頁可見', await visible(page, '#page-setup'));
  check('首頁已隱藏', await hidden(page, '#page-home'));
  check('顯示一般設定卡', await visible(page, '#setup-normal'));
  check('隱藏學習設定卡', await hidden(page, '#setup-learn'));
  check('預設不顯示唐詩難度', await hidden(page, '#row-tier'));
  check('預設計時顯示秒數', await visible(page, '#row-duration'));
  check('CTA 有摘要', (await page.textContent('#ctaHint')).includes('計時'));

  log('  · 選項互動');
  await page.click('#l-poem');
  await page.waitForTimeout(150);
  check('選唐詩後出現難度列', await visible(page, '#row-tier'));
  check('難度預設＝易', (await page.getAttribute('#k-e', 'aria-pressed')) === 'true');
  await page.click('#k-h');
  await page.waitForTimeout(120);
  check('可選難', (await page.getAttribute('#k-h', 'aria-pressed')) === 'true');
  await page.click('#t-text');
  await page.waitForTimeout(120);
  check('計字模式隱藏秒數列', await hidden(page, '#row-duration'));
  await page.click('#t-time');
  await page.click('#d-30');
  await page.click('#e-fix');
  await page.click('#l-zh');
  await page.waitForTimeout(150);
  check('切回中文後難度列隱藏', await hidden(page, '#row-tier'));
  check('摘要含 30 秒', (await page.textContent('#ctaHint')).includes('30 秒'), await page.textContent('#ctaHint'));
  check('摘要含嚴格模式', (await page.textContent('#ctaHint')).includes('要改對'));

  /* ---------- 3. 練習頁（一般模式） ---------- */
  log('\n[3] 練習頁：開始打字');
  await page.click('#b-start');
  await page.waitForTimeout(300);
  check('hash 變 #/practice', (await page.evaluate(() => location.hash)) === '#/practice');
  check('練習頁可見', await visible(page, '#page-practice'));
  check('頂部摘要可見', (await page.textContent('#summaryText')).includes('計時 30 秒'));
  check('有「修改」連結', await visible(page, '#b-edit'));
  check('一般面板可見', await visible(page, '#pane-normal'));
  check('學習面板隱藏', await hidden(page, '#pane-learn'));
  check('渲染出目標文字', (await targetChars(page)).length > 10);
  check('提示層可見', await visible(page, '#ghost'));

  const chars = await targetChars(page);
  await page.click('#typer');
  await typeChars(page, chars.slice(0, 8));
  check('8 字全對標綠', (await page.locator('#view span.ok').count()) === 8);
  check('正確率 100%', (await page.textContent('#sAcc')) === '100');
  check('計時已啟動（提示層消失）', await hidden(page, '#ghost'));

  log('  · 打錯與退格');
  await typeChars(page, ['X']);
  await page.waitForTimeout(60);
  check('出現紅色錯字', (await page.locator('#view span.bad').count()) === 1);
  check('錯誤計數 = 1', (await page.textContent('#sErr')) === '1');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(60);
  check('退格後錯誤歸零', (await page.textContent('#sErr')) === '0');

  log('  · 嚴格模式卡住');
  const curBefore = await page.evaluate(() => document.querySelectorAll('#view span.cur').length);
  await typeChars(page, ['Z']);
  await page.waitForTimeout(60);
  const blockedTxt = await page.evaluate(() => {
    const c = document.querySelector('#view span.cur');
    return c ? c.textContent : null;
  });
  check('打錯後卡在同一格', curBefore === 1 && blockedTxt === 'Z', 'cur=' + blockedTxt);
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(60);
  const unblocked = await page.evaluate(() => {
    const c = document.querySelector('#view span.cur');
    return c ? c.textContent : null;
  });
  check('退格後解鎖', unblocked !== 'Z', 'cur=' + unblocked);

  log('  · Esc 回設定頁');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('hash 退回 #/setup', (await page.evaluate(() => location.hash)) === '#/setup');
  check('設定頁可見', await visible(page, '#page-setup'));
  check('嚴格模式開關仍記住', (await page.getAttribute('#e-fix', 'aria-pressed')) === 'true');
  await page.click('#e-go');
  await page.waitForTimeout(120);

  /* ---------- 4. 計字模式打完 → 結果頁 ---------- */
  log('\n[4] 計字模式打完一篇 → 結果頁');
  await page.click('#t-text');
  await page.waitForTimeout(120);
  await page.click('#b-start');
  await page.waitForTimeout(300);
  // 練習頁進入時應重設為全新的一輪
  check('進入即為新的一輪', (await page.textContent('#sErr')) === '0');
  const full = await targetChars(page);
  await page.click('#typer');
  await typeChars(page, full);
  await page.waitForTimeout(400);
  check('打完跳結果頁', (await page.evaluate(() => location.hash)) === '#/result');
  check('結果頁可見', await visible(page, '#page-result'));
  check('打對字數 = 全文長度', (await page.textContent('#rHits')) === String(full.length), await page.textContent('#rHits'));
  check('含速度數字', /^\d+$/.test(await page.textContent('#rMain')));
  check('含評語', (await page.textContent('#rVerdict')).length > 5);
  check('結果標題帶摘要', (await page.textContent('#resultTitle')).includes('計字'));

  log('  · 再練一次 / 換設定 / 回首頁');
  await page.click('#b-again');
  await page.waitForTimeout(300);
  check('再練一次 → 練習頁', (await page.evaluate(() => location.hash)) === '#/practice');
  const reset = await page.evaluate(() => document.querySelectorAll('#view span.ok').length);
  check('重新渲染未打的文本', reset === 0, 'ok=' + reset);
  await page.click('#b-edit');
  await page.waitForTimeout(300);
  check('修改連結回設定頁', (await page.evaluate(() => location.hash)) === '#/setup');
  await page.click('#b-start');
  await page.waitForTimeout(250);
  await page.goBack();
  await page.waitForTimeout(300);
  check('瀏覽器上一頁回設定頁', (await page.evaluate(() => location.hash)) === '#/setup');
  await page.goForward();
  await page.waitForTimeout(300);
  check('下一頁回練習頁', (await page.evaluate(() => location.hash)) === '#/practice');

  /* ---------- 5. 自訂文本 ---------- */
  log('\n[5] 自訂文本');
  await page.goBack();
  await page.waitForTimeout(250);
  await page.fill('#custom', '測試 123');
  await page.waitForTimeout(150);
  check('自訂文本摘要走計字', (await page.textContent('#ctaHint')).includes('自訂文本'), await page.textContent('#ctaHint'));
  check('自訂文本隱藏秒數', await hidden(page, '#row-duration'));
  await page.click('#b-start');
  await page.waitForTimeout(300);
  const customTxt = (await targetChars(page)).join('');
  check('載入自訂文本', customTxt === '測試 123', JSON.stringify(customTxt));
  await typeChars(page, (await targetChars(page)));
  await page.waitForTimeout(300);
  check('打完自訂文本進結果頁', (await page.evaluate(() => location.hash)) === '#/result');
  await page.click('#b-change');
  await page.waitForTimeout(250);
  await page.click('#b-clear');
  await page.waitForTimeout(200);
  // 清空後回到題庫，且沿用設定頁本身的計量方式（此時仍是計字）
  check('清空後改用題庫', !(await page.textContent('#ctaHint')).includes('自訂文本'), await page.textContent('#ctaHint'));
  check('清空後按設定顯示秒數（計字→隱藏）', await hidden(page, '#row-duration'));
  await page.click('#t-time');
  await page.waitForTimeout(150);
  check('切回計時後秒數列回來', await visible(page, '#row-duration'));

  /* ---------- 6. 學習模式 ---------- */
  log('\n[6] 首頁 → 學習模式設定');
  await page.click('.back');
  await page.waitForTimeout(300);
  check('回首頁', (await page.evaluate(() => location.hash)) === '#/');
  await page.click('#pick-learn');
  await page.waitForTimeout(300);
  check('顯示學習設定卡', await visible(page, '#setup-learn'));
  check('隱藏一般設定卡', await hidden(page, '#setup-normal'));
  check('標題為鍵位設定', (await page.textContent('#setupTitle')).includes('鍵位'));
  check('提示預設開啟', (await page.getAttribute('#h-on', 'aria-pressed')) === 'true');
  await page.click('#g-tone');
  await page.waitForTimeout(150);
  check('摘要含聲調', (await page.textContent('#ctaHint')).includes('聲調'));
  await page.click('#h-off');
  await page.waitForTimeout(120);
  check('摘要含提示關閉', (await page.textContent('#ctaHint')).includes('關閉'));

  log('\n[7] 學習模式練習');
  await page.click('#b-start');
  await page.waitForTimeout(300);
  check('學習面板可見', await visible(page, '#pane-learn'));
  check('鍵盤渲染', (await page.locator('.key').count()) > 55);
  check('聲調範圍 = 5 題', (await page.textContent('#lTotal')) === '5', await page.textContent('#lTotal'));
  check('提示關閉時不亮黃鍵', (await page.locator('.key.hint').count()) === 0);
  const p1 = (await page.textContent('#prompt')).trim();
  check('題目是注音符號', /[ㄅ-ㄩˇˋˊ˙ˉ]/.test(p1), p1);

  const right1 = await codeOfSym(page, p1);
  const wrongKey = ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyA", "KeyS"].find(c => c !== right1);
  await page.keyboard.press(wrongKey);
  await page.waitForTimeout(150);
  check('按錯紅燈', (await page.locator('.key.miss').count()) >= 1);
  check('按錯計數 = 1', (await page.textContent('#lWrong')) === '1');
  check('留在原題', (await page.textContent('#lPos')) === '1' && (await page.textContent('#prompt')).trim() === p1);

  await page.waitForTimeout(600);
  await page.keyboard.press(right1);
  await page.waitForTimeout(200);
  check('按對跳下一題', (await page.textContent('#lPos')) === '2' && (await page.textContent('#lRight')) === '1');

  log('\n[8] 黃色提示開關（設定頁改，練習頁生效）');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await page.click('#h-on');
  await page.click('#g-all');
  await page.waitForTimeout(120);
  await page.click('#b-start');
  await page.waitForTimeout(300);
  check('全部範圍 = 42 鍵', (await page.textContent('#lTotal')) === '42', await page.textContent('#lTotal'));
  check('提示開啟亮黃鍵', (await page.locator('.key.hint').count()) >= 1);
  const hintSym = await page.evaluate(() => {
    const k = document.querySelector('.key.hint');
    return k ? k.querySelector('.kcap-boo').textContent : null;
  });
  check('提示鍵與題目一致', hintSym === (await page.textContent('#prompt')).trim());

  log('\n[9] 跑完整輪 → 結果頁');
  for (let i = 0; i < 70; i++) {
    if ((await page.evaluate(() => location.hash)) === '#/result') break;
    const sym = (await page.textContent('#prompt')).trim();
    const code = await codeOfSym(page, sym);
    if (!code) break;
    await page.keyboard.press(code);
    await page.waitForTimeout(30);
  }
  check('跑完自動進結果頁', (await page.evaluate(() => location.hash)) === '#/result');
  check('主指標為答對率', (await page.textContent('#rMainLab')) === '答對率');
  check('答對率 100%', (await page.textContent('#rMain')) === '100%', await page.textContent('#rMain'));
  check('答對 42 題', (await page.textContent('#rHits')) === '42', await page.textContent('#rHits'));

  /* ---------- 10. 唐詩素材 ---------- */
  log('\n[10] 唐詩素材（於結果頁→換設定）');
  await page.click('#b-change');
  await page.waitForTimeout(250);
  // 上一輪是學習模式，先回首頁改選一般練習
  await page.click('.back');
  await page.waitForTimeout(250);
  await page.click('#pick-normal');
  await page.waitForTimeout(250);
  await page.click('#l-poem');
  await page.waitForTimeout(150);
  await page.click('#k-e');
  await page.waitForTimeout(120);
  await page.click('#b-start');
  await page.waitForTimeout(300);
  const credit = ((await page.textContent('#view i.pc')) || '').trim();
  check('顯示出處（作者＋篇名）', credit.includes('〈'), 'credit=' + credit);
  const poemCheck = await page.evaluate(() => {
    const typed = Array.from(document.querySelectorAll('#view span')).map(s => s.dataset.ch).join('');
    const all = [].concat(...Object.values(window.TP_POEMS));
    return { typed, matched: all.some(x => x.p.join('') === typed), inPoem: typed.includes('〈') };
  });
  check('span 內容為純詩文且對得上原庫', poemCheck.matched && !poemCheck.inPoem);
  await page.click('#typer');
  await typeChars(page, (await targetChars(page)).slice(0, 6));
  check('唐詩打字比對正常', (await page.locator('#view span.ok').count()) === 6);
  check('單位為字/分', (await page.textContent('#unit')) === '字/分');

  log('  · 英文素材');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await page.click('#l-en');
  await page.waitForTimeout(150);
  await page.click('#b-start');
  await page.waitForTimeout(300);
  check('英文單位 WPM', (await page.textContent('#unit')) === 'WPM');
  const enText = (await targetChars(page)).join('');
  check('英文文本為拉丁字元', /^[A-Za-z ,.;:'"-]+$/.test(enText), enText.slice(0, 30));

  /* ---------- 11. 持久化 ---------- */
  log('\n[11] 設定與主題持久化');
  await page.evaluate(() => location.hash = '#/');
  await page.waitForTimeout(250);
  await page.click('#theme');
  await page.waitForTimeout(150);
  check('切到淺色', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'light');
  await page.reload();
  await page.waitForTimeout(500);
  check('重載後記住主題', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'light');
  check('重載後回到首頁', await visible(page, '#page-home'));
  await page.click('#pick-normal');
  await page.waitForTimeout(250);
  check('重載後記住英文素材', (await page.getAttribute('#l-en', 'aria-pressed')) === 'true');
  await page.click('#theme');
  await page.waitForTimeout(120);

  /* ---------- 12. 深連結 ---------- */
  log('\n[12] 直接開 #/setup');
  await page.goto(URL + '#/setup');
  await page.waitForTimeout(400);
  check('深連結停在設定頁', await visible(page, '#page-setup'));
  await page.goto(URL + '#/nope');
  await page.waitForTimeout(400);
  check('未知路由退回首頁', await visible(page, '#page-home'));

  /* ---------- 13. 響應式 + 截圖 ---------- */
  log('\n[13] 響應式與截圖');
  await page.goto(URL);
  await page.waitForTimeout(350);
  await page.screenshot({ path: '/tmp/w-home.png', fullPage: true });
  await page.click('#pick-normal');
  await page.waitForTimeout(250);
  await page.screenshot({ path: '/tmp/w-setup-normal.png', fullPage: true });
  await page.click('#b-start');
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/w-practice.png', fullPage: true });
  await page.evaluate(() => location.hash = '#/');
  await page.waitForTimeout(250);
  await page.click('#pick-learn');
  await page.waitForTimeout(250);
  await page.screenshot({ path: '/tmp/w-setup-learn.png', fullPage: true });
  await page.click('#b-start');
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/w-practice-learn.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  let overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  check('手機：學習練習頁無橫向溢出', !overflow, 'sw=' + await page.evaluate(() => document.documentElement.scrollWidth));
  await page.screenshot({ path: '/tmp/w-m-learn.png', fullPage: true });
  await page.goto(URL);
  await page.waitForTimeout(350);
  overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  check('手機：首頁無橫向溢出', !overflow);
  await page.screenshot({ path: '/tmp/w-m-home.png', fullPage: true });
  await page.click('#pick-normal');
  await page.waitForTimeout(250);
  overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  check('手機：設定頁無橫向溢出', !overflow);
  await page.screenshot({ path: '/tmp/w-m-setup.png', fullPage: true });

  log('\n[14] 控制台錯誤');
  check('無 JS 錯誤', errs.length === 0, errs.join(' | '));

  log('\n=========================');
  log(fails === 0 ? '全部通過' : `${fails} 項失敗`);
  await browser.close();
  process.exit(fails === 0 ? 0 : 1);
})();
