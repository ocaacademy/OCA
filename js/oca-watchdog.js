/**
 * OCA Accounting Anomaly Watchdog (v261)
 * Read-only anomaly scanner for Admin / Manager / Finance / Cashier roles.
 * Detects: (1) Daily Shift Closing cash variance != 0
 *          (2) Daily VOID_RECEIPT spike (>= 3 voids/day)
 *          (3) Stale pending transfer slips (> 24 hours)
 */
(function (global) {
  'use strict';

  function _t(th, en, zh) {
    const lang = String(global._currentSystemLang || 'th').toLowerCase();
    if (lang === 'en') return en || th;
    if (lang === 'zh') return zh || en || th;
    return th;
  }

  const THROTTLE_MS = 5 * 60 * 1000;
  let _lastRunAt = 0;

  function isPrivilegedFinanceRole(role) {
    const r = String(role || '').toLowerCase().trim();
    return ['admin', 'administrator', 'manager', 'finance', 'cashier', 'registrar', 'staff'].some(k => r.includes(k));
  }

  function getTodayBkkYmd() {
    const now = new Date();
    const bkk = new Date(now.getTime() + (7 * 60 + now.getTimezoneOffset()) * 60000);
    const yyyy = bkk.getFullYear();
    const mm = String(bkk.getMonth() + 1).padStart(2, '0');
    const dd = String(bkk.getDate()).padStart(2, '0');
    return { yyyymmdd: `${yyyy}${mm}${dd}`, isoDate: `${yyyy}-${mm}-${dd}` };
  }

  function pushUniqueWatchdogNotifs(alerts) {
    if (!Array.isArray(alerts) || alerts.length === 0) return 0;
    let current = [];
    try {
      current = JSON.parse(localStorage.getItem('oca_notifications') || '[]');
      if (!Array.isArray(current)) current = [];
    } catch (_) {
      current = [];
    }
    const existingIds = new Set(current.map(item => String(item && item.id ? item.id : '')));
    let added = 0;
    for (const alertItem of alerts) {
      if (!existingIds.has(alertItem.id)) {
        current.unshift(alertItem);
        existingIds.add(alertItem.id);
        added++;
      }
    }
    if (added > 0) {
      try {
        localStorage.setItem('oca_notifications', JSON.stringify(current.slice(0, 100)));
      } catch (_) {}
      if (typeof global.renderNotificationBell === 'function') {
        try {
          global.renderNotificationBell(true);
        } catch (_) {}
      }
    }
    return added;
  }

  async function runCheck(supabaseClient, userRole, force = false) {
    if (!supabaseClient || typeof supabaseClient.from !== 'function') {
      return { skipped: true, reason: 'no_client' };
    }
    if (!isPrivilegedFinanceRole(userRole)) {
      return { skipped: true, reason: 'role_excluded' };
    }
    const nowMs = Date.now();
    if (!force && (nowMs - _lastRunAt) < THROTTLE_MS) {
      return { skipped: true, reason: 'throttled' };
    }
    _lastRunAt = nowMs;

    const { yyyymmdd, isoDate } = getTodayBkkYmd();
    const alerts = [];

    try {
      // 1. Shift Closing Cash Variance Check
      const shiftKey = `shift_close_${yyyymmdd}`;
      const { data: shiftRow, error: shiftErr } = await supabaseClient
        .from('fee_settings')
        .select('key, name, updated_at')
        .eq('key', shiftKey)
        .maybeSingle();
      if (shiftErr) {
        console.warn('[OcaWatchdog] shift variance query warning:', shiftErr.message);
      } else if (shiftRow && shiftRow.name) {
        const mVar = String(shiftRow.name).match(/Var:(-?\d+(?:\.\d+)?)/);
        const variance = mVar ? Number(mVar[1]) : 0;
        if (Math.abs(variance) >= 1) {
          alerts.push({
            id: `watchdog_shift_${yyyymmdd}`,
            action: 'ACCOUNTING_WATCHDOG_SHIFT',
            teacher_name: _t('Watchdog บัญชี', 'Accounting Watchdog', '账务监控'),
            details: _t(
              `พบผลต่างเงินสดปิดยอดกะวันที่ ${isoDate}: ${variance > 0 ? '+' : ''}${variance.toLocaleString('en-US')} บาท`,
              `Shift closing cash variance on ${isoDate}: ${variance > 0 ? '+' : ''}${variance.toLocaleString('en-US')} THB`,
              `日结现金差异 (${isoDate}): ${variance > 0 ? '+' : ''}${variance.toLocaleString('en-US')} 泰铢`
            ),
            created_at: shiftRow.updated_at || new Date().toISOString(),
            read: false
          });
        }
      }

      // 2. Daily VOID_RECEIPT Spike Check (>= 3 voids today)
      const dayStartIso = `${isoDate}T00:00:00+07:00`;
      const { data: voidRows, error: voidErr } = await supabaseClient
        .from('security_audit_logs')
        .select('id, created_at')
        .eq('action', 'VOID_RECEIPT')
        .gte('created_at', dayStartIso)
        .limit(20);
      if (voidErr) {
        console.warn('[OcaWatchdog] void spike query warning:', voidErr.message);
      } else if (Array.isArray(voidRows) && voidRows.length >= 3) {
        alerts.push({
          id: `watchdog_void_${yyyymmdd}_${voidRows.length}`,
          action: 'ACCOUNTING_WATCHDOG_VOID',
          teacher_name: 'Watchdog บัญชี',
          details: `มีการยกเลิกใบเสร็จ (VOID) วันนี้แล้ว ${voidRows.length} ฉบับ โปรดตรวจสอบรายการ`,
          created_at: new Date().toISOString(),
          read: false
        });
      }

      // 3. Stale Pending Slips (> 24 hours)
      const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: staleSlips, error: slipErr } = await supabaseClient
        .from('fee_settings')
        .select('key, updated_at')
        .like('key', 'pending_slip:%')
        .lt('updated_at', cutoffIso)
        .limit(50);
      if (slipErr) {
        console.warn('[OcaWatchdog] stale slip query warning:', slipErr.message);
      } else if (Array.isArray(staleSlips) && staleSlips.length > 0) {
        alerts.push({
          id: `watchdog_slip_${yyyymmdd}`,
          action: 'ACCOUNTING_WATCHDOG_SLIP',
          teacher_name: 'Watchdog บัญชี',
          details: `พบสลิปรอตรวจสอบค้างเกิน 24 ชั่วโมง จำนวน ${staleSlips.length} รายการ`,
          created_at: new Date().toISOString(),
          read: false
        });
      }

      const added = pushUniqueWatchdogNotifs(alerts);
      return { success: true, alertsFound: alerts.length, newlyAdded: added };
    } catch (err) {
      console.warn('[OcaWatchdog] runCheck exception:', err);
      return { success: false, message: err && err.message ? err.message : 'Watchdog error' };
    }
  }

  global.OcaWatchdog = {
    runCheck,
    isPrivilegedFinanceRole
  };
})(window);
