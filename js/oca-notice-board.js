/**
 * OCA Connected Notice Board Engine (v358)
 * Shared Producer (Staff Portal) -> Consumer (Student Portal) module.
 * Persists atomic rows in `fee_settings` (VARCHAR(100) safe) and broadcasts
 * live updates over Supabase Realtime (`oca_student_notices`), sorted newest -> oldest.
 */
(function (global) {
  'use strict';

  const NOTICE_PREFIX = 'student_notice:';
  const NOTICE_BODY_PREFIX = 'student_notice_b:';
  const NOTICE_META_PREFIX = 'student_notice_m:';
  const REALTIME_CHANNEL = 'oca_student_notices';
  const MAX_CHUNKS = 6;
  const CHUNK_LEN = 85;

  function sanitizeHttpUrl(raw) {
    let s = String(raw || '').trim();
    if (!s) return '';
    if (/^(javascript|data|vbscript):/i.test(s)) return '';
    if (!/^https?:\/\//i.test(s) && s.includes('.')) {
      s = 'https://' + s;
    }
    return /^https?:\/\/[^\s"'<>]+$/i.test(s) ? s : '';
  }

  function resolveNoticeStorageUrl(sb, relPath) {
    const p = String(relPath || '').trim();
    if (!p) return '';
    if (/^https?:\/\//i.test(p)) return p;
    let bucket = 'student-photos';
    let clean = p.replace(/^\/+/, '');
    if (/^payment-slips\//i.test(clean)) {
      bucket = 'payment-slips';
      clean = clean.replace(/^payment-slips\//i, '');
    } else if (/^student-photos\//i.test(clean)) {
      bucket = 'student-photos';
      clean = clean.replace(/^student-photos\//i, '');
    }
    if (sb && sb.storage && typeof sb.storage.from === 'function') {
      const pub = sb.storage.from(bucket).getPublicUrl(clean);
      if (pub && pub.data && pub.data.publicUrl) return pub.data.publicUrl;
    }
    return '';
  }

  const CATEGORIES = Object.freeze({
    GENERAL: { th: 'ประกาศทั่วไป', en: 'General', zh: '综合公告', bg: '#E0F2FE', fg: '#0369A1' },
    URGENT: { th: 'ประกาศด่วน', en: 'Urgent', zh: '紧急通知', bg: '#FEE2E2', fg: '#991B1B' },
    ACADEMIC: { th: 'วิชาการ / สมัครเรียน', en: 'Academic', zh: '教务 / 报名', bg: '#DCFCE7', fg: '#166534' },
    SCHEDULE: { th: 'ตารางเรียน / วันหยุด', en: 'Schedule', zh: '课表 / 假期', bg: '#FEF3C7', fg: '#92400E' }
  });

  function escHtml(v) {
    if (typeof global.escapeHtml === 'function') return global.escapeHtml(v);
    return String(v === undefined || v === null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function todayIso() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function chunkBody(text) {
    const clean = String(text || '').trim();
    if (!clean) return [];
    const out = [];
    for (let i = 0; i < clean.length && out.length < MAX_CHUNKS; i += CHUNK_LEN) {
      out.push(clean.slice(i, i + CHUNK_LEN));
    }
    return out;
  }

  async function fetchNotices(sb, opts) {
    const options = opts || {};
    if (!sb) return [];
    const { data, error } = await sb
      .from('fee_settings')
      .select('key,name,amount,mode,start_date,end_date,updated_at')
      .like('key', 'student_notice%');
    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    const map = new Map();
    const bodyMap = new Map();
    const metaMap = new Map();

    rows.forEach((r) => {
      const k = String(r.key || '');
      if (k.startsWith(NOTICE_PREFIX)) {
        const id = k.slice(NOTICE_PREFIX.length);
        if (!id) return;
        map.set(id, {
          id,
          title: String(r.name || '').trim(),
          pinned: Number(r.amount || 0) === 1,
          category: CATEGORIES[String(r.mode || '').toUpperCase()] ? String(r.mode).toUpperCase() : 'GENERAL',
          start_date: r.start_date || '',
          end_date: r.end_date || '',
          updated_at: r.updated_at || '',
          body: '',
          imagePath: '',
          imageUrl: '',
          docPath: '',
          docName: '',
          docUrl: '',
          linkUrl: ''
        });
      } else if (k.startsWith(NOTICE_BODY_PREFIX)) {
        const rest = k.slice(NOTICE_BODY_PREFIX.length);
        const parts = rest.split(':');
        if (parts.length >= 2) {
          const id = parts[0];
          const idx = Number(parts[1] || 0);
          if (!bodyMap.has(id)) bodyMap.set(id, []);
          bodyMap.get(id).push({ idx, text: String(r.name || '') });
        }
      } else if (k.startsWith(NOTICE_META_PREFIX)) {
        const rest = k.slice(NOTICE_META_PREFIX.length);
        const parts = rest.split(':');
        if (parts.length >= 2) {
          const id = parts[0];
          if (!metaMap.has(id)) metaMap.set(id, { img: '', doc: '', docn: '', urls: [] });
          const entry = metaMap.get(id);
          const kind = parts[1];
          if (kind === 'img') entry.img = String(r.name || '');
          else if (kind === 'doc') entry.doc = String(r.name || '');
          else if (kind === 'docn') entry.docn = String(r.name || '');
          else if (kind === 'url') entry.urls.push({ idx: Number(parts[2] || 0), text: String(r.name || '') });
        }
      }
    });

    const today = todayIso();
    const nowMs = Date.now();
    const list = [];

    map.forEach((item, id) => {
      const chunks = (bodyMap.get(id) || []).sort((a, b) => a.idx - b.idx);
      item.body = chunks.map((c) => c.text).join('');
      const meta = metaMap.get(id);
      if (meta) {
        item.imagePath = meta.img || '';
        item.imageUrl = resolveNoticeStorageUrl(sb, meta.img);
        item.docPath = meta.doc || '';
        item.docName = meta.docn || (meta.doc ? meta.doc.split('/').pop() : '');
        item.docUrl = resolveNoticeStorageUrl(sb, meta.doc);
        const rawUrl = (meta.urls || []).sort((a, b) => a.idx - b.idx).map(u => u.text).join('');
        item.linkUrl = sanitizeHttpUrl(rawUrl);
      }
      const expired = Boolean(item.end_date && item.end_date < today);
      const notStarted = Boolean(item.start_date && item.start_date > today);
      item.isExpired = expired;
      item.isScheduled = notStarted;
      const numId = Number(id);
      const createdMs = Number.isFinite(numId) && numId > 1e11 ? numId : (Date.parse(item.updated_at) || 0);
      item.createdMs = createdMs;
      item.isNew = createdMs > 0 && (nowMs - createdMs) <= (3 * 86400 * 1000);
      if (!options.includeExpired && (expired || notStarted)) return;
      list.push(item);
    });

    list.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (b.createdMs !== a.createdMs) return b.createdMs - a.createdMs;
      return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
    });

    return list;
  }

  let _onNoticeUpdateCb = null;

  async function broadcastNoticeChange(sb, id) {
    if (!sb || typeof sb.channel !== 'function') return;
    try {
      const existing = global._activeOcaNoticeChannel;
      if (existing && existing.state === 'joined' && typeof existing.send === 'function') {
        await existing.send({
          type: 'broadcast',
          event: 'notices_updated',
          payload: { id: String(id || ''), ts: Date.now() }
        });
        return;
      }
      const ch = sb.channel(REALTIME_CHANNEL);
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          ch.send({
            type: 'broadcast',
            event: 'notices_updated',
            payload: { id: String(id || ''), ts: Date.now() }
          }).finally(() => {
            setTimeout(() => {
              if (typeof sb.removeChannel === 'function' && ch.state === 'joined') {
                sb.removeChannel(ch);
              }
            }, 400);
          });
        }
      });
    } catch (_) {}
  }

  function getActiveStaffSession() {
    try {
      if (typeof global.getSavedCurrentUser === 'function') {
        const u = global.getSavedCurrentUser();
        if (u && (u.username || u.role)) return u;
      }
    } catch (_) {}
    if (global.currentUser && (global.currentUser.username || global.currentUser.role)) {
      return global.currentUser;
    }
    if (global.currentStaffUser || global.currentStaffRole) {
      return {
        username: global.currentStaffUser || '',
        fullName: global.currentStaffName || global.currentStaffUser || '',
        role: global.currentStaffRole || ''
      };
    }
    return null;
  }

  async function writeAudit(sb, action, detail) {
    if (!sb) return;
    try {
      const staff = getActiveStaffSession();
      const actor = String((staff && (staff.username || staff.fullName || staff.full_name)) || 'STAFF').slice(0, 60);
      const actorName = String((staff && (staff.fullName || staff.full_name || staff.username)) || actor).slice(0, 80);
      const actorRole = String((staff && staff.role) || 'STAFF').slice(0, 30);
      const devId = (typeof global.getOrCreateDeviceId === 'function') ? global.getOrCreateDeviceId() : 'STAFF_WEBAPP';
      const { error } = await sb.from('security_audit_logs').insert([{
        action: action,
        username: actor,
        full_name: actorName,
        role: actorRole,
        device_id: devId,
        details: String(detail || '').slice(0, 240),
        status: 'SUCCESS',
        created_at: new Date().toISOString()
      }]);
      if (error) console.warn('[OcaNoticeBoard] audit log warning:', error.message || error);
    } catch (_) {}
  }

  async function saveNotice(sb, payload) {
    if (!sb) throw new Error('Supabase client not initialized');
    const title = String(payload?.title || '').trim().slice(0, 90);
    if (!title) throw new Error('กรุณากรอกหัวข้อประกาศ');
    const id = String(payload?.id || Date.now()).replace(/[^0-9A-Za-z_-]/g, '');
    const category = CATEGORIES[String(payload?.category || '').toUpperCase()] ? String(payload.category).toUpperCase() : 'GENERAL';
    const pinned = payload?.pinned ? 1 : 0;
    const startDate = String(payload?.start_date || '').trim() || null;
    const endDate = String(payload?.end_date || '').trim() || null;
    if (startDate && endDate && endDate < startDate) {
      throw new Error('วันหมดอายุต้องไม่น้อยกว่าวันเริ่มแสดง');
    }
    const nowIso = new Date().toISOString();

    const { error: delBodyErr } = await sb
      .from('fee_settings')
      .delete()
      .like('key', NOTICE_BODY_PREFIX + id + ':%');
    if (delBodyErr) throw delBodyErr;

    const { error: delMetaErr } = await sb
      .from('fee_settings')
      .delete()
      .like('key', NOTICE_META_PREFIX + id + ':%');
    if (delMetaErr) throw delMetaErr;

    const rows = [{
      key: NOTICE_PREFIX + id,
      name: title,
      amount: pinned,
      mode: category,
      start_date: startDate,
      end_date: endDate,
      updated_at: nowIso
    }];

    const chunks = chunkBody(payload?.body || '');
    chunks.forEach((text, idx) => {
      rows.push({
        key: `${NOTICE_BODY_PREFIX}${id}:${String(idx).padStart(2, '0')}`,
        name: text.slice(0, 90),
        amount: idx,
        mode: 'BODY',
        start_date: null,
        end_date: null,
        updated_at: nowIso
      });
    });

    const imgPath = String(payload?.image_path || '').trim().slice(0, 90);
    if (imgPath) {
      rows.push({ key: `${NOTICE_META_PREFIX}${id}:img`, name: imgPath, amount: 1, mode: 'META_IMG', start_date: null, end_date: null, updated_at: nowIso });
    }
    const docPath = String(payload?.doc_path || '').trim().slice(0, 90);
    if (docPath) {
      rows.push({ key: `${NOTICE_META_PREFIX}${id}:doc`, name: docPath, amount: 1, mode: 'META_DOC', start_date: null, end_date: null, updated_at: nowIso });
      const docName = String(payload?.doc_name || '').trim().slice(0, 90);
      if (docName) rows.push({ key: `${NOTICE_META_PREFIX}${id}:docn`, name: docName, amount: 1, mode: 'META_DOCN', start_date: null, end_date: null, updated_at: nowIso });
    }
    const safeUrl = sanitizeHttpUrl(payload?.link_url || '');
    if (safeUrl) {
      for (let i = 0, uIdx = 0; i < safeUrl.length && uIdx < 6; i += CHUNK_LEN, uIdx++) {
        rows.push({
          key: `${NOTICE_META_PREFIX}${id}:url:${String(uIdx).padStart(2, '0')}`,
          name: safeUrl.slice(i, i + CHUNK_LEN),
          amount: uIdx,
          mode: 'META_URL',
          start_date: null,
          end_date: null,
          updated_at: nowIso
        });
      }
    }

    const { error: upErr } = await sb.from('fee_settings').upsert(rows, { onConflict: 'key' });
    if (upErr) throw upErr;

    await writeAudit(sb, 'NOTICE_BOARD_SAVE', `${id} | ${title}`);
    await broadcastNoticeChange(sb, id);
    return id;
  }

  async function deleteNotice(sb, id) {
    if (!sb || !id) return;
    const cleanId = String(id).trim();
    const { error: delHeadErr } = await sb
      .from('fee_settings')
      .delete()
      .eq('key', NOTICE_PREFIX + cleanId);
    if (delHeadErr) throw delHeadErr;

    const { error: delBodyErr } = await sb
      .from('fee_settings')
      .delete()
      .like('key', NOTICE_BODY_PREFIX + cleanId + ':%');
    if (delBodyErr) throw delBodyErr;

    const { error: delMetaErr } = await sb
      .from('fee_settings')
      .delete()
      .like('key', NOTICE_META_PREFIX + cleanId + ':%');
    if (delMetaErr) throw delMetaErr;

    await writeAudit(sb, 'NOTICE_BOARD_DELETE', cleanId);
    await broadcastNoticeChange(sb, cleanId);
  }

  function subscribeNotices(sb, onUpdate) {
    if (!sb || typeof sb.channel !== 'function' || typeof onUpdate !== 'function') return null;
    _onNoticeUpdateCb = onUpdate;
    const existing = global._activeOcaNoticeChannel;
    if (existing && (existing.state === 'joined' || existing.state === 'joining')) {
      return existing;
    }
    const ch = sb
      .channel(REALTIME_CHANNEL)
      .on('broadcast', { event: 'notices_updated' }, () => {
        if (typeof _onNoticeUpdateCb === 'function') _onNoticeUpdateCb();
      })
      .subscribe();
    global._activeOcaNoticeChannel = ch;
    return ch;
  }

  let _staffCache = [];

  function ensureStaffModal() {
    let modal = document.getElementById('modalOcaNoticeManager');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'modalOcaNoticeManager';
    modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:100020;background:rgba(2,44,34,0.72);backdrop-filter:blur(4px);align-items:center;justify-content:center;padding:16px;';
    modal.innerHTML = `
      <div style="width:100%;max-width:780px;max-height:92vh;overflow-y:auto;background:#FFFFFF;color:#0F172A;border-radius:18px;border:1.5px solid #D4AF37;box-shadow:0 24px 60px rgba(0,0,0,0.35);">
        <div style="background:linear-gradient(135deg,#022C22 0%,#064E3B 100%);color:#FFFFFF;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #D4AF37;position:sticky;top:0;z-index:5;">
          <div>
            <div style="font-size:16px;font-weight:800;color:#FDE68A;"><i class="fa-solid fa-bullhorn"></i> จัดการบอร์ดประชาสัมพันธ์นักศึกษา</div>
            <div style="font-size:12px;color:#A7F3D0;">ข่าวที่บันทึกจะซิงก์ไปหน้าแรก Student WebApp ทันที</div>
          </div>
          <button type="button" onclick="OcaNoticeBoard.closeStaffManagerModal()" style="background:rgba(255,255,255,0.16);color:#FFFFFF;border:1px solid rgba(255,255,255,0.35);border-radius:8px;width:34px;height:34px;cursor:pointer;font-weight:800;"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div style="padding:18px 20px;display:flex;flex-direction:column;gap:16px;">
          <form id="formOcaNoticeSave" onsubmit="OcaNoticeBoard.submitStaffNotice(event)" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;padding:14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;">
            <input type="hidden" id="inpNoticeEditId" value="" />
            <div style="grid-column:1 / -1;">
              <label for="inpNoticeTitle" style="display:block;font-size:12.5px;font-weight:700;color:#0F172A;margin-bottom:4px;">หัวข้อประกาศ * (สูงสุด 90 ตัวอักษร)</label>
              <input id="inpNoticeTitle" type="text" maxlength="90" required placeholder="เช่น เปิดรับสมัครเรียนภาคเรียนใหม่ หรือ แจ้งวันหยุดสถาบัน" style="width:100%;padding:9px 11px;border-radius:9px;border:1.5px solid #CBD5E1;background:#FFFFFF;color:#0F172A;font-size:13.5px;box-sizing:border-box;" />
            </div>
            <div>
              <label for="selNoticeCategory" style="display:block;font-size:12.5px;font-weight:700;color:#0F172A;margin-bottom:4px;">หมวดหมู่</label>
              <select id="selNoticeCategory" style="width:100%;padding:9px 11px;border-radius:9px;border:1.5px solid #CBD5E1;background:#FFFFFF;color:#0F172A;font-size:13px;">
                <option value="GENERAL">ประกาศทั่วไป</option>
                <option value="URGENT">ประกาศด่วน</option>
                <option value="ACADEMIC">วิชาการ / สมัครเรียน</option>
                <option value="SCHEDULE">ตารางเรียน / วันหยุด</option>
              </select>
            </div>
            <div>
              <label for="selNoticeDuration" style="display:block;font-size:12.5px;font-weight:700;color:#0F172A;margin-bottom:4px;">ระยะเวลาประชาสัมพันธ์</label>
              <select id="selNoticeDuration" onchange="OcaNoticeBoard.onDurationPresetChange()" style="width:100%;padding:9px 11px;border-radius:9px;border:1.5px solid #CBD5E1;background:#FFFFFF;color:#0F172A;font-size:13px;">
                <option value="30" selected>30 วัน (ค่าเริ่มต้น)</option>
                <option value="7">7 วัน</option>
                <option value="14">14 วัน</option>
                <option value="60">60 วัน</option>
                <option value="custom">กำหนดวันเอง</option>
                <option value="forever">ไม่จำกัดวัน</option>
              </select>
            </div>
            <div>
              <label for="inpNoticeStart" style="display:block;font-size:12.5px;font-weight:700;color:#0F172A;margin-bottom:4px;">วันเริ่มแสดง</label>
              <input id="inpNoticeStart" type="date" oninput="OcaNoticeBoard.onManualDateChange()" style="width:100%;padding:8px 10px;border-radius:9px;border:1.5px solid #CBD5E1;background:#FFFFFF;color:#0F172A;font-size:13px;box-sizing:border-box;" />
            </div>
            <div>
              <label for="inpNoticeEnd" style="display:block;font-size:12.5px;font-weight:700;color:#0F172A;margin-bottom:4px;">วันหมดอายุ</label>
              <input id="inpNoticeEnd" type="date" oninput="OcaNoticeBoard.onManualDateChange()" style="width:100%;padding:8px 10px;border-radius:9px;border:1.5px solid #CBD5E1;background:#FFFFFF;color:#0F172A;font-size:13px;box-sizing:border-box;" />
            </div>
            <div style="grid-column:1 / -1;">
              <label for="inpNoticeBody" style="display:block;font-size:12.5px;font-weight:700;color:#0F172A;margin-bottom:4px;">รายละเอียดประกาศ (สูงสุด 500 ตัวอักษร)</label>
              <textarea id="inpNoticeBody" rows="3" maxlength="500" placeholder="รายละเอียดเพิ่มเติมสำหรับนักศึกษา..." style="width:100%;padding:9px 11px;border-radius:9px;border:1.5px solid #CBD5E1;background:#FFFFFF;color:#0F172A;font-size:13px;box-sizing:border-box;"></textarea>
            </div>
            <div style="grid-column:1 / -1;">
              <label for="inpNoticeLink" style="display:block;font-size:12.5px;font-weight:700;color:#0F172A;margin-bottom:4px;"><i class="fa-solid fa-link"></i> แนบลิงก์ภายนอก (ไม่บังคับ)</label>
              <input id="inpNoticeLink" type="text" placeholder="https://..." style="width:100%;padding:8px 10px;border-radius:9px;border:1.5px solid #CBD5E1;background:#FFFFFF;color:#0F172A;font-size:13px;box-sizing:border-box;" />
            </div>
            <div>
              <label for="inpNoticeImageFile" style="display:block;font-size:12.5px;font-weight:700;color:#0F172A;margin-bottom:4px;"><i class="fa-regular fa-image"></i> แนบรูปภาพประกอบ (≤ 5MB)</label>
              <input id="inpNoticeImageFile" type="file" accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif,.jfif" style="width:100%;font-size:12px;" />
              <div style="font-size:11px;color:#475569;margin-top:3px;line-height:1.35;">หมายเหตุ: รองรับรูปภาพมาตรฐานทุกนามสกุล (JPG, PNG, WEBP, GIF, BMP, AVIF) ขนาด ≤ 5 MB (ปรับเป็น JPEG อัตโนมัติ)</div>
              <input type="hidden" id="inpNoticeImagePath" value="" />
              <div id="lblNoticeImageState" style="font-size:11px;color:#047857;margin-top:2px;"></div>
            </div>
            <div>
              <label for="inpNoticeDocFile" style="display:block;font-size:12.5px;font-weight:700;color:#0F172A;margin-bottom:4px;"><i class="fa-regular fa-file-pdf"></i> แนบไฟล์เอกสารมาตรฐาน (≤ 10MB)</label>
              <input id="inpNoticeDocFile" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.rtf,.odt,.ods,.odp,.zip" style="width:100%;font-size:12px;" />
              <div style="font-size:11px;color:#475569;margin-top:3px;line-height:1.35;">หมายเหตุ: รองรับเอกสารมาตรฐาน (PDF, Word, Excel, PowerPoint, CSV, TXT, RTF, ODT/ODS/ODP, ZIP) ขนาด ≤ 10 MB</div>
              <input type="hidden" id="inpNoticeDocPath" value="" />
              <input type="hidden" id="inpNoticeDocName" value="" />
              <div id="lblNoticeDocState" style="font-size:11px;color:#0369A1;margin-top:2px;"></div>
            </div>
            <div style="grid-column:1 / -1;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
              <label style="display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:700;color:#0F172A;cursor:pointer;">
                <input id="chkNoticePinned" type="checkbox" style="width:16px;height:16px;" />
                ปักหมุดไว้บนสุด (Pin to Top)
              </label>
              <div style="display:flex;gap:8px;">
                <button type="button" onclick="OcaNoticeBoard.resetStaffForm()" style="padding:8px 14px;border-radius:9px;border:1px solid #CBD5E1;background:#FFFFFF;color:#0F172A;font-weight:700;font-size:13px;cursor:pointer;">ล้างฟอร์ม</button>
                <button type="submit" id="btnSubmitOcaNotice" style="padding:9px 18px;border-radius:9px;border:none;background:#047857;color:#FFFFFF;font-weight:800;font-size:13.5px;cursor:pointer;"><i class="fa-solid fa-paper-plane"></i> เผยแพร่ประกาศ</button>
              </div>
            </div>
          </form>
          <div>
            <div style="font-size:14px;font-weight:800;color:#0F172A;margin-bottom:8px;">รายการประกาศทั้งหมด</div>
            <div id="boxStaffNoticeList" style="display:flex;flex-direction:column;gap:8px;max-height:300px;overflow-y:auto;"></div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    return modal;
  }

  function addDaysIso(baseIso, days) {
    const parts = String(baseIso || todayIso()).split('-').map(Number);
    const dt = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
    dt.setDate(dt.getDate() + Number(days || 0));
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }

  function formatThaiShortDate(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return '';
    return `${m[3]}/${m[2]}/${Number(m[1]) + 543}`;
  }

  function onDurationPresetChange() {
    const dur = document.getElementById('selNoticeDuration')?.value || '30';
    const startEl = document.getElementById('inpNoticeStart');
    const endEl = document.getElementById('inpNoticeEnd');
    if (!startEl || !endEl) return;
    if (dur === 'forever') {
      if (!startEl.value) startEl.value = todayIso();
      endEl.value = '';
      return;
    }
    if (dur === 'custom') return;
    const days = Number(dur);
    if (Number.isFinite(days) && days > 0) {
      const base = startEl.value || todayIso();
      startEl.value = base;
      endEl.value = addDaysIso(base, days);
    }
  }

  function onManualDateChange() {
    const sel = document.getElementById('selNoticeDuration');
    if (sel) sel.value = 'custom';
  }

  function applyDefaultNoticeDates() {
    const sel = document.getElementById('selNoticeDuration');
    const startEl = document.getElementById('inpNoticeStart');
    const endEl = document.getElementById('inpNoticeEnd');
    if (sel) sel.value = '30';
    if (startEl) startEl.value = todayIso();
    if (endEl) endEl.value = addDaysIso(todayIso(), 30);
  }

  function resetStaffForm() {
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    setVal('inpNoticeEditId', '');
    setVal('inpNoticeTitle', '');
    setVal('selNoticeCategory', 'GENERAL');
    setVal('inpNoticeBody', '');
    setVal('inpNoticeLink', '');
    setVal('inpNoticeImageFile', '');
    setVal('inpNoticeImagePath', '');
    setVal('inpNoticeDocFile', '');
    setVal('inpNoticeDocPath', '');
    setVal('inpNoticeDocName', '');
    const imgLbl = document.getElementById('lblNoticeImageState'); if (imgLbl) imgLbl.textContent = '';
    const docLbl = document.getElementById('lblNoticeDocState'); if (docLbl) docLbl.textContent = '';
    const chk = document.getElementById('chkNoticePinned');
    if (chk) chk.checked = false;
    applyDefaultNoticeDates();
  }

  function editStaffNotice(id) {
    const item = _staffCache.find((x) => x.id === String(id));
    if (!item) return;
    document.getElementById('inpNoticeEditId').value = item.id;
    document.getElementById('inpNoticeTitle').value = item.title;
    document.getElementById('selNoticeCategory').value = item.category;
    document.getElementById('inpNoticeStart').value = item.start_date || '';
    document.getElementById('inpNoticeEnd').value = item.end_date || '';
    const sel = document.getElementById('selNoticeDuration');
    if (sel) sel.value = item.end_date ? 'custom' : 'forever';
    document.getElementById('inpNoticeBody').value = item.body || '';
    document.getElementById('inpNoticeLink').value = item.linkUrl || '';
    document.getElementById('inpNoticeImagePath').value = item.imagePath || '';
    document.getElementById('inpNoticeDocPath').value = item.docPath || '';
    document.getElementById('inpNoticeDocName').value = item.docName || '';
    const imgLbl = document.getElementById('lblNoticeImageState');
    if (imgLbl) imgLbl.textContent = item.imagePath ? 'มีรูปภาพแนบแล้ว' : '';
    const docLbl = document.getElementById('lblNoticeDocState');
    if (docLbl) docLbl.textContent = item.docName ? ('ไฟล์เดิม: ' + item.docName) : '';
    document.getElementById('chkNoticePinned').checked = Boolean(item.pinned);
  }

  async function refreshStaffNoticeList() {
    const box = document.getElementById('boxStaffNoticeList');
    if (!box) return;
    box.innerHTML = '<div style="font-size:13px;color:#64748B;padding:10px;">กำลังโหลดประกาศ...</div>';
    try {
      _staffCache = await fetchNotices(global._supabase, { includeExpired: true });
      if (!_staffCache.length) {
        box.innerHTML = '<div style="font-size:13px;color:#64748B;padding:14px;text-align:center;border:1px dashed #CBD5E1;border-radius:10px;">ยังไม่มีประกาศในระบบ สามารถสร้างประกาศแรกด้านบนได้เลย</div>';
        return;
      }
      const today = todayIso();
      box.innerHTML = _staffCache.map((n) => {
        const cat = CATEGORIES[n.category] || CATEGORIES.GENERAL;
        const dtStr = n.createdMs ? new Date(n.createdMs).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
        let statusBadge = '<span style="background:#DCFCE7;color:#166534;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;">กำลังแสดง</span>';
        if (n.isExpired) {
          statusBadge = '<span style="background:#FEE2E2;color:#991B1B;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;">หมดอายุแล้ว</span>';
        } else if (n.isScheduled) {
          statusBadge = '<span style="background:#DBEAFE;color:#1E40AF;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;">รอถึงวันเริ่มแสดง</span>';
        } else if (n.end_date) {
          const daysLeft = Math.max(0, Math.round((Date.parse(n.end_date) - Date.parse(today)) / 86400000));
          statusBadge = `<span style="background:#DCFCE7;color:#166534;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;">กำลังแสดง (เหลือ ${daysLeft} วัน)</span>`;
        }
        const rangeTxt = (n.start_date || n.end_date)
          ? `ระยะเวลา: ${n.start_date ? formatThaiShortDate(n.start_date) : 'ทันที'} – ${n.end_date ? formatThaiShortDate(n.end_date) : 'ไม่มีกำหนด'}`
          : 'ระยะเวลา: ไม่จำกัดวัน';
        const mediaBadges = [
          n.imageUrl ? '<span style="background:#ECFDF5;color:#065F46;font-size:10.5px;font-weight:700;padding:1px 6px;border-radius:999px;"><i class="fa-regular fa-image"></i> รูปภาพ</span>' : '',
          n.linkUrl ? '<span style="background:#EFF6FF;color:#1D4ED8;font-size:10.5px;font-weight:700;padding:1px 6px;border-radius:999px;"><i class="fa-solid fa-link"></i> ลิงก์</span>' : '',
          n.docUrl ? '<span style="background:#FEF3C7;color:#92400E;font-size:10.5px;font-weight:700;padding:1px 6px;border-radius:999px;"><i class="fa-regular fa-file-pdf"></i> เอกสาร</span>' : ''
        ].filter(Boolean).join(' ');
        return `
          <div style="border:1px solid #E2E8F0;border-radius:12px;padding:11px 13px;background:#FFFFFF;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
            <div style="min-width:0;flex:1;">
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px;">
                ${n.pinned ? '<span style="background:#FEF3C7;color:#92400E;font-size:11px;font-weight:800;padding:2px 7px;border-radius:999px;"><i class="fa-solid fa-thumbtack"></i> ปักหมุด</span>' : ''}
                <span style="background:${cat.bg};color:${cat.fg};font-size:11px;font-weight:800;padding:2px 8px;border-radius:999px;">${escHtml(cat.th)}</span>
                ${statusBadge}
                ${mediaBadges}
                <span style="font-size:11.5px;color:#64748B;">${escHtml(dtStr)}</span>
              </div>
              <div style="font-size:14px;font-weight:800;color:#0F172A;">${escHtml(n.title)}</div>
              <div style="font-size:11.5px;color:#0369A1;font-weight:600;margin-top:2px;"><i class="fa-regular fa-calendar"></i> ${escHtml(rangeTxt)}</div>
              ${n.body ? `<div style="font-size:12.5px;color:#475569;margin-top:3px;white-space:pre-line;">${escHtml(n.body)}</div>` : ''}
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0;">
              <button type="button" onclick="OcaNoticeBoard.editStaffNotice('${escHtml(n.id)}')" style="padding:6px 10px;border-radius:8px;border:1px solid #CBD5E1;background:#F8FAFC;color:#0F172A;font-size:12px;font-weight:700;cursor:pointer;">แก้ไข</button>
              <button type="button" onclick="OcaNoticeBoard.removeStaffNotice('${escHtml(n.id)}', this)" style="padding:6px 10px;border-radius:8px;border:1px solid #FCA5A5;background:#FEF2F2;color:#991B1B;font-size:12px;font-weight:700;cursor:pointer;">ลบ</button>
            </div>
          </div>`;
      }).join('');
    } catch (err) {
      box.innerHTML = `<div style="color:#991B1B;font-size:13px;padding:10px;">โหลดประกาศไม่สำเร็จ: ${escHtml(err.message || err)}</div>`;
    }
  }

  function convertImageFileToJpegBlob(file, maxDim = 1280) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          let w = img.naturalWidth || 1, h = img.naturalHeight || 1;
          if (w > maxDim || h > maxDim) {
            const scale = maxDim / Math.max(w, h);
            w = Math.max(1, Math.round(w * scale));
            h = Math.max(1, Math.round(h * scale));
          }
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          c.toBlob((blob) => {
            URL.revokeObjectURL(url);
            c.width = 0; c.height = 0;
            if (!blob) return reject(new Error('แปลงรูปภาพเป็น JPEG ไม่สำเร็จ'));
            resolve(blob);
          }, 'image/jpeg', 0.88);
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(err);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('ไม่สามารถอ่านไฟล์รูปภาพที่เลือกได้'));
      };
      img.src = url;
    });
  }

  async function uploadNoticeAttachment(sb, upPath, fileOrBlob, contentType) {
    const opts = { contentType: contentType || fileOrBlob?.type || 'image/jpeg', upsert: true };
    const { error: mainErr } = await sb.storage.from('student-photos').upload(upPath, fileOrBlob, opts);
    if (!mainErr) return 'student-photos/' + upPath;
    const msg = String(mainErr.message || mainErr.error || '');
    if (opts.contentType !== 'image/jpeg' && (msg.toLowerCase().includes('mime') || String(mainErr.statusCode || '') === '400')) {
      throw new Error('Bucket student-photos รองรับเฉพาะไฟล์ภาพ JPEG (สำหรับไฟล์ PDF/Office กรุณาอัปโหลดขึ้น Google Drive แล้วนำลิงก์มาวางในช่อง "แนบลิงก์ภายนอก")');
    }
    throw mainErr;
  }

  async function submitStaffNotice(ev) {
    ev.preventDefault();
    const btn = document.getElementById('btnSubmitOcaNotice');
    if (btn) btn.disabled = true;
    try {
      const sb = global._supabase;
      const editId = document.getElementById('inpNoticeEditId')?.value || '';
      const noticeId = String(editId || Date.now()).replace(/[^0-9A-Za-z_-]/g, '');
      let imagePath = document.getElementById('inpNoticeImagePath')?.value || '';
      let docPath = document.getElementById('inpNoticeDocPath')?.value || '';
      let docName = document.getElementById('inpNoticeDocName')?.value || '';

      const ALLOWED_IMG_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif', 'jfif'];
      const ALLOWED_DOC_EXTS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'txt', 'rtf', 'odt', 'ods', 'odp', 'zip'];

      const imgFile = document.getElementById('inpNoticeImageFile')?.files?.[0];
      if (imgFile) {
        const imgMime = String(imgFile.type || '').toLowerCase();
        const imgExt = (imgFile.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const isValidImg = (imgMime.startsWith('image/') && !imgMime.includes('svg')) || ALLOWED_IMG_EXTS.includes(imgExt);
        if (!isValidImg) {
          throw new Error('รองรับเฉพาะไฟล์รูปภาพมาตรฐาน (JPG, PNG, WEBP, GIF, BMP, AVIF)');
        }
        if (Number(imgFile.size || 0) > 5 * 1024 * 1024) throw new Error('ขนาดรูปภาพต้องไม่เกิน 5 MB');
        const jpegBlob = await convertImageFileToJpegBlob(imgFile, 1280);
        const upPath = `notice_img_${noticeId}_${Date.now()}.jpg`;
        imagePath = await uploadNoticeAttachment(sb, upPath, jpegBlob, 'image/jpeg');
      }

      const docFile = document.getElementById('inpNoticeDocFile')?.files?.[0];
      if (docFile) {
        if (Number(docFile.size || 0) > 10 * 1024 * 1024) throw new Error('ขนาดไฟล์เอกสารต้องไม่เกิน 10 MB');
        const ext = (docFile.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!ALLOWED_DOC_EXTS.includes(ext)) {
          throw new Error('รองรับเฉพาะไฟล์เอกสารมาตรฐาน (PDF, Word, Excel, PowerPoint, CSV, TXT, RTF, ODT/ODS/ODP, ZIP)');
        }
        const upPath = `notice_doc_${noticeId}_${Date.now()}.${ext}`;
        docPath = await uploadNoticeAttachment(sb, upPath, docFile, docFile.type || 'application/octet-stream');
        docName = String(docFile.name || '').slice(0, 90);
      }

      await saveNotice(sb, {
        id: noticeId,
        title: document.getElementById('inpNoticeTitle')?.value || '',
        category: document.getElementById('selNoticeCategory')?.value || 'GENERAL',
        start_date: document.getElementById('inpNoticeStart')?.value || '',
        end_date: document.getElementById('inpNoticeEnd')?.value || '',
        body: document.getElementById('inpNoticeBody')?.value || '',
        pinned: Boolean(document.getElementById('chkNoticePinned')?.checked),
        link_url: document.getElementById('inpNoticeLink')?.value || '',
        image_path: imagePath,
        doc_path: docPath,
        doc_name: docName
      });
      resetStaffForm();
      await refreshStaffNoticeList();
      if (typeof global.showToast === 'function') global.showToast('เผยแพร่ประกาศไปยังแอปนักศึกษาแล้ว');
    } catch (err) {
      alert('บันทึกประกาศไม่สำเร็จ: ' + (err.message || err));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  let _pendingDeleteId = '';
  let _pendingDeleteTimer = null;
  async function removeStaffNotice(id, btnEl) {
    const cleanId = String(id || '').trim();
    if (!cleanId) return;
    if (_pendingDeleteId !== cleanId) {
      _pendingDeleteId = cleanId;
      if (_pendingDeleteTimer) clearTimeout(_pendingDeleteTimer);
      if (btnEl) {
        btnEl.textContent = 'ยืนยันลบ?';
        btnEl.style.background = '#DC2626';
        btnEl.style.color = '#FFFFFF';
        btnEl.style.borderColor = '#B91C1C';
      }
      _pendingDeleteTimer = setTimeout(() => {
        if (_pendingDeleteId === cleanId) {
          _pendingDeleteId = '';
          if (btnEl) {
            btnEl.textContent = 'ลบ';
            btnEl.style.background = '#FEF2F2';
            btnEl.style.color = '#B91C1C';
            btnEl.style.borderColor = '#FCA5A5';
          }
        }
      }, 4000);
      return;
    }
    _pendingDeleteId = '';
    if (_pendingDeleteTimer) clearTimeout(_pendingDeleteTimer);
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'กำลังลบ...'; }
    try {
      await deleteNotice(global._supabase, cleanId);
      await refreshStaffNoticeList();
      if (typeof global.showToast === 'function') global.showToast('ลบประกาศเรียบร้อยแล้ว', 'success');
    } catch (err) {
      const box = document.getElementById('boxNoticeManagerList');
      if (box) box.insertAdjacentHTML('afterbegin', `<div style="padding:8px 10px;border-radius:8px;background:#FEF2F2;color:#991B1B;font-size:12px;font-weight:700;">ลบประกาศไม่สำเร็จ: ${escHtml(err.message || err)}</div>`);
    }
  }

  function openStaffManagerModal() {
    const staff = getActiveStaffSession();
    if (!staff) {
      alert('กรุณาเข้าสู่ระบบเจ้าหน้าที่ก่อนจัดการประกาศ');
      return;
    }
    if (typeof global.hasUserPermission === 'function' && !global.hasUserPermission('noticeBoard')) {
      if (typeof global.showToast === 'function') global.showToast('คุณไม่มีสิทธิ์เข้าถึงเมนูประชาสัมพันธ์สถาบัน', 'error');
      return;
    }
    const modal = ensureStaffModal();
    modal.style.display = 'flex';
    if (!document.getElementById('inpNoticeEditId')?.value) applyDefaultNoticeDates();
    refreshStaffNoticeList();
  }

  function closeStaffManagerModal() {
    const modal = document.getElementById('modalOcaNoticeManager');
    if (modal) modal.style.display = 'none';
  }

  global.OcaNoticeBoard = {
    CATEGORIES,
    fetchNotices,
    saveNotice,
    deleteNotice,
    subscribeNotices,
    openStaffManagerModal,
    closeStaffManagerModal,
    submitStaffNotice,
    editStaffNotice,
    removeStaffNotice,
    resetStaffForm,
    onDurationPresetChange,
    onManualDateChange
  };
})(window);
