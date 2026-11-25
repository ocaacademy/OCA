/**
 * OCA Scheduled Cloud Backup & Restore Dry-Run Validator (v261)
 * Client-side backup file integrity & schema validator (Zero production writes).
 */
(function (global) {
  'use strict';

  function _t(th, en, zh) {
    const lang = String(global._currentSystemLang || 'th').toLowerCase();
    if (lang === 'en') return en || th;
    if (lang === 'zh') return zh || en || th;
    return th;
  }

  const REQUIRED_TABLES = ['courses', 'fee_settings', 'receipts', 'schedules', 'security_audit_logs', 'staff_users', 'students'];
  const OPTIONAL_TABLES = ['app_settings'];

  function renderBackupOpsCard() {
    const mountEl = document.getElementById('ocaScheduledBackupMount');
    if (!mountEl) return;

    mountEl.innerHTML = `
      <div class="oca-mod-card" id="cardOcaScheduledBackupOps">
        <div class="oca-mod-card-header">
          <div>
            <h3 class="oca-mod-card-title">
              <i class="fa-solid fa-file-shield" style="color:#0284C7;"></i>
              <span>ตัวตรวจสอบไฟล์สำรอง (Backup Dry-Run Validator)</span>
            </h3>
            <div class="oca-mod-card-sub">
              เลือกไฟล์สำรองข้อมูล (.json) ที่เก็บไว้ภายนอก เพื่อตรวจสอบความครบถ้วนของ 7 ตารางหลักและข้อมูลสำคัญก่อนใช้งานกู้คืนจริง (อ่านอย่างเดียว ไม่แก้ไขฐานข้อมูล)
            </div>
          </div>
          <span class="oca-mod-badge-ok" id="badgeOcaBackupSchedule">
            <i class="fa-solid fa-circle-check"></i> Read-Only Dry-Run
          </span>
        </div>

        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <label for="inpOcaBackupDryRunFile" role="button" tabindex="0" class="oca-mod-btn-primary" style="margin:0;" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();document.getElementById('inpOcaBackupDryRunFile').click();}">
            <i class="fa-solid fa-file-shield"></i> เลือกไฟล์ Backup (.json) เพื่อทดสอบ Dry-Run
          </label>
          <input type="file" id="inpOcaBackupDryRunFile" accept=".json,application/json" style="display:none;" />
          <span style="font-size:12px; color:var(--text-muted);">
            ตรวจสอบโครงสร้าง 7 ตาราง, 8 ตารางเรียนหลัก และ 4 บัญชีเจ้าหน้าที่หลัก (ไม่แก้ไขข้อมูลจริง)
          </span>
        </div>
        <div id="boxOcaBackupDryRunResult" class="oca-mod-validator-result" aria-live="polite" style="display:none;"></div>
      </div>
    `;

    const fileInp = document.getElementById('inpOcaBackupDryRunFile');
    if (fileInp) {
      fileInp.onchange = async (evt) => {
        const file = evt.target && evt.target.files ? evt.target.files[0] : null;
        if (!file) return;
        const box = document.getElementById('boxOcaBackupDryRunResult');
        try {
          const text = await file.text();
          const report = validateBackupJsonText(text, file.name);
          if (box) {
            box.style.display = 'block';
            box.innerHTML = report.html;
          }
        } catch (err) {
          if (box) {
            box.style.display = 'block';
            box.innerHTML = `<div style="color:#EF4444; font-weight:700;">✗ อ่านไฟล์ไม่สำเร็จ: ${String(err?.message || err).replace(/[<>&"]/g, '')}</div>`;
          }
        } finally {
          fileInp.value = '';
        }
      };
    }
  }

  function validateBackupJsonText(rawText, fileName = 'backup.json') {
    try {
      const parsed = JSON.parse(rawText);
      const tablesObj = (parsed && parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data))
        ? parsed.data
        : ((parsed && parsed.tables && typeof parsed.tables === 'object' && !Array.isArray(parsed.tables)) ? parsed.tables : parsed);
      const missing = [];
      const invalidShape = [];
      const counts = {};
      const hasValidRows = (arr) => arr.every(r => r !== null && typeof r === 'object' && !Array.isArray(r));
      for (const tbl of REQUIRED_TABLES) {
        if (!tablesObj || !Array.isArray(tablesObj[tbl])) {
          missing.push(tbl);
        } else if (!hasValidRows(tablesObj[tbl])) {
          invalidShape.push(tbl);
          counts[tbl] = tablesObj[tbl].length;
        } else {
          counts[tbl] = tablesObj[tbl].length;
        }
      }
      for (const optTbl of OPTIONAL_TABLES) {
        if (tablesObj && tablesObj[optTbl] !== undefined) {
          if (!Array.isArray(tablesObj[optTbl]) || !hasValidRows(tablesObj[optTbl])) {
            invalidShape.push(optTbl);
          } else {
            counts[optTbl] = tablesObj[optTbl].length;
          }
        }
      }
      const schedCount = counts.schedules || 0;
      const staffCount = counts.staff_users || 0;
      const coreOk = schedCount >= 8 && staffCount >= 4;
      const passed = missing.length === 0 && invalidShape.length === 0 && coreOk;
      const summaryRows = REQUIRED_TABLES.concat(OPTIONAL_TABLES.filter(t => counts[t] !== undefined || invalidShape.includes(t))).map(t => {
        if (invalidShape.includes(t)) {
          return `<li><code>${t}</code>: <span style="color:#EF4444;">${_t('โครงสร้างแถวไม่ถูกต้อง (พบข้อมูลที่ไม่ใช่ Object)', 'Invalid row structure (non-object entry)', '行结构无效（存在非对象条目）')}</span></li>`;
        }
        return `<li><code>${t}</code>: ${counts[t] !== undefined ? counts[t].toLocaleString('en-US') + ' ' + _t('แถว', 'rows', '行') : `<span style="color:#EF4444;">${_t('ไม่พบตาราง', 'Missing table', '缺少表')}</span>`}</li>`;
      }).join('');
      return {
        passed,
        missing,
        invalidShape,
        counts,
        html: `
          <div style="font-weight:800; margin-bottom:6px; color:${passed ? '#059669' : '#D97706'};">
            ${passed ? _t('✓ ผลการตรวจ Dry-Run ผ่าน 100% — ไฟล์พร้อมใช้งานกู้คืน', '✓ Dry-Run Passed 100% — Backup file is ready for restore', '✓ 预检 100% 通过 — 备份文件可用于恢复') : _t('⚠️ พบข้อสังเกตในไฟล์สำรองข้อมูล', '⚠️ Backup file warnings detected', '⚠️ 检测到备份文件异常')} (${String(fileName).replace(/[<>&"]/g, '')})
          </div>
          <ul style="margin:0 0 6px 18px; padding:0;">${summaryRows}</ul>
          <div style="font-size:11.5px; color:var(--text-muted);">
            Core Guard: Schedules ${schedCount}/8+ | Staff ${staffCount}/4+
          </div>
        `
      };
    } catch (err) {
      return {
        passed: false,
        missing: REQUIRED_TABLES,
        counts: {},
        html: `<div style="color:#EF4444; font-weight:700;">✗ ไฟล์ JSON ไม่ถูกต้อง: ${String(err.message || err).replace(/[<>&"]/g, '')}</div>`
      };
    }
  }

  global.OcaBackupOps = {
    renderBackupOpsCard,
    validateBackupJsonText
  };
})(window);
