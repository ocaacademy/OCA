/**
 * OCA Universal Hover-Preview Popover Engine (v354)
 * Zero-DB-cost hover previews with v353 internal scroll & drag guard.
 */
(function (global) {
  'use strict';

  const POPOVER_ID = 'ocaUniversalHoverPopover';
  let _openTimer = null;
  let _hideTimer = null;
  let _activeTrigger = null;

  function esc(v) {
    return String(v === undefined || v === null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtMoney(n) {
    const num = Number(n || 0);
    return '฿' + num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function getData() {
    if (typeof global._ocaGetHoverData === 'function') {
      try { return global._ocaGetHoverData() || {}; } catch (_) {}
    }
    return {};
  }

  function getOrCreatePopover() {
    let pop = document.getElementById(POPOVER_ID);
    if (!pop) {
      pop = document.createElement('div');
      pop.id = POPOVER_ID;
      pop.style.cssText = 'position:fixed; z-index:99998; display:none; background:#ffffff; color:#0f172a; border:1px solid #cbd5e1; border-radius:12px; box-shadow:0 14px 36px rgba(15,23,42,0.22); min-width:300px; max-width:480px; max-height:380px; overflow:hidden; font-family:inherit; text-align:left;';
      pop.addEventListener('mouseenter', () => {
        if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }
      });
      pop.addEventListener('mouseleave', (ev) => {
        if (ev && ev.buttons > 0) return;
        scheduleHide();
      });
      document.body.appendChild(pop);
      document.addEventListener('click', (ev) => {
        const p = document.getElementById(POPOVER_ID);
        if (!p || p.style.display === 'none') return;
        if (p.contains(ev.target)) return;
        if (_activeTrigger && _activeTrigger.contains && _activeTrigger.contains(ev.target)) return;
        hide();
      });
      window.addEventListener('scroll', (ev) => {
        const p = document.getElementById(POPOVER_ID);
        if (!p || p.style.display === 'none') return;
        if (ev && ev.target && (ev.target === p || (ev.target instanceof Node && p.contains(ev.target)))) return;
        hide();
      }, true);
    }
    return pop;
  }

  function hide() {
    if (_openTimer) { clearTimeout(_openTimer); _openTimer = null; }
    if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }
    const pop = document.getElementById(POPOVER_ID);
    if (pop) pop.style.display = 'none';
    _activeTrigger = null;
  }

  function scheduleHide() {
    if (_openTimer) { clearTimeout(_openTimer); _openTimer = null; }
    if (_hideTimer) clearTimeout(_hideTimer);
    _hideTimer = setTimeout(hide, 320);
  }

  function buildShell(titleHtml, badgeText, bodyHtml) {
    return (
      '<div style="padding:9px 12px; background:#f8fafc; border-bottom:1px solid #e2e8f0; display:flex; align-items:center; justify-content:space-between; gap:8px;">' +
      '  <div style="font-size:12.5px; font-weight:700; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + titleHtml + '</div>' +
      '  <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">' +
      (badgeText ? '    <span style="font-size:11px; font-weight:700; padding:2px 8px; border-radius:999px; background:#e0f2fe; color:#0369a1; border:1px solid #7dd3fc; white-space:nowrap;">' + esc(badgeText) + '</span>' : '') +
      '    <button type="button" onclick="window.OcaHoverPopover && window.OcaHoverPopover.hide()" aria-label="ปิด" style="background:transparent; border:none; color:#64748b; font-size:14px; font-weight:700; cursor:pointer; padding:0 2px; line-height:1;">✕</button>' +
      '  </div>' +
      '</div>' +
      '<div style="max-height:310px; overflow-y:auto; overflow-x:auto; overscroll-behavior:contain; padding:10px 12px; background:#ffffff; color:#0f172a; font-size:12px; line-height:1.5;">' +
      bodyHtml +
      '</div>'
    );
  }

  function rowKV(label, val) {
    return '<div style="display:flex; gap:8px; padding:3px 0; border-bottom:1px dashed #e2e8f0;"><span style="color:#64748b; min-width:96px; flex-shrink:0;">' + esc(label) + '</span><span style="color:#0f172a; font-weight:600; word-break:break-word;">' + esc(val || '-') + '</span></div>';
  }

  function buildCoursePreview(codeRaw, data) {
    const code = String(codeRaw || '').trim();
    const courses = Array.isArray(data.courses) ? data.courses : [];
    const c = courses.find(x => String(x.code || '').toUpperCase() === code.toUpperCase() || String(x.id || '') === code);
    if (!c) return null;
    const schedules = Array.isArray(data.schedules) ? data.schedules : [];
    const termObj = typeof global.resolveCurrentAcademicTerm === 'function' ? global.resolveCurrentAcademicTerm() : null;
    const tVal = String((termObj && termObj.term) || '1');
    const yVal = String((termObj && termObj.yearBE) || (new Date().getFullYear() + 543));
    const matchedScheds = [];
    if (typeof global.getOfferedCourseCodesForSchedule === 'function') {
      schedules.forEach(sc => {
        if (!sc || sc.is_active === false) return;
        const offered = global.getOfferedCourseCodesForSchedule(sc.id, tVal, yVal) || [];
        if (offered.some(oc => String(oc).toUpperCase() === String(c.code || code).toUpperCase())) {
          matchedScheds.push(sc);
        }
      });
    }
    const schedListHtml = matchedScheds.length > 0
      ? '<div style="margin-top:8px;"><div style="font-weight:700; color:#0369a1; margin-bottom:4px;">รอบเวลาที่เปิดสอน (' + matchedScheds.length + ' รอบ)</div>' +
        matchedScheds.map(sc => '<div style="padding:3px 7px; margin-bottom:3px; border-radius:6px; background:#f8fafc; border:1px solid #e2e8f0; color:#0f172a;">• ' + esc(sc.name || sc.id) + (sc.day_time ? ' (' + esc(sc.day_time) + ')' : '') + '</div>').join('') +
        '</div>'
      : '<div style="margin-top:8px; color:#64748b;">ยังไม่ระบุรอบเปิดสอนในเทอม ' + esc(tVal) + '/' + esc(yVal) + '</div>';
    const body =
      rowKV('ชื่อคอร์ส', c.name || '-') +
      rowKV('ระดับ', c.level || '-') +
      rowKV('ค่าเล่าเรียน', fmtMoney(c.price)) +
      rowKV('ตำราเรียน', c.linked_book || '-') +
      schedListHtml;
    return buildShell('📚 ' + esc(c.code || code), 'หลักสูตร', body);
  }

  function buildStudentPreview(sid, data) {
    const students = Array.isArray(data.students) ? data.students : [];
    const s = students.find(x => String(x.studentId || x.student_id || (Array.isArray(x) ? x[0] : '')).trim() === String(sid).trim());
    if (!s) return null;
    const name = s.fullName || s.rawName || (Array.isArray(s) ? s[1] : '-') || '-';
    const phone = s.phone || s.phoneNumber || (Array.isArray(s) ? s[3] : '-') || '-';
    const course = s.course || (Array.isArray(s) ? s[4] : '-') || '-';
    const sched = s.schedule || (Array.isArray(s) ? s[5] : '-') || '-';
    const status = s.status || (Array.isArray(s) ? s[7] : 'พร้อมเรียน') || 'พร้อมเรียน';
    const body =
      rowKV('ชื่อ-นามสกุล', name) +
      rowKV('เบอร์โทร', phone) +
      rowKV('LINE ID', s.lineId || '-') +
      rowKV('คอร์สเรียน', course) +
      rowKV('รอบเวลา', sched) +
      rowKV('วิธีรับตำรา', s.deliveryMethod || '-') +
      rowKV('สถานะ', status);
    return buildShell('🎓 นักศึกษา ' + esc(sid), 'Quick View', body);
  }

  function buildReceiptPreview(rcNo, data) {
    const receipts = Array.isArray(data.receipts) ? data.receipts : [];
    const r = receipts.find(x => String(x.receiptNo || x.receipt_no || '').trim() === String(rcNo).trim());
    if (!r) return null;
    const slip = data.slipsMap && typeof data.slipsMap.get === 'function' ? data.slipsMap.get(String(rcNo)) : null;
    const body =
      rowKV('ประเภท', r.receiptType || r.receipt_type || '-') +
      rowKV('ผู้ชำระเงิน', (r.buyerName || r.buyer_name || '-') + (r.buyerId ? ' (' + r.buyerId + ')' : '')) +
      rowKV('รายการ', r.itemName || r.item_name || '-') +
      rowKV('ยอดสุทธิ', fmtMoney(r.grandTotal ?? r.grand_total ?? 0)) +
      rowKV('วิธีชำระ', r.paymentMethod || r.payment_method || '-') +
      rowKV('สถานะรับตำรา', r.claimStatus || r.claim_status || '-') +
      rowKV('อีเมล', r.email || '-') +
      (r.editNotes ? rowKV('หมายเหตุ', r.editNotes) : '') +
      (slip && slip.mode ? rowKV('อ้างอิงสลิป', slip.mode) : '');
    return buildShell('🧾 ใบเสร็จ ' + esc(rcNo), fmtMoney(r.grandTotal ?? r.grand_total ?? 0), body);
  }

  function buildCourseScheduleMatrixPreview(codeRaw, data) {
    const code = String(codeRaw || '').trim();
    const courses = Array.isArray(data.courses) ? data.courses : [];
    const c = courses.find(x => String(x.code || '').toUpperCase() === code.toUpperCase() || String(x.id || '') === code);
    if (!c) return null;
    const schedules = Array.isArray(data.schedules) ? data.schedules : [];
    const termObj = typeof global.resolveCurrentAcademicTerm === 'function' ? global.resolveCurrentAcademicTerm() : null;
    const tVal = String((termObj && termObj.term) || '1');
    const yVal = String((termObj && termObj.yearBE) || (new Date().getFullYear() + 543));
    let rowsHtml = '';
    schedules.forEach(sc => {
      if (!sc || sc.is_active === false) return;
      const offered = typeof global.getOfferedCourseCodesForSchedule === 'function'
        ? (global.getOfferedCourseCodesForSchedule(sc.id, tVal, yVal) || [])
        : [];
      if (!offered.some(oc => String(oc).toUpperCase() === String(c.code || code).toUpperCase())) return;
      const groups = typeof global.getCourseGroupInstructorList === 'function'
        ? (global.getCourseGroupInstructorList(c.code || code, sc.id, tVal, yVal) || [])
        : [];
      const grpText = groups.length > 0
        ? groups.map(g => [g.section ? 'กลุ่ม ' + g.section : '', g.lecturerName || '', g.room ? 'ห้อง ' + g.room : ''].filter(Boolean).join(' • ')).join('<br>')
        : '-';
      rowsHtml += '<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:5px 7px; font-weight:700; white-space:nowrap;">' + esc(sc.name || sc.id) + '</td><td style="padding:5px 7px; font-size:11.5px; color:#334155;">' + grpText + '</td></tr>';
    });
    const tableHtml = rowsHtml
      ? '<table style="width:100%; border-collapse:collapse; margin-top:6px;"><thead><tr style="background:#f1f5f9; border-bottom:1px solid #cbd5e1;"><th style="padding:5px 7px; text-align:left;">รอบเวลา</th><th style="padding:5px 7px; text-align:left;">กลุ่ม / ผู้สอน / ห้อง</th></tr></thead><tbody>' + rowsHtml + '</tbody></table>'
      : '<div style="margin-top:8px; color:#64748b;">ยังไม่มีรอบเวลาที่เปิดรับในเทอม ' + esc(tVal) + '/' + esc(yVal) + '</div>';
    return buildShell('📖 ' + esc(c.code || code) + ' • ' + esc(c.name || ''), 'ตารางรอบสอน', rowKV('ค่าเรียน', fmtMoney(c.price)) + rowKV('ตำรา', c.linked_book || '-') + tableHtml);
  }

  function buildShippingPreview(orderId, data) {
    const orders = Array.isArray(data.shipping) ? data.shipping : [];
    const o = orders.find(x => String(x.orderId || '') === String(orderId));
    if (!o) return null;
    const body =
      rowKV('ผู้รับ', (o.fullName || '-') + (o.studentId ? ' (' + o.studentId + ')' : '')) +
      rowKV('เลขใบเสร็จ', o.receiptNo || o.orderId || '-') +
      rowKV('เบอร์โทร', o.phoneNumber || '-') +
      rowKV('ที่อยู่จัดส่ง', o.address || '-') +
      rowKV('รายการตำรา', o.books || o.itemName || '-') +
      rowKV('Tracking', o.trackingNumber || '-') +
      rowKV('สถานะ', o.status || '-');
    return buildShell('📦 พัสดุ ' + esc(o.receiptNo || orderId), o.status || 'จัดส่ง', body);
  }

  function resolveTarget(targetEl) {
    if (!targetEl || !targetEl.closest) return null;
    const data = getData();

    // 1. Course code pill across system
    const pill = targetEl.closest('.oca-course-code-pill');
    if (pill) {
      const code = (pill.textContent || '').trim();
      const html = buildCoursePreview(code, data);
      if (html) return { trigger: pill, html };
    }

    // 2. Search students table (#tbodySearchStudents)
    const stCell = targetEl.closest('#tbodySearchStudents td:nth-child(1), #tbodySearchStudents td:nth-child(2), #tbodySearchStudents .oca-action-btn--view');
    if (stCell) {
      const tr = stCell.closest('tr');
      const viewBtn = tr && tr.querySelector('.oca-action-btn--view');
      const oc = viewBtn ? String(viewBtn.getAttribute('onclick') || '') : '';
      const m = oc.match(/viewStudentDetailFromSearch\(['"]([^'"]+)['"]\)/);
      const sid = m ? m[1] : (tr && tr.cells[0] ? tr.cells[0].textContent.trim().split(/\s+/)[0] : '');
      const html = sid ? buildStudentPreview(sid, data) : null;
      if (html) return { trigger: stCell, html };
    }

    // 3. Receipts history table (#tbodyReceiptsHistory)
    const rcCell = targetEl.closest('#tbodyReceiptsHistory td:first-child, #tbodyReceiptsHistory .oca-rcpt-act-view');
    if (rcCell) {
      const tr = rcCell.closest('tr');
      const viewBtn = tr && tr.querySelector('.oca-rcpt-act-view');
      const oc = viewBtn ? String(viewBtn.getAttribute('onclick') || '') : '';
      const m = oc.match(/openReceiptDetailViewer\(['"]([^'"]+)['"]/);
      const rcNo = m ? m[1] : (tr && tr.cells[0] ? tr.cells[0].textContent.trim().split(/\s+/)[0] : '');
      const html = rcNo ? buildReceiptPreview(rcNo, data) : null;
      if (html) return { trigger: rcCell, html };
    }

    // 4. Courses management table (#tbodyCourses)
    const cCell = targetEl.closest('#tbodyCourses td:nth-child(1), #tbodyCourses td:nth-child(2)');
    if (cCell) {
      const tr = cCell.closest('tr');
      const badge = tr && tr.querySelector('.oca-mono-code-badge');
      const code = badge ? badge.textContent.trim() : '';
      const html = code ? buildCourseScheduleMatrixPreview(code, data) : null;
      if (html) return { trigger: cCell, html };
    }

    // 5. Shipping orders table (#tbodyShippingOrders)
    const shCell = targetEl.closest('#tbodyShippingOrders td:nth-child(3), #tbodyShippingOrders td:nth-child(4), #tbodyShippingOrders td:nth-child(5), #tbodyShippingOrders .oca-shipping-status-badge');
    if (shCell) {
      const tr = shCell.closest('tr');
      const chk = tr && tr.querySelector('.chk-ship-item');
      const orderId = chk ? chk.value : '';
      const html = orderId ? buildShippingPreview(orderId, data) : null;
      if (html) return { trigger: shCell, html };
    }

    return null;
  }

  function show(triggerEl, html) {
    if (!triggerEl || !html) return;
    if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }
    const pop = getOrCreatePopover();
    pop.innerHTML = html;
    pop.style.visibility = 'hidden';
    pop.style.display = 'block';
    const rect = triggerEl.getBoundingClientRect();
    const popRect = pop.getBoundingClientRect();
    const popW = Math.min(Math.max(popRect.width || 340, 300), Math.min(480, window.innerWidth - 24));
    const popH = Math.min(popRect.height || 220, 380);
    pop.style.width = popW + 'px';
    let left = rect.left;
    if (left + popW > window.innerWidth - 12) left = Math.max(12, window.innerWidth - popW - 12);
    if (left < 12) left = 12;
    let top = rect.bottom + 8;
    if (top + popH > window.innerHeight - 12) {
      const aboveTop = rect.top - popH - 8;
      top = aboveTop >= 12 ? aboveTop : Math.max(12, window.innerHeight - popH - 12);
    }
    pop.style.left = Math.round(left) + 'px';
    pop.style.top = Math.round(top) + 'px';
    pop.style.visibility = 'visible';
    _activeTrigger = triggerEl;
  }

  document.addEventListener('mouseover', (ev) => {
    const p = document.getElementById(POPOVER_ID);
    if (p && p.contains(ev.target)) return;
    const res = resolveTarget(ev.target);
    if (!res) return;
    if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }
    if (_activeTrigger === res.trigger && p && p.style.display !== 'none') return;
    if (_openTimer) clearTimeout(_openTimer);
    _openTimer = setTimeout(() => {
      show(res.trigger, res.html);
    }, 180);
  });

  document.addEventListener('mouseout', (ev) => {
    const p = document.getElementById(POPOVER_ID);
    if (!p || p.style.display === 'none') {
      if (_openTimer) { clearTimeout(_openTimer); _openTimer = null; }
      return;
    }
    if (ev && ev.buttons > 0) return;
    const rel = ev.relatedTarget;
    if (rel && (p.contains(rel) || (_activeTrigger && _activeTrigger.contains && _activeTrigger.contains(rel)))) return;
    scheduleHide();
  });

  global.OcaHoverPopover = { show, hide, resolveTarget };
})(window);
