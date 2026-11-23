/**
 * OCA Scheduled Cloud Backup & Restore Dry-Run Validator (v261)
 * Client-side backup file integrity & schema validator (Zero production writes).
 */
(function (global) {
  'use strict';

  const REQUIRED_TABLES = ['courses', 'fee_settings', 'receipts', 'schedules', 'security_audit_logs', 'staff_users', 'students'];

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
            <i class="fa-solid fa-shield-check"></i> Read-Only Dry-Run
          </span>
        </div>

        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <label for="inpOcaBackupDryRunFile" class="oca-mod-btn-primary" style="margin:0;">
            <i class="fa-solid fa-file-shield"></i> เลือกไฟล์ Backup (.json) เพื่อทดสอบ Dry-Run
          </label>
          <input type="file" id="inpOcaBackupDryRunFile" accept=".json,application/json" style="display:none;" />
          <span style="font-size:12px; color:var(--text-muted);">
            ตรวจสอบโครงสร้าง 7 ตาราง, 8 ตารางเรียนหลัก และ 4 บัญชีเจ้าหน้าที่หลัก (ไม่แก้ไขข้อมูลจริง)
          </span>
        </div>
        <div id="boxOcaBackupDryRunResult" class="oca-mod-validator-result" style="display:none;"></div>
      </div>
    `;

    const fileInp = document.getElementById('inpOcaBackupDryRunFile');
    if (fileInp) {
      fileInp.onchange = async (evt) => {
        const file = evt.target && evt.target.files ? evt.target.files[0] : null;
        if (!file) return;
        const text = await file.text();
        const report = validateBackupJsonText(text, file.name);
        const box = document.getElementById('boxOcaBackupDryRunResult');
        if (box) {
          box.style.display = 'block';
          box.innerHTML = report.html;
        }
        fileInp.value = '';
      };
    }
  }

  function validateBackupJsonText(rawText, fileName = 'backup.json') {
    try {
      const parsed = JSON.parse(rawText);
      const tablesObj = (parsed && parsed.tables && typeof parsed.tables === 'object') ? parsed.tables : parsed;
      const missing = [];
      const counts = {};
      for (const tbl of REQUIRED_TABLES) {
        if (!tablesObj || !Array.isArray(tablesObj[tbl])) {
          missing.push(tbl);
        } else {
          counts[tbl] = tablesObj[tbl].length;
        }
      }
      const schedCount = counts.schedules || 0;
      const staffCount = counts.staff_users || 0;
      const coreOk = schedCount >= 8 && staffCount >= 4;
      const passed = missing.length === 0 && coreOk;
      const summaryRows = REQUIRED_TABLES.map(t =>
        `<li><code>${t}</code>: ${counts[t] !== undefined ? counts[t].toLocaleString('en-US') + ' แถว' : '<span style="color:#EF4444;">ไม่พบตาราง</span>'}</li>`
      ).join('');
      return {
        passed,
        missing,
        counts,
        html: `
          <div style="font-weight:800; margin-bottom:6px; color:${passed ? '#059669' : '#D97706'};">
            ${passed ? '✓ ผลการตรวจ Dry-Run ผ่าน 100% — ไฟล์พร้อมใช้งานกู้คืน' : '⚠️ พบข้อสังเกตในไฟล์สำรองข้อมูล'} (${String(fileName).replace(/[<>&"]/g, '')})
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
