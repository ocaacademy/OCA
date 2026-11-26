/**
 * OCA Student Web App Controller (v356)
 * Parallel Student Portal sharing the existing Supabase Pro Project.
 * Zero edits to index.html; isolated session key 'oca_student_session'.
 */
(function (global) {
  'use strict';

  const SUPABASE_URL = 'https://bapsvgjgexjhqnykilse.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_LLxdgD2RTMYpl8ygAK3v9w_vRAbqpWQ';
  const SESSION_KEY = 'oca_student_session';
  const LANG_KEY = 'oca_student_lang';

  const _sb = (global.supabase && typeof global.supabase.createClient === 'function')
    ? global.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;
  global._supabase = _sb;

  let _currentLang = localStorage.getItem(LANG_KEY) || 'th';
  let _student = null;
  let _needsDobSetup = false;
  let _courses = [];
  let _schedules = [];
  let _receipts = [];
  let _pendingSlips = [];
  let _creditAmount = 0;
  let _activeCat = 'ALL';
  let _checkoutCourse = null;
  let _pendingAiPhoto = null;
  let _deferredPwaPrompt = null;
  let _notifs = [];

  const I18N = {
    th: {
      hdrSub: 'ระบบนักศึกษาออนไลน์ (สมัครเรียน • ตารางเรียน • บัตรนักศึกษา)',
      installPwa: 'ติดตั้งแอป',
      logout: 'ออกจากระบบ',
      newBadge: '✨ สำหรับผู้ที่ยังไม่เคยมีรหัสนักศึกษา OCA',
      newHeroTitle: 'ลงทะเบียนนักศึกษาใหม่',
      newHeroDesc: 'กรอกประวัติส่วนตัวและวันเดือนปีเกิด ระบบจะออกรหัสนักศึกษาให้อัตโนมัติ แล้วพาเข้าสู่หน้าเลือกคอร์สเรียนและแนบสลิปได้ทันที',
      btnNewReg: 'ลงทะเบียนใหม่ (นักศึกษาใหม่)',
      loginTitle: 'เข้าสู่ระบบนักศึกษา',
      loginSub: 'สำหรับนักศึกษาปัจจุบัน: ต่อคอร์ส, ดูตารางเรียน, บัตรนักศึกษา และแก้ไขประวัติ',
      loginSid: 'รหัสนักศึกษา (7 หลัก)',
      loginSecret: 'วันเดือนปีเกิด (เช่น 15/05/2540) หรือรหัสเริ่มต้น 123456',
      btnLogin: 'เข้าสู่ระบบนักศึกษา',
      quickEnroll: 'เลือกคอร์ส / ต่อคอร์ส',
      tabHome: 'หน้าหลัก',
      tabEnroll: 'เลือกคอร์ส & แนบสลิป',
      tabCard: 'บัตรนักศึกษา',
      tabSchedule: 'ตารางเรียน',
      tabFinance: 'การเงิน & พัสดุ',
      tabProfile: 'ประวัติส่วนตัว & รูปโปรไฟล์'
    },
    en: {
      hdrSub: 'Student Self-Service Portal (Enroll • Schedule • Digital ID)',
      installPwa: 'Install App',
      logout: 'Sign Out',
      newBadge: '✨ For First-Time Applicants Without an OCA Student ID',
      newHeroTitle: 'New Student Registration',
      newHeroDesc: 'Fill in your profile & date of birth to receive your Student ID immediately and proceed straight to course enrollment.',
      btnNewReg: 'Register as New Student',
      loginTitle: 'Student Sign In',
      loginSub: 'For current students: renew courses, view schedule, digital ID & profile',
      loginSid: 'Student ID (7 digits)',
      loginSecret: 'Date of Birth (DD/MM/YYYY) or default 123456',
      btnLogin: 'Sign In',
      quickEnroll: 'Enroll / Renew Course',
      tabHome: 'Home',
      tabEnroll: 'Courses & Payment',
      tabCard: 'Student ID Card',
      tabSchedule: 'Schedule',
      tabFinance: 'Receipts & Shipping',
      tabProfile: 'Profile & AI Photo'
    },
    zh: {
      hdrSub: '东方文化书院学员在线门户（在线报名 • 课表 • 电子学生证）',
      installPwa: '安装应用',
      logout: '退出登录',
      newBadge: '✨ 适用于尚未拥有OCA学号的新学员',
      newHeroTitle: '新学员在线注册',
      newHeroDesc: '填写个人资料与出生日期即可自动生成学号，并立即进入选课与上传转账凭证页面。',
      btnNewReg: '新学员注册',
      loginTitle: '学员登录',
      loginSub: '老学员专用：续费选课、查看课表、电子学生证及修改个人资料',
      loginSid: '学号（7位数字）',
      loginSecret: '出生日期（如 15/05/1997）或初始密码 123456',
      btnLogin: '登录学员系统',
      quickEnroll: '选课 / 续费报名',
      tabHome: '首页',
      tabEnroll: '选课与缴费',
      tabCard: '电子学生证',
      tabSchedule: '我的课表',
      tabFinance: '收据与物流',
      tabProfile: '个人资料与AI证件照'
    }
  };

  function esc(v) {
    return String(v === undefined || v === null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showToast(msg) {
    const el = document.getElementById('stToast');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('st-hidden');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add('st-hidden'), 3800);
  }

  function normalizeDobIso(raw) {
    const clean = String(raw || '').trim();
    if (!clean) return '';
    let y = 0, m = 0, d = 0;
    let m1 = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    let m2 = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (m1) {
      y = Number(m1[1]); m = Number(m1[2]); d = Number(m1[3]);
    } else if (m2) {
      d = Number(m2[1]); m = Number(m2[2]); y = Number(m2[3]);
    } else {
      return '';
    }
    if (y >= 2400) y -= 543;
    if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900) return '';
    return String(y).padStart(4, '0') + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  function formatIsoToThaiDob(iso) {
    const norm = normalizeDobIso(iso);
    if (!norm) return '';
    const [y, m, d] = norm.split('-').map(Number);
    return String(d).padStart(2, '0') + '/' + String(m).padStart(2, '0') + '/' + String(y + 543);
  }

  function setLang(lang) {
    _currentLang = I18N[lang] ? lang : 'th';
    localStorage.setItem(LANG_KEY, _currentLang);
    const dict = I18N[_currentLang];
    document.querySelectorAll('.st-lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === _currentLang));
    const mapIds = {
      txtHdrSub: 'hdrSub', lblInstallPwa: 'installPwa', lblLogout: 'logout',
      lblNewBadge: 'newBadge', lblNewHeroTitle: 'newHeroTitle', lblNewHeroDesc: 'newHeroDesc',
      lblBtnNewReg: 'btnNewReg', lblLoginTitle: 'loginTitle', lblLoginSub: 'loginSub',
      lblLoginSid: 'loginSid', lblLoginSecret: 'loginSecret', lblBtnLogin: 'btnLogin',
      lblQuickEnroll: 'quickEnroll'
    };
    Object.entries(mapIds).forEach(([id, k]) => {
      const el = document.getElementById(id);
      if (el && dict[k]) el.textContent = dict[k];
    });
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const k = el.getAttribute('data-i18n');
      if (dict[k]) el.textContent = dict[k];
    });
  }

  function showOnlyView(viewId) {
    ['viewStudentAuth', 'viewStudentRegister', 'viewStudentApp'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('st-hidden', id !== viewId);
    });
    const logoutBtn = document.getElementById('btnStudentLogout');
    if (logoutBtn) logoutBtn.classList.toggle('st-hidden', viewId !== 'viewStudentApp');
    const bellBtn = document.getElementById('btnStudentNotifBell');
    if (bellBtn) bellBtn.classList.toggle('st-hidden', viewId !== 'viewStudentApp');
  }

  function openRegisterView() {
    showOnlyView('viewStudentRegister');
  }

  function backToLogin() {
    showOnlyView('viewStudentAuth');
  }

  async function resolveActiveYearTerm() {
    const nowYearBE = new Date().getFullYear() + 543;
    let yearBE = nowYearBE;
    let term = 1;
    if (!_sb) return { yearBE, term };
    try {
      const { data, error } = await _sb.from('fee_settings').select('name').eq('key', 'active_academic_term').maybeSingle();
      if (!error && data && data.name) {
        const parts = String(data.name).split(':');
        if (parts.length === 2 && Number(parts[0]) >= 2560 && Number(parts[1]) >= 1) {
          yearBE = Number(parts[0]);
          term = Number(parts[1]);
        }
      }
    } catch (_) {}
    return { yearBE, term };
  }

  async function handleLogin(ev) {
    ev.preventDefault();
    const sid = (document.getElementById('inpLoginSid')?.value || '').trim();
    const secret = (document.getElementById('inpLoginSecret')?.value || '').trim();
    const errEl = document.getElementById('lblLoginErr');
    const btn = document.getElementById('btnStudentLoginSubmit');
    if (errEl) errEl.classList.add('st-hidden');
    if (!_sb) return;
    if (btn) btn.disabled = true;
    try {
      let loggedStudent = null;
      let needsDob = false;
      const { data: rpcData, error: rpcErr } = await _sb.rpc('student_portal_login', { p_student_id: sid, p_secret: secret });
      if (!rpcErr && rpcData && typeof rpcData === 'object') {
        if (!rpcData.success) throw new Error(rpcData.message || 'เข้าสู่ระบบไม่สำเร็จ');
        loggedStudent = rpcData.student;
        needsDob = Boolean(rpcData.needsDobSetup);
      } else {
        // Fallback before SQL RPC is applied in Supabase SQL Editor
        const { data: stRow, error: stErr } = await _sb
          .from('students')
          .select('student_id,prefix,full_name,birth_date,phone_number,line_id,email,address,emergency_name,emergency_phone,emergency_relation,current_course,current_schedule,status,photo_url,nationality,year_be,term,notes')
          .eq('student_id', sid)
          .maybeSingle();
        if (stErr) throw stErr;
        if (!stRow || String(stRow.status || '').toUpperCase() === 'DELETED') {
          throw new Error('ไม่พบรหัสนักศึกษานี้ในระบบ');
        }
        const dbDob = normalizeDobIso(stRow.birth_date);
        if (!dbDob) {
          if (secret !== '123456') throw new Error('รหัสนี้ยังไม่มีวันเกิดในระบบ กรุณากรอกรหัสเริ่มต้น 123456');
          needsDob = true;
        } else {
          const inDob = normalizeDobIso(secret);
          if (!inDob || inDob !== dbDob) throw new Error('วันเดือนปีเกิดไม่ถูกต้อง');
        }
        loggedStudent = stRow;
      }
      _student = loggedStudent;
      _needsDobSetup = needsDob;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ student: _student, needsDobSetup: _needsDobSetup }));
      await enterApp('home');
    } catch (err) {
      if (errEl) {
        errEl.textContent = err.message || 'ไม่สามารถเข้าสู่ระบบได้';
        errEl.classList.remove('st-hidden');
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function handleRegister(ev) {
    ev.preventDefault();
    if (!_sb) return;
    const errEl = document.getElementById('lblRegErr');
    const btn = document.getElementById('btnRegSubmit');
    if (errEl) errEl.classList.add('st-hidden');
    const dobIso = normalizeDobIso(document.getElementById('regDob')?.value || '');
    if (!dobIso) {
      if (errEl) { errEl.textContent = 'กรุณากรอกวันเดือนปีเกิดให้ถูกต้อง (เช่น 15/05/2540)'; errEl.classList.remove('st-hidden'); }
      return;
    }
    if (btn) btn.disabled = true;
    try {
      const { yearBE, term } = await resolveActiveYearTerm();
      const prefix2 = String(yearBE).slice(-2) + String(term);
      const minId = prefix2 + '0000';
      const maxId = String(Number(prefix2) + 1) + '0000';
      const { data: latestRows, error: latErr } = await _sb
        .from('students')
        .select('student_id')
        .gte('student_id', minId)
        .lt('student_id', maxId)
        .order('student_id', { ascending: false })
        .limit(1);
      if (latErr) throw latErr;
      const lastSeq = (latestRows && latestRows[0]) ? Number(String(latestRows[0].student_id).slice(3)) || 0 : 0;
      const newSid = prefix2 + String(lastSeq + 1).padStart(4, '0');
      const payload = {
        student_id: newSid,
        prefix: document.getElementById('regPrefix')?.value || 'นาย',
        full_name: (document.getElementById('regFullName')?.value || '').trim(),
        birth_date: dobIso,
        citizen_id: (document.getElementById('regCitizenId')?.value || '').trim(),
        phone_number: (document.getElementById('regPhone')?.value || '').trim(),
        line_id: (document.getElementById('regLine')?.value || '').trim(),
        email: (document.getElementById('regEmail')?.value || '').trim(),
        nationality: (document.getElementById('regNationality')?.value || 'ไทย').trim(),
        address: (document.getElementById('regAddress')?.value || '').trim(),
        status: 'รอลงทะเบียนคอร์ส',
        registration_channel: 'STUDENT_WEB_APP',
        year_be: yearBE,
        term: term
      };
      const { data: inserted, error: insErr } = await _sb.from('students').insert([payload]).select('student_id,prefix,full_name,birth_date,phone_number,line_id,email,address,current_course,current_schedule,status,photo_url,nationality,year_be,term').single();
      if (insErr) throw insErr;
      _student = inserted;
      _needsDobSetup = false;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ student: _student, needsDobSetup: false }));
      showToast('ลงทะเบียนสำเร็จ รหัสนักศึกษาของคุณคือ ' + newSid);
      await enterApp('enroll');
    } catch (err) {
      if (errEl) {
        errEl.textContent = err.message || 'ลงทะเบียนไม่สำเร็จ';
        errEl.classList.remove('st-hidden');
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function enterApp(initialTab) {
    if (!_student) return;
    showOnlyView('viewStudentApp');
    renderHeaderAndProfile();
    await loadStudentAppData();
    subscribeStudentNotifications();
    const urlTab = new URLSearchParams(global.location.search).get('tab');
    switchTab(urlTab || initialTab || 'home');
  }

  function renderHeaderAndProfile() {
    const sid = _student.student_id || '-';
    const fullName = ((_student.prefix || '') + ' ' + (_student.full_name || '')).trim();
    const photo = _student.photo_url || './student-icon-192.png';
    document.getElementById('lblAppStudentName').textContent = fullName;
    document.getElementById('lblAppStudentId').textContent = sid;
    document.getElementById('lblAppStatus').textContent = _student.status || 'พร้อมเรียน';
    document.getElementById('imgAppAvatar').src = photo;
    document.getElementById('imgCardPhoto').src = photo;
    document.getElementById('imgProfileAiPreview').src = photo;
    document.getElementById('lblCardSid').textContent = sid;
    document.getElementById('lblCardName').textContent = fullName;
    document.getElementById('lblCardCourse').textContent = _student.current_course || 'ยังไม่ลงทะเบียนคอร์ส';
    document.getElementById('lblHomeCourse').textContent = _student.current_course || 'ยังไม่ลงทะเบียนคอร์ส';
    document.getElementById('lblHomeSched').textContent = _student.current_schedule || '-';

    const banner = document.getElementById('bannerLegacyDob');
    if (banner) banner.classList.toggle('st-hidden', !_needsDobSetup);

    document.getElementById('profDob').value = formatIsoToThaiDob(_student.birth_date);
    document.getElementById('profPhone').value = _student.phone_number || '';
    document.getElementById('profLine').value = _student.line_id || '';
    document.getElementById('profEmail').value = _student.email || '';
    document.getElementById('profAddress').value = _student.address || '';

    const qrBox = document.getElementById('boxCardQr');
    if (qrBox && global.QRCode) {
      qrBox.innerHTML = '';
      new global.QRCode(qrBox, { text: 'OCA:' + sid, width: 74, height: 74 });
    }
  }

  async function loadStudentAppData() {
    if (!_sb || !_student) return;
    const sid = String(_student.student_id || '').trim();
    const [resC, resSc, resRc, resPend, resCred, resNotif] = await Promise.all([
      _sb.from('courses').select('id,code,name,level,price,linked_book,is_active').eq('is_active', true).order('code'),
      _sb.from('schedules').select('id,name,day_time,learning_mode,is_active').eq('is_active', true).order('id'),
      _sb.from('receipts').select('receipt_no,item_code,item_name,grand_total,claim_status,delivery_method,tracking_number,created_at,edit_notes').eq('student_id', sid).order('created_at', { ascending: false }).limit(50),
      _sb.from('fee_settings').select('key,name,amount,mode,updated_at').like('key', 'pending_slip%:' + sid),
      _sb.from('fee_settings').select('amount').eq('key', 'student_credit_' + sid).maybeSingle(),
      _sb.from('fee_settings').select('key,name,amount,mode,updated_at').eq('key', 'student_notif:' + sid).maybeSingle()
    ]);
    _courses = Array.isArray(resC.data) ? resC.data : [];
    _schedules = Array.isArray(resSc.data) ? resSc.data : [];
    _receipts = Array.isArray(resRc.data) ? resRc.data.filter(r => String(r.claim_status || '').toUpperCase() !== 'VOIDED') : [];
    _pendingSlips = Array.isArray(resPend.data) ? resPend.data.filter(r => r.key && r.key.startsWith('pending_slip:')) : [];
    _creditAmount = Number(resCred?.data?.amount || 0);
    _notifs = [];
    if (resNotif && resNotif.data) _notifs.push(resNotif.data);
    _receipts.slice(0, 5).forEach(r => {
      _notifs.push({
        key: 'rc_' + r.receipt_no,
        name: 'ใบเสร็จ #' + r.receipt_no + ' • ' + (r.item_name || r.item_code || ''),
        amount: r.grand_total,
        mode: r.claim_status || 'PENDING',
        updated_at: r.created_at
      });
    });
    updateNotifBadge();

    document.getElementById('lblHomeCredit').textContent = '฿' + _creditAmount.toLocaleString('en-US', { minimumFractionDigits: 2 });
    document.getElementById('lblHomePending').textContent = _pendingSlips.length > 0
      ? ('มีสลิปรอตรวจสอบ ' + _pendingSlips.length + ' รายการ')
      : 'ไม่มีสลิปรอตรวจสอบ';

    renderEnrollCategories();
    renderCoursesGrid();
    renderScheduleTab();
    renderFinanceTab();
  }

  function detectCategory(c) {
    const txt = ((c.code || '') + ' ' + (c.name || '') + ' ' + (c.level || '')).toLowerCase();
    if (txt.includes('ตำรา') || txt.includes('หนังสือ') || txt.includes('book')) return 'BOOKS';
    if (txt.includes('สอบ') || txt.includes('exam') || txt.includes('test')) return 'EXAM';
    if (txt.includes('เด็ก') || txt.includes('kid')) return 'KIDS';
    if (txt.includes('hsk')) return 'HSK';
    if (txt.includes('สนทนา') || txt.includes('convo')) return 'CONVO';
    if (txt.includes('ศิลป') || txt.includes('วาด') || txt.includes('พู่กัน')) return 'ART';
    if (txt.includes('ดนตรี') || txt.includes('กู่เจิง') || txt.includes('ขลุ่ย')) return 'MUSIC';
    if (txt.includes('ขั้นสูง')) return 'ADV';
    if (txt.includes('ขั้นกลาง')) return 'INT';
    if (txt.includes('ขั้นต้น')) return 'BEG';
    return 'OTHER';
  }

  function renderEnrollCategories() {
    const box = document.getElementById('boxEnrollCategories');
    if (!box) return;
    const learnedCodes = new Set(_receipts.map(r => String(r.item_code || '').toUpperCase()).filter(Boolean));
    const cats = [
      { id: 'ALL', label: 'ทั้งหมด' },
      { id: 'LEARNED', label: 'คอร์สที่เรียนแล้ว (' + learnedCodes.size + ')' },
      { id: 'BOOKS', label: 'ซื้อตำราเรียน' },
      { id: 'EXAM', label: 'สอบวัดความรู้ภาษาจีน' },
      { id: 'KIDS', label: 'คอร์สเด็ก' },
      { id: 'BEG', label: 'คอร์สขั้นต้น' },
      { id: 'INT', label: 'คอร์สขั้นกลาง' },
      { id: 'ADV', label: 'คอร์สขั้นสูง' },
      { id: 'CONVO', label: 'คอร์สสนทนา' },
      { id: 'HSK', label: 'ติวสอบวัดระดับ HSK' },
      { id: 'ART', label: 'ศิลป์ (วาดภาพ/เขียนอักษร)' },
      { id: 'MUSIC', label: 'ดนตรีจีน' },
      { id: 'OTHER', label: 'คอร์สทั่วไป/อื่นๆ' }
    ];
    box.innerHTML = cats.map(cat =>
      `<button type="button" class="st-cat-btn ${_activeCat === cat.id ? 'active' : ''}" onclick="OcaStudentPortal.selectCategory('${cat.id}')">${esc(cat.label)}</button>`
    ).join('');
  }

  function selectCategory(catId) {
    _activeCat = catId;
    renderEnrollCategories();
    renderCoursesGrid();
  }

  function renderCoursesGrid() {
    const grid = document.getElementById('boxEnrollCoursesGrid');
    const lblCount = document.getElementById('lblCourseCount');
    if (!grid) return;
    const q = (document.getElementById('inpCourseSearch')?.value || '').trim().toLowerCase();
    const learnedCodes = new Set(_receipts.map(r => String(r.item_code || '').toUpperCase()).filter(Boolean));
    const list = _courses.filter(c => {
      if (q && !((c.code || '').toLowerCase().includes(q) || (c.name || '').toLowerCase().includes(q))) return false;
      if (_activeCat === 'ALL') return true;
      if (_activeCat === 'LEARNED') return learnedCodes.has(String(c.code || '').toUpperCase());
      return detectCategory(c) === _activeCat;
    });
    if (lblCount) lblCount.textContent = list.length + ' คอร์ส';
    if (list.length === 0) {
      grid.innerHTML = '<div class="st-card" style="padding: 28px; text-align: center; color: #64748B; grid-column: 1 / -1;">ไม่พบคอร์สในหมวดหมู่นี้</div>';
      return;
    }
    grid.innerHTML = list.map(c => {
      const isLearned = learnedCodes.has(String(c.code || '').toUpperCase());
      return `
        <div class="st-card" style="padding: 14px; display: flex; flex-direction: column; justify-content: space-between; gap: 10px;">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px; margin-bottom: 8px;">
              <span style="font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: #E0F2FE; color: #0369A1;">${esc(c.level || 'หลักสูตร')}</span>
              ${isLearned ? '<span style="font-size: 11px; font-weight: 800; padding: 2px 8px; border-radius: 999px; background: #047857; color: #FFFFFF;">✓ เรียนแล้ว</span>' : ''}
            </div>
            <div style="text-align: center; padding: 12px 8px; border-radius: 12px; background: #ECFEFF; border: 1px solid #BAE6FD;">
              <div style="font-size: 20px; font-weight: 800; color: #0F172A; font-family: monospace;">${esc(c.code || c.id)}</div>
            </div>
            <div style="font-size: 13.5px; font-weight: 700; color: #0F172A; margin-top: 8px;">${esc(c.name || '-')}</div>
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; border-top: 1px solid #E2E8F0; padding-top: 10px;">
            <strong style="font-size: 16px; color: #047857; font-family: monospace;">฿${Number(c.price || 0).toLocaleString('en-US')}</strong>
            <button type="button" class="st-btn-primary" style="padding: 7px 12px; font-size: 12.5px;" onclick="OcaStudentPortal.openCheckout('${esc(c.id)}')">+ เลือกคอร์ส</button>
          </div>
        </div>
      `;
    }).join('');
  }

  function openCheckout(courseId) {
    _checkoutCourse = _courses.find(c => String(c.id) === String(courseId));
    if (!_checkoutCourse) return;
    document.getElementById('lblCheckoutCourseTitle').textContent = (_checkoutCourse.code || '') + ' — ' + (_checkoutCourse.name || '');
    const sel = document.getElementById('selCheckoutSched');
    if (sel) {
      sel.innerHTML = _schedules.map(sc => `<option value="${esc(sc.name || sc.id)}">${esc(sc.name || sc.id)} (${esc(sc.day_time || '-')})</option>`).join('');
    }
    document.getElementById('inpCheckoutSlipFile').value = '';
    recalcCheckout();
    document.getElementById('modalStudentCheckout').classList.remove('st-hidden');
  }

  function closeCheckout() {
    document.getElementById('modalStudentCheckout').classList.add('st-hidden');
  }

  function recalcCheckout() {
    if (!_checkoutCourse) return 0;
    const ship = document.getElementById('selCheckoutDelivery')?.value === 'ส่งตำรา' ? 50 : 0;
    const total = Math.max(0, Number(_checkoutCourse.price || 0) + ship);
    document.getElementById('lblCheckoutTotal').textContent = '฿' + total.toLocaleString('en-US', { minimumFractionDigits: 2 });
    return total;
  }

  async function submitEnrollment() {
    if (!_sb || !_student || !_checkoutCourse) return;
    const fileInput = document.getElementById('inpCheckoutSlipFile');
    const file = fileInput && fileInput.files && fileInput.files[0];
    if (!file) {
      showToast('กรุณาแนบรูปสลิปโอนเงินก่อนส่ง');
      return;
    }
    const btn = document.getElementById('btnSubmitCheckout');
    if (btn) btn.disabled = true;
    try {
      const sid = String(_student.student_id).trim();
      const total = recalcCheckout();
      const sched = document.getElementById('selCheckoutSched')?.value || '-';
      const mode = document.getElementById('selCheckoutMode')?.value || 'Onsite';
      const delivery = document.getElementById('selCheckoutDelivery')?.value || 'รับเอง';
      const ext = (file.name.split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '') || 'jpg';
      const storagePath = `slips/slip_${sid}_${Date.now()}.${ext}`;
      const { error: upErr } = await _sb.storage.from('student-photos').upload(storagePath, file, { upsert: true });
      if (upErr) throw upErr;
      const pubUrl = _sb.storage.from('student-photos').getPublicUrl(storagePath)?.data?.publicUrl || storagePath;
      const summaryName = `${sid}|${_checkoutCourse.code || ''}|${_checkoutCourse.name || ''}|${sched}|${mode}|${delivery}`.slice(0, 90);
      const { error: pErr } = await _sb.from('fee_settings').upsert([
        { key: 'pending_slip:' + sid, name: summaryName, amount: total, mode: 'PENDING', updated_at: new Date().toISOString() },
        { key: 'pending_slip_url:' + sid, name: String(pubUrl).slice(0, 90), amount: total, mode: 'PENDING', updated_at: new Date().toISOString() }
      ], { onConflict: 'key' });
      if (pErr) throw pErr;
      closeCheckout();
      showToast('ส่งใบสมัครและสลิปเรียบร้อยแล้ว รอเจ้าหน้าที่ตรวจสอบ');
      await loadStudentAppData();
      switchTab('finance');
    } catch (err) {
      showToast('ส่งสลิปไม่สำเร็จ: ' + (err.message || err));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function renderScheduleTab() {
    const box = document.getElementById('boxStudentScheduleList');
    if (!box) return;
    if (!_student.current_course && _receipts.length === 0) {
      box.innerHTML = '<div style="color: #64748B; font-size: 13px;">ยังไม่มีข้อมูลตารางเรียน</div>';
      return;
    }
    const items = [];
    if (_student.current_course) {
      items.push(`<div style="padding: 12px; border: 1px solid #CBD5E1; border-radius: 12px; background: #F8FAFC;"><div style="font-weight: 800; color: #047857;">${esc(_student.current_course)}</div><div style="font-size: 12.5px; color: #334155; margin-top: 4px;">รอบเวลา: ${esc(_student.current_schedule || '-')}</div></div>`);
    }
    box.innerHTML = items.join('');
  }

  function renderFinanceTab() {
    const pendBox = document.getElementById('boxStudentPendingSlips');
    const rcBox = document.getElementById('boxStudentReceiptsList');
    if (pendBox) {
      pendBox.innerHTML = _pendingSlips.map(p =>
        `<div style="background: #FEF3C7; border: 1.5px solid #F59E0B; color: #0F172A; border-radius: 12px; padding: 12px 14px; font-size: 13px; display: flex; justify-content: space-between; align-items: center; gap: 8px;"><span><strong>⏳ สลิปรอตรวจสอบ:</strong> ${esc(p.name)}</span><strong>฿${Number(p.amount || 0).toLocaleString('en-US')}</strong></div>`
      ).join('');
    }
    if (rcBox) {
      if (_receipts.length === 0) {
        rcBox.innerHTML = '<div style="color: #64748B; font-size: 13px;">ยังไม่มีประวัติใบเสร็จ</div>';
      } else {
        rcBox.innerHTML = _receipts.map(r => `
          <div onclick="OcaStudentPortal.openReceiptDetail('${esc(r.receipt_no)}')" style="padding: 12px; border: 1px solid #E2E8F0; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; cursor: pointer;">
            <div>
              <div style="font-weight: 800; font-size: 13.5px; color: #0F172A;">#${esc(r.receipt_no)} • ${esc(r.item_name || r.item_code || '-')}</div>
              <div style="font-size: 12px; color: #475569; margin-top: 2px;">ตำรา: ${esc(r.claim_status || 'PENDING')}${r.tracking_number ? ' • Tracking: ' + esc(r.tracking_number) : ''} • <span style="color:#0369A1; font-weight:700;">แตะเพื่อดูใบเสร็จ / QR</span></div>
            </div>
            <strong style="font-family: monospace; color: #047857;">฿${Number(r.grand_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
          </div>
        `).join('');
      }
    }
  }

  function switchTab(tab) {
    document.querySelectorAll('.st-tab-panel').forEach(p => p.classList.add('st-hidden'));
    const target = document.getElementById('tabPanel_' + tab);
    if (target) target.classList.remove('st-hidden');
    document.querySelectorAll('.st-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  }

  async function onProfilePhotoSelected(inputEl) {
    const file = inputEl && inputEl.files && inputEl.files[0];
    if (!file || !global.OcaStudentAiPhoto) return;
    const statusEl = document.getElementById('lblAiPhotoStatus');
    const saveBtn = document.getElementById('btnSaveAiPhoto');
    try {
      const res = await global.OcaStudentAiPhoto.processPortraitToCrimson(file, (msg) => {
        if (statusEl) statusEl.textContent = msg;
      });
      _pendingAiPhoto = res;
      document.getElementById('imgProfileAiPreview').src = res.dataUrl;
      if (statusEl) statusEl.textContent = 'ตัดพื้นหลังสีแดงเลือดหมู (#800000) สำเร็จ (' + res.engine.toUpperCase() + ')';
      if (saveBtn) saveBtn.classList.remove('st-hidden');
    } catch (err) {
      if (statusEl) statusEl.textContent = 'ประมวลผลรูปไม่สำเร็จ: ' + (err.message || err);
    }
  }

  async function saveAiPhoto() {
    if (!_sb || !_student || !_pendingAiPhoto || !_pendingAiPhoto.blob) return;
    const btn = document.getElementById('btnSaveAiPhoto');
    if (btn) btn.disabled = true;
    try {
      const sid = String(_student.student_id).trim();
      const path = `student_ai_${sid}_${Date.now()}.jpg`;
      const { error: upErr } = await _sb.storage.from('student-photos').upload(path, _pendingAiPhoto.blob, { contentType: 'image/jpeg', upsert: true });
      if (upErr) throw upErr;
      const pubUrl = _sb.storage.from('student-photos').getPublicUrl(path)?.data?.publicUrl;
      if (!pubUrl) throw new Error('ไม่สามารถสร้าง URL รูปภาพได้');
      const { error: rpcErr } = await _sb.rpc('student_portal_update_profile', { p_student_id: sid, p_photo_url: pubUrl });
      if (rpcErr) {
        const { error: updErr } = await _sb.from('students').update({ photo_url: pubUrl }).eq('student_id', sid);
        if (updErr) throw updErr;
      }
      _student.photo_url = pubUrl;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ student: _student, needsDobSetup: _needsDobSetup }));
      renderHeaderAndProfile();
      if (btn) btn.classList.add('st-hidden');
      showToast('บันทึกรูปโปรไฟล์ AI เรียบร้อยแล้ว');
    } catch (err) {
      showToast('บันทึกรูปไม่สำเร็จ: ' + (err.message || err));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function saveProfile(ev) {
    ev.preventDefault();
    if (!_sb || !_student) return;
    const dobIso = normalizeDobIso(document.getElementById('profDob')?.value || '');
    if (!dobIso) {
      showToast('กรุณากรอกวันเดือนปีเกิดให้ถูกต้อง (เช่น 15/05/2540)');
      return;
    }
    const btn = document.getElementById('btnSaveProfile');
    if (btn) btn.disabled = true;
    try {
      const sid = String(_student.student_id).trim();
      const phone = (document.getElementById('profPhone')?.value || '').trim();
      const lineId = (document.getElementById('profLine')?.value || '').trim();
      const email = (document.getElementById('profEmail')?.value || '').trim();
      const address = (document.getElementById('profAddress')?.value || '').trim();
      const { error: rpcErr } = await _sb.rpc('student_portal_update_profile', {
        p_student_id: sid,
        p_birth_date: dobIso,
        p_phone: phone,
        p_line_id: lineId,
        p_email: email,
        p_address: address
      });
      if (rpcErr) {
        const { error: updErr } = await _sb.from('students').update({
          birth_date: dobIso, phone_number: phone, line_id: lineId, email, address
        }).eq('student_id', sid);
        if (updErr) throw updErr;
      }
      _student.birth_date = dobIso;
      _student.phone_number = phone;
      _student.line_id = lineId;
      _student.email = email;
      _student.address = address;
      _needsDobSetup = false;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ student: _student, needsDobSetup: false }));
      renderHeaderAndProfile();
      showToast('บันทึกประวัติส่วนตัวและวันเดือนปีเกิดเรียบร้อยแล้ว');
    } catch (err) {
      showToast('บันทึกไม่สำเร็จ: ' + (err.message || err));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function updateNotifBadge() {
    if (!_student) return;
    const badge = document.getElementById('badgeStudentNotifCount');
    if (!badge) return;
    const seenAt = Number(localStorage.getItem('oca_st_notif_seen_' + _student.student_id) || 0);
    const unread = _notifs.filter(n => n.updated_at && Date.parse(n.updated_at) > seenAt).length;
    badge.textContent = unread > 9 ? '9+' : String(unread);
    badge.classList.toggle('st-hidden', unread === 0);
  }

  function subscribeStudentNotifications() {
    if (!_sb || !_student || typeof _sb.channel !== 'function') return;
    if (global._activeStudentNotifChannel && typeof _sb.removeChannel === 'function') {
      _sb.removeChannel(global._activeStudentNotifChannel);
      global._activeStudentNotifChannel = null;
    }
    const sid = String(_student.student_id || '').trim();
    global._activeStudentNotifChannel = _sb
      .channel('oca_student_notif_' + sid)
      .on('broadcast', { event: 'student_receipt_issued' }, async (msg) => {
        const p = (msg && msg.payload) ? msg.payload : msg;
        if (!p || String(p.studentId || '') !== sid) return;
        showToast('ออกใบเสร็จรับเงินแล้ว #' + (p.receiptNo || ''));
        await loadStudentAppData();
        if ('Notification' in global && Notification.permission === 'granted' && 'serviceWorker' in navigator) {
          try {
            const reg = await navigator.serviceWorker.ready;
            if (reg && typeof reg.showNotification === 'function') {
              await reg.showNotification('ออกใบเสร็จรับเงินแล้ว #' + (p.receiptNo || ''), {
                body: (p.itemName || 'คอร์สเรียน OCA') + ' • ฿' + Number(p.grandTotal || 0).toLocaleString('en-US'),
                icon: './student-icon-192.png',
                badge: './student-favicon.png',
                data: { url: './student.html?tab=finance' }
              });
            }
          } catch (_) {}
        }
      })
      .subscribe();
  }

  function isIosNonStandalone() {
    const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    const isStandalone = (global.matchMedia && global.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
    return isIos && !isStandalone;
  }

  async function enableNotifications() {
    if (isIosNonStandalone()) {
      openNotifModal();
      return;
    }
    if (!('Notification' in global)) {
      showToast('เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน');
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      showToast('กรุณากดอนุญาตการแจ้งเตือนในการตั้งค่าเบราว์เซอร์');
      return;
    }
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        if (reg && typeof reg.showNotification === 'function') {
          await reg.showNotification('เปิดรับแจ้งเตือน OCA Student สำเร็จ', {
            body: 'ระบบจะแจ้งเตือนเมื่อมีใบเสร็จใหม่หรืออัปเดตพัสดุ',
            icon: './student-icon-192.png',
            badge: './student-favicon.png',
            data: { url: './student.html?tab=finance' }
          });
        }
        if (_sb && _student && reg && reg.pushManager) {
          const { data: vapidRow, error: vErr } = await _sb.from('fee_settings').select('name').eq('key', 'student_vapid_public_key').maybeSingle();
          if (!vErr && vapidRow && vapidRow.name) {
            const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidRow.name.trim() });
            const { error: subErr } = await _sb.from('fee_settings').upsert([{
              key: 'student_push_sub:' + _student.student_id,
              name: JSON.stringify(sub).slice(0, 90),
              amount: 1,
              mode: 'PUSH_ACTIVE',
              updated_at: new Date().toISOString()
            }], { onConflict: 'key' });
            if (subErr) console.warn('[Push subscribe] warning:', subErr.message);
          }
        }
      } catch (_) {}
    }
    showToast('เปิดรับการแจ้งเตือนบนมือถือเรียบร้อยแล้ว');
  }

  function openNotifModal() {
    const guide = document.getElementById('boxIosNotifGuide');
    if (guide) guide.classList.toggle('st-hidden', !isIosNonStandalone());
    const listBox = document.getElementById('boxStudentNotifList');
    if (listBox) {
      listBox.innerHTML = _notifs.length === 0
        ? '<div style="color:#64748B; font-size:13px;">ยังไม่มีการแจ้งเตือน</div>'
        : _notifs.map(n => `<div style="padding:10px 12px; border:1px solid #E2E8F0; border-radius:10px; background:#F8FAFC; font-size:12.5px;"><div style="font-weight:700; color:#0F172A;">${esc(n.name)}</div><div style="color:#047857; font-weight:700; margin-top:2px;">฿${Number(n.amount || 0).toLocaleString('en-US')}</div></div>`).join('');
    }
    document.getElementById('modalStudentNotif')?.classList.remove('st-hidden');
  }

  function closeNotifModal() {
    document.getElementById('modalStudentNotif')?.classList.add('st-hidden');
  }

  function markAllNotifsRead() {
    if (_student) localStorage.setItem('oca_st_notif_seen_' + _student.student_id, String(Date.now()));
    updateNotifBadge();
    closeNotifModal();
  }

  function openReceiptDetail(rcNo) {
    const r = _receipts.find(x => String(x.receipt_no) === String(rcNo));
    if (!r) return;
    document.getElementById('lblRcDetailTitle').textContent = 'ใบเสร็จรับเงิน #' + (r.receipt_no || '');
    document.getElementById('boxRcDetailBody').innerHTML =
      `<div><strong>รายการ:</strong> ${esc(r.item_name || r.item_code || '-')}</div>` +
      `<div><strong>ยอดชำระสุทธิ:</strong> <span style="color:#047857; font-weight:800;">฿${Number(r.grand_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>` +
      `<div><strong>วิธีรับตำรา:</strong> ${esc(r.delivery_method || 'รับเองที่สถาบัน')}</div>` +
      `<div><strong>สถานะตำรา:</strong> ${esc(r.claim_status || 'PENDING')}</div>` +
      (r.tracking_number ? `<div><strong>เลขพัสดุ:</strong> <span style="font-family:monospace;">${esc(r.tracking_number)}</span></div>` : '');
    const qrBox = document.getElementById('boxRcDetailQr');
    if (qrBox && global.QRCode) {
      qrBox.innerHTML = '';
      new global.QRCode(qrBox, { text: 'OCA-RC:' + r.receipt_no, width: 110, height: 110 });
    }
    document.getElementById('modalStudentReceiptDetail')?.classList.remove('st-hidden');
  }

  function closeReceiptDetail() {
    document.getElementById('modalStudentReceiptDetail')?.classList.add('st-hidden');
  }

  function logout() {
    if (_sb && global._activeStudentNotifChannel && typeof _sb.removeChannel === 'function') {
      _sb.removeChannel(global._activeStudentNotifChannel);
      global._activeStudentNotifChannel = null;
    }
    _student = null;
    _needsDobSetup = false;
    sessionStorage.removeItem(SESSION_KEY);
    showOnlyView('viewStudentAuth');
  }

  function installPwa() {
    if (_deferredPwaPrompt) {
      _deferredPwaPrompt.prompt();
      _deferredPwaPrompt = null;
    }
  }

  global.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _deferredPwaPrompt = e;
    const btn = document.getElementById('btnStudentPwaInstall');
    if (btn) btn.classList.remove('st-hidden');
  });

  if ('serviceWorker' in navigator) {
    global.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    setLang(_currentLang);
    try {
      const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      if (saved && saved.student && saved.student.student_id) {
        _student = saved.student;
        _needsDobSetup = Boolean(saved.needsDobSetup);
        enterApp('home');
      }
    } catch (_) {}
  });

  global.OcaStudentPortal = {
    setLang,
    openRegisterView,
    backToLogin,
    handleLogin,
    handleRegister,
    switchTab,
    selectCategory,
    renderCoursesGrid,
    openCheckout,
    closeCheckout,
    recalcCheckout,
    submitEnrollment,
    onProfilePhotoSelected,
    saveAiPhoto,
    saveProfile,
    enableNotifications,
    openNotifModal,
    closeNotifModal,
    markAllNotifsRead,
    openReceiptDetail,
    closeReceiptDetail,
    logout,
    installPwa
  };
})(window);
