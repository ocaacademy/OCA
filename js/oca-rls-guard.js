/**
 * OCA RLS Security Posture & Append-Only Audit Guard (v276)
 * Read-only posture check for Settings -> Security (#subviewSettingsDevice).
 */
(function (global) {
  'use strict';

  function formatCheckedTime(isoStr) {
    try {
      const dt = isoStr ? new Date(isoStr) : new Date();
      return dt.toLocaleTimeString('th-TH', {
        timeZone: 'Asia/Bangkok',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }) + ' น.';
    } catch (_) {
      return '-';
    }
  }

  function renderCard(mountEl, posture) {
    if (!mountEl) return;
    const isProtected = Boolean(posture && posture.rlsStaffProtected);
    const isAppendOnly = Boolean(posture && posture.auditAppendOnly);
    const allOk = isProtected && isAppendOnly;
    const badgeClass = allOk ? 'oca-mod-badge-ok' : 'oca-mod-badge-warn';
    const badgeText = allOk
      ? '<span class="oca-rls-dot" aria-hidden="true"></span><i class="fa-solid fa-circle-check"></i><span>RLS &amp; Append-Only Active</span>'
      : '<span class="oca-rls-dot" aria-hidden="true"></span><i class="fa-solid fa-triangle-exclamation"></i><span>รอรัน SQL Hardening ใน Supabase</span>';
    const checkedLabel = formatCheckedTime(posture && posture.checkedAt);

    mountEl.innerHTML = `
      <div class="oca-mod-card ${allOk ? 'is-protected' : 'is-warning'}" id="cardOcaRlsPosture">
        <div class="oca-mod-card-header">
          <div class="oca-rls-header-left">
            <div class="oca-rls-icon-box" aria-hidden="true">
              <i class="fa-solid fa-shield-halved"></i>
            </div>
            <div>
              <h3 class="oca-mod-card-title">
                <span>สถานะความปลอดภัยฐานข้อมูล (RLS &amp; Append-Only Audit Logs)</span>
              </h3>
              <div class="oca-mod-card-sub">
                ตรวจสอบสิทธิ์การเข้าถึงตาราง <code class="oca-rls-code">staff_users</code> ผ่าน RPC และล็อก <code class="oca-rls-code">security_audit_logs</code> แบบเพิ่มได้อย่างเดียว (ห้ามแก้ไข/ลบ)
              </div>
            </div>
          </div>
          <span class="${badgeClass}" id="badgeOcaRlsStatus" aria-live="polite">${badgeText}</span>
        </div>

        <div class="oca-mod-pill-grid">
          <div class="oca-mod-status-box oca-rls-tile ${isProtected ? 'is-ok' : 'is-warn'}">
            <div class="oca-rls-tile-icon" aria-hidden="true">
              <i class="fa-solid fa-user-lock"></i>
            </div>
            <div>
              <div class="oca-mod-status-label">ตาราง staff_users (RPC-Only)</div>
              <div class="oca-mod-status-val">
                <i class="fa-solid ${isProtected ? 'fa-circle-check' : 'fa-triangle-exclamation'}"></i>
                <span>${isProtected ? 'ปิดการเข้าถึงตรงจาก anon แล้ว' : 'ยังอ่านตรงได้ (แนะนำรัน SQL)'}</span>
              </div>
              <div class="oca-rls-tile-hint">อนุญาตเฉพาะฟังก์ชัน RPC ที่ผ่านการยืนยันตัวตน</div>
            </div>
          </div>

          <div class="oca-mod-status-box oca-rls-tile ${isAppendOnly ? 'is-ok' : 'is-warn'}">
            <div class="oca-rls-tile-icon" aria-hidden="true">
              <i class="fa-solid fa-file-shield"></i>
            </div>
            <div>
              <div class="oca-mod-status-label">ตาราง security_audit_logs</div>
              <div class="oca-mod-status-val">
                <i class="fa-solid ${isAppendOnly ? 'fa-circle-check' : 'fa-triangle-exclamation'}"></i>
                <span>${isAppendOnly ? 'Append-Only Trigger ทำงานอยู่' : 'ยังไม่มี Trigger ห้ามลบ/แก้ไข'}</span>
              </div>
              <div class="oca-rls-tile-hint">ป้องกันการแก้ไขหรือลบบันทึกกิจกรรมย้อนหลัง (PDPA)</div>
            </div>
          </div>
        </div>

        <div class="oca-rls-footer">
          <div class="oca-rls-actions">
            <button type="button" id="btnCheckOcaRlsPosture" class="oca-mod-btn-primary">
              <i class="fa-solid fa-magnifying-glass-chart"></i>
              <span>ตรวจสอบสถานะ RLS ล่าสุด</span>
            </button>
            <button type="button" id="btnCopyOcaRlsSqlPath" class="oca-mod-btn-outline" title="คัดลอกพาธไฟล์ SQL Hardening">
              <i class="fa-solid fa-file-code"></i>
              <span>ดูไฟล์ SQL:</span>
              <code class="oca-rls-sql-chip">sql/oca_rls_security_hardening_v261.sql</code>
            </button>
          </div>
          <div class="oca-rls-checked-at">
            <i class="fa-regular fa-clock" aria-hidden="true"></i>
            <span>ตรวจสอบล่าสุดเมื่อ ${checkedLabel}</span>
          </div>
        </div>
      </div>
    `;

    const btnCheck = document.getElementById('btnCheckOcaRlsPosture');
    if (btnCheck) {
      btnCheck.onclick = async () => {
        btnCheck.disabled = true;
        btnCheck.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>กำลังตรวจสอบสถานะ...</span>';
        await checkPosture(global._supabase, true);
      };
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
    const posture = { rlsStaffProtected: false, auditAppendOnly: false, networkError: '', checkedAt: new Date().toISOString() };

    if (supabaseClient && typeof supabaseClient.rpc === 'function') {
      try {
        const { data, error } = await supabaseClient.rpc('check_oca_rls_posture');
        if (error) {
          console.warn('[OcaRlsGuard] checkPosture RPC error:', error.message || error);
          const msg = String(error.message || '');
          if (!/function.*check_oca_rls_posture|does not exist|42883/i.test(msg)) {
            posture.networkError = msg || 'RPC connection error';
          }
        } else if (data && typeof data === 'object') {
          posture.rlsStaffProtected = Boolean(data.rls_staff_users);
          posture.auditAppendOnly = Boolean(data.append_only_trigger && data.rls_audit_logs);
        }
      } catch (err) {
        console.warn('[OcaRlsGuard] checkPosture RPC warning:', err);
        posture.networkError = String((err && err.message) || err || 'Network error');
      }
    }

    renderCard(mountEl, posture);
    if (notifyUser && typeof global.showToast === 'function') {
      const toastMsg = posture.networkError
        ? ('ไม่สามารถเชื่อมต่อฐานข้อมูลได้ชั่วคราว: ' + posture.networkError)
        : ((posture.rlsStaffProtected && posture.auditAppendOnly)
          ? 'ฐานข้อมูลเปิดใช้งาน RLS & Append-Only Audit ครบถ้วน'
          : 'กรุณารัน sql/oca_rls_security_hardening_v261.sql ใน Supabase SQL Editor');
      global.showToast('ตรวจสอบ RLS เสร็จสิ้น', toastMsg, posture.networkError ? '⚠️' : '🛡️');
    }
    return posture;
  }

  global.OcaRlsGuard = {
    checkPosture,
    renderCard
  };
})(window);
