/* ============================================================================
 * OCA EMAIL GUARD, FAILED QUEUE, APP CONFIG INSPECTOR & 8-TABLE BACKUP (v217)
 * - Strict RFC Email Validation + 30s Per-Receipt Cooldown
 * - Failed Email Queue persisted via window.OcaAppConfig ('failed_email_queue')
 * - Retry Single / Retry All + Test Email + Slip Rejection Email
 * - Configurable Brevo Low-Quota Threshold & Auto-Email Switches ('email_config')
 * - App Config (app_settings JSONB) Inspector & Editor
 * - Configurable Idle Timeout (15 / 30 / 60 min)
 * - Full 8-Table Backup + DATA_BACKUP_EXPORT Audit Log + 7-Day Reminder Badge
 * ============================================================================ */
(function (global) {
  'use strict';

  const DEFAULT_EMAIL_CONFIG = Object.freeze({
    brevoLowQuotaThreshold: 50,
    autoEmailOnApprove: true,
    autoEmailOnReject: true
  });

  const FULL_BACKUP_TABLES = [
    'students',
    'receipts',
    'courses',
    'schedules',
    'fee_settings',
    'app_settings',
    'staff_users',
    'security_audit_logs'
  ];

  const EMAIL_COOLDOWN_MS = 30 * 1000;
  const _receiptEmailCooldownMap = new Map();
  let _cachedEmailConfig = { ...DEFAULT_EMAIL_CONFIG };

  function escapeAdminHtml(str) {
    if (typeof global.escapeHtml === 'function') return global.escapeHtml(str);
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Strict RFC-5322 practical email validator
   */
  function isValidOcaEmail(email) {
    const val = String(email || '').trim();
    if (!val || val.length > 254) return false;
    if (val.includes('..') || val.startsWith('.') || val.endsWith('.')) return false;
    const rfcRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    return rfcRegex.test(val);
  }

  /**
   * 30-second per-receipt send cooldown guard
   */
  function checkEmailSendCooldown(receiptNo) {
    const key = String(receiptNo || '').trim();
    if (!key) return { allowed: true, remainingSec: 0 };
    const lastTs = _receiptEmailCooldownMap.get(key) || 0;
    const elapsed = Date.now() - lastTs;
    if (elapsed < EMAIL_COOLDOWN_MS) {
      return {
        allowed: false,
        remainingSec: Math.ceil((EMAIL_COOLDOWN_MS - elapsed) / 1000)
      };
    }
    return { allowed: true, remainingSec: 0 };
  }

  function markEmailSentNow(receiptNo) {
    const key = String(receiptNo || '').trim();
    if (key) _receiptEmailCooldownMap.set(key, Date.now());
  }

  async function loadEmailConfig(force = false) {
    if (!force && global._ocaEmailConfigLoaded) {
      return { ..._cachedEmailConfig };
    }
    try {
      if (global.OcaAppConfig && typeof global.OcaAppConfig.get === 'function') {
        const stored = await global.OcaAppConfig.get('email_config', null);
        if (stored && typeof stored === 'object') {
          _cachedEmailConfig = { ...DEFAULT_EMAIL_CONFIG, ...stored };
          global._ocaEmailConfigLoaded = true;
          return { ..._cachedEmailConfig };
        }
      }
    } catch (err) {
      console.warn('[OcaEmailAdmin.loadEmailConfig] Warning:', err);
    }
    return { ..._cachedEmailConfig };
  }

  async function saveEmailConfig(partialCfg) {
    const merged = {
      ...DEFAULT_EMAIL_CONFIG,
      ..._cachedEmailConfig,
      ...(partialCfg || {})
    };
    merged.brevoLowQuotaThreshold = Math.max(5, Math.min(300, Number(merged.brevoLowQuotaThreshold) || 50));
    merged.autoEmailOnApprove = Boolean(merged.autoEmailOnApprove);
    merged.autoEmailOnReject = Boolean(merged.autoEmailOnReject);
    _cachedEmailConfig = merged;
    global._ocaEmailConfigLoaded = true;
    if (global.OcaAppConfig && typeof global.OcaAppConfig.set === 'function') {
      return await global.OcaAppConfig.set('email_config', merged, 'email');
    }
    return false;
  }

  async function getFailedEmailQueue() {
    try {
      if (global.OcaAppConfig && typeof global.OcaAppConfig.get === 'function') {
        const list = await global.OcaAppConfig.get('failed_email_queue', [], true);
        return Array.isArray(list) ? list : [];
      }
    } catch (err) {
      console.warn('[OcaEmailAdmin.getFailedEmailQueue] Warning:', err);
    }
    return [];
  }

  async function enqueueFailedEmail(entry) {
    if (!entry || !entry.toEmail) return false;
    try {
      const queue = await getFailedEmailQueue();
      const id = 'fe_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      const cleanRcpt = String(entry.receiptNo || '').trim();
      const cleanSid = String(entry.studentId || '').trim();
      const cleanKind = String(entry.kind || 'payment_confirmation');
      const cleanTo = String(entry.toEmail || '').trim();
      const filtered = queue.filter(item => {
        if (item.toEmail !== cleanTo || String(item.kind || 'payment_confirmation') !== cleanKind) return true;
        if (cleanRcpt && item.receiptNo === cleanRcpt) return false;
        if (!cleanRcpt && cleanSid && item.studentId === cleanSid) return false;
        return true;
      });
      filtered.unshift({
        id,
        kind: cleanKind,
        receiptNo: cleanRcpt,
        studentId: cleanSid,
        course: String(entry.course || '').trim().slice(0, 120),
        toEmail: cleanTo,
        toName: String(entry.toName || '').trim().slice(0, 120),
        subject: String(entry.subject || '').trim().slice(0, 200),
        reason: String(entry.reason || '').trim().slice(0, 200),
        errorMessage: String(entry.errorMessage || 'Edge Function send-email failed').slice(0, 240),
        failedAt: new Date().toISOString(),
        retries: Number(entry.retries || 0)
      });
      const bounded = filtered.slice(0, 100);
      if (global.OcaAppConfig && typeof global.OcaAppConfig.set === 'function') {
        await global.OcaAppConfig.set('failed_email_queue', bounded, 'email');
      }
      return true;
    } catch (err) {
      console.warn('[OcaEmailAdmin.enqueueFailedEmail] Error:', err);
      return false;
    }
  }

  async function removeFailedEmailItem(id) {
    const queue = await getFailedEmailQueue();
    const next = queue.filter(item => item.id !== id);
    if (global.OcaAppConfig && typeof global.OcaAppConfig.set === 'function') {
      await global.OcaAppConfig.set('failed_email_queue', next, 'email');
    }
    return next;
  }

  /**
   * Send Slip Rejection notification email via Edge Function 'send-email'
   */
  async function sendSlipRejectionEmail(opts) {
    const studentId = String(opts?.studentId || '').trim();
    const toEmail = String(opts?.toEmail || '').trim();
    const toName = String(opts?.toName || 'ผู้สมัครเรียน').trim();
    const reason = String(opts?.reason || 'ไม่สามารถตรวจสอบยอดโอนได้').trim();
    const course = String(opts?.course || '-').trim();

    if (!isValidOcaEmail(toEmail)) {
      return { success: false, error: 'รูปแบบอีเมลผู้รับไม่ถูกต้อง' };
    }

    const sb = global._supabase;
    if (!sb) {
      return { success: false, error: 'ไม่พบการเชื่อมต่อ Supabase' };
    }

    const curUser = (typeof global.getSavedCurrentUser === 'function') ? global.getSavedCurrentUser() : null;
    const staffUsername = (curUser && curUser.username) ? String(curUser.username).trim() : '';
    const subject = `[แจ้งผลการตรวจสอบสลิปการโอนเงิน] โรงเรียนวิทยสถานแห่งวัฒนธรรมตะวันออก (OCA) - รหัส ${studentId}`;
    const htmlContent = `<!DOCTYPE html>
<html lang="th"><head><meta charset="utf-8"><title>แจ้งผลการตรวจสอบสลิป OCA</title></head>
<body style="margin:0; padding:16px; background:#F8FAFC; font-family:'Noto Sans Thai','Prompt',Tahoma,Arial,sans-serif; color:#0F172A;">
  <div style="max-width:560px; margin:0 auto; background:#FFFFFF; border:1px solid #CBD5E1; border-radius:12px; overflow:hidden;">
    <div style="background:#0F3D2E; color:#FFFFFF; padding:18px 20px; text-align:center;">
      <div style="font-size:18px; font-weight:800;">โรงเรียนวิทยสถานแห่งวัฒนธรรมตะวันออก (OCA)</div>
      <div style="font-size:12px; color:#FDE68A; margin-top:4px;">แจ้งผลการตรวจสอบหลักฐานการโอนเงิน (Payment Slip Notice)</div>
    </div>
    <div style="padding:20px; font-size:14px; line-height:1.65;">
      <p style="margin-top:0;">เรียนคุณ <strong>${escapeAdminHtml(toName)}</strong> (รหัสผู้สมัคร: <strong>${escapeAdminHtml(studentId)}</strong>)</p>
      <p>เจ้าหน้าที่ฝ่ายการเงินได้ตรวจสอบหลักฐานการโอนเงินสำหรับหลักสูตร <strong>${escapeAdminHtml(course)}</strong> แล้ว พบว่ายังไม่สามารถอนุมัติรายการได้ เนื่องจาก:</p>
      <div style="background:#FEF2F2; border:1px solid #FCA5A5; border-left:4px solid #DC2626; border-radius:8px; padding:12px 14px; color:#991B1B; font-weight:700; margin:14px 0;">
        ${escapeAdminHtml(reason)}
      </div>
      <p>กรุณาติดต่อเจ้าหน้าที่ฝ่ายการเงินเพื่อส่งหลักฐานการโอนเงินที่ถูกต้องเพิ่มเติม:</p>
      <ul style="padding-left:20px; color:#334155;">
        <li>Line Official: <strong>@OCANIHAO</strong></li>
        <li>โทรศัพท์: <strong>02-216-2826, 02-216-2827, 02-216-2828</strong></li>
      </ul>
      <div style="margin-top:16px; padding-top:12px; border-top:1px dashed #CBD5E1; font-size:11.5px; color:#64748B;">
        หมายเหตุ: อีเมลฉบับนี้เป็นการแจ้งสถานะการตรวจสอบเท่านั้น ไม่ใช่ใบเสร็จรับเงินอิเล็กทรอนิกส์ (ใบเสร็จรับเงินฉบับทางการออกเฉพาะกระดาษต่อเนื่อง Dot-Matrix 5.5"x8" ที่เคาน์เตอร์โรงเรียนเท่านั้น)
      </div>
    </div>
  </div>
</body></html>`;

    let sent = false;
    let errMsg = '';
    try {
      const { data: fnData, error: fnErr } = await sb.functions.invoke('send-email', {
        body: {
          action: 'sendEmail',
          staffUsername,
          receiptNo: 'REJECT-' + studentId,
          toEmail,
          toName,
          subject,
          htmlContent
        }
      });
      if (!fnErr && fnData && fnData.success) {
        sent = true;
      } else {
        errMsg = (fnErr && fnErr.message) || (fnData && (fnData.error || fnData.message)) || 'Edge Function send-email returned failure';
      }
    } catch (err) {
      errMsg = err.message || String(err);
    }

    if (!sent) {
      await enqueueFailedEmail({
        kind: 'slip_rejection',
        receiptNo: '',
        studentId,
        course,
        toEmail,
        toName,
        subject,
        reason,
        errorMessage: errMsg,
        retries: Number(opts?.retries || 0)
      });
    }

    try {
      const actor = (typeof global.getAuditActor === 'function')
        ? global.getAuditActor()
        : { username: staffUsername || 'staff', fullName: 'Staff', role: 'CASHIER', deviceId: '', deviceInfo: '' };
      const { error: audErr } = await sb.from('security_audit_logs').insert([{
        action: sent ? 'SLIP_REJECTION_EMAIL_SENT' : 'SLIP_REJECTION_EMAIL_FAILED',
        username: actor.username,
        full_name: actor.fullName,
        role: actor.role,
        device_id: actor.deviceId,
        device_info: actor.deviceInfo,
        details: `แจ้งปฏิเสธสลิป ${studentId} -> ${toEmail} (${sent ? 'SUCCESS' : errMsg})`,
        records: 1,
        status: sent ? 'SUCCESS' : 'FAILED'
      }]);
      if (audErr) console.warn('[OcaEmailAdmin.sendSlipRejectionEmail] audit log warning:', audErr);
    } catch (_) {}

    return sent ? { success: true } : { success: false, error: errMsg };
  }

  async function retryFailedEmail(id) {
    const queue = await getFailedEmailQueue();
    const item = queue.find(x => x.id === id);
    if (!item) return { success: false, error: 'ไม่พบรายการในคิว' };

    let res = { success: false, error: 'Unsupported retry kind' };
    const nextRetries = (Number(item.retries) || 0) + 1;
    if (item.kind === 'slip_rejection') {
      res = await sendSlipRejectionEmail({
        studentId: item.studentId,
        toEmail: item.toEmail,
        toName: item.toName,
        course: item.course || '-',
        reason: item.reason || 'ไม่สามารถตรวจสอบสลิปได้',
        retries: nextRetries
      });
    } else if (item.receiptNo && typeof global.callGasApi === 'function') {
      try {
        res = await global.callGasApi('sendReceiptEmail', {
          receiptNo: item.receiptNo,
          email: item.toEmail,
          _skipAutoEnqueue: true
        }, 'POST');
      } catch (err) {
        res = { success: false, error: (err && err.message) || String(err || 'Network error') };
      }
      if (!res || !res.success) {
        await enqueueFailedEmail({
          ...item,
          errorMessage: (res && (res.error || res.message)) || item.errorMessage,
          retries: nextRetries
        });
      }
    }

    if (res && res.success) {
      await removeFailedEmailItem(id);
      return { success: true };
    }
    return { success: false, error: (res && (res.error || res.message)) || 'ส่งซ้ำไม่สำเร็จ' };
  }

  async function retryAllFailedEmails() {
    const queue = await getFailedEmailQueue();
    let ok = 0;
    let fail = 0;
    for (const item of queue) {
      const r = await retryFailedEmail(item.id);
      if (r && r.success) ok++;
      else fail++;
    }
    return { total: queue.length, ok, fail };
  }

  async function sendTestEmailFromSettings(toEmail) {
    const target = String(toEmail || '').trim();
    if (!isValidOcaEmail(target)) {
      return { success: false, error: 'กรุณาระบุอีเมลปลายทางที่ถูกต้องตามรูปแบบ RFC' };
    }
    const sb = global._supabase;
    if (!sb) return { success: false, error: 'Supabase client not ready' };
    const curUser = (typeof global.getSavedCurrentUser === 'function') ? global.getSavedCurrentUser() : null;
    const staffUsername = (curUser && curUser.username) ? String(curUser.username).trim() : '';
    try {
      const { data: fnData, error: fnErr } = await sb.functions.invoke('send-email', {
        body: {
          action: 'sendEmail',
          staffUsername,
          receiptNo: 'TEST-' + Date.now(),
          toEmail: target,
          toName: 'OCA Admin Test',
          subject: '[ทดสอบระบบอีเมล] โรงเรียนวิทยสถานแห่งวัฒนธรรมตะวันออก (OCA)',
          htmlContent: `<div style="font-family:Tahoma,Arial,sans-serif;padding:16px;"><h3>ทดสอบการส่งอีเมล OCA สำเร็จ</h3><p>เวลาทดสอบ: ${new Date().toLocaleString('th-TH')}</p><p style="font-size:12px;color:#64748B;">ข้อความทดสอบระบบเท่านั้น ไม่ใช่ใบเสร็จรับเงิน</p></div>`
        }
      });
      if (!fnErr && fnData && fnData.success) {
        return { success: true, message: 'ส่งอีเมลทดสอบสำเร็จไปยัง ' + target };
      }
      return { success: false, error: (fnErr && fnErr.message) || (fnData && (fnData.error || fnData.message)) || 'Edge Function send-email ไม่ตอบสนอง' };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  }

  /**
   * Idle Timeout (15 / 30 / 60 minutes) persisted in app_settings
   */
  async function loadIdleTimeoutMinutes() {
    try {
      if (global.OcaAppConfig && typeof global.OcaAppConfig.get === 'function') {
        const val = await global.OcaAppConfig.get('idle_timeout_minutes', 30);
        const mins = Number(val);
        if ([15, 30, 60].includes(mins)) {
          global._ocaIdleTimeoutMinutes = mins;
          return mins;
        }
      }
    } catch (_) {}
    global._ocaIdleTimeoutMinutes = global._ocaIdleTimeoutMinutes || 30;
    return global._ocaIdleTimeoutMinutes;
  }

  async function saveIdleTimeoutMinutes(minutes) {
    const mins = [15, 30, 60].includes(Number(minutes)) ? Number(minutes) : 30;
    global._ocaIdleTimeoutMinutes = mins;
    let ok = false;
    if (global.OcaAppConfig && typeof global.OcaAppConfig.set === 'function') {
      ok = await global.OcaAppConfig.set('idle_timeout_minutes', mins, 'security');
    }
    if (typeof global.resetSecurityIdleTimer === 'function') {
      global.resetSecurityIdleTimer(true);
    }
    return ok;
  }

  /**
   * Full 8-Table Backup Exporter + DATA_BACKUP_EXPORT Audit Log + Last Backup Timestamp
   */
  async function fetchAllTableRowsPaginated(sb, tableName, onProgress) {
    const all = [];
    const pageSize = 1000;
    const KEYSET_COLS = {
      receipts: 'receipt_no',
      students: 'student_id',
      security_audit_logs: 'id'
    };
    const pkCol = KEYSET_COLS[tableName];
    if (pkCol) {
      let lastPk = null;
      for (let page = 0; page < 1000; page++) {
        let q = sb.from(tableName).select('*').order(pkCol, { ascending: true }).limit(pageSize);
        if (lastPk !== null && lastPk !== undefined) {
          q = q.gt(pkCol, lastPk);
        }
        const { data, error } = await q;
        if (error) {
          throw new Error(`[OcaEmailAdmin.backup] keyset table ${tableName} error: ${error.message || error}`);
        }
        if (!Array.isArray(data) || data.length === 0) break;
        all.push(...data);
        if (typeof onProgress === 'function') onProgress(all.length);
        if (data.length < pageSize) break;
        const nextPk = data[data.length - 1][pkCol];
        if (nextPk === undefined || nextPk === null || nextPk === lastPk) break;
        lastPk = nextPk;
      }
      return all;
    }
    const orderColMap = {
      courses: 'id',
      schedules: 'id',
      fee_settings: 'key',
      app_settings: 'key',
      staff_users: 'username'
    };
    const orderCol = orderColMap[tableName] || null;
    let from = 0;
    for (let page = 0; page < 250; page++) {
      let qPage = sb.from(tableName).select('*');
      if (orderCol) qPage = qPage.order(orderCol, { ascending: true });
      const { data, error } = await qPage.range(from, from + pageSize - 1);
      if (error) {
        throw new Error(`[OcaEmailAdmin.backup] table ${tableName} error: ${error.message || error}`);
      }
      if (!Array.isArray(data) || data.length === 0) break;
      all.push(...data);
      if (typeof onProgress === 'function') onProgress(all.length);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return all;
  }

  async function exportFull8TableBackup(onProgress) {
    const sb = global._supabase;
    if (!sb) throw new Error('Supabase client is not initialized');
    const nowIso = new Date().toISOString();
    const actor = (typeof global.getAuditActor === 'function')
      ? global.getAuditActor()
      : { username: 'admin', fullName: 'Admin', role: 'ADMIN', deviceId: '', deviceInfo: '' };

    const tablesData = {};
    const counts = {};
    let totalRows = 0;
    for (let idx = 0; idx < FULL_BACKUP_TABLES.length; idx++) {
      const tbl = FULL_BACKUP_TABLES[idx];
      if (typeof onProgress === 'function') {
        onProgress({ index: idx + 1, totalTables: FULL_BACKUP_TABLES.length, table: tbl, rows: 0 });
      }
      const rows = await fetchAllTableRowsPaginated(sb, tbl, (n) => {
        if (typeof onProgress === 'function') {
          onProgress({ index: idx + 1, totalTables: FULL_BACKUP_TABLES.length, table: tbl, rows: n });
        }
      });
      tablesData[tbl] = rows;
      counts[tbl] = rows.length;
      totalRows += rows.length;
    }

    const bundle = {
      schema_version: 'OCA_FULL_BACKUP_8_TABLES_v217',
      exported_at: nowIso,
      exported_by: actor.username,
      tables: FULL_BACKUP_TABLES,
      counts,
      total_records: totalRows,
      data: tablesData
    };

    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = nowIso.replace(/[-:T]/g, '').slice(0, 12);
    a.href = url;
    a.download = `OCA_FULL_8TABLE_BACKUP_${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try { document.body.removeChild(a); } catch (_) {}
      try { URL.revokeObjectURL(url); } catch (_) {}
    }, 500);

    const { error: audErr } = await sb.from('security_audit_logs').insert([{
      action: 'DATA_BACKUP_EXPORT',
      username: actor.username,
      full_name: actor.fullName,
      role: actor.role,
      device_id: actor.deviceId,
      device_info: actor.deviceInfo,
      ip_address: (typeof global.getOcaClientPublicIp === 'function' ? global.getOcaClientPublicIp() : '') || null,
      details: `สำรองข้อมูลครบ 8 ตาราง (${totalRows} รายการ): ` + FULL_BACKUP_TABLES.map(t => `${t}=${counts[t]}`).join(', '),
      records: totalRows,
      status: 'SUCCESS'
    }]);
    if (audErr) console.warn('[OcaEmailAdmin.exportFull8TableBackup] audit log warning:', audErr);

    const backupMeta = { at: nowIso, by: actor.username, totalRecords: totalRows, counts };
    if (global.OcaAppConfig && typeof global.OcaAppConfig.set === 'function') {
      await global.OcaAppConfig.set('last_backup_at', backupMeta, 'backup');
    }
    return backupMeta;
  }

  /**
   * UI Renderers for Settings Subtab 4 (#subviewSettingsSlipEmail)
   * and Settings Subtab 5 (#subviewSettingsAppConfig)
   */
  async function initSettingsSlipEmailView() {
    const slipCfg = global.OcaSlipGuard ? await global.OcaSlipGuard.loadConfig(true) : {};
    const emailCfg = await loadEmailConfig(true);

    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
    const setChk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = Boolean(v); };

    setVal('inpSlipGuardBankName', slipCfg.bankName || '');
    setVal('inpSlipGuardAccName', slipCfg.bankAccountName || '');
    setVal('inpSlipGuardAccNo', slipCfg.bankAccountNo || '');
    setVal('inpSlipGuardMaxAgeDays', slipCfg.maxSlipAgeDays ?? 7);
    setVal('selSlipGuardBankApiProvider', slipCfg.bankApiProvider || 'disabled');
    setChk('chkSlipGuardStrictCrc16', slipCfg.strictCrc16 !== false);
    setChk('chkSlipGuardAutoBlacklist', slipCfg.autoBlacklistFakeSlip !== false);

    setVal('inpEmailBrevoThreshold', emailCfg.brevoLowQuotaThreshold ?? 50);
    setChk('chkEmailAutoOnApprove', emailCfg.autoEmailOnApprove !== false);
    setChk('chkEmailAutoOnReject', emailCfg.autoEmailOnReject !== false);

    await Promise.all([renderBlacklistTable(), renderFailedEmailQueueTable()]);
  }

  async function renderBlacklistTable() {
    const tbody = document.getElementById('tbodySlipBlacklist');
    if (!tbody) return;
    const rows = global.OcaSlipGuard ? await global.OcaSlipGuard.listBlacklistedSlips() : [];
    const badge = document.getElementById('lblSlipBlacklistCount');
    if (badge) badge.textContent = String(rows.length);
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:18px; color:var(--text-muted);">ยังไม่มีรายการสลิปในบัญชีดำ (Blacklist)</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(r => {
      const k = escapeAdminHtml(r.key || '');
      const n = escapeAdminHtml(r.name || '');
      const ts = r.updated_at ? new Date(r.updated_at).toLocaleString('th-TH') : '-';
      return `<tr style="border-bottom:1px solid var(--border-soft);">
        <td style="padding:8px 10px; font-family:monospace; font-size:12px; color:var(--text-main);">${k}</td>
        <td style="padding:8px 10px; font-size:12px; font-weight:700; color:#DC2626;">${n}</td>
        <td style="padding:8px 10px; font-size:11.5px; color:var(--text-muted); white-space:nowrap;">${escapeAdminHtml(ts)}</td>
        <td style="padding:8px 10px; text-align:center;">
          <button type="button" data-bl-key="${k}" onclick="handleRemoveBlacklistedSlip(this.dataset.blKey)" style="background:#FEE2E2; color:#991B1B; border:1px solid #FCA5A5; border-radius:6px; padding:4px 10px; font-size:11.5px; font-weight:700; cursor:pointer;">ปลดล็อก</button>
        </td>
      </tr>`;
    }).join('');
  }

  async function renderFailedEmailQueueTable() {
    const tbody = document.getElementById('tbodyFailedEmailQueue');
    if (!tbody) return;
    const queue = await getFailedEmailQueue();
    const badge = document.getElementById('lblFailedEmailCount');
    if (badge) badge.textContent = String(queue.length);
    if (queue.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:18px; color:var(--text-muted);">ไม่มีอีเมลที่ส่งไม่สำเร็จในคิว</td></tr>';
      return;
    }
    tbody.innerHTML = queue.map(item => {
      const id = escapeAdminHtml(item.id || '');
      const ref = escapeAdminHtml(item.receiptNo || item.studentId || '-');
      const to = escapeAdminHtml(item.toEmail || '-');
      const err = escapeAdminHtml(item.errorMessage || '-');
      const ts = item.failedAt ? new Date(item.failedAt).toLocaleString('th-TH') : '-';
      return `<tr style="border-bottom:1px solid var(--border-soft);">
        <td style="padding:8px 10px; font-family:monospace; font-size:12px; color:var(--text-main); white-space:nowrap;">${ref}</td>
        <td style="padding:8px 10px; font-size:12px; color:var(--text-main);">${to}</td>
        <td style="padding:8px 10px; font-size:11.5px; color:#DC2626;">${err}</td>
        <td style="padding:8px 10px; font-size:11.5px; color:var(--text-muted); white-space:nowrap;">${escapeAdminHtml(ts)}</td>
        <td style="padding:8px 10px; text-align:center; white-space:nowrap;">
          <button type="button" data-fe-id="${id}" onclick="handleRetryFailedEmail(this.dataset.feId)" style="background:#047857; color:#FFFFFF; border:none; border-radius:6px; padding:4px 10px; font-size:11.5px; font-weight:700; cursor:pointer; margin-right:4px;">ส่งใหม่</button>
          <button type="button" data-fe-id="${id}" onclick="handleDeleteFailedEmail(this.dataset.feId)" style="background:#FEE2E2; color:#991B1B; border:1px solid #FCA5A5; border-radius:6px; padding:4px 8px; font-size:11.5px; font-weight:700; cursor:pointer;">ลบ</button>
        </td>
      </tr>`;
    }).join('');
  }

  async function initSettingsAppConfigView() {
    const mins = await loadIdleTimeoutMinutes();
    const selIdle = document.getElementById('selSettingsIdleTimeout');
    if (selIdle) selIdle.value = String(mins);

    // Backup status & 7-day reminder
    const lblBackup = document.getElementById('lblLastBackupStatus');
    const badgeRemind = document.getElementById('badgeBackupOverdueWarning');
    try {
      const meta = global.OcaAppConfig ? await global.OcaAppConfig.get('last_backup_at', null) : null;
      if (meta && meta.at) {
        const dt = new Date(meta.at);
        const daysAgo = Math.floor((Date.now() - dt.getTime()) / (24 * 60 * 60 * 1000));
        if (lblBackup) {
          lblBackup.textContent = `สำรองล่าสุด: ${dt.toLocaleString('th-TH')} โดย ${meta.by || '-'} (${meta.totalRecords || 0} รายการ)`;
        }
        if (badgeRemind) {
          badgeRemind.style.display = daysAgo >= 7 ? 'inline-flex' : 'none';
        }
      } else {
        if (lblBackup) lblBackup.textContent = 'ยังไม่มีประวัติการสำรองข้อมูลครบ 8 ตาราง';
        if (badgeRemind) badgeRemind.style.display = 'inline-flex';
      }
    } catch (_) {}

    await renderAppSettingsInspectorTable();
  }

  async function renderAppSettingsInspectorTable() {
    const tbody = document.getElementById('tbodyAppSettingsInspector');
    if (!tbody) return;
    const sb = global._supabase;
    if (!sb) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:16px; color:var(--text-muted);">ไม่พบการเชื่อมต่อ Supabase</td></tr>';
      return;
    }
    try {
      const { data, error } = await sb
        .from('app_settings')
        .select('key, value, category, updated_by, updated_at')
        .order('key', { ascending: true })
        .limit(1000);
      if (error) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:16px; color:#DC2626;">ไม่สามารถโหลด app_settings: ${escapeAdminHtml(error.message)}</td></tr>`;
        return;
      }
      const rows = Array.isArray(data) ? data : [];
      if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:16px; color:var(--text-muted);">ยังไม่มีคีย์ในตาราง app_settings</td></tr>';
        return;
      }
      tbody.innerHTML = rows.map(r => {
        const k = escapeAdminHtml(r.key || '');
        const cat = escapeAdminHtml(r.category || 'general');
        const valStr = escapeAdminHtml(String(JSON.stringify(r.value ?? null)).slice(0, 140));
        const ts = r.updated_at ? new Date(r.updated_at).toLocaleString('th-TH') : '-';
        return `<tr style="border-bottom:1px solid var(--border-soft);">
          <td style="padding:8px 10px; font-family:monospace; font-size:12px; font-weight:700; color:var(--text-main);">${k}</td>
          <td style="padding:8px 10px; font-size:11.5px; color:var(--text-muted);">${cat}</td>
          <td style="padding:8px 10px; font-family:monospace; font-size:11.5px; color:var(--text-main); max-width:340px; word-break:break-all;">${valStr}</td>
          <td style="padding:8px 10px; font-size:11px; color:var(--text-muted); white-space:nowrap;">${escapeAdminHtml(ts)}</td>
        </tr>`;
      }).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:16px; color:#DC2626;">${escapeAdminHtml(err.message || String(err))}</td></tr>`;
    }
  }

  // Global UI click handlers for Settings Subtab 4 & 5
  async function _runSettingsSaveWithFeedback(btnId, saveFn, okTitle, okDesc) {
    const btn = document.getElementById(btnId);
    if (btn && btn.dataset.saving === '1') return;
    const origHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.dataset.saving = '1';
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...';
    }
    try {
      const ok = await saveFn();
      if (typeof global.showToast === 'function') {
        global.showToast(ok ? okTitle : 'บันทึกไม่สำเร็จ', ok ? okDesc : 'กรุณาลองใหม่', ok ? '✅' : '❌');
      }
      if (typeof global.showOcaAlert === 'function') {
        global.showOcaAlert(
          ok ? okTitle : 'บันทึกไม่สำเร็จ',
          ok ? okDesc : 'ไม่สามารถบันทึกการตั้งค่าลงฐานข้อมูลได้ กรุณาลองใหม่อีกครั้ง',
          ok ? 'success' : 'error'
        );
      }
      if (ok && btn) {
        btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> บันทึกสำเร็จแล้ว!';
        setTimeout(() => {
          btn.innerHTML = origHtml;
          btn.disabled = false;
          delete btn.dataset.saving;
        }, 2000);
        if (document.getElementById('tbodyAppSettingsInspector') && typeof renderAppSettingsInspectorTable === 'function') {
          renderAppSettingsInspectorTable().catch(() => {});
        }
        return;
      }
    } catch (err) {
      console.error('[OcaEmailAdmin.save]', btnId, err);
      if (typeof global.showToast === 'function') {
        global.showToast('บันทึกไม่สำเร็จ', (err && err.message) || 'เกิดข้อผิดพลาดระหว่างบันทึก', '❌');
      }
      if (typeof global.showOcaAlert === 'function') {
        global.showOcaAlert('บันทึกไม่สำเร็จ', (err && err.message) || 'เกิดข้อผิดพลาดระหว่างบันทึก', 'error');
      }
    }
    if (btn) {
      btn.innerHTML = origHtml;
      btn.disabled = false;
      delete btn.dataset.saving;
    }
  }

  global.saveSlipGuardSettingsFromUi = async function () {
    if (!global.OcaSlipGuard) return;
    const beforeCfg = (typeof global.OcaSlipGuard.getConfigSync === 'function') ? global.OcaSlipGuard.getConfigSync() : {};
    const nextCfg = {
      bankName: document.getElementById('inpSlipGuardBankName')?.value || '',
      bankAccountName: document.getElementById('inpSlipGuardAccName')?.value || '',
      bankAccountNo: document.getElementById('inpSlipGuardAccNo')?.value || '',
      maxSlipAgeDays: Number(document.getElementById('inpSlipGuardMaxAgeDays')?.value || 7),
      bankApiProvider: document.getElementById('selSlipGuardBankApiProvider')?.value || 'disabled',
      strictCrc16: Boolean(document.getElementById('chkSlipGuardStrictCrc16')?.checked),
      autoBlacklistFakeSlip: Boolean(document.getElementById('chkSlipGuardAutoBlacklist')?.checked)
    };
    await _runSettingsSaveWithFeedback(
      'btnSaveSlipGuardSettings',
      async () => {
        const ok = await global.OcaSlipGuard.saveConfig(nextCfg);
        if (ok && typeof global.logDetailedAuditEvent === 'function') {
          global.logDetailedAuditEvent({
            action: 'SLIP_GUARD_SAVED',
            targetType: 'app_settings',
            targetId: 'slip_guard_config',
            summary: 'อัปเดตตั้งค่าป้องกันทุจริตสลิปโอนเงิน (Slip Guard)',
            before: beforeCfg,
            after: nextCfg,
            severity: 'WARN'
          });
        }
        return ok;
      },
      'บันทึกการตั้งค่า Slip Guard แล้ว',
      'อัปเดตลง app_settings เรียบร้อย'
    );
  };

  global.saveEmailSettingsFromUi = async function () {
    const beforeCfg = { ..._cachedEmailConfig };
    const nextCfg = {
      brevoLowQuotaThreshold: Number(document.getElementById('inpEmailBrevoThreshold')?.value || 50),
      autoEmailOnApprove: Boolean(document.getElementById('chkEmailAutoOnApprove')?.checked),
      autoEmailOnReject: Boolean(document.getElementById('chkEmailAutoOnReject')?.checked)
    };
    await _runSettingsSaveWithFeedback(
      'btnSaveEmailSettings',
      async () => {
        const ok = await saveEmailConfig(nextCfg);
        if (ok && typeof global.logDetailedAuditEvent === 'function') {
          global.logDetailedAuditEvent({
            action: 'EMAIL_CONFIG_SAVED',
            targetType: 'app_settings',
            targetId: 'email_config',
            summary: 'อัปเดตตั้งค่าระบบส่งอีเมล & เกณฑ์โควตา Brevo',
            before: beforeCfg,
            after: nextCfg,
            severity: 'INFO'
          });
        }
        return ok;
      },
      'บันทึกการตั้งค่าอีเมลแล้ว',
      'อัปเดตลง app_settings เรียบร้อย'
    );
  };

  global.handleSendTestEmailFromSettings = async function () {
    const inp = document.getElementById('inpSettingsTestEmailTo');
    const btn = document.getElementById('btnSettingsSendTestEmail');
    const target = inp ? inp.value.trim() : '';
    if (!isValidOcaEmail(target)) {
      if (typeof global.showToast === 'function') global.showToast('อีเมลไม่ถูกต้อง', 'กรุณากรอกอีเมลให้ถูกต้องตามรูปแบบ RFC', '⚠️');
      if (inp) inp.focus();
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = 'กำลังส่ง...'; }
    try {
      const res = await sendTestEmailFromSettings(target);
      if (typeof global.showToast === 'function') {
        global.showToast(res.success ? 'ส่งอีเมลทดสอบสำเร็จ' : 'ส่งอีเมลทดสอบไม่สำเร็จ', res.message || res.error || '', res.success ? '✅' : '❌');
      }
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> ทดสอบส่งอีเมล'; }
    }
  };

  let _emailActionBusy = false;
  global.handleRemoveBlacklistedSlip = async function (key) {
    if (!key || !global.OcaSlipGuard || _emailActionBusy) return;
    if (typeof global.requireSecurityPinVerification === 'function') {
      const pinOk = await global.requireSecurityPinVerification('ยืนยันการปลดล็อกสลิปบัญชีดำ', `ปลดล็อกสลิป ${key} ออกจากบัญชีดำ`);
      if (!pinOk) return;
    }
    _emailActionBusy = true;
    try {
      const ok = await global.OcaSlipGuard.removeBlacklistedSlip(key);
      if (ok && typeof global.logDetailedAuditEvent === 'function') {
        global.logDetailedAuditEvent({
          action: 'SLIP_BLACKLIST_REMOVED',
          targetType: 'fee_settings',
          targetId: key,
          summary: `ปลดล็อกสลิปออกจากบัญชีดำ (${key})`,
          before: { blacklisted: true },
          after: { blacklisted: false },
          severity: 'CRITICAL'
        });
      }
      if (typeof global.showToast === 'function') {
        global.showToast(ok ? 'ปลดล็อกรายการแล้ว' : 'ปลดล็อกไม่สำเร็จ', key, ok ? '✅' : '❌');
      }
      await renderBlacklistTable();
    } finally {
      _emailActionBusy = false;
    }
  };

  global.handleRetryFailedEmail = async function (id) {
    if (_emailActionBusy) return;
    _emailActionBusy = true;
    try {
      const res = await retryFailedEmail(id);
      if (res && res.success && typeof global.logDetailedAuditEvent === 'function') {
        global.logDetailedAuditEvent({
          action: 'FAILED_EMAIL_RETRIED',
          targetType: 'email_queue',
          targetId: id,
          summary: `ส่งอีเมลค้างในคิวซ้ำสำเร็จ (${id})`,
          severity: 'INFO'
        });
      }
      if (typeof global.showToast === 'function') {
        global.showToast(res.success ? 'ส่งอีเมลซ้ำสำเร็จ' : 'ส่งอีเมลซ้ำไม่สำเร็จ', res.error || 'นำออกจากคิวเรียบร้อย', res.success ? '✅' : '❌');
      }
      await renderFailedEmailQueueTable();
    } finally {
      _emailActionBusy = false;
    }
  };

  global.handleDeleteFailedEmail = async function (id) {
    if (_emailActionBusy) return;
    _emailActionBusy = true;
    try {
      await removeFailedEmailItem(id);
      await renderFailedEmailQueueTable();
    } finally {
      _emailActionBusy = false;
    }
  };

  global.handleRetryAllFailedEmails = async function () {
    if (_emailActionBusy) return;
    _emailActionBusy = true;
    const btn = document.getElementById('btnRetryAllFailedEmails');
    if (btn) { btn.disabled = true; btn.textContent = 'กำลังส่งซ้ำ...'; }
    try {
      const res = await retryAllFailedEmails();
      if (typeof global.showToast === 'function') {
        global.showToast('ส่งอีเมลซ้ำครบแล้ว', `สำเร็จ ${res.ok} / ไม่สำเร็จ ${res.fail} รายการ`, res.fail === 0 ? '✅' : '⚠️');
      }
      await renderFailedEmailQueueTable();
    } finally {
      _emailActionBusy = false;
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> ส่งใหม่ทั้งหมด'; }
    }
  };

  global.handleSaveIdleTimeoutFromUi = async function () {
    const sel = document.getElementById('selSettingsIdleTimeout');
    const prevMins = Number(global._ocaIdleTimeoutMinutes || 30);
    const mins = Number(sel ? sel.value : 30);
    await _runSettingsSaveWithFeedback(
      'btnSaveIdleTimeout',
      async () => {
        const ok = await saveIdleTimeoutMinutes(mins);
        if (ok && typeof global.logDetailedAuditEvent === 'function') {
          global.logDetailedAuditEvent({
            action: 'IDLE_TIMEOUT_SAVED',
            targetType: 'app_settings',
            targetId: 'idle_timeout_minutes',
            summary: `ตั้งเวลา Auto-Logout เป็น ${mins} นาที`,
            before: { minutes: prevMins },
            after: { minutes: mins },
            severity: 'WARN'
          });
        }
        return ok;
      },
      'บันทึกเวลา Auto-Logout แล้ว',
      `ตั้งค่าเป็น ${mins} นาที`
    );
  };

  global.handleExportFull8TableBackup = async function () {
    const btn = document.getElementById('btnExportFull8TableBackup');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังสำรองข้อมูล 8 ตาราง...'; }
    try {
      const meta = await exportFull8TableBackup((prog) => {
        if (btn && prog) {
          btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> กำลังสำรองตาราง ${prog.index}/${prog.totalTables} (${prog.table}: ${Number(prog.rows || 0).toLocaleString()} แถว)...`;
        }
      });
      const summaryDesc = `รวมทั้งหมด ${Number(meta.totalRecords || 0).toLocaleString()} รายการ (บันทึก Audit Log และ last_backup_at แล้ว)`;
      if (typeof global.showToast === 'function') {
        global.showToast('สำรองข้อมูลครบ 8 ตารางสำเร็จ!', summaryDesc, '✅');
      }
      if (typeof global.showOcaAlert === 'function') {
        global.showOcaAlert('สำรองข้อมูลครบ 8 ตารางสำเร็จ!', summaryDesc, 'success');
      }
      await initSettingsAppConfigView();
    } catch (err) {
      const errMsg = (err && err.message) || String(err);
      if (typeof global.showToast === 'function') {
        global.showToast('สำรองข้อมูลไม่สำเร็จ', errMsg, '❌');
      }
      if (typeof global.showOcaAlert === 'function') {
        global.showOcaAlert('สำรองข้อมูลไม่สำเร็จ', errMsg, 'error');
      }
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-database"></i> สำรองข้อมูลครบทั้ง 8 ตาราง (Full JSON Backup)'; }
    }
  };

  global.OcaEmailAdmin = {
    DEFAULT_EMAIL_CONFIG,
    FULL_BACKUP_TABLES,
    EMAIL_COOLDOWN_MS,
    isValidOcaEmail,
    checkEmailSendCooldown,
    markEmailSentNow,
    loadEmailConfig,
    saveEmailConfig,
    getFailedEmailQueue,
    enqueueFailedEmail,
    removeFailedEmailItem,
    retryFailedEmail,
    retryAllFailedEmails,
    sendSlipRejectionEmail,
    sendTestEmailFromSettings,
    loadIdleTimeoutMinutes,
    saveIdleTimeoutMinutes,
    exportFull8TableBackup,
    initSettingsSlipEmailView,
    initSettingsAppConfigView,
    renderBlacklistTable,
    renderFailedEmailQueueTable,
    renderAppSettingsInspectorTable,
    saveSlipGuardSettingsFromUi: global.saveSlipGuardSettingsFromUi,
    saveEmailSettingsFromUi: global.saveEmailSettingsFromUi,
    handleSendTestEmailFromSettings: global.handleSendTestEmailFromSettings,
    handleRetryAllFailedEmails: global.handleRetryAllFailedEmails,
    handleSaveIdleTimeoutFromUi: global.handleSaveIdleTimeoutFromUi,
    handleExportFull8TableBackup: global.handleExportFull8TableBackup
  };

  global.isValidOcaEmail = isValidOcaEmail;
  global.sendSlipRejectionEmail = sendSlipRejectionEmail;
})(window);
