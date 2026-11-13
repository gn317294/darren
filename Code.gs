/**
 * 小步日常 · 家庭練習花園 — Google 試算表雲端同步腳本
 * 使用方式：
 * 1. 開啟一個新的 Google 試算表
 * 2. 點選上方選單「擴充功能」→「Apps Script」
 * 3. 將此檔案內容全部貼上並取代原本程式碼
 * 4. 修改下方的 SECRET_TOKEN（自訂一組英數密鑰，例如 xu2026sync）
 * 5. 點選右上角「部署」→「新增部署」→ 類型選「網頁應用程式」
 *    - 執行身分：我
 *    - 誰可以存取：所有人
 * 6. 複製產生的網頁應用程式網址（/exec 結尾），貼回「小步日常 → 家長檢視 → 雲端自動同步設定」即可！
 */

const SECRET_TOKEN = 'darren0937701291';
const DATA_SHEET = 'SyncData';
const READABLE_SHEET = '日常紀錄總覽';
const CHUNK_SIZE = 45000;

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

function readStoredJson(ss) {
  const sheet = getOrCreateSheet(ss, DATA_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow === 0) return null;
  const values = sheet.getRange(1, 1, lastRow, 1).getValues();
  const raw = values.map(r => r[0]).join('');
  if (!raw) return null;
  return JSON.parse(raw);
}

function writeStoredJson(ss, jsonStr) {
  const sheet = getOrCreateSheet(ss, DATA_SHEET);
  sheet.clearContents();
  const chunks = [];
  for (let i = 0; i < jsonStr.length; i += CHUNK_SIZE) {
    chunks.push([jsonStr.slice(i, i + CHUNK_SIZE)]);
  }
  if (chunks.length > 0) {
    sheet.getRange(1, 1, chunks.length, 1).setValues(chunks);
  }
}

function updateReadableSheet(ss, data) {
  if (!data || !data.children) return;
  const sheet = getOrCreateSheet(ss, READABLE_SHEET);
  sheet.clearContents();
  const rows = [['孩子', '日期', '情境', '情緒', '精神', '分心次數', '提醒次數', '作業(分)', '平復(分)', '睡眠(時)', '打呼/鼻塞', '白天想睡', '觀察筆記']];
  const mapChild = { girl: '徐彗瑄', boy: '徐邦盛' };
  ['girl', 'boy'].forEach(c => {
    const logs = (data.children[c] && data.children[c].logs) || [];
    logs.forEach(l => {
      rows.push([
        mapChild[c],
        l.date || '',
        l.context || '',
        l.mood || '',
        l.energy || '',
        l.distractions ?? '',
        l.reminders ?? '',
        l.homework ?? '',
        l.calmMinutes ?? '',
        l.sleepHours ?? '',
        l.snore || '',
        l.sleepy || '',
        l.note || ''
      ]);
    });
  });
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
}

function doGet(e) {
  try {
    const token = (e && e.parameter && e.parameter.token) || '';
    if (token !== SECRET_TOKEN) {
      return jsonResponse({ ok: false, error: 'INVALID_TOKEN' });
    }
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const data = readStoredJson(ss);
    return jsonResponse({ ok: true, data: data });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const body = JSON.parse(e.postData.contents || '{}');
    if (body.token !== SECRET_TOKEN) {
      return jsonResponse({ ok: false, error: 'INVALID_TOKEN' });
    }
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const payload = body.data;
    if (!payload || payload.version !== 1 || !payload.children) {
      return jsonResponse({ ok: false, error: 'INVALID_DATA' });
    }
    writeStoredJson(ss, JSON.stringify(payload));
    updateReadableSheet(ss, payload);
    return jsonResponse({ ok: true, updatedAt: Date.now() });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}
