/**
 * OCA Student Web App Controller (v359)
 * - Isolated PWA scope (/OCA/student/)
 * - Left Sidebar Navigation + 3D Flippable Official Gold ID Card
 * - Multi-table DB Profile & Real Photo Resolver
 * - Unified Notification Center (Receipts + Academy Notices newest -> oldest)
 * - 100% Real-Time 3-Language i18n (th / en / zh) with MutationObserver
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
  let _activeCat = 'ALL';
  let _checkoutCourse = null;
  let _pendingAiPhoto = null;
  let _deferredPwaPrompt = global.__ocaStudentDeferredPrompt || null;
  let _notifs = [];
  let _notices = [];
  let _isCardFlipped = false;
  let _isApplyingI18n = false;

  const I18N = {
    th: {
      hdrSub: 'ระบบนักศึกษาออนไลน์ (สมัครเรียน • ตารางเรียน • บัตรนักศึกษา)',
      installPwa: 'ติดตั้งแอป',
      installPwaFull: 'ติดตั้งแอปนักศึกษา OCA (PWA)',
      logout: 'ออกจากระบบ',
      notifBellTitle: 'การแจ้งเตือนและประกาศสถาบัน',
      noticeBoardTitle: 'บอร์ดประชาสัมพันธ์สถาบัน',
      noticeNewestFirst: 'เรียงข่าวใหม่ไปเก่า',
      backWelcome: 'กลับหน้าต้อนรับ',
      loginTitle: 'เข้าสู่ระบบนักศึกษา',
      loginSub: 'สำหรับนักศึกษาปัจจุบัน: ต่อคอร์ส, ดูตารางเรียน, บัตรนักศึกษา',
      loginSid: 'รหัสนักศึกษา (7 หลัก)',
      loginSecret: 'วันเดือนปีเกิด (เช่น 15/05/2540) หรือรหัส 123456',
      phSid: 'เช่น 6950001',
      phSecret: 'DD/MM/พ.ศ. หรือ 123456',
      legacyHint: 'นักศึกษาเก่าที่ยังไม่มีวันเกิดในระบบ: กรอก 123456 เพื่อเข้าสู่ระบบแล้วตั้งวันเกิดจริง',
      btnLogin: 'เข้าสู่ระบบนักศึกษา',
      newOrDivider: 'สำหรับผู้ที่ยังไม่มีรหัสนักศึกษา',
      btnNewReg: 'ลงทะเบียนใหม่ (นักศึกษาใหม่)',
      regTitle: 'ลงทะเบียนนักศึกษาใหม่',
      regSub: 'สมัครเสร็จแล้วระบบจะพาท่านเข้าสู่หน้าเลือกคอร์สเรียนอัตโนมัติ',
      backLogin: 'กลับหน้าเข้าสู่ระบบ',
      fldPrefix: 'คำนำหน้า',
      fldFullName: 'ชื่อ-นามสกุล *',
      phFullName: 'ชื่อ นามสกุล',
      fldDob: 'วันเดือนปีเกิด (วัน/เดือน/ปี พ.ศ.) *',
      fldCitizen: 'เลขบัตรประชาชน / พาสปอร์ต *',
      phCitizen: '13 หลัก หรือเลขพาสปอร์ต',
      fldPhone: 'เบอร์โทรศัพท์ *',
      fldLine: 'LINE ID',
      fldEmail: 'อีเมล',
      fldNationality: 'สัญชาติ',
      fldAddress: 'ที่อยู่จัดส่งตำราเรียน',
      fldEmergName: 'ผู้ติดต่อฉุกเฉิน',
      fldEmergPhone: 'เบอร์ผู้ติดต่อฉุกเฉิน',
      btnRegSubmit: 'ยืนยันลงทะเบียนและไปเลือกคอร์สเรียน',
      menuBtn: 'เมนู',
      quickEnroll: 'เลือกคอร์ส / ต่อคอร์ส',
      tabHome: 'หน้าหลัก',
      tabEnroll: 'เลือกคอร์ส & แนบสลิป',
      tabCard: 'บัตรนักศึกษา',
      tabSchedule: 'ตารางเรียน',
      tabFinance: 'การเงิน & พัสดุ',
      tabProfile: 'ประวัติส่วนตัว & รูปโปรไฟล์',
      legacyBanner: 'คุณเข้าสู่ระบบด้วยรหัสเริ่มต้น 123456 กรุณาตั้งวันเดือนปีเกิดจริงของคุณในหน้าประวัติส่วนตัวเพื่อความปลอดภัย',
      setupDobNow: 'ตั้งวันเดือนปีเกิดเลย',
      homeCourseLbl: 'คอร์สปัจจุบัน',
      homeTotalCoursesLbl: 'คอร์สที่ลงทะเบียนแล้ว',
      homeTotalCoursesSub: 'ดึงข้อมูลจริงจากประวัติใบเสร็จสถาบัน',
      homeSlipLbl: 'สถานะสลิปล่าสุด',
      phCourseSearch: 'ค้นหารหัสคอร์ส หรือชื่อคอร์ส...',
      cardSidLbl: 'รหัสนักศึกษา',
      flipCardBack: 'พลิกดูด้านหลังบัตร',
      flipCardFront: 'พลิกดูด้านหน้าบัตร',
      cardQrTitle: 'QR ยืนยันตัวตนรับตำราเรียน',
      cardQrSub: 'สแกนเพื่อตรวจสอบสิทธิ์เข้าเรียนและรับหนังสือ (PDPA Safe)',
      schedTitle: 'ตารางเรียนและคอร์สที่ลงทะเบียน',
      finTitle: 'ประวัติใบเสร็จรับเงิน & สถานะรับ/จัดส่งตำรา',
      aiTitle: 'รูปโปรไฟล์ & บัตรนักศึกษา (AI Studio)',
      aiDesc: 'ระบบจะใช้ AI (RMBG-1.4 / MODNet) ตัดพื้นหลังเป็นสีแดงเลือดหมู (#800000) มาตรฐานสถาบันให้อัตโนมัติ',
      aiReady: 'พร้อมอัปโหลดรูปหน้าตรง',
      btnPickPhoto: 'เลือกรูปภาพใหม่',
      btnSavePhoto: 'บันทึกรูปโปรไฟล์',
      profEditTitle: 'แก้ไขประวัติส่วนตัว & ตั้งวันเดือนปีเกิด',
      btnSaveProf: 'บันทึกข้อมูลส่วนตัว',
      chkSched: 'เลือกรอบเวลาเรียน',
      chkMode: 'รูปแบบเรียน',
      chkDelivery: 'วิธีรับตำราเรียน',
      delivPickup: 'รับเองที่สถาบัน (ฟรี)',
      delivShip: 'จัดส่งพัสดุตามที่อยู่ (+฿50)',
      chkTotal: 'ยอดชำระสุทธิ',
      chkSlipHint: 'สแกนโอนเงินแล้วแนบสลิปด้านล่าง (ระบบจะส่งให้เจ้าหน้าที่อนุมัติ)',
      btnSubmitCheckout: 'ยืนยันส่งใบสมัคร & สลิปโอนเงิน',
      notifModalTitle: 'การแจ้งเตือนและประกาศสถาบัน',
      iosGuideTitle: 'สำหรับ iPhone / iPad (iOS 16.4+):',
      iosGuideBody: '1. แตะปุ่ม แชร์ (Share) ด้านล่างของ Safari แล้วเลือก "เพิ่มไปยังหน้าจอโฮม" 2. เปิดแอป OCA Student จากหน้าจอหลัก แล้วกดเปิดรับแจ้งเตือน',
      enableNotifBtn: 'เปิดรับแจ้งเตือนบนมือถือ',
      markAllRead: 'ทำเครื่องหมายอ่านแล้วทั้งหมด',
      rcQrHint: 'QR ยืนยันตัวตนรับตำราเรียนที่สถาบัน',
      pwaModalTitle: 'ติดตั้งแอป OCA Student (PWA)',
      pwaPcTitle: 'คอมพิวเตอร์ (Chrome / Edge):',
      pwaPcBody: 'คลิกไอคอนติดตั้งรูปคอมพิวเตอร์/ลูกศรลง ที่มุมขวาของแถบที่อยู่ (Address Bar) แล้วกด "ติดตั้ง (Install)"',
      pwaIosTitle: 'iPhone / iPad (Safari):',
      pwaIosBody: 'แตะปุ่ม แชร์ (Share) ด้านล่าง แล้วเลือก "เพิ่มไปยังหน้าจอโฮม (Add to Home Screen)" จากนั้นกด เพิ่ม',
      pwaAndroidTitle: 'Android (Chrome):',
      pwaAndroidBody: 'แตะเมนูจุด 3 จุดมุมขวาบน แล้วเลือก "ติดตั้งแอป" (Install app)',
      termPrefix: 'ภาคเรียน',
      coursesUnit: 'คอร์ส',
      enrollBtn: 'สมัคร / ต่อคอร์ส',
      noSlipPending: 'ไม่มีสลิปรอตรวจสอบ',
      slipPendingCount: 'มีสลิปรอตรวจสอบ',
      itemsUnit: 'รายการ',
      noScheduleMsg: 'ยังไม่มีประวัติตารางเรียน กรุณาเลือกคอร์สในแท็บ "เลือกคอร์ส & แนบสลิป"',
      noReceiptsMsg: 'ยังไม่มีประวัติใบเสร็จรับเงิน',
      noNotifsMsg: 'ยังไม่มีการแจ้งเตือนหรือประกาศใหม่'
    },
    en: {
      hdrSub: 'Student Self-Service Portal (Enroll • Schedule • Digital ID)',
      installPwa: 'Install App',
      installPwaFull: 'Install OCA Student App (PWA)',
      logout: 'Sign Out',
      notifBellTitle: 'Notifications & Academy Announcements',
      noticeBoardTitle: 'OCA Notice Board',
      noticeNewestFirst: 'Newest to Oldest',
      backWelcome: 'Back to Welcome',
      loginTitle: 'Student Sign In',
      loginSub: 'For current students: renew courses, view schedule & digital ID',
      loginSid: 'Student ID (7 digits)',
      loginSecret: 'Date of Birth (DD/MM/YYYY) or default 123456',
      phSid: 'e.g. 6950001',
      phSecret: 'DD/MM/YYYY or 123456',
      legacyHint: 'Legacy students without DOB on file: enter 123456 to sign in and set your birth date.',
      btnLogin: 'Sign In',
      newOrDivider: 'New to OCA?',
      btnNewReg: 'Register as New Student',
      regTitle: 'New Student Registration',
      regSub: 'After registration, you will be signed in to choose courses right away.',
      backLogin: 'Back to Sign In',
      fldPrefix: 'Title',
      fldFullName: 'Full Name *',
      phFullName: 'First & Last Name',
      fldDob: 'Date of Birth (DD/MM/YYYY) *',
      fldCitizen: 'National ID / Passport No. *',
      phCitizen: '13-digit ID or Passport',
      fldPhone: 'Phone Number *',
      fldLine: 'LINE ID',
      fldEmail: 'Email',
      fldNationality: 'Nationality',
      fldAddress: 'Shipping Address (for textbooks)',
      fldEmergName: 'Emergency Contact',
      fldEmergPhone: 'Emergency Phone',
      btnRegSubmit: 'Confirm Registration & Choose Courses',
      menuBtn: 'Menu',
      quickEnroll: 'Enroll / Renew Course',
      tabHome: 'Home',
      tabEnroll: 'Courses & Payment',
      tabCard: 'Student ID Card',
      tabSchedule: 'Schedule',
      tabFinance: 'Receipts & Shipping',
      tabProfile: 'Profile & AI Photo',
      legacyBanner: 'You signed in with default code 123456. Please update your actual Date of Birth in Profile.',
      setupDobNow: 'Set Date of Birth',
      homeCourseLbl: 'Current Course',
      homeTotalCoursesLbl: 'Enrolled Courses',
      homeTotalCoursesSub: 'Live count from official academy receipts',
      homeSlipLbl: 'Latest Slip Status',
      phCourseSearch: 'Search course code or title...',
      cardSidLbl: 'Student ID',
      flipCardBack: 'Flip to Back of Card',
      flipCardFront: 'Flip to Front of Card',
      cardQrTitle: 'Textbook Claim Verification QR',
      cardQrSub: 'Scan at academy counter to verify enrollment & claim books (PDPA Safe)',
      schedTitle: 'Class Schedule & Enrolled Courses',
      finTitle: 'Official Receipts & Textbook Delivery',
      aiTitle: 'Profile Photo & ID Card (AI Studio)',
      aiDesc: 'AI (RMBG-1.4 / MODNet) automatically replaces background with OCA Crimson (#800000).',
      aiReady: 'Ready for portrait upload',
      btnPickPhoto: 'Choose New Photo',
      btnSavePhoto: 'Save Profile Photo',
      profEditTitle: 'Edit Profile & Date of Birth',
      btnSaveProf: 'Save Profile',
      chkSched: 'Select Class Schedule',
      chkMode: 'Learning Mode',
      chkDelivery: 'Textbook Delivery',
      delivPickup: 'Pick up at Academy (Free)',
      delivShip: 'Parcel Delivery (+฿50)',
      chkTotal: 'Net Payable',
      chkSlipHint: 'Scan QR to transfer, then attach your payment slip below.',
      btnSubmitCheckout: 'Submit Enrollment & Payment Slip',
      notifModalTitle: 'Notifications & Academy Notices',
      iosGuideTitle: 'For iPhone / iPad (iOS 16.4+):',
      iosGuideBody: '1. Tap Share in Safari and choose "Add to Home Screen". 2. Open OCA Student from Home Screen and tap Enable Notifications.',
      enableNotifBtn: 'Enable Mobile Push Alerts',
      markAllRead: 'Mark All as Read',
      rcQrHint: 'QR for textbook pickup verification',
      pwaModalTitle: 'Install OCA Student App (PWA)',
      pwaPcTitle: 'Desktop (Chrome / Edge):',
      pwaPcBody: 'Click the Install App icon on the right side of the browser Address Bar, then click "Install".',
      pwaIosTitle: 'iPhone / iPad (Safari):',
      pwaIosBody: 'Tap Share at the bottom, choose "Add to Home Screen", then tap Add.',
      pwaAndroidTitle: 'Android (Chrome):',
      pwaAndroidBody: 'Tap the 3-dot menu at top-right and choose "Install app".',
      termPrefix: 'Term',
      coursesUnit: 'courses',
      enrollBtn: 'Enroll / Renew',
      noSlipPending: 'No pending slips',
      slipPendingCount: 'Pending slips:',
      itemsUnit: 'items',
      noScheduleMsg: 'No schedule records yet. Please select a course in Courses & Payment.',
      noReceiptsMsg: 'No receipt records yet.',
      noNotifsMsg: 'No notifications or announcements yet.'
    },
    zh: {
      hdrSub: '东方文化书院学员在线门户（在线报名 • 课表 • 电子学生证）',
      installPwa: '安装应用',
      installPwaFull: '安装 OCA 学员应用 (PWA)',
      logout: '退出登录',
      notifBellTitle: '通知与书院公告',
      noticeBoardTitle: '书院公告栏',
      noticeNewestFirst: '按最新时间排序',
      backWelcome: '返回欢迎页',
      loginTitle: '学员登录',
      loginSub: '老学员专用：续费选课、查看课表、电子学生证',
      loginSid: '学号（7位数字）',
      loginSecret: '出生日期（如 15/05/1997）或初始密码 123456',
      phSid: '例如 6950001',
      phSecret: '日/月/年 或 123456',
      legacyHint: '尚未登记出生日期的老学员：请输入 123456 登录后完善出生日期。',
      btnLogin: '登录学员系统',
      newOrDivider: '尚未拥有OCA学号？',
      btnNewReg: '新学员注册',
      regTitle: '新学员在线注册',
      regSub: '注册成功后系统将自动带您进入选课页面',
      backLogin: '返回登录页',
      fldPrefix: '称谓',
      fldFullName: '姓名 *',
      phFullName: '请输入真实姓名',
      fldDob: '出生日期（日/月/年）*',
      fldCitizen: '身份证号 / 护照号 *',
      phCitizen: '13位身份证或护照号',
      fldPhone: '联系电话 *',
      fldLine: 'LINE ID',
      fldEmail: '电子邮箱',
      fldNationality: '国籍',
      fldAddress: '教材邮寄地址',
      fldEmergName: '紧急联系人',
      fldEmergPhone: '紧急联系电话',
      btnRegSubmit: '确认注册并前往选课',
      menuBtn: '菜单',
      quickEnroll: '选课 / 续费报名',
      tabHome: '首页',
      tabEnroll: '选课与缴费',
      tabCard: '电子学生证',
      tabSchedule: '我的课表',
      tabFinance: '收据与物流',
      tabProfile: '个人资料与AI证件照',
      legacyBanner: '您正在使用初始密码 123456 登录，请前往个人资料设置真实出生日期以确保安全。',
      setupDobNow: '立即设置出生日期',
      homeCourseLbl: '当前课程',
      homeTotalCoursesLbl: '已报名课程数',
      homeTotalCoursesSub: '实时同步自书院正式收据记录',
      homeSlipLbl: '最新凭证状态',
      phCourseSearch: '搜索课程代码或名称...',
      cardSidLbl: '学号',
      flipCardBack: '翻转查看背面',
      flipCardFront: '翻转查看正面',
      cardQrTitle: '教材领取核验二维码',
      cardQrSub: '现场扫码核验上课资格与领取教材（已隐去隐私证件号）',
      schedTitle: '我的课表与已报课程',
      finTitle: '电子收据记录与教材物流状态',
      aiTitle: '个人头像与学生证照片 (AI Studio)',
      aiDesc: '系统使用 AI (RMBG-1.4 / MODNet) 自动抠图并替换为书院标准暗红底色 (#800000)。',
      aiReady: '可上传正面免冠照片',
      btnPickPhoto: '选择新照片',
      btnSavePhoto: '保存头像',
      profEditTitle: '修改个人资料与出生日期',
      btnSaveProf: '保存个人资料',
      chkSched: '选择上课时间',
      chkMode: '上课方式',
      chkDelivery: '教材领取方式',
      delivPickup: '书院自取（免费）',
      delivShip: '快递邮寄（+฿50）',
      chkTotal: '应付总额',
      chkSlipHint: '请扫码转账并在下方上传转账凭证（工作人员将尽快审核）',
      btnSubmitCheckout: '确认提交报名与转账凭证',
      notifModalTitle: '消息通知与书院公告',
      iosGuideTitle: 'iPhone / iPad (iOS 16.4+) 指引：',
      iosGuideBody: '1. 点击 Safari 底部“分享”按钮并选择“添加到主屏幕”。2. 从桌面打开 OCA Student 后点击开启通知。',
      enableNotifBtn: '开启手机消息提醒',
      markAllRead: '全部标为已读',
      rcQrHint: '现场领取教材核验二维码',
      pwaModalTitle: '安装 OCA Student 应用 (PWA)',
      pwaPcTitle: '电脑端 (Chrome / Edge)：',
      pwaPcBody: '点击浏览器地址栏右侧的“安装应用”图标，然后点击“安装”。',
      pwaIosTitle: 'iPhone / iPad (Safari)：',
      pwaIosBody: '点击底部“分享”按钮，选择“添加到主屏幕”，然后点击“添加”。',
      pwaAndroidTitle: 'Android (Chrome)：',
      pwaAndroidBody: '点击右上角“⋮”菜单，选择“安装应用”。',
      termPrefix: '学期',
      coursesUnit: '门课程',
      enrollBtn: '报名 / 续费',
      noSlipPending: '暂无待审核凭证',
      slipPendingCount: '待审核凭证：',
      itemsUnit: '条',
      noScheduleMsg: '暂无课表记录，请前往“选课与缴费”报名课程。',
      noReceiptsMsg: '暂无收据记录',
      noNotifsMsg: '暂无通知或公告'
    }
  };

  function t(key) {
    const dict = I18N[_currentLang] || I18N.th;
    return dict[key] || I18N.th[key] || key;
  }

  function esc(v) {
    return String(v === undefined || v === null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function resolveStudentPhotoUrl(raw) {
    const s = String(raw || '').trim();
    if (!s) return './oca_logo.png';
    if (s.startsWith('data:image/') || s.startsWith('./') || s.startsWith('/')) return s;
    const g1 = s.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
    if (g1 && g1[1]) return 'https://lh3.googleusercontent.com/d/' + g1[1];
    const g2 = s.match(/drive\.google\.com\/open\?id=([^&]+)/i);
    if (g2 && g2[1]) return 'https://lh3.googleusercontent.com/d/' + g2[1];
    return s;
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
    const m1 = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    const m2 = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
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

  function applyI18nToNode(root) {
    if (!root || _isApplyingI18n) return;
    _isApplyingI18n = true;
    try {
      const scope = root.querySelectorAll ? root : document;
      scope.querySelectorAll('[data-i18n]').forEach((el) => {
        if (el.closest('[data-i18n-locked="true"]')) return;
        const k = el.getAttribute('data-i18n');
        const val = t(k);
        if (val && el.textContent !== val) el.textContent = val;
      });
      scope.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
        const k = el.getAttribute('data-i18n-placeholder');
        const val = t(k);
        if (val && el.getAttribute('placeholder') !== val) el.setAttribute('placeholder', val);
      });
      scope.querySelectorAll('[data-i18n-title]').forEach((el) => {
        const k = el.getAttribute('data-i18n-title');
        const val = t(k);
        if (val && el.getAttribute('title') !== val) el.setAttribute('title', val);
      });
    } finally {
      _isApplyingI18n = false;
    }
  }

  function setLang(lang) {
    _currentLang = I18N[lang] ? lang : 'th';
    localStorage.setItem(LANG_KEY, _currentLang);
    document.documentElement.lang = _currentLang;
    document.querySelectorAll('.st-lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === _currentLang));
    applyI18nToNode(document);
    const flipLbl = document.getElementById('lblFlipCardBtn');
    if (flipLbl) flipLbl.textContent = t(_isCardFlipped ? 'flipCardFront' : 'flipCardBack');
    renderNoticeCards();
    if (_student) {
      renderHeaderAndProfile();
      renderEnrollCategories();
      renderCoursesGrid();
      renderScheduleTab();
      renderFinanceTab();
      renderNotifModalList();
    }
  }

  function initRealtimeI18nObserver() {
    if (typeof MutationObserver !== 'function' || !document.body) return;
    let rafId = 0;
    const obs = new MutationObserver((mutations) => {
      if (_isApplyingI18n) return;
      const needsSync = mutations.some((m) => m.type === 'childList' && m.addedNodes && m.addedNodes.length > 0);
      if (!needsSync) return;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        applyI18nToNode(document);
      });
    });
    obs.observe(document.body, { childList: true, subtree: true });
    global.addEventListener('storage', (ev) => {
      if (ev.key === LANG_KEY && ev.newValue && ev.newValue !== _currentLang) {
        setLang(ev.newValue);
      }
    });
  }

  function showOnlyView(viewId) {
    ['viewStudentWelcome', 'viewStudentAuth', 'viewStudentRegister', 'viewStudentApp'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('st-hidden', id !== viewId);
    });
    const hdr = document.getElementById('stMainHeader');
    if (hdr) hdr.classList.toggle('st-hidden', viewId === 'viewStudentWelcome' || viewId === 'viewStudentAuth');
    const logoutBtn = document.getElementById('btnStudentLogout');
    if (logoutBtn) logoutBtn.classList.toggle('st-hidden', viewId !== 'viewStudentApp');
    const bellBtn = document.getElementById('btnStudentNotifBell');
    if (bellBtn) bellBtn.classList.toggle('st-hidden', viewId !== 'viewStudentApp');
  }

  function enterLoginFromWelcome() { showOnlyView('viewStudentAuth'); }
  function backToWelcome() { showOnlyView('viewStudentWelcome'); }
  function openRegisterView() { showOnlyView('viewStudentRegister'); }
  function backToLogin() { showOnlyView('viewStudentAuth'); }

  function toggleSidebar(forceOpen) {
    const sbEl = document.getElementById('stAppSidebar');
    if (!sbEl) return;
    if (typeof forceOpen === 'boolean') sbEl.classList.toggle('open', forceOpen);
    else sbEl.classList.toggle('open');
  }

  function flipIdCard() {
    _isCardFlipped = !_isCardFlipped;
    const inner = document.getElementById('ocaStudentCardInner');
    if (inner) inner.classList.toggle('flipped', _isCardFlipped);
    const lbl = document.getElementById('lblFlipCardBtn');
    if (lbl) lbl.textContent = t(_isCardFlipped ? 'flipCardFront' : 'flipCardBack');
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
    if (!sid || !secret || !_sb) return;
    if (btn) btn.disabled = true;

    try {
      let studentRow = null;
      let needsSetup = false;

      const { data: rpcData, error: rpcErr } = await _sb.rpc('student_portal_login', { p_student_id: sid, p_secret: secret });
      if (!rpcErr && rpcData && rpcData.ok && rpcData.student) {
        studentRow = rpcData.student;
        needsSetup = Boolean(rpcData.needs_dob_setup);
      } else {
        const { data: rows, error: qErr } = await _sb.from('students').select('*').eq('student_id', sid).limit(1);
        if (qErr) throw qErr;
        const st = Array.isArray(rows) ? rows[0] : null;
        if (!st) throw new Error('ไม่พบรหัสนักศึกษาในระบบ');
        const dbDob = normalizeDobIso(st.birth_date || '');
        const inDob = normalizeDobIso(secret);
        if (dbDob) {
          if (!inDob || inDob !== dbDob) throw new Error('วันเดือนปีเกิดไม่ถูกต้อง');
        } else if (secret !== '123456') {
          throw new Error('นักศึกษาที่ยังไม่มีวันเกิดในระบบ กรุณากรอกรหัสเริ่มต้น 123456');
        } else {
          needsSetup = true;
        }
        studentRow = st;
      }

      _student = studentRow;
      _needsDobSetup = needsSetup;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ student: _student, needsDobSetup: _needsDobSetup }));
      await enterApp('home');
    } catch (err) {
      if (errEl) {
        errEl.textContent = err.message || String(err);
        errEl.classList.remove('st-hidden');
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function handleRegister(ev) {
    ev.preventDefault();
    const errEl = document.getElementById('lblRegErr');
    const btn = document.getElementById('btnRegSubmit');
    if (errEl) errEl.classList.add('st-hidden');
    if (!_sb) return;

    const dobIso = normalizeDobIso(document.getElementById('regDob')?.value || '');
    if (!dobIso) {
      if (errEl) { errEl.textContent = 'กรุณากรอกวันเดือนปีเกิดให้ถูกต้อง (เช่น 15/05/2540)'; errEl.classList.remove('st-hidden'); }
      return;
    }

    if (btn) btn.disabled = true;
    try {
      const { yearBE, term } = await resolveActiveYearTerm();
      const yy = String(yearBE).slice(-2);
      const prefixCode = yy + String(term);
      const fullName = (document.getElementById('regFullName')?.value || '').trim();
      const prefix = (document.getElementById('regPrefix')?.value || '').trim();
      const citizenId = (document.getElementById('regCitizenId')?.value || '').trim();
      const phone = (document.getElementById('regPhone')?.value || '').trim();
      const lineId = (document.getElementById('regLine')?.value || '').trim();
      const email = (document.getElementById('regEmail')?.value || '').trim();
      const nationality = (document.getElementById('regNationality')?.value || 'ไทย').trim();
      const address = (document.getElementById('regAddress')?.value || '').trim();

      const { data: latestRows, error: latErr } = await _sb
        .from('students')
        .select('student_id')
        .like('student_id', prefixCode + '%')
        .order('student_id', { ascending: false })
        .limit(1);
      if (latErr) throw latErr;
      let nextSeq = 1;
      if (Array.isArray(latestRows) && latestRows[0] && latestRows[0].student_id) {
        const tail = Number(String(latestRows[0].student_id).slice(prefixCode.length));
        if (Number.isFinite(tail) && tail >= 1) nextSeq = tail + 1;
      }
      const newSid = prefixCode + String(nextSeq).padStart(4, '0');

      const insertPayload = {
        student_id: newSid,
        prefix,
        full_name: fullName,
        birth_date: dobIso,
        citizen_id: citizenId,
        phone_number: phone,
        line_id: lineId,
        email,
        nationality,
        address,
        year_be: yearBE,
        term,
        registration_channel: 'STUDENT_WEBAPP',
        status: 'ACTIVE',
        created_at: new Date().toISOString()
      };

      const { data: insRows, error: insErr } = await _sb.from('students').insert([insertPayload]).select('*');
      if (insErr) throw insErr;

      _student = (Array.isArray(insRows) && insRows[0]) ? insRows[0] : insertPayload;
      _needsDobSetup = false;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ student: _student, needsDobSetup: false }));
      showToast('ลงทะเบียนสำเร็จ! รหัสนักศึกษาของคุณคือ ' + newSid);
      await enterApp('enroll');
    } catch (err) {
      if (errEl) {
        errEl.textContent = err.message || String(err);
        errEl.classList.remove('st-hidden');
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function enterApp(defaultTab) {
    showOnlyView('viewStudentApp');
    renderHeaderAndProfile();
    switchTab(defaultTab || 'home');
    await loadStudentAppData();
    subscribeStudentNotifications();
  }

  function switchTab(tabName) {
    document.querySelectorAll('.st-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
    document.querySelectorAll('.st-tab-panel').forEach(p => p.classList.toggle('st-hidden', p.id !== 'tabPanel_' + tabName));
    toggleSidebar(false);
  }

  function renderHeaderAndProfile() {
    if (!_student) return;
    const fullName = [_student.prefix, _student.full_name].filter(Boolean).join(' ') || _student.student_id;
    const photo = resolveStudentPhotoUrl(_student.photo_url);

    const setImg = (id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.onerror = () => { el.onerror = null; el.src = './oca_logo.png'; };
      el.src = photo;
    };
    setImg('imgAppAvatar');
    setImg('imgAppAvatarMob');
    setImg('imgCardPhoto');
    setImg('imgProfileAiPreview');

    document.getElementById('lblAppStudentName').textContent = fullName;
    document.getElementById('lblAppStudentId').textContent = _student.student_id;
    const mobName = document.getElementById('lblAppStudentNameMob');
    const mobSid = document.getElementById('lblAppStudentIdMob');
    if (mobName) mobName.textContent = fullName;
    if (mobSid) mobSid.textContent = _student.student_id;
    document.getElementById('lblAppStatus').textContent = _student.status || 'ACTIVE';
    document.getElementById('bannerLegacyDob')?.classList.toggle('st-hidden', !_needsDobSetup);

    document.getElementById('lblHomeCourse').textContent = _student.current_course || '-';
    document.getElementById('lblHomeSched').textContent = _student.current_schedule || '-';
    document.getElementById('lblHomeCoursesCount').textContent = String(_receipts.length || 0);

    document.getElementById('lblCardSid').textContent = _student.student_id;
    document.getElementById('lblCardName').textContent = fullName;
    const cardNameEn = document.getElementById('lblCardNameEn');
    if (cardNameEn) cardNameEn.textContent = _student.full_name_en || _student.nickname || '';
    document.getElementById('lblCardCourse').textContent = _student.current_course || 'Oriental Culture Academy';
    const issueEl = document.getElementById('lblCardIssueDate');
    if (issueEl) {
      const dt = _student.created_at ? new Date(_student.created_at) : new Date();
      issueEl.textContent = dt.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    const qrBox = document.getElementById('boxCardQr');
    if (qrBox && global.QRCode) {
      qrBox.innerHTML = '';
      new global.QRCode(qrBox, { text: 'OCA-ST:' + _student.student_id, width: 88, height: 88 });
    }

    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    setVal('profDob', formatIsoToThaiDob(_student.birth_date || ''));
    setVal('profPhone', _student.phone_number || '');
    setVal('profLine', _student.line_id || '');
    setVal('profEmail', _student.email || '');
    setVal('profAddress', _student.address || '');
    setVal('profEmergName', _student.emergency_name || '');
    setVal('profEmergPhone', _student.emergency_phone || '');

    const sumBox = document.getElementById('boxProfileDbSummary');
    if (sumBox) {
      sumBox.innerHTML =
        `<div><strong>ID:</strong> <span data-i18n-locked="true">${esc(_student.student_id)}</span> • <strong>Status:</strong> ${esc(_student.status || 'ACTIVE')}</div>` +
        `<div><strong>${esc(t('fldNationality'))}:</strong> ${esc(_student.nationality || '-')} ${(_student.ethnicity ? '(' + esc(_student.ethnicity) + ')' : '')}</div>` +
        `<div><strong>Level:</strong> ${esc(_student.language_level || '-')} • <strong>${esc(t('homeTotalCoursesLbl'))}:</strong> ${_receipts.length}</div>` +
        `<div><strong>${esc(t('homeCourseLbl'))}:</strong> <span data-i18n-locked="true">${esc(_student.current_course || '-')}</span></div>`;
    }
  }

  async function loadStudentAppData() {
    if (!_sb || !_student) return;
    const sid = String(_student.student_id || '').trim();
    const [resSt, resC, resSc, resRc, resPend, resNotif] = await Promise.all([
      _sb.from('students').select('*').eq('student_id', sid).maybeSingle(),
      _sb.from('courses').select('*').eq('is_active', true).order('code', { ascending: true }),
      _sb.from('schedules').select('*').eq('is_active', true).order('id', { ascending: true }),
      _sb.from('receipts').select('*').eq('student_id', sid).order('created_at', { ascending: false }),
      _sb.from('fee_settings').select('key,name,amount,mode,updated_at').like('key', 'pending_slip%:' + sid),
      _sb.from('fee_settings').select('key,name,amount,mode,updated_at').eq('key', 'student_notif:' + sid).maybeSingle()
    ]);

    if (!resSt.error && resSt.data) {
      _student = resSt.data;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ student: _student, needsDobSetup: _needsDobSetup }));
    }
    _courses = Array.isArray(resC.data) ? resC.data : [];
    _schedules = Array.isArray(resSc.data) ? resSc.data : [];
    _receipts = Array.isArray(resRc.data) ? resRc.data.filter(r => String(r.claim_status || '').toUpperCase() !== 'VOIDED') : [];
    _pendingSlips = Array.isArray(resPend.data) ? resPend.data.filter(r => r.key && r.key.startsWith('pending_slip:')) : [];

    _notifs = [];
    if (resNotif && resNotif.data) _notifs.push(resNotif.data);
    _receipts.slice(0, 5).forEach(r => {
      _notifs.push({
        key: 'rc_' + r.receipt_no,
        name: '#' + r.receipt_no + ' • ' + (r.item_name || r.item_code || ''),
        amount: r.grand_total,
        mode: r.claim_status || 'PENDING',
        updated_at: r.created_at
      });
    });

    await loadNoticeBoard();
    updateNotifBadge();
    renderHeaderAndProfile();

    const pendEl = document.getElementById('lblHomePending');
    if (pendEl) {
      pendEl.textContent = _pendingSlips.length > 0
        ? `${t('slipPendingCount')} ${_pendingSlips.length} ${t('itemsUnit')}`
        : t('noSlipPending');
    }

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
    const labels = {
      th: { ALL: 'ทั้งหมด', LEARNED: `คอร์สที่เรียนแล้ว (${learnedCodes.size})`, BOOKS: 'ซื้อตำราเรียน', EXAM: 'สอบวัดความรู้ภาษาจีน', KIDS: 'คอร์สเด็ก', BEG: 'คอร์สขั้นต้น', INT: 'คอร์สขั้นกลาง', ADV: 'คอร์สขั้นสูง', CONVO: 'คอร์สสนทนา', HSK: 'ติวสอบวัดระดับ HSK', ART: 'ศิลป์ (วาดภาพ/เขียนอักษร)', MUSIC: 'ดนตรีจีน', OTHER: 'คอร์สทั่วไป/อื่นๆ' },
      en: { ALL: 'All Courses', LEARNED: `Completed (${learnedCodes.size})`, BOOKS: 'Textbooks', EXAM: 'Proficiency Exam', KIDS: 'Kids', BEG: 'Beginner', INT: 'Intermediate', ADV: 'Advanced', CONVO: 'Conversation', HSK: 'HSK Prep', ART: 'Chinese Art & Calligraphy', MUSIC: 'Chinese Music', OTHER: 'Other Courses' },
      zh: { ALL: '全部课程', LEARNED: `已学课程 (${learnedCodes.size})`, BOOKS: '购买教材', EXAM: '汉语水平测试', KIDS: '少儿汉语', BEG: '初级课程', INT: '中级课程', ADV: '高级课程', CONVO: '口语会话', HSK: 'HSK 辅导', ART: '书画艺术', MUSIC: '中国民乐', OTHER: '综合课程' }
    };
    const l = labels[_currentLang] || labels.th;
    const ids = ['ALL', 'LEARNED', 'BOOKS', 'EXAM', 'KIDS', 'BEG', 'INT', 'ADV', 'CONVO', 'HSK', 'ART', 'MUSIC', 'OTHER'];
    box.innerHTML = ids.map(id =>
      `<button type="button" class="st-cat-btn ${_activeCat === id ? 'active' : ''}" onclick="OcaStudentPortal.selectCategory('${id}')">${esc(l[id])}</button>`
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

    const filtered = _courses.filter(c => {
      if (_activeCat === 'LEARNED' && !learnedCodes.has(String(c.code || '').toUpperCase())) return false;
      if (_activeCat !== 'ALL' && _activeCat !== 'LEARNED' && detectCategory(c) !== _activeCat) return false;
      if (q && !((c.code || '') + ' ' + (c.name || '')).toLowerCase().includes(q)) return false;
      return true;
    });

    if (lblCount) lblCount.textContent = `${filtered.length} ${t('coursesUnit')}`;
    grid.innerHTML = filtered.map(c => {
      const isLearned = learnedCodes.has(String(c.code || '').toUpperCase());
      const badge = isLearned
        ? '<span style="background:#022C22;color:#FFFFFF;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;"><i class="fa-solid fa-check"></i></span>'
        : `<span style="background:#DCFCE7;color:#166534;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;">${esc(c.level || 'OCA')}</span>`;
      return `
        <div class="st-card" style="padding:14px;display:flex;flex-direction:column;justify-content:space-between;gap:10px;">
          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:6px;">
              <strong data-i18n-locked="true" style="font-family:monospace;font-size:14px;color:#0369A1;background:#E0F2FE;padding:2px 8px;border-radius:8px;">${esc(c.code)}</strong>
              ${badge}
            </div>
            <div data-i18n-locked="true" style="font-size:14px;font-weight:700;color:#0F172A;line-height:1.4;">${esc(c.name)}</div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid #F1F5F9;">
            <strong style="font-size:16px;font-family:monospace;color:#047857;">฿${Number(c.price || 0).toLocaleString('en-US')}</strong>
            <button type="button" class="st-btn-primary" style="padding:7px 12px;font-size:12.5px;" onclick="OcaStudentPortal.openCheckout(${Number(c.id)})">${esc(t('enrollBtn'))}</button>
          </div>
        </div>`;
    }).join('');
  }

  function openCheckout(courseId) {
    const c = _courses.find(x => Number(x.id) === Number(courseId));
    if (!c) return;
    _checkoutCourse = c;
    document.getElementById('lblCheckoutCourseTitle').textContent = `${c.code} — ${c.name}`;
    const selSched = document.getElementById('selCheckoutSched');
    if (selSched) {
      selSched.innerHTML = _schedules.map(s => `<option value="${esc(s.name + ' ' + (s.day_time || ''))}">${esc(s.name)} (${esc(s.day_time || '')})</option>`).join('');
    }
    recalcCheckout();
    document.getElementById('modalStudentCheckout')?.classList.remove('st-hidden');
  }

  function closeCheckout() {
    document.getElementById('modalStudentCheckout')?.classList.add('st-hidden');
  }

  function recalcCheckout() {
    if (!_checkoutCourse) return;
    const base = Number(_checkoutCourse.price || 0);
    const deliv = document.getElementById('selCheckoutDelivery')?.value || 'รับเอง';
    const ship = deliv === 'ส่งตำรา' ? 50 : 0;
    document.getElementById('lblCheckoutTotal').textContent = '฿' + (base + ship).toLocaleString('en-US', { minimumFractionDigits: 2 });
  }

  async function submitEnrollment() {
    if (!_sb || !_student || !_checkoutCourse) return;
    const fileInput = document.getElementById('inpCheckoutSlipFile');
    const file = fileInput && fileInput.files && fileInput.files[0];
    if (!file) { showToast('กรุณาแนบรูปสลิปการโอนเงินก่อนส่ง'); return; }
    const btn = document.getElementById('btnSubmitCheckout');
    if (btn) btn.disabled = true;

    try {
      const sid = String(_student.student_id).trim();
      const base = Number(_checkoutCourse.price || 0);
      const deliv = document.getElementById('selCheckoutDelivery')?.value || 'รับเอง';
      const total = base + (deliv === 'ส่งตำรา' ? 50 : 0);
      const ext = (file.name.split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '');
      const path = `student_slip_${sid}_${Date.now()}.${ext}`;
      const { error: upErr } = await _sb.storage.from('payment-slips').upload(path, file, { upsert: true });
      if (upErr) throw upErr;

      const pubUrl = _sb.storage.from('payment-slips').getPublicUrl(path)?.data?.publicUrl || path;
      const summaryName = (`${_checkoutCourse.code} ${deliv}`).slice(0, 90);
      const { error: pErr } = await _sb.from('fee_settings').upsert([
        { key: 'pending_slip:' + sid, name: summaryName, amount: total, mode: 'PENDING', updated_at: new Date().toISOString() },
        { key: 'pending_slip_url:' + sid, name: String(pubUrl).slice(0, 90), amount: total, mode: 'PENDING', updated_at: new Date().toISOString() }
      ], { onConflict: 'key' });
      if (pErr) throw pErr;

      closeCheckout();
      await loadStudentAppData();
      switchTab('finance');
      showToast('ส่งใบสมัครและสลิปเรียบร้อยแล้ว');
    } catch (err) {
      showToast('ส่งสลิปไม่สำเร็จ: ' + (err.message || err));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function renderScheduleTab() {
    const box = document.getElementById('boxStudentScheduleList');
    if (!box) return;
    if (!_receipts.length) {
      box.innerHTML = `<div style="color:#64748B;font-size:13px;">${esc(t('noScheduleMsg'))}</div>`;
      return;
    }
    box.innerHTML = _receipts.map(r => `
      <div style="border:1px solid #E2E8F0;border-radius:12px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
        <div>
          <div data-i18n-locked="true" style="font-size:14px;font-weight:800;">${esc(r.item_name || r.item_code || '-')}</div>
          <div data-i18n-locked="true" style="font-size:12.5px;color:#047857;margin-top:2px;"><i class="fa-regular fa-clock"></i> ${esc(r.schedule_info || '-')} • ${esc(r.learning_mode || 'Onsite')}</div>
        </div>
        <span style="background:#DCFCE7;color:#166534;font-size:11.5px;font-weight:700;padding:4px 10px;border-radius:999px;">#${esc(r.receipt_no || '-')}</span>
      </div>
    `).join('');
  }

  function renderFinanceTab() {
    const pendBox = document.getElementById('boxStudentPendingSlips');
    if (pendBox) {
      pendBox.innerHTML = _pendingSlips.map(p => `
        <div class="st-card" style="padding:14px;background:#FEF3C7;border-color:#F59E0B;display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <div>
            <div style="font-size:13px;font-weight:800;color:#92400E;">${esc(t('slipPendingCount'))}</div>
            <div style="font-size:14px;font-weight:700;">${esc(p.name)} • ฿${Number(p.amount || 0).toLocaleString('en-US')}</div>
          </div>
          <span style="background:#F59E0B;color:#0F172A;font-size:11.5px;font-weight:800;padding:4px 10px;border-radius:999px;">PENDING</span>
        </div>
      `).join('');
    }
    const rcBox = document.getElementById('boxStudentReceiptsList');
    if (!rcBox) return;
    if (!_receipts.length) {
      rcBox.innerHTML = `<div style="color:#64748B;font-size:13px;">${esc(t('noReceiptsMsg'))}</div>`;
      return;
    }
    rcBox.innerHTML = _receipts.map(r => `
      <div style="border:1px solid #E2E8F0;border-radius:12px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
        <div>
          <div data-i18n-locked="true" style="font-size:14px;font-weight:800;">#${esc(r.receipt_no)} • ${esc(r.item_name || r.item_code || '-')}</div>
          <div style="font-size:12px;color:#475569;margin-top:2px;">
            ฿${Number(r.grand_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} • ${esc(r.delivery_method || 'รับเอง')}
            ${r.tracking_number ? ` • <strong style="color:#0369A1;">Tracking: ${esc(r.tracking_number)}</strong>` : ''}
          </div>
        </div>
        <button type="button" class="st-btn-outline" style="font-size:12px;padding:6px 10px;" onclick="OcaStudentPortal.openReceiptDetail('${esc(r.receipt_no)}')">
          <i class="fa-solid fa-qrcode"></i> QR / Details
        </button>
      </div>
    `).join('');
  }

  async function onProfilePhotoSelected(input) {
    const file = input && input.files && input.files[0];
    if (!file) return;
    const statusEl = document.getElementById('lblAiPhotoStatus');
    const previewEl = document.getElementById('imgProfileAiPreview');
    const saveBtn = document.getElementById('btnSaveAiPhoto');
    if (saveBtn) saveBtn.classList.add('st-hidden');
    if (statusEl) statusEl.textContent = 'AI Processing...';
    try {
      const res = await global.OcaStudentAiPhoto.processPortraitToCrimson(file, (msg) => {
        if (statusEl) statusEl.textContent = msg;
      });
      _pendingAiPhoto = res;
      if (previewEl) previewEl.src = res.dataUrl;
      if (statusEl) statusEl.textContent = 'OK (' + res.engine.toUpperCase() + ')';
      if (saveBtn) saveBtn.classList.remove('st-hidden');
    } catch (err) {
      if (statusEl) statusEl.textContent = 'Error: ' + (err.message || err);
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
      if (!pubUrl) throw new Error('Public URL failed');
      const { error: rpcErr } = await _sb.rpc('student_portal_update_profile', { p_student_id: sid, p_photo_url: pubUrl });
      if (rpcErr) {
        const { error: updErr } = await _sb.from('students').update({ photo_url: pubUrl }).eq('student_id', sid);
        if (updErr) throw updErr;
      }
      _student.photo_url = pubUrl;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ student: _student, needsDobSetup: _needsDobSetup }));
      renderHeaderAndProfile();
      if (btn) btn.classList.add('st-hidden');
      showToast('บันทึกรูปโปรไฟล์เรียบร้อยแล้ว');
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
    if (!dobIso) { showToast('กรุณากรอกวันเดือนปีเกิดให้ถูกต้อง (เช่น 15/05/2540)'); return; }
    const btn = document.getElementById('btnSaveProfile');
    if (btn) btn.disabled = true;
    try {
      const sid = String(_student.student_id).trim();
      const phone = (document.getElementById('profPhone')?.value || '').trim();
      const lineId = (document.getElementById('profLine')?.value || '').trim();
      const email = (document.getElementById('profEmail')?.value || '').trim();
      const address = (document.getElementById('profAddress')?.value || '').trim();
      const emergName = (document.getElementById('profEmergName')?.value || '').trim();
      const emergPhone = (document.getElementById('profEmergPhone')?.value || '').trim();

      const { error: rpcErr } = await _sb.rpc('student_portal_update_profile', {
        p_student_id: sid, p_birth_date: dobIso, p_phone: phone, p_line_id: lineId, p_email: email, p_address: address
      });
      if (rpcErr) {
        const { error: updErr } = await _sb.from('students').update({
          birth_date: dobIso, phone_number: phone, line_id: lineId, email, address, emergency_name: emergName, emergency_phone: emergPhone
        }).eq('student_id', sid);
        if (updErr) throw updErr;
      } else if (emergName || emergPhone) {
        const { error: emErr } = await _sb.from('students').update({
          emergency_name: emergName, emergency_phone: emergPhone
        }).eq('student_id', sid);
        if (emErr) console.warn('[saveProfile emergency]', emErr.message || emErr);
      }

      _student.birth_date = dobIso;
      _student.phone_number = phone;
      _student.line_id = lineId;
      _student.email = email;
      _student.address = address;
      _student.emergency_name = emergName;
      _student.emergency_phone = emergPhone;
      _needsDobSetup = false;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ student: _student, needsDobSetup: false }));
      renderHeaderAndProfile();
      showToast('บันทึกประวัติส่วนตัวเรียบร้อยแล้ว');
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
    const unreadReceipts = _notifs.filter(n => n.updated_at && Date.parse(n.updated_at) > seenAt).length;
    const unreadNotices = _notices.filter(n => n.createdMs && n.createdMs > seenAt).length;
    const totalUnread = unreadReceipts + unreadNotices;
    badge.textContent = totalUnread > 9 ? '9+' : String(totalUnread);
    badge.classList.toggle('st-hidden', totalUnread === 0);
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
                body: (p.itemName || 'OCA') + ' • ฿' + Number(p.grandTotal || 0).toLocaleString('en-US'),
                icon: './student-icon-192.png',
                badge: './student-favicon.png',
                data: { url: './?tab=finance' }
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
    if (isIosNonStandalone()) { openNotifModal(); return; }
    if (!('Notification' in global)) { showToast('เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน'); return; }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { showToast('ไม่ได้รับอนุญาตให้ส่งการแจ้งเตือน'); return; }
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        if (reg && typeof reg.showNotification === 'function') {
          await reg.showNotification('OCA Student', {
            body: 'เปิดรับแจ้งเตือนสำเร็จแล้ว',
            icon: './student-icon-192.png',
            badge: './student-favicon.png'
          });
        }
        if (reg && reg.pushManager && _sb && _student) {
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
            if (subErr) console.warn('[push_sub]', subErr.message || subErr);
          }
        }
      } catch (_) {}
    }
    showToast('เปิดรับแจ้งเตือนบนมือถือเรียบร้อยแล้ว');
  }

  function renderNotifModalList() {
    const list = document.getElementById('boxStudentNotifList');
    if (!list) return;
    const noticeHtml = _notices.map((n) => {
      const dtStr = n.createdMs ? new Date(n.createdMs).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
      return `
        <div onclick="OcaStudentPortal.openNoticeDetail('${esc(n.id)}')" style="border:1px solid #FDE68A;border-radius:12px;padding:10px 12px;background:#FFFBEB;cursor:pointer;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
            <span style="font-size:11px;font-weight:800;color:#92400E;"><i class="fa-solid fa-bullhorn"></i> ${esc(t('noticeBoardTitle'))}</span>
            <span style="font-size:11px;color:#64748B;">${esc(dtStr)}</span>
          </div>
          <div style="font-size:13.5px;font-weight:800;color:#0F172A;margin-top:3px;">${esc(n.title)}</div>
          ${n.body ? `<div style="font-size:12px;color:#475569;margin-top:2px;">${esc(n.body)}</div>` : ''}
        </div>`;
    });

    const receiptHtml = _notifs.map((n) => {
      const dt = n.updated_at ? new Date(n.updated_at).toLocaleString('th-TH') : '';
      return `
        <div style="border:1px solid #E2E8F0;border-radius:12px;padding:10px 12px;background:#F8FAFC;">
          <div style="font-size:13.5px;font-weight:700;color:#0F172A;"><i class="fa-solid fa-receipt" style="color:#047857;"></i> ${esc(n.name || '-')}</div>
          <div style="font-size:12px;color:#475569;margin-top:2px;">฿${Number(n.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} • ${esc(n.mode || '')} • ${esc(dt)}</div>
        </div>`;
    });

    const combined = noticeHtml.concat(receiptHtml);
    list.innerHTML = combined.length ? combined.join('') : `<div style="color:#64748B;font-size:13px;">${esc(t('noNotifsMsg'))}</div>`;
  }

  function openNotifModal() {
    document.getElementById('boxIosNotifGuide')?.classList.toggle('st-hidden', !isIosNonStandalone());
    renderNotifModalList();
    document.getElementById('modalStudentNotif')?.classList.remove('st-hidden');
  }

  function closeNotifModal() { document.getElementById('modalStudentNotif')?.classList.add('st-hidden'); }

  function markAllNotifsRead() {
    if (_student) localStorage.setItem('oca_st_notif_seen_' + _student.student_id, String(Date.now()));
    updateNotifBadge();
    closeNotifModal();
  }

  function openReceiptDetail(rcNo) {
    const r = _receipts.find(x => String(x.receipt_no) === String(rcNo));
    if (!r) return;
    document.getElementById('lblRcDetailTitle').textContent = '#' + (r.receipt_no || '');
    document.getElementById('boxRcDetailBody').innerHTML =
      `<div data-i18n-locked="true"><strong>${esc(r.item_name || r.item_code || '-')}</strong></div>` +
      `<div><strong style="color:#047857;">฿${Number(r.grand_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></div>` +
      `<div>${esc(r.delivery_method || 'รับเองที่สถาบัน')} • ${esc(r.claim_status || 'PENDING')}</div>` +
      (r.tracking_number ? `<div>Tracking: <span style="font-family:monospace;">${esc(r.tracking_number)}</span></div>` : '');
    const qrBox = document.getElementById('boxRcDetailQr');
    if (qrBox && global.QRCode) {
      qrBox.innerHTML = '';
      new global.QRCode(qrBox, { text: 'OCA-RC:' + r.receipt_no, width: 110, height: 110 });
    }
    document.getElementById('modalStudentReceiptDetail')?.classList.remove('st-hidden');
  }

  function closeReceiptDetail() { document.getElementById('modalStudentReceiptDetail')?.classList.add('st-hidden'); }

  function renderNoticeCards() {
    const loginBox = document.getElementById('listStudentNotices');
    if (!loginBox) return;
    const cats = (global.OcaNoticeBoard && global.OcaNoticeBoard.CATEGORIES) || {};
    const fallbackNotice = {
      id: 'default',
      title: _currentLang === 'en' ? 'Welcome to OCA Student Portal' : (_currentLang === 'zh' ? '欢迎使用东方文化书院学员在线系统' : 'ยินดีต้อนรับสู่ระบบนักศึกษา OCA'),
      body: _currentLang === 'en'
        ? 'Enroll in courses, upload payment slips, view schedules, and access your digital student ID card anytime.'
        : (_currentLang === 'zh' ? '在线选课报名、上传转账凭证、查看课表与电子学生证，随时随地便捷使用。' : 'สามารถสมัครคอร์สเรียน แนบสลิปโอนเงิน ดูตารางเรียน บัตรนักศึกษา และรับใบเสร็จได้ตลอด 24 ชม.'),
      category: 'GENERAL',
      pinned: true,
      isNew: false,
      createdMs: Date.now()
    };
    const items = _notices.length > 0 ? _notices : [fallbackNotice];

    loginBox.innerHTML = items.map((n) => {
      const cat = cats[n.category] || { th: 'ประกาศ', en: 'Notice', zh: '公告', bg: '#E0F2FE', fg: '#0369A1' };
      const catLabel = cat[_currentLang] || cat.th;
      const dtStr = n.createdMs ? new Date(n.createdMs).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '';
      return `
        <div class="oca-notice-item" onclick="OcaStudentPortal.openNoticeDetail('${esc(n.id)}')">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px;">
            ${n.pinned ? '<span style="background:#FEF3C7;color:#92400E;font-size:10.5px;font-weight:800;padding:1px 7px;border-radius:999px;"><i class="fa-solid fa-thumbtack"></i></span>' : ''}
            ${n.isNew ? '<span style="background:#EF4444;color:#FFFFFF;font-size:10.5px;font-weight:800;padding:1px 7px;border-radius:999px;">NEW</span>' : ''}
            <span style="background:${cat.bg};color:${cat.fg};font-size:10.5px;font-weight:800;padding:1px 7px;border-radius:999px;">${esc(catLabel)}</span>
            <span style="font-size:11px;color:#A7F3D0;margin-left:auto;">${esc(dtStr)}</span>
          </div>
          <div style="font-size:13.5px;font-weight:700;color:#FFFFFF;line-height:1.4;">${esc(n.title)}</div>
          ${n.body ? `<div style="font-size:12px;color:#D1FAE5;margin-top:3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${esc(n.body)}</div>` : ''}
        </div>`;
    }).join('');
  }

  async function loadNoticeBoard() {
    try {
      const term = await resolveActiveYearTerm();
      const termEl = document.getElementById('lblLoginActiveTerm');
      if (termEl) termEl.textContent = `${t('termPrefix')} ${term.term}/${term.yearBE}`;
      if (_sb && global.OcaNoticeBoard && typeof global.OcaNoticeBoard.fetchNotices === 'function') {
        _notices = await global.OcaNoticeBoard.fetchNotices(_sb, { includeExpired: false });
      }
    } catch (err) {
      console.warn('[loadNoticeBoard]', err);
    }
    renderNoticeCards();
    updateNotifBadge();
    renderNotifModalList();
  }

  function openNoticeDetail(id) {
    const n = _notices.find(x => String(x.id) === String(id));
    if (!n) return;
    document.getElementById('lblNoticeModalTitle').textContent = n.title || t('noticeBoardTitle');
    const dtStr = n.createdMs ? new Date(n.createdMs).toLocaleDateString('th-TH', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
    document.getElementById('boxNoticeModalMeta').textContent = dtStr;
    document.getElementById('boxNoticeModalBody').textContent = n.body || '-';
    document.getElementById('modalStudentNoticeDetail')?.classList.remove('st-hidden');
  }

  function closeNoticeDetail() { document.getElementById('modalStudentNoticeDetail')?.classList.add('st-hidden'); }

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

  async function installPwa() {
    const promptEvt = global.__ocaStudentDeferredPrompt || _deferredPwaPrompt;
    if (promptEvt && typeof promptEvt.prompt === 'function') {
      try {
        promptEvt.prompt();
        await promptEvt.userChoice;
      } catch (_) {}
      global.__ocaStudentDeferredPrompt = null;
      _deferredPwaPrompt = null;
      return;
    }
    document.getElementById('modalStudentPwaGuide')?.classList.remove('st-hidden');
  }

  function closePwaGuide() { document.getElementById('modalStudentPwaGuide')?.classList.add('st-hidden'); }

  global.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _deferredPwaPrompt = e;
    global.__ocaStudentDeferredPrompt = e;
    const btn = document.getElementById('btnStudentPwaInstall');
    if (btn) btn.classList.remove('st-hidden');
  });

  if ('serviceWorker' in navigator) {
    global.addEventListener('load', () => {
      const inStudentDir = /\/student(\/|$)/i.test(global.location.pathname || '');
      const swPath = inStudentDir ? './student/sw.js' : './sw.js';
      navigator.serviceWorker.register(swPath, { updateViaCache: 'none' }).catch(() => {});
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initRealtimeI18nObserver();
    setLang(_currentLang);
    loadNoticeBoard();
    if (_sb && global.OcaNoticeBoard && typeof global.OcaNoticeBoard.subscribeNotices === 'function') {
      global.OcaNoticeBoard.subscribeNotices(_sb, async () => {
        await loadNoticeBoard();
        if (_student) showToast(t('noticeBoardTitle'));
      });
    }
    try {
      const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      if (saved && saved.student && saved.student.student_id) {
        _student = saved.student;
        _needsDobSetup = Boolean(saved.needsDobSetup);
        const tabParam = new URLSearchParams(global.location.search || '').get('tab') || 'home';
        enterApp(tabParam);
      }
    } catch (_) {}
  });

  global.OcaStudentPortal = {
    setLang,
    enterLoginFromWelcome,
    backToWelcome,
    openRegisterView,
    backToLogin,
    toggleSidebar,
    flipIdCard,
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
    openNoticeDetail,
    closeNoticeDetail,
    logout,
    installPwa,
    closePwaGuide
  };
})(window);
