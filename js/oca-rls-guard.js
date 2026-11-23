/**
 * OCA RLS Security Posture & Append-Only Audit Guard (v261)
 * Read-only posture check for Settings -> Security (#subviewSettingsDevice).
 */
(function (global) {
  'use strict';

  function renderCard(mountEl, posture) {
    if (!mountEl) return;
    const isProtected = posture && posture.rlsStaffProtected;
    const isAppendOnly = posture && posture.auditAppendOnly;
    const badgeClass = (isProtected && isAppendOnly) ? 'oca-mod-badge-ok' : 'oca-mod-badge-warn';
    const badgeText = (isProtected && isAppendOnly)
      ? '<i class="fa-solid fa-shield-check"></i> RLS & Append-Only Active'
      : '<i class="fa-solid fa-triangle-exclamation"></i> รอรัน SQL Hardening ใน Supabase';

    mountEl.innerHTML = `
      <div class="oca-mod-card" id="cardOcaRlsPosture">
        <div class="oca-mod-card-header">
          <div>
            <h3 class="oca-mod-card-title">
              <i class="fa-solid fa-database" style="color:#059669;"></i>
              <span>สถานะความปลอดภัยฐานข้อมูล (RLS & Append-Only Audit Logs)</span>
            </h3>
            <div class="oca-mod-card-sub">
              ตรวจสอบสิทธิ์การเข้าถึงตาราง <code>staff_users</code> ผ่าน RPC และล็อก <code>security_audit_logs</code> แบบเพิ่มได้อย่างเดียว (ห้ามแก้ไข/ลบ)
            </div>
          </div>
          <span class="${badgeClass}" id="badgeOcaRlsStatus">${badgeText}</span>
        </div>
        <div class="oca-mod-pill-grid">
          <div class="oca-mod-status-box">
            <div class="oca-mod-status-label">ตาราง staff_users (RPC-Only)</div>
            <div class="oca-mod-status-val">${isProtected ? '✓ ปิดการเข้าถึงตรงจาก anon แล้ว' : '⚠️ ยังอ่านตรงได้ (แนะนำรัน SQL)'}</div>
          </div>
          <div class="oca-mod-status-box">
            <div class="oca-mod-status-label">ตาราง security_audit_logs</div>
            <div class="oca-mod-status-val">${isAppendOnly ? '✓ Append-Only Trigger ทำงานอยู่' : '⚠️ ยังไม่มี Trigger ห้ามลบ/แก้ไข'}</div>
          </div>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button type="button" id="btnCheckOcaRlsPosture" class="oca-mod-btn-primary">
            <i class="fa-solid fa-magnifying-glass-chart"></i> ตรวจสอบสถานะ RLS ล่าสุด
          </button>
          <button type="button" id="btnCopyOcaRlsSqlPath" class="oca-mod-btn-outline">
            <i class="fa-solid fa-file-code"></i> ดูไฟล์ SQL: sql/oca_rls_security_hardening_v261.sql
          </button>
        </div>
      </div>
    `;

    const btnCheck = document.getElementById('btnCheckOcaRlsPosture');
    if (btnCheck) {
      btnCheck.onclick = () => checkPosture(global._supabase, true);
    }
    const btnCopy = document.getElementById('btnCopyOcaRlsSqlPath');
    if (btnCopy) {
      btnCopy.onclick = () => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText('sql/oca_rls_security_hardening_v261.sql').catch(() => {});
        }
        if (typeof global.showToast === 'function') {
          global.showToast('ไฟล์ SQL Hardening', 'นำไฟล์ sql/oca_rls_security_hardening_v261.sql ไปรันใน Supabase SQL Editor', '🛡️');
        }
      };
    }
  }

  async function checkPosture(supabaseClient, notifyUser = false) {
    const mountEl = document.getElementById('ocaRlsPostureMount');
    const posture = { rlsStaffProtected: false, auditAppendOnly: false, checkedAt: new Date().toISOString() };

    if (supabaseClient && typeof supabaseClient.rpc === 'function') {
      try {
        const { data, error } = await supabaseClient.rpc('check_oca_rls_posture');
        if (!error && data && typeof data === 'object') {
          posture.rlsStaffProtected = Boolean(data.rls_staff_users);
          posture.auditAppendOnly = Boolean(data.append_only_trigger && data.rls_audit_logs);
        }
      } catch (err) {
        console.warn('[OcaRlsGuard] checkPosture RPC warning:', err);
      }
    }

    renderCard(mountEl, posture);
    if (notifyUser && typeof global.showToast === 'function') {
      global.showToast(
        'ตรวจสอบ RLS เสร็จสิ้น',
        (posture.rlsStaffProtected && posture.auditAppendOnly)
          ? 'ฐานข้อมูลเปิดใช้งาน RLS & Append-Only Audit ครบถ้วน'
          : 'กรุณารัน sql/oca_rls_security_hardening_v261.sql ใน Supabase SQL Editor',
        '🛡️'
      );
    }
    return posture;
  }

  global.OcaRlsGuard = {
    checkPosture,
    renderCard
  };
})(window);
