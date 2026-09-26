/* 四頁向導 E2E：首頁選模式 → 設定頁 → 練習頁（逐行）→ 結果頁
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

/* 目前所有行的範例文字 */
const lineTexts = (page) =>
  page.evaluate(() => Array.from(document.querySelectorAll('#lines .line .sample'))
    .map(s => Array.from(s.children).map(x => x.textContent).join('')));

/* 模擬輸入法：把整段文字塞進焦點中的 input 並觸發 input 事件（等同按 Enter 出字） */
async function imeType(page, str) {
  await page.evaluate((s) => {
    const inp = document.activeElement;
    inp.value = s;
    inp.dispatchEvent(new InputEvent('input', { bubbles: true }));
  }, str);
  await page.waitForTimeout(80);
}

/* 用真實按鍵打（不經輸入法） */
async function rawType(page, str) {
  await page.keyboard.type(str, { delay: 12 });
  await page.waitForTimeout(80);
}

const codeOfSym = (page, sym) =>
  page.evaluate(s => {
    const D = window.TP_DATA;
    return Object.keys(D.BOPOMOFO).find(k => D.BOPOMOFO[k] === s);
  }, sym);

const visible = (page, sel) => page.locator(sel).isVisible();
const hidden = async (page, sel) => !(await page.locator(sel).isVisible());

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

  /* ---------- 3. 練習頁：逐行版面 ---------- */
  log('\n[3] 練習頁：一行範例、一個輸入框');
  await page.click('#b-start');
  await page.waitForTimeout(350);
  check('hash 變 #/practice', (await page.evaluate(() => location.hash)) === '#/practice');
  check('頂部摘要可見', (await page.textContent('#summaryText')).includes('計時 30 秒'));
  check('有「修改」連結', await visible(page, '#b-edit'));

  const lines = await lineTexts(page);
  check('已切成行', lines.length >= 1, 'lines=' + lines.length);
  check('每行都有對應輸入框',
        (await page.locator('#lines .line input.answer').count()) === lines.length);
  check('行寬不超 28 字', lines.every(l => l.length <= 28), 'max=' + Math.max(...lines.map(l => l.length)));
  check('焦點已在第一列', await page.evaluate(() => {
    const a = document.activeElement;
    return !!a && a.classList.contains('answer') && a === document.querySelector('#lines input.answer');
  }));

  log('  · 打對會即時標綠');
  await rawType(page, lines[0].slice(0, 4));
  check('前 4 字標綠', (await page.locator('#lines .line:first-child .sample span.ok').count()) === 4,
        'ok=' + (await page.locator('#lines .line:first-child .sample span.ok').count()));
  check('正確率 100%', (await page.textContent('#sAcc')) === '100');
  check('提示層已消失', await hidden(page, '#ghost'));

  log('  · 打錯會標紅並累計');
  await rawType(page, 'X');
  check('出現紅色錯字', (await page.locator('#lines .line:first-child .sample span.bad').count()) === 1);
  check('錯誤計數 = 1', (await page.textContent('#sErr')) === '1', 'err=' + (await page.textContent('#sErr')));
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(80);
  check('退格後紅字消失', (await page.locator('#lines .line:first-child .sample span.bad').count()) === 0);
  check('退格後游標格回到原位',
        (await page.locator('#lines .line:first-child .sample span.cur').count()) === 1);

  log('  · 打完一行自動跳下一行');
  const beforeDone = await page.locator('#lines .line.done').count();
  await imeType(page, lines[0]);
  await page.waitForTimeout(200);
  check('該行結算為完成', (await page.locator('#lines .line.done').count()) === beforeDone + 1);
  check('完成後顯示已打內容', (await page.locator('#lines .line:first-child .typed').count()) === 1);
  check('焦點自動移到下一列', await page.evaluate(() => {
    const a = document.activeElement;
    return !!a && a === document.querySelectorAll('#lines input.answer')[1];
  }));

  log('  · Esc 回設定頁');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('hash 退回 #/setup', (await page.evaluate(() => location.hash)) === '#/setup');
  check('嚴格模式開關仍記住', (await page.getAttribute('#e-fix', 'aria-pressed')) === 'true');
  await page.click('#e-go');
  await page.waitForTimeout(120);

  /* ---------- 4. 嚴格模式：有錯不讓走 ---------- */
  log('\n[4] 嚴格模式（要改對才能繼續）');
  await page.click('#e-fix');
  await page.waitForTimeout(120);
  await page.click('#b-start');
  await page.waitForTimeout(350);
  const L = await lineTexts(page);
  await imeType(page, 'X'.repeat(L[0].length));   // 保證每個字都錯
  await page.waitForTimeout(150);
  check('整行打完但有錯 → 不跳行',
        (await page.locator('#lines .line.done').count()) === 0);
  check('出現紅色提示文字', await visible(page, '#hint'));
  check('提示內容指出錯幾個字', (await page.textContent('#hint')).includes('個字不對'), await page.textContent('#hint'));
  check('該列標成待修正', (await page.locator('#lines .line.needs').count()) === 1);
  // 清空重打對
  await page.evaluate(() => {
    const inp = document.activeElement;
    inp.value = '';
    inp.dispatchEvent(new InputEvent('input', { bubbles: true }));
  });
  await imeType(page, L[0]);
  await page.waitForTimeout(200);
  check('改對後放行', (await page.locator('#lines .line.done').count()) === 1);
  check('提示消失', await hidden(page, '#hint'));
  check('曾經打錯仍計入錯誤數', (await page.textContent('#sErr')) !== '0', 'err=' + (await page.textContent('#sErr')));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await page.click('#e-go');
  await page.waitForTimeout(120);

  /* ---------- 5. 計字打完 → 結果頁 ---------- */
  log('\n[5] 計字模式打完全部 → 結果頁');
  await page.click('#t-text');
  await page.waitForTimeout(120);
  await page.click('#b-start');
  await page.waitForTimeout(350);
  check('進入即為新的一輪', (await page.textContent('#sErr')) === '0');
  const all = await lineTexts(page);
  const totalChars = all.join('').length;
  await page.evaluate(() => {
    const l = document.querySelector('#lines .line:not(.done) input.answer');
    if (l) l.focus();
  });
  for (const t of all) { await imeType(page, t); }
  await page.waitForTimeout(400);
  check('打完跳結果頁', (await page.evaluate(() => location.hash)) === '#/result');
  check('打對字數 = 全文長度', (await page.textContent('#rHits')) === String(totalChars),
        'hits=' + await page.textContent('#rHits') + ' total=' + totalChars);
  check('含速度數字', /^\d+$/.test(await page.textContent('#rMain')));
  check('含評語', (await page.textContent('#rVerdict')).length > 5);
  check('結果標題帶摘要', (await page.textContent('#resultTitle')).includes('計字'));

  log('  · 再練一次 / 修改 / 換設定 / 前後頁');
  await page.click('#b-again');
  await page.waitForTimeout(350);
  check('再練一次 → 練習頁', (await page.evaluate(() => location.hash)) === '#/practice');
  check('重新渲染且未結算', (await page.locator('#lines .line.done').count()) === 0);
  check('新的一輪焦點在首列', await page.evaluate(() => {
    const a = document.activeElement;
    return !!a && a === document.querySelector('#lines input.answer');
  }));
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

  /* ---------- 6. 自訂文本逐行 ---------- */
  log('\n[6] 自訂文本會依換行拆成多列');
  await page.goBack();
  await page.waitForTimeout(250);
  await page.fill('#custom', '鵝鵝鵝，曲項向天歌，\n白毛浮綠水，紅掌撥清波。');
  await page.waitForTimeout(150);
  check('自訂文本摘要走計字', (await page.textContent('#ctaHint')).includes('自訂文本'), await page.textContent('#ctaHint'));
  await page.click('#b-start');
  await page.waitForTimeout(350);
  const cl = await lineTexts(page);
  check('依換行切成兩列', cl.length === 2, JSON.stringify(cl));
  check('第一列內容正確', cl[0] === '鵝鵝鵝，曲項向天歌，', JSON.stringify(cl[0]));
  await page.evaluate(() => document.querySelector('#lines input.answer').focus());
  await imeType(page, cl[0]);
  await imeType(page, cl[1]);
  await page.waitForTimeout(400);
  check('打完自訂文本進結果頁', (await page.evaluate(() => location.hash)) === '#/result');
  await page.click('#b-change');
  await page.waitForTimeout(250);
  await page.click('#b-clear');
  await page.waitForTimeout(200);
  check('清空後改用題庫', !(await page.textContent('#ctaHint')).includes('自訂文本'), await page.textContent('#ctaHint'));

  /* ---------- 7. 唐詩逐行 ---------- */
  log('\n[7] 唐詩：每句一行');
  await page.click('#l-poem');
  await page.waitForTimeout(150);
  await page.click('#k-e');
  await page.waitForTimeout(120);
  await page.click('#b-start');
  await page.waitForTimeout(350);
  const credit = ((await page.textContent('#lines .credit')) || '').trim();
  check('顯示出處（作者＋篇名）', credit.includes('〈'), 'credit=' + credit);
  const pl = await lineTexts(page);
  check('每行是一句或一聯（以標點結尾、不超 22 字）',
        pl.every(l => /[，。；：！？、,.!?;:]$/.test(l) && l.length <= 22),
        JSON.stringify(pl));
  check('唐詩至少切成兩行', pl.length >= 2, 'lines=' + pl.length);
  const poemMatch = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#lines .line .sample'))
      .map(s => Array.from(s.children).map(x => x.textContent).join(''));
    const joined = rows.join('');
    const all = [].concat(...Object.values(window.TP_POEMS));
    return { joined, matched: all.some(x => x.p.join('') === joined), creditIn: joined.includes('〈') };
  });
  check('各行合起來對得上原庫且不含出處', poemMatch.matched && !poemMatch.creditIn,
        'joined=' + poemMatch.joined.slice(0, 24));
  check('單位為字/分', (await page.textContent('#unit')) === '字/分');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);

  /* ---------- 8. 英文逐行 ---------- */
  log('\n[8] 英文：不會把單字切兩半');
  await page.click('#l-en');
  await page.waitForTimeout(150);
  await page.click('#b-start');
  await page.waitForTimeout(350);
  check('英文單位 WPM', (await page.textContent('#unit')) === 'WPM');
  const el2 = await lineTexts(page);
  check('英文文本為拉丁字元', el2.every(l => /^[A-Za-z ,.;:'"-]+$/.test(l)), JSON.stringify(el2[0]));
  check('斷行不切碎單字', el2.every(l => !/^[a-z]/.test(l) || l.includes(' ') || l.length < 24),
        JSON.stringify(el2));

  /* ---------- 9. 防貼上 ---------- */
  log('\n[9] 防 Ctrl+V 貼上');
  await page.evaluate(() => {
    window.__pasted = false;
    document.addEventListener('paste', () => { window.__pasted = true; }, true);
  });
  const enLine = (await lineTexts(page))[0];
  await page.evaluate(() => {
    const a = document.activeElement;
    if (!(a && a.classList.contains('answer'))) document.querySelector('#lines .line:not(.done) input.answer').focus();
  });
  // 剪貼簿塞整行，然後按 Ctrl+V
  await page.evaluate((t) => {
    const inp = document.activeElement;
    window.__clip = t;
    inp.addEventListener('paste', (e) => {
      if (e.clipboardData && e.clipboardData.setData) e.clipboardData.setData('text/plain', window.__clip);
      e.preventDefault();
    }, true);
  }, enLine);
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(250);
  const afterPaste = await page.evaluate(() => document.activeElement.value);
  check('輸入框不收貼上內容', afterPaste === '', 'value=' + JSON.stringify(afterPaste));
  check('貼上未增加錯誤或字數', (await page.textContent('#sErr')) === '0', 'err=' + (await page.textContent('#sErr')));
  // 直接打 keydown 組合也要被擋
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(150);
  check('重複按 Ctrl+V 仍無效', (await page.evaluate(() => document.activeElement.value)) === '');

  /* ---------- 10. 真實按鍵與注音流程 ---------- */
  log('\n[10] 注音輸入法流程（composition）');
  await page.goto(URL);
  await page.waitForTimeout(350);
  await page.click('#pick-normal');
  await page.waitForTimeout(250);
  await page.click('#l-zh');
  await page.waitForTimeout(150);
  await page.click('#b-start');
  await page.waitForTimeout(350);
  const zt = (await lineTexts(page))[0];
  await page.evaluate(() => document.querySelector('#lines input.answer').focus());
  // 逐字：先丟出拼音（compositionupdate，input 帶 insertCompositionText），再 compositionend 出字
  for (const ch of zt.slice(0, 6)) {
    await page.evaluate((c) => {
      const inp = document.activeElement;
      inp.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      inp.dispatchEvent(new CompositionEvent('compositionupdate', { data: 'ㄆㄧㄣ', bubbles: true }));
      inp.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', data: 'ㄆㄧㄣ', bubbles: true }));
      inp.value += c;
      inp.dispatchEvent(new CompositionEvent('compositionend', { data: c, bubbles: true }));
      inp.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', data: c, bubbles: true }));
    }, ch);
    await page.waitForTimeout(40);
  }
  check('組合中的拼音不會被計成錯字', (await page.textContent('#sErr')) === '0', 'err=' + (await page.textContent('#sErr')));
  check('只有成品入帳', (await page.locator('#lines .line:first-child .sample span.ok').count()) === 6,
        'ok=' + (await page.locator('#lines .line:first-child .sample span.ok').count()));
  check('輸入框保留已確認的字', (await page.evaluate(() => document.activeElement.value)) === zt.slice(0, 6));
  // Enter 確認不該被當成錯字
  const errB = await page.textContent('#sErr');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  check('按 Enter 不會被判錯字', (await page.textContent('#sErr')) === errB);

  /* ---------- 11. 學習模式 ---------- */
  log('\n[11] 注音鍵位學習');
  await page.goto(URL);
  await page.waitForTimeout(350);
  await page.click('#pick-learn');
  await page.waitForTimeout(300);
  check('顯示學習設定卡', await visible(page, '#setup-learn'));
  check('隱藏一般設定卡', await hidden(page, '#setup-normal'));
  check('標題為鍵位設定', (await page.textContent('#setupTitle')).includes('鍵位'));
  await page.click('#g-tone');
  await page.waitForTimeout(150);
  check('摘要含聲調', (await page.textContent('#ctaHint')).includes('聲調'));
  await page.click('#h-off');
  await page.waitForTimeout(120);
  check('摘要含提示關閉', (await page.textContent('#ctaHint')).includes('關閉'));
  await page.click('#b-start');
  await page.waitForTimeout(350);
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

  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await page.click('#h-on');
  await page.click('#g-all');
  await page.waitForTimeout(120);
  await page.click('#b-start');
  await page.waitForTimeout(350);
  check('全部範圍 = 42 鍵', (await page.textContent('#lTotal')) === '42', await page.textContent('#lTotal'));
  check('提示開啟亮黃鍵', (await page.locator('.key.hint').count()) >= 1);
  const hintSym = await page.evaluate(() => {
    const k = document.querySelector('.key.hint');
    return k ? k.querySelector('.kcap-boo').textContent : null;
  });
  check('提示鍵與題目一致', hintSym === (await page.textContent('#prompt')).trim());

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

  /* ---------- 12. 持久化 ---------- */
  log('\n[12] 設定與主題持久化');
  await page.click('#b-change');
  await page.waitForTimeout(250);
  await page.click('.back');
  await page.waitForTimeout(250);
  await page.click('#pick-normal');
  await page.waitForTimeout(250);
  await page.click('#l-en');
  await page.waitForTimeout(150);
  await page.click('#theme');
  await page.waitForTimeout(150);
  check('切到淺色', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'light');
  await page.reload();
  await page.waitForTimeout(500);
  check('重載後記住主題', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'light');
  check('重載後停在設定頁（有這一輪設定）', await visible(page, '#page-setup'));
  check('重載後記住英文素材', (await page.getAttribute('#l-en', 'aria-pressed')) === 'true');
  await page.evaluate(() => location.hash = '#/');
  await page.waitForTimeout(250);
  check('回首頁可見', await visible(page, '#page-home'));
  await page.click('#theme');
  await page.waitForTimeout(120);

  /* ---------- 13. 深連結 ---------- */
  log('\n[13] 深連結與未知路由');
  await page.goto(URL + '#/setup');
  await page.waitForTimeout(400);
  check('深連結停在設定頁', await visible(page, '#page-setup'));
  await page.goto(URL + '#/result');
  await page.waitForTimeout(400);
  check('沒有這一輪時結果頁退回設定頁', await visible(page, '#page-setup'));
  await page.goto(URL + '#/nope');
  await page.waitForTimeout(400);
  check('未知路由退回首頁', await visible(page, '#page-home'));

  /* ---------- 14. 響應式 + 截圖 ---------- */
  log('\n[14] 響應式與截圖');
  await page.goto(URL);
  await page.waitForTimeout(350);
  await page.screenshot({ path: '/tmp/w-home.png', fullPage: true });
  await page.click('#pick-normal');
  await page.waitForTimeout(250);
  await page.click('#l-zh');
  await page.click('#t-time');
  await page.waitForTimeout(150);
  await page.screenshot({ path: '/tmp/w-setup-normal.png', fullPage: true });
  await page.click('#b-start');
  await page.waitForTimeout(400);
  const L2 = await lineTexts(page);
  await imeType(page, L2[0]);                        // 完成第一行（留下已打過的 recap）
  await page.waitForTimeout(200);
  const L3 = await lineTexts(page);                  // 計時模式下會自動接下一段
  await imeType(page, L3[1].slice(0, Math.ceil(L3[1].length / 2))); // 第二行打一半
  await page.waitForTimeout(200);
  check('截圖停在練習頁', await visible(page, '#page-practice'));
  check('截圖：第一行已完成', (await page.locator('#lines .line:first-child.done').count()) === 1);
  check('截圖：第二行游標在中間', (await page.locator('#lines .line:nth-child(2) .sample span.cur').count()) === 1);
  await page.screenshot({ path: '/tmp/w-practice.png', fullPage: true });
  await page.evaluate(() => location.hash = '#/');
  await page.waitForTimeout(250);
  await page.click('#pick-learn');
  await page.waitForTimeout(250);
  await page.screenshot({ path: '/tmp/w-setup-learn.png', fullPage: true });
  await page.click('#b-start');
  await page.waitForTimeout(350);
  await page.screenshot({ path: '/tmp/w-practice-learn.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  let overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  check('手機：學習練習頁無橫向溢出', !overflow, 'sw=' + await page.evaluate(() => document.documentElement.scrollWidth));
  await page.goto(URL);
  await page.waitForTimeout(350);
  await page.click('#pick-normal');
  await page.waitForTimeout(250);
  await page.click('#b-start');
  await page.waitForTimeout(400);
  const Lm = await lineTexts(page);
  await imeType(page, Lm[0].slice(0, Math.max(2, Math.ceil(Lm[0].length / 2)))); // 打一半，確保停在練習頁
  await page.waitForTimeout(250);
  check('手機截圖停在練習頁', await visible(page, '#page-practice'));
  overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  check('手機：逐行練習頁無橫向溢出', !overflow, 'sw=' + await page.evaluate(() => document.documentElement.scrollWidth));
  await page.screenshot({ path: '/tmp/w-m-practice.png', fullPage: true });
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

  log('\n[15] 控制台錯誤');
  check('無 JS 錯誤', errs.length === 0, errs.join(' | '));

  log('\n=========================');
  log(fails === 0 ? '全部通過' : `${fails} 項失敗`);
  await browser.close();
  process.exit(fails === 0 ? 0 : 1);
})();
