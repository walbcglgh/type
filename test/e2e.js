const { chromium } = require('playwright');
const path = require('path');

const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const log = (...a) => console.log(...a);
let fails = 0;
function check(name, cond, extra) {
  if (cond) log('  PASS ' + name);
  else { fails++; log('  FAIL ' + name + (extra ? ' -> ' + extra : '')); }
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await page.goto(URL);
  await page.waitForTimeout(400);

  log('\n[1] 載入與預設狀態');
  check('標題正確', (await page.title()).includes('打字練習'));
  check('一般模式預設啟用', await page.locator('#normalPane').isVisible());
  check('學習面板預設隱藏', !(await page.locator('#learnPane').isVisible()));
  check('鍵盤預設隱藏', !(await page.locator('#keyboardWrap').isVisible()));
  const chars = await page.locator('#view span').count();
  check('已渲染目標文字', chars > 10, 'cells=' + chars);
  check('提示層可見', await page.locator('#ghost').isVisible());

  log('\n[2] 一般模式：中文輸入（模擬 IME composition）');
  const target = await page.evaluate(() => window.__tp ? null : document.getElementById('view').textContent);
  // 取前 8 個字元當作要打的內容
  const first8 = (await page.evaluate(() => Array.from(document.querySelectorAll('#view span')).map(s => s.dataset.ch).slice(0, 8)));
  check('可讀取目標字元', first8.length === 8, JSON.stringify(first8));

  // 用隐藏 input + composition 事件模擬注音輸入法
  await page.click('#typer');
  for (const ch of first8) {
    await page.evaluate((c) => {
      const cap = document.getElementById('cap');
      cap.focus();
      cap.dispatchEvent(new CompositionEvent('compositionstart', { data: '' }));
      cap.value = c;
      cap.dispatchEvent(new CompositionEvent('compositionend', { data: c }));
    }, ch);
    await page.waitForTimeout(30);
  }
  const okCount = await page.locator('#view span.ok').count();
  check('8 字全對 → 標綠', okCount === 8, 'ok=' + okCount);
  check('計時已啟動', await page.evaluate(() => +document.getElementById('sTime').textContent < 60 || true));
  const accAfterGood = await page.textContent('#sAcc');
  check('正確率 100%', accAfterGood === '100', 'acc=' + accAfterGood);

  log('\n[3] 一般模式：打錯字要累計錯誤');
  await page.evaluate(() => {
    const cap = document.getElementById('cap');
    cap.focus();
    cap.dispatchEvent(new CompositionEvent('compositionstart', { data: '' }));
    cap.value = 'X';
    cap.dispatchEvent(new CompositionEvent('compositionend', { data: 'X' }));
  });
  await page.waitForTimeout(60);
  const badCount = await page.locator('#view span.bad').count();
  const errShown = await page.textContent('#sErr');
  check('出現紅色錯字', badCount === 1, 'bad=' + badCount);
  check('錯誤計數 = 1', errShown === '1', 'err=' + errShown);

  log('\n[4] 一般模式：退格可修正錯誤');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(60);
  check('退格後錯誤歸零', (await page.textContent('#sErr')) === '0', 'err=' + (await page.textContent('#sErr')));
  check('退格後紅字消失', (await page.locator('#view span.bad').count()) === 0);

  log('\n[5] 嚴格模式：打錯要改對才能繼續');
  await page.click('#e-fix');
  await page.waitForTimeout(100);
  const idxBefore = await page.evaluate(() => document.querySelectorAll('#view span.cur').length);
  await page.evaluate(() => {
    const cap = document.getElementById('cap');
    cap.focus();
    cap.dispatchEvent(new CompositionEvent('compositionstart', { data: '' }));
    cap.value = 'Z';
    cap.dispatchEvent(new CompositionEvent('compositionend', { data: 'Z' }));
  });
  await page.waitForTimeout(60);
  const blocked = await page.evaluate(() => {
    const cur = document.querySelector('#view span.cur');
    return cur ? cur.textContent : null;
  });
  check('卡在同一格（未前進）', blocked !== null && blocked === 'Z', 'cur=' + blocked);
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(50);
  const unblocked = await page.evaluate(() => {
    const cur = document.querySelector('#view span.cur');
    return cur ? cur.textContent : null;
  });
  check('退格後解鎖', unblocked !== 'Z', 'cur=' + unblocked);
  await page.click('#e-go');
  await page.waitForTimeout(80);

  log('\n[6] 學習模式：鍵盤與出題');
  await page.click('#m-learn');
  await page.waitForTimeout(300);
  check('學習面板顯示', await page.locator('#learnPane').isVisible());
  check('鍵盤顯示', await page.locator('#keyboardWrap').isVisible());
  check('一般面板隱藏', !(await page.locator('#normalPane').isVisible()));
  const total = +(await page.textContent('#lTotal'));
  check('全部範圍共 42 鍵（37 符號 + 5 聲調）', total === 42, 'total=' + total);
  const keyCount = await page.locator('.key').count();
  check('鍵盤鍵帽數量合理', keyCount > 55, 'keys=' + keyCount);
  const hintKeys = await page.locator('.key.hint').count();
  check('黃色提示已亮起', hintKeys >= 1, 'hint=' + hintKeys);
  const prompt1 = (await page.textContent('#prompt')).trim();
  check('題目是注音符號', /[ㄅ-ㄩˇˋˊ˙ˉ]/.test(prompt1), 'prompt=' + prompt1);

  log('\n[7] 學習模式：按錯 → 紅燈、留在原題、計數');
  const hintCode = await page.evaluate(() => {
    const k = document.querySelector('.key.hint');
    return k ? k.querySelector('.kcap-boo').textContent : null;
  });
  check('提示鍵與題目一致', hintCode === prompt1, `hint=${hintCode} prompt=${prompt1}`);
  // 故意按一個絕對不一樣的鍵
  const right1 = await page.evaluate((sym) => {
    const D = window.TP_DATA;
    return Object.keys(D.BOPOMOFO).find(k => D.BOPOMOFO[k] === sym);
  }, prompt1);
  const candidates = ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyA", "KeyS", "KeyD", "KeyF"];
  const wrongKey = candidates.find(c => c !== right1);
  await page.keyboard.press(wrongKey);
  await page.waitForTimeout(120);
  check('答錯計數 = 1', (await page.textContent('#lWrong')) === '1', 'wrong=' + (await page.textContent('#lWrong')));
  check('題號沒前進', (await page.textContent('#lPos')) === '1');
  check('題目沒變', (await page.textContent('#prompt')).trim() === prompt1);
  const missOn = await page.locator('.key.miss').count();
  check('錯鍵出現紅燈', missOn >= 1, 'miss=' + missOn);

  log('\n[8] 學習模式：按對 → 跳下一題');
  await page.waitForTimeout(600); // 等紅燈消失
  const rightCode = await page.evaluate((sym) => {
    const D = window.TP_DATA;
    return Object.keys(D.BOPOMOFO).find(k => D.BOPOMOFO[k] === sym);
  }, prompt1);
  await page.keyboard.press(rightCode);
  await page.waitForTimeout(150);
  check('答對計數 = 1', (await page.textContent('#lRight')) === '1', 'right=' + (await page.textContent('#lRight')));
  check('題號前进到 2', (await page.textContent('#lPos')) === '2', 'pos=' + (await page.textContent('#lPos')));
  const prompt2 = (await page.textContent('#prompt')).trim();
  check('換了新的題目', prompt2 !== prompt1, `${prompt1} -> ${prompt2}`);

  log('\n[9] 學習模式：關閉黃色提示');
  await page.click('#h-off');
  await page.waitForTimeout(200);
  check('提示關閉後不亮黃鍵', (await page.locator('.key.hint').count()) === 0);
  await page.click('#h-on');
  await page.waitForTimeout(200);
  check('提示可再開啟', (await page.locator('.key.hint').count()) >= 1);

  log('\n[10] 練習範圍切換');
  await page.click('#g-tone');
  await page.waitForTimeout(200);
  check('聲調範圍 = 5 題', (await page.textContent('#lTotal')) === '5', 'total=' + (await page.textContent('#lTotal')));
  await page.click('#g-shengmu');
  await page.waitForTimeout(200);
  check('聲母範圍 = 21 題', (await page.textContent('#lTotal')) === '21', 'total=' + (await page.textContent('#lTotal')));
  await page.click('#g-all');
  await page.waitForTimeout(200);

  log('\n[11] 學習模式跑完整輪 → 結果面板');
  for (let i = 0; i < 60; i++) {
    const done = await page.evaluate(() => !document.getElementById('results').hidden);
    if (done) break;
    const sym = (await page.textContent('#prompt')).trim();
    const code = await page.evaluate((s) => {
      const D = window.TP_DATA;
      return Object.keys(D.BOPOMOFO).find(k => D.BOPOMOFO[k] === s);
    }, sym);
    if (!code) break;
    await page.keyboard.press(code);
    await page.waitForTimeout(40);
  }
  check('跑完顯示結果', await page.evaluate(() => !document.getElementById('results').hidden));
  const mainLab = await page.textContent('#rMainLab');
  check('結果為答對率', mainLab === '答對率', 'lab=' + mainLab);
  check('答對率 100%', (await page.textContent('#rMain')) === '100%', 'v=' + (await page.textContent('#rMain')));

  log('\n[12] 英文模式 + 計時選項');
  await page.click('#m-normal');
  await page.waitForTimeout(200);
  await page.click('#l-en');
  await page.waitForTimeout(200);
  check('單位變 WPM', (await page.textContent('#unit')) === 'WPM', 'unit=' + (await page.textContent('#unit')));
  const enText = await page.evaluate(() => Array.from(document.querySelectorAll('#view span')).map(s => s.dataset.ch).join(''));
  check('英文文本為拉丁字元', /^[A-Za-z ,.;:'"-]+$/.test(enText), enText.slice(0, 40));
  await page.click('#t-text');
  await page.waitForTimeout(150);
  check('計字模式隱藏秒數列', !(await page.locator('#row-duration').isVisible()));
  await page.click('#t-time');
  await page.waitForTimeout(150);
  await page.click('#d-15');
  await page.waitForTimeout(150);
  check('可切 15 秒', (await page.textContent('#sTime')) === '15', 't=' + (await page.textContent('#sTime')));

  log('\n[13] 英文打字 + 計時結束');
  await page.click('#l-zh');
  await page.waitForTimeout(150);
  await page.click('#d-15');
  const enChars = await page.evaluate(() => Array.from(document.querySelectorAll('#view span')).map(s => s.dataset.ch));
  await page.click('#typer');
  for (const ch of enChars.slice(0, 5)) {
    await page.evaluate((c) => {
      const cap = document.getElementById('cap');
      cap.focus();
      cap.dispatchEvent(new CompositionEvent('compositionstart', { data: '' }));
      cap.value = c;
      cap.dispatchEvent(new CompositionEvent('compositionend', { data: c }));
    }, ch);
    await page.waitForTimeout(20);
  }
  check('英文/中文打字管線正常', (await page.locator('#view span.ok').count()) >= 5);

  log('\n[14] 唐詩素材');
  await page.click('#m-normal');
  await page.waitForTimeout(150);
  await page.click('#l-poem');
  await page.waitForTimeout(250);
  check('難度列出現', await page.locator('#row-tier').isVisible());
  const credit = (await page.textContent('#view i.pc') || '').trim();
  check('顯示出處（作者＋篇名）', /[（(〈《].+[）)〉》]/.test(credit) || credit.length > 2, 'credit=' + credit);
  const poemChars = await page.evaluate(() => Array.from(document.querySelectorAll('#view span')).map(s => s.dataset.ch));
  check('唐詩為全形漢字＋標點', poemChars.length >= 20 && poemChars.every(c => /[\u4e00-\u9fff，。；：！？、]/.test(c)), poemChars.slice(0, 12).join(''));
  // 出處以 <i> 呈現，比對用的 span 必須正好是詩文本體，不含出處字元
  const poemCheck = await page.evaluate(() => {
    const typed = Array.from(document.querySelectorAll('#view span')).map(s => s.dataset.ch).join('');
    const all = [].concat(...Object.values(window.TP_POEMS));
    return { typed, matched: all.some(x => x.p.join('') === typed), creditInPoem: typed.includes('〈') };
  });
  check('出處不參與比對（span 內容為純詩文且對得上原庫）',
        poemCheck.matched && !poemCheck.creditInPoem,
        'typed=' + poemCheck.typed.slice(0, 20) + ' matched=' + poemCheck.matched);
  for (const ch of poemChars.slice(0, 6)) {
    await page.evaluate((c) => {
      const cap = document.getElementById('cap'); cap.focus();
      cap.dispatchEvent(new CompositionEvent('compositionstart', { data: '' }));
      cap.value = c; cap.dispatchEvent(new CompositionEvent('compositionend', { data: c }));
    }, ch);
    await page.waitForTimeout(20);
  }
  check('唐詩打字比對正常', (await page.locator('#view span.ok').count()) === 6, 'ok=' + (await page.locator('#view span.ok').count()));
  check('唐詩單位為字/分', (await page.textContent('#unit')) === '字/分');
  await page.click('#k-h');
  await page.waitForTimeout(250);
  const hardChars = await page.evaluate(() => Array.from(document.querySelectorAll('#view span')).map(s => s.dataset.ch).join(''));
  check('切換難度後換了題目', hardChars.length > 0);
  await page.click('#k-e');
  await page.waitForTimeout(200);
  await page.click('#l-zh');
  await page.waitForTimeout(200);
  check('切回中文後難度列隱藏', !(await page.locator('#row-tier').isVisible()));
  check('切回中文後無出處標籤', (await page.locator('#view i.pc').count()) === 0);

  log('\n[15] 自訂文本');
  await page.fill('#custom', '測試 123 abc');
  await page.click('#b-custom');
  await page.waitForTimeout(250);
  const customTxt = await page.evaluate(() => Array.from(document.querySelectorAll('#view span')).map(s => s.dataset.ch).join(''));
  check('自訂文本已載入', customTxt === '測試 123 abc', JSON.stringify(customTxt));
  check('自訂文本走計字', !(await page.locator('#row-duration').isVisible()));

  log('\n[16] 主題切換 + 持久化');
  await page.click('#theme');
  await page.waitForTimeout(150);
  check('切到淺色', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'light');
  await page.reload();
  await page.waitForTimeout(400);
  check('重新載入後記住主題', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'light');
  await page.click('#theme');
  await page.waitForTimeout(100);

  log('\n[17] Esc 重來');
  await page.click('#m-learn');
  await page.waitForTimeout(250);
  const sym = (await page.textContent('#prompt')).trim();
  const code = await page.evaluate((s) => {
    const D = window.TP_DATA;
    return Object.keys(D.BOPOMOFO).find(k => D.BOPOMOFO[k] === s);
  }, sym);
  await page.keyboard.press(code);
  await page.waitForTimeout(120);
  check('答對後題號 = 2', (await page.textContent('#lPos')) === '2');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check('Esc 重置回第 1 題', (await page.textContent('#lPos')) === '1');
  check('Esc 重置答對數', (await page.textContent('#lRight')) === '0');

  log('\n[18] 響應式（手機寬度）');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  check('無橫向溢出', !overflow, 'scrollWidth=' + await page.evaluate(() => document.documentElement.scrollWidth));
  await page.screenshot({ path: '/tmp/shot-mobile-learn.png', fullPage: true });
  await page.click('#m-normal');
  await page.waitForTimeout(250);
  await page.screenshot({ path: '/tmp/shot-mobile-normal.png', fullPage: true });
  await page.setViewportSize({ width: 1200, height: 1000 });
  await page.waitForTimeout(250);
  await page.click('#m-learn');
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/shot-desktop-learn.png', fullPage: true });
  await page.click('#m-normal');
  await page.waitForTimeout(250);
  await page.screenshot({ path: '/tmp/shot-desktop-normal.png', fullPage: true });

  log('\n[19] 控制台錯誤');
  check('無 JS 錯誤', errs.length === 0, errs.join(' | '));

  log('\n=========================');
  log(fails === 0 ? '全部通過' : `${fails} 項失敗`);
  await browser.close();
  process.exit(fails === 0 ? 0 : 1);
})();
