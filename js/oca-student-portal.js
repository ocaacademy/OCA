/**
 * OCA Student Web App Controller (v360)
 * - Isolated PWA scope (/OCA/student/)
 * - Password-masked 8-digit DOB (DDMMYYYY) + Eye Toggle + Brute-force Lockout (5 fails -> 60s)
 * - 30-Min Idle Auto-Logout + Live Account Status Guard + 5MB Image/Slip Guard
 * - Staff-Parity Course Catalog (13 Icon Categories + Smart Next-Course Recommendation + Dynamic Shipping)
 * - Current-Course-Only Schedule (Term Timetable + Lecturer Lookup)
 * - Thai Address Autocomplete + Hover-Preview Popover (Notices, Courses, Receipts)
 * - 3D Flippable Official Gold ID Card + Real-Time 3-Language i18n (th / en / zh)
 */
(function (global) {
  'use strict';

  const SUPABASE_URL = 'https://bapsvgjgexjhqnykilse.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_LLxdgD2RTMYpl8ygAK3v9w_vRAbqpWQ';
  const SESSION_KEY = 'oca_student_session';
  const LANG_KEY = 'oca_student_lang';
  const LOGIN_GUARD_KEY = 'oca_st_login_guard';
  const MAX_LOGIN_FAILS = 5;
  const LOCKOUT_MS = 60 * 1000;
  const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
  const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
  const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

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
  let _shippingFee = 50;
  let _feeRules = {};
  let _activeCat = 'ALL';
  let _checkoutCourse = null;
  let _pendingAiPhoto = null;
  let _deferredPwaPrompt = global.__ocaStudentDeferredPrompt || null;
  let _notifs = [];
  let _notices = [];
  let _isCardFlipped = false;
  let _isApplyingI18n = false;
  let _thaiAddrIndex = null;
  let _lecturerMap = null;
  let _termInfo = null;
  let _hoverHideTimer = null;
  let _idleTimer = null;

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
      loginSecret: 'รหัสผ่าน (วันเดือนปีเกิด 8 หลัก เช่น 15052540 หรือ 123456)',
      phSid: 'เช่น 6950001',
      phSecret: '15052540 หรือ 123456',
      togglePassTitle: 'แสดง/ซ่อนรหัสผ่าน',
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
      fldAddrSearch: 'ค้นหาที่อยู่ไทยอัตโนมัติ (รหัสไปรษณีย์ / ตำบล / อำเภอ)',
      phAddrSearch: 'พิมพ์รหัสไปรษณีย์ เช่น 10330 หรือชื่อตำบล...',
      fldAddress: 'ที่อยู่จัดส่งตำราเรียน',
      fldEmergName: 'ผู้ติดต่อฉุกเฉิน',
      fldEmergPhone: 'เบอร์ผู้ติดต่อฉุกเฉิน',
      btnRegSubmit: 'ยืนยันลงทะเบียนและไปเลือกคอร์สเรียน',
      menuBtn: 'เมนู',
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
      schedTitle: 'ตารางเรียนคอร์สปัจจุบัน',
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
      delivShip: 'จัดส่งพัสดุตามที่อยู่',
      chkTotal: 'ยอดชำระสุทธิ',
      chkSlipHint: 'สแกนโอนเงินแล้วแนบสลิปด้านล่าง (เฉพาะ JPG/PNG/WEBP ไม่เกิน 5MB)',
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
      enrollBtn: '+ เลือกคอร์ส',
      recommendedBadge: 'แนะนำสำหรับคุณ',
      learnedBadge: 'เรียนแล้ว',
      currentCourseBadge: 'กำลังเรียนในภาคเรียนนี้',
      lecturerLbl: 'อาจารย์ผู้สอน',
      termPeriodLbl: 'ช่วงเวลาภาคเรียน',
      noSlipPending: 'ไม่มีสลิปรอตรวจสอบ',
      slipPendingCount: 'มีสลิปรอตรวจสอบ',
      itemsUnit: 'รายการ',
      noScheduleMsg: 'ยังไม่มีข้อมูลคอร์สปัจจุบัน กรุณาเลือกคอร์สในแท็บ "เลือกคอร์ส & แนบสลิป"',
      noReceiptsMsg: 'ยังไม่มีประวัติใบเสร็จรับเงิน',
      noNotifsMsg: 'ยังไม่มีการแจ้งเตือนหรือประกาศใหม่',
      btnDownloadCard: 'บันทึกรูปบัตร (PNG)',
      btnDownloadReceipt: 'บันทึกรูปใบเสร็จ (PNG)',
      toggleThemeTitle: 'สลับโหมดมืด/สว่าง',
      feeTuition: 'ค่าเรียน',
      feeReg: 'ค่าแรกเข้า (นักศึกษาใหม่)',
      feeOther: 'ค่าธรรมเนียมอื่นๆ',
      feeLatePenalty: 'ค่าปรับลงทะเบียนล่าช้า',
      feeShipping: 'ค่าจัดส่งตำราเรียน',
      feeDiscount: 'ส่วนลดตามสิทธิ์',
      errNoImage: 'กรุณาเลือกไฟล์รูปภาพ',
      errImageType: 'รองรับเฉพาะไฟล์ภาพ JPG, PNG หรือ WEBP เท่านั้น',
      errImageSize: 'ขนาดไฟล์ต้องไม่เกิน 5 MB',
      idleLogoutToast: 'ออกจากระบบอัตโนมัติเนื่องจากไม่มีการใช้งานเกิน 30 นาที',
      lockoutWaitPrefix: 'กรอกผิดเกินกำหนด กรุณารอ',
      lockoutWaitSuffix: 'วินาทีแล้วลองใหม่',
      errSidNotFound: 'ไม่พบรหัสนักศึกษาในระบบ',
      errAccountSuspended: 'บัญชีนักศึกษานี้ถูกระงับหรือปิดใช้งาน กรุณาติดต่อสถาบัน',
      errDobMismatch: 'วันเดือนปีเกิดไม่ถูกต้อง (กรอก 8 หลัก เช่น 15052540)',
      errLegacyDefault: 'นักศึกษาที่ยังไม่มีวันเกิดในระบบ กรุณากรอกรหัสเริ่มต้น 123456',
      lockoutReached: 'กรอกรหัสผิดครบ 5 ครั้ง ระบบล็อกชั่วคราว 60 วินาที',
      errBadDob: 'กรุณากรอกวันเดือนปีเกิดให้ถูกต้อง (เช่น 15052540 หรือ 15/05/2540)',
      errDupCid1: 'เลขบัตรประชาชน/พาสปอร์ตนี้มีอยู่ในระบบแล้ว (รหัสนักศึกษา:',
      errDupCid2: ') กรุณาเข้าสู่ระบบด้วยรหัสนักศึกษาเดิม',
      regSuccessSid: 'ลงทะเบียนสำเร็จ! รหัสนักศึกษาของคุณคือ',
      errAccountMissing: 'ไม่พบข้อมูลบัญชีนักศึกษาในระบบ',
      errDupSlip: 'ตรวจพบสลิปซ้ำหรือไม่ถูกต้อง',
      slipSubmitSuccess: 'ส่งใบสมัครและสลิปเรียบร้อยแล้ว',
      slipSubmitFail: 'ส่งสลิปไม่สำเร็จ:',
      photoSaveSuccess: 'บันทึกรูปโปรไฟล์เรียบร้อยแล้ว',
      photoSaveFail: 'บันทึกรูปไม่สำเร็จ:',
      profSaveSuccess: 'บันทึกประวัติส่วนตัวเรียบร้อยแล้ว',
      profSaveFail: 'บันทึกไม่สำเร็จ:',
      rcIssuedToast: 'ออกใบเสร็จรับเงินแล้ว #',
      notifUnsupported: 'เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน',
      notifDenied: 'ไม่ได้รับอนุญาตให้ส่งการแจ้งเตือน',
      notifActiveBody: 'เปิดรับแจ้งเตือนสำเร็จแล้ว',
      notifEnabledToast: 'เปิดรับแจ้งเตือนบนมือถือเรียบร้อยแล้ว',
      pwaInstalling: 'กำลังติดตั้งแอป OCA Student...',
      pwaPreparing: 'กำลังเตรียมหน้าต่างติดตั้งแอปอัตโนมัติ...',
      pwaInstalled: 'ติดตั้งแอป OCA Student สำเร็จแล้ว',
      imgGenNotReady: 'ระบบสร้างภาพยังไม่พร้อม กรุณาลองใหม่',
      imgSaveSuccess: 'บันทึกรูปภาพเรียบร้อยแล้ว',
      imgSaveFail: 'บันทึกรูปไม่สำเร็จ:',
      delivPickupShort: 'รับเอง',
      fldPassport: 'เลขพาสปอร์ต (Passport No.)',
      fldEthnicity: 'เชื้อชาติ',
      fldAge: 'อายุ (คำนวณอัตโนมัติ)',
      fldEmergRelation: 'ความสัมพันธ์ (ผู้ติดต่อฉุกเฉิน)',
      fldLangLevel: 'ระดับพื้นฐานภาษาจีนเดิม',
      fldNotes: 'หมายเหตุประวัตินักศึกษา (ไม่บังคับ)',
      phNotes: 'ระบุหมายเหตุเพิ่มเติมเกี่ยวกับตัวผู้เรียน (ถ้ามี)...',
      langLvlSelect: '-- เลือกระดับความรู้เดิม --',
      langLvlNone: 'ไม่มีพื้นฐานเลย (เริ่มต้นใหม่จากศูนย์)',
      langLvlPinyin: 'มีพื้นฐานพินอินและคำศัพท์ง่ายๆ',
      langLvlHsk12: 'ระดับเทียบเท่า HSK 1 - 2',
      langLvlHsk34: 'ระดับเทียบเท่า HSK 3 - 4',
      langLvlHsk5: 'ระดับเทียบเท่า HSK 5 ขึ้นไป',
      ageYearsUnit: 'ปี',
      mobTabHome: 'หน้าหลัก',
      mobTabEnroll: 'เลือกคอร์ส',
      mobTabCard: 'บัตร',
      mobTabSchedule: 'ตาราง',
      mobTabFinance: 'ใบเสร็จ',
      mobTabProfile: 'โปรไฟล์',
      btnReceiptQr: 'ใบเสร็จ & QR รับตำรา'
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
      loginSecret: 'Password (8-digit DOB e.g. 15052540 or 123456)',
      phSid: 'e.g. 6950001',
      phSecret: '15052540 or 123456',
      togglePassTitle: 'Show/Hide Password',
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
      fldAddrSearch: 'Thai Address Autocomplete (Zipcode / Subdistrict / District)',
      phAddrSearch: 'Type zipcode e.g. 10330 or subdistrict...',
      fldAddress: 'Shipping Address (for textbooks)',
      fldEmergName: 'Emergency Contact',
      fldEmergPhone: 'Emergency Phone',
      btnRegSubmit: 'Confirm Registration & Choose Courses',
      menuBtn: 'Menu',
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
      schedTitle: 'Current Course Schedule',
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
      delivShip: 'Parcel Delivery',
      chkTotal: 'Net Payable',
      chkSlipHint: 'Scan QR to transfer, then attach slip below (JPG/PNG/WEBP, max 5MB).',
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
      enrollBtn: '+ Select Course',
      recommendedBadge: 'Recommended',
      learnedBadge: 'Completed',
      currentCourseBadge: 'Current Active Course',
      lecturerLbl: 'Lecturer',
      termPeriodLbl: 'Term Period',
      noSlipPending: 'No pending slips',
      slipPendingCount: 'Pending slips:',
      itemsUnit: 'items',
      noScheduleMsg: 'No current course found. Please select a course in Courses & Payment.',
      noReceiptsMsg: 'No receipt records yet.',
      noNotifsMsg: 'No notifications or announcements yet.',
      btnDownloadCard: 'Save Card (PNG)',
      btnDownloadReceipt: 'Save Receipt (PNG)',
      toggleThemeTitle: 'Toggle Dark/Light Mode',
      feeTuition: 'Tuition Fee',
      feeReg: 'Registration Fee (New Student)',
      feeOther: 'Other Fees',
      feeLatePenalty: 'Late Registration Penalty',
      feeShipping: 'Textbook Shipping Fee',
      feeDiscount: 'Eligible Discount',
      errNoImage: 'Please select an image file.',
      errImageType: 'Only JPG, PNG, or WEBP images are supported.',
      errImageSize: 'File size must not exceed 5 MB.',
      idleLogoutToast: 'Signed out automatically due to 30 minutes of inactivity.',
      lockoutWaitPrefix: 'Too many failed attempts. Please wait',
      lockoutWaitSuffix: 'seconds before trying again.',
      errSidNotFound: 'Student ID not found.',
      errAccountSuspended: 'This student account is suspended or inactive. Please contact the Academy.',
      errDobMismatch: 'Incorrect date of birth (enter 8 digits, e.g. 15052540).',
      errLegacyDefault: 'For accounts without a registered birth date, enter default code 123456.',
      lockoutReached: '5 failed attempts reached. Locked temporarily for 60 seconds.',
      errBadDob: 'Please enter a valid date of birth (e.g. 15052540 or 15/05/2540).',
      errDupCid1: 'This Citizen ID / Passport is already registered (Student ID:',
      errDupCid2: '). Please sign in with your existing Student ID.',
      regSuccessSid: 'Registration successful! Your Student ID is',
      errAccountMissing: 'Student account not found.',
      errDupSlip: 'Duplicate or invalid payment slip detected.',
      slipSubmitSuccess: 'Enrollment & payment slip submitted successfully.',
      slipSubmitFail: 'Submission failed:',
      photoSaveSuccess: 'Profile photo saved successfully.',
      photoSaveFail: 'Failed to save photo:',
      profSaveSuccess: 'Profile updated successfully.',
      profSaveFail: 'Failed to save profile:',
      rcIssuedToast: 'Receipt issued #',
      notifUnsupported: 'Notifications are not supported in this browser.',
      notifDenied: 'Notification permission was denied.',
      notifActiveBody: 'Notifications enabled successfully.',
      notifEnabledToast: 'Mobile push alerts enabled.',
      pwaInstalling: 'Installing OCA Student App...',
      pwaPreparing: 'Preparing automatic app install prompt...',
      pwaInstalled: 'OCA Student App installed successfully.',
      imgGenNotReady: 'Image export engine is not ready. Please try again.',
      imgSaveSuccess: 'Image saved successfully.',
      imgSaveFail: 'Failed to save image:',
      delivPickupShort: 'Self-pickup',
      fldPassport: 'Passport No.',
      fldEthnicity: 'Ethnicity',
      fldAge: 'Age (Auto)',
      fldEmergRelation: 'Emergency Relation',
      fldLangLevel: 'Chinese Proficiency Level',
      fldNotes: 'Student Profile Notes (Optional)',
      phNotes: 'Additional notes about the student (if any)...',
      langLvlSelect: '-- Select Current Level --',
      langLvlNone: 'Complete Beginner (From Zero)',
      langLvlPinyin: 'Basic Pinyin & Simple Vocabulary',
      langLvlHsk12: 'Equivalent to HSK 1 - 2',
      langLvlHsk34: 'Equivalent to HSK 3 - 4',
      langLvlHsk5: 'Equivalent to HSK 5 or Above',
      ageYearsUnit: 'yrs',
      mobTabHome: 'Home',
      mobTabEnroll: 'Courses',
      mobTabCard: 'ID Card',
      mobTabSchedule: 'Schedule',
      mobTabFinance: 'Receipts',
      mobTabProfile: 'Profile',
      btnReceiptQr: 'Receipt & Book QR'
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
      loginSecret: '密码（8位出生日期 如 15052540 或 123456）',
      phSid: '例如 6950001',
      phSecret: '15052540 或 123456',
      togglePassTitle: '显示/隐藏密码',
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
      fldAddrSearch: '泰国地址自动补全（邮编 / 街道 / 区县）',
      phAddrSearch: '输入邮编如 10330 或区县名称...',
      fldAddress: '教材邮寄地址',
      fldEmergName: '紧急联系人',
      fldEmergPhone: '紧急联系电话',
      btnRegSubmit: '确认注册并前往选课',
      menuBtn: '菜单',
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
      schedTitle: '当前在读课程表',
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
      delivShip: '快递邮寄',
      chkTotal: '应付总额',
      chkSlipHint: '请扫码转账并在下方上传转账凭证（仅限 JPG/PNG/WEBP，最大 5MB）',
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
      enrollBtn: '+ 选择课程',
      recommendedBadge: '为您推荐',
      learnedBadge: '已修课程',
      currentCourseBadge: '本学期在读课程',
      lecturerLbl: '授课教师',
      termPeriodLbl: '学期时间',
      noSlipPending: '暂无待审核凭证',
      slipPendingCount: '待审核凭证：',
      itemsUnit: '条',
      noScheduleMsg: '暂无当前课程信息，请前往“选课与缴费”报名课程。',
      noReceiptsMsg: '暂无收据记录',
      noNotifsMsg: '暂无通知或公告',
      btnDownloadCard: '保存学生证 (PNG)',
      btnDownloadReceipt: '保存收据 (PNG)',
      toggleThemeTitle: '切换深色/浅色模式',
      feeTuition: '课程学费',
      feeReg: '新生注册费',
      feeOther: '其他费用',
      feeLatePenalty: '逾期注册滞纳金',
      feeShipping: '教材邮寄费',
      feeDiscount: '优惠减免',
      errNoImage: '请选择图片文件',
      errImageType: '仅支持 JPG、PNG 或 WEBP 格式图片',
      errImageSize: '文件大小不能超过 5 MB',
      idleLogoutToast: '由于超过30分钟未操作，系统已自动退出登录',
      lockoutWaitPrefix: '密码错误次数过多，请等待',
      lockoutWaitSuffix: '秒后再试',
      errSidNotFound: '未在系统中找到该学号',
      errAccountSuspended: '该学员账户已被停用或冻结，请联系书院',
      errDobMismatch: '出生日期不正确（请输入8位数字 如 15052540）',
      errLegacyDefault: '尚未登记出生日期的学员，请输入初始密码 123456',
      lockoutReached: '连续输错5次，系统已暂时锁定60秒',
      errBadDob: '请输入正确的出生日期（如 15052540 或 15/05/2540）',
      errDupCid1: '该身份证号/护照号已注册（学号：',
      errDupCid2: '），请使用原学号登录',
      regSuccessSid: '注册成功！您的学号为',
      errAccountMissing: '未在系统中找到学员账户信息',
      errDupSlip: '检测到重复或无效的转账凭证',
      slipSubmitSuccess: '报名与转账凭证提交成功',
      slipSubmitFail: '凭证提交失败：',
      photoSaveSuccess: '头像保存成功',
      photoSaveFail: '头像保存失败：',
      profSaveSuccess: '个人资料保存成功',
      profSaveFail: '保存失败：',
      rcIssuedToast: '已开具电子收据 #',
      notifUnsupported: '当前浏览器不支持消息通知',
      notifDenied: '未授予消息通知权限',
      notifActiveBody: '已成功开启消息提醒',
      notifEnabledToast: '已开启手机消息通知',
      pwaInstalling: '正在安装 OCA Student 应用...',
      pwaPreparing: '正在准备自动安装窗口...',
      pwaInstalled: 'OCA Student 应用安装成功',
      imgGenNotReady: '图片生成组件尚未就绪，请重试',
      imgSaveSuccess: '图片保存成功',
      imgSaveFail: '图片保存失败：',
      delivPickupShort: '书院自取',
      fldPassport: '护照号 (Passport No.)',
      fldEthnicity: '民族 / 族裔',
      fldAge: '年龄（自动计算）',
      fldEmergRelation: '紧急联系人关系',
      fldLangLevel: '汉语基础水平',
      fldNotes: '学员档案备注（选填）',
      phNotes: '如有其他补充信息请填写...',
      langLvlSelect: '-- 请选择汉语基础水平 --',
      langLvlNone: '零基础（从头开始学习）',
      langLvlPinyin: '掌握基本拼音与常用词汇',
      langLvlHsk12: '相当于 HSK 1 - 2 级',
      langLvlHsk34: '相当于 HSK 3 - 4 级',
      langLvlHsk5: '相当于 HSK 5 级及以上',
      ageYearsUnit: '岁',
      mobTabHome: '首页',
      mobTabEnroll: '选课',
      mobTabCard: '学生证',
      mobTabSchedule: '课表',
      mobTabFinance: '收据',
      mobTabProfile: '资料',
      btnReceiptQr: '收据与领书二维码'
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

  function formatStudentDisplayName(st) {
    if (!st) return '-';
    const prefix = String(st.prefix || '').trim();
    const full = String(st.full_name || '').trim();
    if (!full) return prefix || String(st.student_id || '-');
    if (!prefix) return full;
    if (full.startsWith(prefix)) return full;
    const known = ['นาย', 'นางสาว', 'นาง', 'น.ส.', 'ด.ช.', 'ด.ญ.', 'เด็กชาย', 'เด็กหญิง', 'Mr.', 'Mrs.', 'Ms.', 'Miss'];
    if (known.some((p) => full.toLowerCase().startsWith(p.toLowerCase()))) return full;
    return prefix + ' ' + full;
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

  function validateImageFile(file) {
    if (!file) return t('errNoImage');
    if (file.type && !ALLOWED_MIME.includes(String(file.type).toLowerCase())) {
      return t('errImageType');
    }
    if (Number(file.size || 0) > MAX_UPLOAD_BYTES) {
      return t('errImageSize');
    }
    return '';
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
    const m8 = clean.match(/^(\d{2})(\d{2})(\d{4})$/);
    const m1 = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    const m2 = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (m8) {
      d = Number(m8[1]); m = Number(m8[2]); y = Number(m8[3]);
    } else if (m1) {
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

  function calcAgeFromDobInput(val) {
    const iso = normalizeDobIso(val);
    if (!iso) return '';
    const parts = iso.split('-').map(Number);
    if (parts.length !== 3) return '';
    const today = new Date();
    let age = today.getFullYear() - parts[0];
    const mDiff = (today.getMonth() + 1) - parts[1];
    if (mDiff < 0 || (mDiff === 0 && today.getDate() < parts[2])) age--;
    if (age < 0 || age > 120) return '';
    return `${age} ${t('ageYearsUnit')}`;
  }

  function updateAgeDisplay(mode) {
    const dobId = mode === 'reg' ? 'regDob' : 'profDob';
    const ageId = mode === 'reg' ? 'regAge' : 'profAge';
    const dobEl = document.getElementById(dobId);
    const ageEl = document.getElementById(ageId);
    if (dobEl && ageEl) ageEl.value = calcAgeFromDobInput(dobEl.value);
  }

  function toggleLoginSecret() {
    const inp = document.getElementById('inpLoginSecret');
    const icon = document.getElementById('iconLoginSecretEye');
    if (!inp) return;
    const toText = inp.type === 'password';
    inp.type = toText ? 'text' : 'password';
    if (icon) icon.className = toText ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
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

  /* HOVER-PREVIEW POPOVER ENGINE */
  function getPopoverEl() {
    const pop = document.getElementById('ocaStudentHoverPopover');
    if (pop && !pop._bound) {
      pop._bound = true;
      pop.addEventListener('mouseenter', () => {
        if (_hoverHideTimer) { clearTimeout(_hoverHideTimer); _hoverHideTimer = null; }
      });
      pop.addEventListener('mouseleave', (ev) => {
        if (ev && ev.buttons > 0) return;
        scheduleHideHoverPopover();
      });
    }
    return pop;
  }

  function showHoverPopover(triggerEl, html) {
    if (!triggerEl || !html) return;
    if (_hoverHideTimer) { clearTimeout(_hoverHideTimer); _hoverHideTimer = null; }
    const pop = getPopoverEl();
    if (!pop) return;
    pop.innerHTML = html;
    pop.classList.remove('st-hidden');
    const r = triggerEl.getBoundingClientRect();
    const pw = Math.min(420, global.innerWidth - 24);
    let left = r.right + 10;
    if (left + pw > global.innerWidth - 12) left = Math.max(12, r.left - pw - 10);
    if (global.innerWidth < 760) left = Math.max(12, (global.innerWidth - pw) / 2);
    let top = Math.max(12, Math.min(r.top, global.innerHeight - 300));
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }

  function scheduleHideHoverPopover() {
    if (_hoverHideTimer) clearTimeout(_hoverHideTimer);
    _hoverHideTimer = setTimeout(() => {
      const pop = document.getElementById('ocaStudentHoverPopover');
      if (pop) pop.classList.add('st-hidden');
    }, 180);
  }

  function getFallbackNotice() {
    return {
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
  }

  function hoverNotice(id, el) {
    const n = _notices.find(x => String(x.id) === String(id)) || (String(id) === 'default' ? getFallbackNotice() : null);
    if (!n) return;
    const dtStr = n.createdMs ? new Date(n.createdMs).toLocaleDateString('th-TH', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
    showHoverPopover(el,
      `<div class="st-accent-text" style="font-size:11px;font-weight:800;margin-bottom:4px;"><i class="fa-solid fa-bullhorn"></i> ${esc(t('noticeBoardTitle'))} • ${esc(dtStr)}</div>` +
      `<div style="font-size:14.5px;font-weight:800;margin-bottom:6px;">${esc(n.title)}</div>` +
      `<div class="st-muted-text" style="font-size:13px;line-height:1.6;white-space:pre-line;">${esc(n.body || '-')}</div>`
    );
  }

  function hoverCourse(courseId, el) {
    const c = _courses.find(x => String(x.id || x.code) === String(courseId));
    if (!c) return;
    showHoverPopover(el,
      `<div class="st-link-accent" style="font-size:12px;font-weight:800;font-family:monospace;">${esc(c.code)} • ${esc(c.level || 'OCA')}</div>` +
      `<div style="font-size:14px;font-weight:800;margin:4px 0 6px 0;">${esc(c.name)}</div>` +
      (c.linked_book ? `<div class="st-muted-text" style="font-size:12.5px;"><i class="fa-solid fa-book"></i> ${esc(c.linked_book)}</div>` : '') +
      `<div class="st-accent-text" style="font-size:15px;font-weight:800;margin-top:6px;">฿${Number(c.price || 0).toLocaleString('en-US')}</div>`
    );
  }

  function hoverReceipt(rcNo, el) {
    const r = _receipts.find(x => String(x.receipt_no) === String(rcNo));
    if (!r) return;
    showHoverPopover(el,
      `<div class="st-accent-text" style="font-size:12px;font-weight:800;">#${esc(r.receipt_no)}</div>` +
      `<div style="font-size:14px;font-weight:800;margin:3px 0;">${esc(r.item_name || r.item_code || '-')}</div>` +
      `<div class="st-muted-text" style="font-size:12.5px;">${esc(r.schedule_info || '-')} • ${esc(r.learning_mode || 'Onsite')}</div>` +
      `<div class="st-muted-text" style="font-size:12.5px;margin-top:4px;">฿${Number(r.grand_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} • ${esc(r.delivery_method || t('delivPickupShort'))} (${esc(r.claim_status || 'PENDING')})</div>` +
      (r.tracking_number ? `<div class="st-link-accent" style="font-size:12px;font-weight:700;margin-top:3px;">Tracking: ${esc(r.tracking_number)}</div>` : '')
    );
  }

  /* THAI ADDRESS AUTOCOMPLETE */
  async function ensureThaiAddressIndex() {
    if (_thaiAddrIndex) return _thaiAddrIndex;
    try {
      const res = await fetch('./assets/data/thai_address_compact.json');
      if (!res.ok) return [];
      const data = await res.json();
      const idx = [];
      const distByProv = data.districtsByProv || {};
      const subByDist = data.subdistrictsByDist || {};
      Object.entries(distByProv).forEach(([provName, dists]) => {
        (dists || []).forEach((dist) => {
          const subs = subByDist[String(dist.id)] || [];
          subs.forEach((sub) => {
            idx.push({
              sub: sub.name,
              dist: dist.name,
              prov: provName,
              zip: String(sub.zipCode || ''),
              label: `ต.${sub.name} อ.${dist.name} จ.${provName} ${sub.zipCode || ''}`
            });
          });
        });
      });
      _thaiAddrIndex = idx;
      return idx;
    } catch (_) {
      return [];
    }
  }

  async function onAddrSearch(target, query) {
    const boxId = target === 'reg' ? 'boxRegAddrSuggest' : 'boxProfAddrSuggest';
    const box = document.getElementById(boxId);
    if (!box) return;
    const q = String(query || '').trim().toLowerCase();
    if (q.length < 2) {
      box.classList.add('st-hidden');
      box.innerHTML = '';
      return;
    }
    const idx = await ensureThaiAddressIndex();
    const matches = idx.filter((x) => x.zip.startsWith(q) || x.label.toLowerCase().includes(q)).slice(0, 8);
    if (!matches.length) {
      box.classList.add('st-hidden');
      box.innerHTML = '';
      return;
    }
    box.innerHTML = matches.map((m) =>
      `<button type="button" class="oca-addr-opt" onclick="OcaStudentPortal.pickThaiAddress('${target}','${esc(m.label)}')">${esc(m.label)}</button>`
    ).join('');
    box.classList.remove('st-hidden');
  }

  function pickThaiAddress(target, label) {
    const area = document.getElementById(target === 'reg' ? 'regAddress' : 'profAddress');
    const inp = document.getElementById(target === 'reg' ? 'inpRegAddrSearch' : 'inpProfAddrSearch');
    const box = document.getElementById(target === 'reg' ? 'boxRegAddrSuggest' : 'boxProfAddrSuggest');
    if (area) {
      const cur = String(area.value || '').trim();
      area.value = cur ? (cur + ' ' + label) : label;
    }
    if (inp) inp.value = label;
    if (box) box.classList.add('st-hidden');
  }

  /* SECURITY: BRUTE-FORCE LOCKOUT + 30-MIN IDLE TIMEOUT */
  function getLoginGuard() {
    try { return JSON.parse(localStorage.getItem(LOGIN_GUARD_KEY) || '{"fails":0,"lockedUntil":0}'); } catch (_) { return { fails: 0, lockedUntil: 0 }; }
  }

  function setLoginGuard(g) {
    try { localStorage.setItem(LOGIN_GUARD_KEY, JSON.stringify(g)); } catch (_) {}
  }

  function resetIdleTimer() {
    if (_idleTimer) clearTimeout(_idleTimer);
    if (!_student) return;
    _idleTimer = setTimeout(() => {
      if (_student) {
        logout();
        showToast(t('idleLogoutToast'));
      }
    }, IDLE_TIMEOUT_MS);
  }

  function initIdleMonitor() {
    ['click', 'keydown', 'touchstart', 'mousemove'].forEach((evt) => {
      global.addEventListener(evt, resetIdleTimer, { passive: true });
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
    const mobNav = document.getElementById('stMobileBottomNav');
    if (mobNav) mobNav.classList.toggle('st-hidden', viewId !== 'viewStudentApp');
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

    const guard = getLoginGuard();
    if (guard.lockedUntil && Date.now() < guard.lockedUntil) {
      const secLeft = Math.ceil((guard.lockedUntil - Date.now()) / 1000);
      if (errEl) {
        errEl.textContent = `${t('lockoutWaitPrefix')} ${secLeft} ${t('lockoutWaitSuffix')}`;
        errEl.classList.remove('st-hidden');
      }
      return;
    }
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
        if (!st) throw new Error(t('errSidNotFound'));
        const stStatus = String(st.status || 'ACTIVE').toUpperCase();
        if (stStatus === 'SUSPENDED' || stStatus === 'DELETED' || stStatus === 'INACTIVE') {
          throw new Error(t('errAccountSuspended'));
        }
        const dbDob = normalizeDobIso(st.birth_date || '');
        const inDob = normalizeDobIso(secret);
        if (dbDob) {
          if (!inDob || inDob !== dbDob) throw new Error(t('errDobMismatch'));
        } else if (secret !== '123456') {
          throw new Error(t('errLegacyDefault'));
        } else {
          needsSetup = true;
        }
        studentRow = st;
      }

      setLoginGuard({ fails: 0, lockedUntil: 0 });
      _student = studentRow;
      _needsDobSetup = needsSetup;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ student: _student, needsDobSetup: _needsDobSetup }));
      await enterApp('home');
    } catch (err) {
      const nextFails = (guard.fails || 0) + 1;
      const nextLock = nextFails >= MAX_LOGIN_FAILS ? (Date.now() + LOCKOUT_MS) : 0;
      setLoginGuard({ fails: nextLock ? 0 : nextFails, lockedUntil: nextLock });
      if (nextLock && _sb) {
        const { error: logErr } = await _sb.from('security_audit_logs').insert([{
          event_type: 'STUDENT_LOGIN_LOCKOUT',
          username: sid.slice(0, 30),
          details: 'Exceeded 5 failed login attempts',
          created_at: new Date().toISOString()
        }]);
        if (logErr) console.warn('[audit]', logErr.message || logErr);
      }
      if (errEl) {
        errEl.textContent = nextLock
          ? t('lockoutReached')
          : (err.message || String(err));
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
      if (errEl) { errEl.textContent = t('errBadDob'); errEl.classList.remove('st-hidden'); }
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
      const passportNo = (document.getElementById('regPassportNo')?.value || '').trim();
      const ethnicity = (document.getElementById('regEthnicity')?.value || 'ไทย').trim();
      const phone = (document.getElementById('regPhone')?.value || '').trim();
      const lineId = (document.getElementById('regLine')?.value || '').trim();
      const email = (document.getElementById('regEmail')?.value || '').trim();
      const nationality = (document.getElementById('regNationality')?.value || 'ไทย').trim();
      const languageLevel = (document.getElementById('regLanguageLevel')?.value || '').trim();
      const address = (document.getElementById('regAddress')?.value || '').trim();
      const emergName = (document.getElementById('regEmergName')?.value || '').trim();
      const emergRel = (document.getElementById('regEmergRelation')?.value || '').trim();
      const emergPhone = (document.getElementById('regEmergPhone')?.value || '').trim();
      const notes = (document.getElementById('regNotes')?.value || '').trim().slice(0, 300);

      const cleanCid = citizenId.replace(/[\s-]/g, '');
      if (cleanCid.length >= 6) {
        const { data: dupRows, error: dupErr } = await _sb
          .from('students')
          .select('student_id, full_name, status')
          .eq('citizen_id', citizenId)
          .limit(1);
        if (!dupErr && Array.isArray(dupRows) && dupRows[0] && String(dupRows[0].status || '').toUpperCase() !== 'DELETED') {
          throw new Error(`${t('errDupCid1')} ${dupRows[0].student_id}${t('errDupCid2')}`);
        }
      }

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
        passport_no: passportNo,
        ethnicity,
        phone_number: phone,
        line_id: lineId,
        email,
        nationality,
        language_level: languageLevel,
        address,
        emergency_name: emergName,
        emergency_relation: emergRel,
        emergency_phone: emergPhone,
        notes,
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
      showToast(`${t('regSuccessSid')} ${newSid}`);
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
    resetIdleTimer();
    renderHeaderAndProfile();
    switchTab(defaultTab || 'home');
    await loadStudentAppData();
    subscribeStudentNotifications();
  }

  function switchTab(tabName) {
    document.querySelectorAll('.st-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
    document.querySelectorAll('.st-bottom-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
    document.querySelectorAll('.st-tab-panel').forEach(p => p.classList.toggle('st-hidden', p.id !== 'tabPanel_' + tabName));
    toggleSidebar(false);
    if (global.innerWidth < 900) {
      try { global.scrollTo({ top: 0, behavior: 'smooth' }); } catch (_) {}
    }
  }

  function renderHeaderAndProfile() {
    if (!_student) return;
    const fullName = formatStudentDisplayName(_student);
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
    const issueEl = document.getElementById('lblCardIssueDate');
    if (issueEl) {
      const dt = _student.created_at ? new Date(_student.created_at) : new Date();
      issueEl.textContent = dt.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    setVal('profPrefix', _student.prefix || '');
    setVal('profFullName', _student.full_name || '');
    setVal('profCitizenId', _student.citizen_id || '');
    setVal('profPassportNo', _student.passport_no || '');
    setVal('profEthnicity', _student.ethnicity || '');
    setVal('profNationality', _student.nationality || '');
    setVal('profDob', formatIsoToThaiDob(_student.birth_date || ''));
    setVal('profAge', calcAgeFromDobInput(_student.birth_date || ''));
    setVal('profPhone', _student.phone_number || '');
    setVal('profLine', _student.line_id || '');
    setVal('profEmail', _student.email || '');
    setVal('profLanguageLevel', _student.language_level || '');
    setVal('profAddress', _student.address || '');
    setVal('profEmergName', _student.emergency_name || '');
    setVal('profEmergRelation', _student.emergency_relation || '');
    setVal('profEmergPhone', _student.emergency_phone || '');
    setVal('profNotes', _student.notes || '');

    const sumBox = document.getElementById('boxProfileDbSummary');
    if (sumBox) {
      sumBox.innerHTML =
        `<div><strong>ID:</strong> <span data-i18n-locked="true">${esc(_student.student_id)}</span> • <strong>Status:</strong> ${esc(_student.status || 'ACTIVE')}</div>` +
        `<div><strong>${esc(t('fldNationality'))}:</strong> ${esc(_student.nationality || '-')} ${(_student.ethnicity ? '(' + esc(_student.ethnicity) + ')' : '')}</div>` +
        `<div><strong>${esc(t('fldLangLevel'))}:</strong> ${esc(_student.language_level || '-')} • <strong>${esc(t('homeTotalCoursesLbl'))}:</strong> ${_receipts.length}</div>` +
        `<div><strong>${esc(t('homeCourseLbl'))}:</strong> <span data-i18n-locked="true">${esc(_student.current_course || '-')}</span></div>`;
    }
  }

  async function loadLecturerAndTermMeta(yearBE, term) {
    try {
      if (!_lecturerMap) {
        const resL = await fetch('./assets/data/oca_class_lecturer_registry.json');
        if (resL.ok) _lecturerMap = await resL.json();
      }
      if (!_termInfo) {
        const knownTerms = ['700', '699', '698', '697', '696', '695'];
        const cand = String(yearBE).slice(-2) + String(term);
        const target = knownTerms.includes(cand) ? cand : '700';
        const resT = await fetch(`./assets/data/term_timetables/term_${target}.json`);
        if (resT.ok) _termInfo = await resT.json();
      }
    } catch (_) {}
  }

  function isFeeRuleActive(row) {
    if (!row || Number(row.amount || 0) <= 0) return false;
    const mode = String(row.mode || 'ALWAYS').toUpperCase();
    if (mode === 'OFF' || mode === 'DISABLED') return false;
    if (mode === 'RANGE' || mode === 'DATE_RANGE') {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      if (row.start_date && today < String(row.start_date)) return false;
      if (row.end_date && today > String(row.end_date)) return false;
    }
    return true;
  }

  function computeCheckoutBreakdown(course, deliveryMethod) {
    const base = Number((course && course.price) || 0);
    const isNewStudent = _receipts.length === 0;
    const regFee = isNewStudent && isFeeRuleActive(_feeRules.regFee) ? Number(_feeRules.regFee.amount) : 0;
    const otherFee = isFeeRuleActive(_feeRules.otherRegFee) ? Number(_feeRules.otherRegFee.amount) : 0;
    const latePenalty = isFeeRuleActive(_feeRules.lateRegPenalty) ? Number(_feeRules.lateRegPenalty.amount) : 0;
    const shipping = deliveryMethod === 'ส่งตำรา'
      ? (isFeeRuleActive(_feeRules.shippingFee) ? Number(_feeRules.shippingFee.amount) : _shippingFee)
      : 0;
    const isKids = course ? detectCategory(course) === 'KIDS' : false;
    const kidsRow = _feeRules.discountKids || _feeRules.discount_kids;
    const baseDisc = isKids && isFeeRuleActive(kidsRow)
      ? Number(kidsRow.amount)
      : (isFeeRuleActive(_feeRules.discountNormal) ? Number(_feeRules.discountNormal.amount) : 0);
    const otherDisc = isFeeRuleActive(_feeRules.discountOther) ? Number(_feeRules.discountOther.amount) : 0;
    const discount = baseDisc + otherDisc;
    const total = Math.max(0, base + regFee + otherFee + latePenalty + shipping - discount);
    return { base, regFee, otherFee, latePenalty, shipping, discount, total };
  }

  async function loadStudentAppData() {
    if (!_sb || !_student) return;
    const sid = String(_student.student_id || '').trim();
    const [resSt, resC, resSc, resRc, resPend, resNotif, resFees] = await Promise.all([
      _sb.from('students').select('*').eq('student_id', sid).maybeSingle(),
      _sb.from('courses').select('*').eq('is_active', true).order('code', { ascending: true }),
      _sb.from('schedules').select('*').eq('is_active', true).order('id', { ascending: true }),
      _sb.from('receipts').select('*').eq('student_id', sid).order('created_at', { ascending: false }),
      _sb.from('fee_settings').select('key,name,amount,mode,updated_at').like('key', 'pending_slip%:' + sid),
      _sb.from('fee_settings').select('key,name,amount,mode,updated_at').eq('key', 'student_notif:' + sid).maybeSingle(),
      _sb.from('fee_settings').select('key,name,amount,mode,start_date,end_date').in('key', [
        'regFee', 'otherRegFee', 'shippingFee', 'discountNormal', 'discountKids', 'discount_kids', 'discountOther', 'lateRegPenalty', 'shipping_fee', 'textbook_shipping'
      ])
    ]);

    if (!resSt.error && !resSt.data) {
      logout();
      showToast(t('errAccountMissing'));
      return;
    }
    if (!resSt.error && resSt.data) {
      const stStatus = String(resSt.data.status || 'ACTIVE').toUpperCase();
      if (stStatus === 'SUSPENDED' || stStatus === 'DELETED' || stStatus === 'INACTIVE') {
        logout();
        showToast(t('errAccountSuspended'));
        return;
      }
      _student = resSt.data;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ student: _student, needsDobSetup: _needsDobSetup }));
    }

    _courses = Array.isArray(resC.data) ? resC.data : [];
    _schedules = Array.isArray(resSc.data) ? resSc.data : [];
    _receipts = Array.isArray(resRc.data) ? resRc.data.filter(r => String(r.claim_status || '').toUpperCase() !== 'VOIDED') : [];
    _pendingSlips = Array.isArray(resPend.data) ? resPend.data.filter(r => r.key && r.key.startsWith('pending_slip:')) : [];
    _feeRules = {};
    if (Array.isArray(resFees.data)) {
      resFees.data.forEach((r) => { if (r && r.key) _feeRules[r.key] = r; });
    }
    const shipRow = _feeRules.shippingFee || _feeRules.shipping_fee || _feeRules.textbook_shipping;
    if (shipRow && isFeeRuleActive(shipRow)) {
      _shippingFee = Number(shipRow.amount);
    }

    const activeTerm = await resolveActiveYearTerm();
    await loadLecturerAndTermMeta(activeTerm.yearBE, activeTerm.term);

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
    const counts = { ALL: _courses.length, LEARNED: learnedCodes.size };
    _courses.forEach((c) => {
      const cat = detectCategory(c);
      counts[cat] = (counts[cat] || 0) + 1;
    });
    const labels = {
      th: { ALL: 'ทั้งหมด', LEARNED: 'คอร์สที่เรียนแล้ว', BOOKS: 'ซื้อตำราเรียน', EXAM: 'สอบวัดความรู้ภาษาจีน', KIDS: 'คอร์สเด็ก', BEG: 'คอร์สขั้นต้น', INT: 'คอร์สขั้นกลาง', ADV: 'คอร์สขั้นสูง', CONVO: 'คอร์สสนทนา', HSK: 'ติวสอบวัดระดับ HSK', ART: 'ศิลป์ (วาดภาพ/เขียนอักษร)', MUSIC: 'ดนตรีจีน', OTHER: 'คอร์สทั่วไป/อื่นๆ' },
      en: { ALL: 'All Courses', LEARNED: 'Completed', BOOKS: 'Textbooks', EXAM: 'Proficiency Exam', KIDS: 'Kids', BEG: 'Beginner', INT: 'Intermediate', ADV: 'Advanced', CONVO: 'Conversation', HSK: 'HSK Prep', ART: 'Chinese Art', MUSIC: 'Chinese Music', OTHER: 'Other Courses' },
      zh: { ALL: '全部课程', LEARNED: '已学课程', BOOKS: '购买教材', EXAM: '汉语水平测试', KIDS: '少儿汉语', BEG: '初级课程', INT: '中级课程', ADV: '高级课程', CONVO: '口语会话', HSK: 'HSK 辅导', ART: '书画艺术', MUSIC: '中国民乐', OTHER: '综合课程' }
    };
    const icons = {
      ALL: 'fa-layer-group', LEARNED: 'fa-circle-check', BOOKS: 'fa-book', EXAM: 'fa-file-signature',
      KIDS: 'fa-child-reaching', BEG: 'fa-seedling', INT: 'fa-user-graduate', ADV: 'fa-graduation-cap',
      CONVO: 'fa-comments', HSK: 'fa-award', ART: 'fa-paintbrush', MUSIC: 'fa-music', OTHER: 'fa-shapes'
    };
    const dotColors = {
      ALL: '#047857', LEARNED: '#0F766E', BOOKS: '#15803D', EXAM: '#A16207',
      KIDS: '#D97706', BEG: '#059669', INT: '#2563EB', ADV: '#4F46E5',
      CONVO: '#0891B2', HSK: '#DC2626', ART: '#DB2777', MUSIC: '#7C3AED', OTHER: '#475569'
    };
    const l = labels[_currentLang] || labels.th;
    const ids = ['ALL', 'LEARNED', 'BOOKS', 'EXAM', 'KIDS', 'BEG', 'INT', 'ADV', 'CONVO', 'HSK', 'ART', 'MUSIC', 'OTHER'];
    box.innerHTML = ids.map(id =>
      `<button type="button" class="st-cat-btn ${_activeCat === id ? 'active' : ''}" onclick="OcaStudentPortal.selectCategory('${id}')">` +
      `<span style="display:inline-flex;align-items:center;gap:7px;"><span class="oca-cat-dot" style="background:${_activeCat === id ? '#FDE68A' : (dotColors[id] || '#047857')};"></span><i class="fa-solid ${icons[id]}"></i><span>${esc(l[id])}</span></span>` +
      `<span style="font-size:11px;font-weight:800;padding:1px 7px;border-radius:999px;background:${_activeCat === id ? 'rgba(255,255,255,0.2)' : '#F1F5F9'};color:${_activeCat === id ? '#FFFFFF' : '#475569'};">${counts[id] || 0}</span>` +
      `</button>`
    ).join('');
  }

  function selectCategory(catId) {
    _activeCat = catId;
    renderEnrollCategories();
    renderCoursesGrid();
  }

  function getRecommendedCode() {
    if (!_receipts.length || !_courses.length) return '';
    const lastCode = String(_receipts[0].item_code || '').toUpperCase();
    const m = lastCode.match(/^([A-Z]+)(\d+)$/);
    if (!m) return '';
    const nextCode = m[1] + String(Number(m[2]) + 1).padStart(m[2].length, '0');
    return _courses.some(c => String(c.code || '').toUpperCase() === nextCode) ? nextCode : '';
  }

  function renderCoursesGrid() {
    const grid = document.getElementById('boxEnrollCoursesGrid');
    const lblCount = document.getElementById('lblCourseCount');
    if (!grid) return;
    const q = (document.getElementById('inpCourseSearch')?.value || '').trim().toLowerCase();
    const learnedCodes = new Set(_receipts.map(r => String(r.item_code || '').toUpperCase()).filter(Boolean));
    const recCode = getRecommendedCode();

    const filtered = _courses.filter(c => {
      if (_activeCat === 'LEARNED' && !learnedCodes.has(String(c.code || '').toUpperCase())) return false;
      if (_activeCat !== 'ALL' && _activeCat !== 'LEARNED' && detectCategory(c) !== _activeCat) return false;
      if (q && !((c.code || '') + ' ' + (c.name || '')).toLowerCase().includes(q)) return false;
      return true;
    });

    if (lblCount) lblCount.textContent = `${filtered.length} ${t('coursesUnit')}`;
    grid.innerHTML = filtered.map(c => {
      const cat = detectCategory(c);
      const codeUp = String(c.code || '').toUpperCase();
      const isLearned = learnedCodes.has(codeUp);
      const isRec = recCode && codeUp === recCode;
      const rightBadge = isRec
        ? `<span style="background:#FEF3C7;color:#92400E;border:1px solid #F59E0B;font-size:10.5px;font-weight:800;padding:2px 8px;border-radius:999px;"><i class="fa-solid fa-star"></i> ${esc(t('recommendedBadge'))}</span>`
        : (isLearned
          ? `<span style="background:#022C22;color:#FFFFFF;font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:999px;"><i class="fa-solid fa-check"></i> ${esc(t('learnedBadge'))}</span>`
          : '');
      return `
        <div class="oca-course-card oca-cat-theme-${esc(cat)}" onmouseenter="OcaStudentPortal.hoverCourse('${esc(c.id || c.code)}', this)" onmouseleave="OcaStudentPortal.scheduleHideHoverPopover()">
          <div class="oca-course-hero">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;min-height:22px;">
              <span class="oca-cat-pill"><i class="fa-solid fa-book-open"></i> ${esc(c.level || 'OCA')}</span>
              ${rightBadge}
            </div>
            <div class="oca-course-code-box">
              <div data-i18n-locked="true" class="oca-course-code-txt">${esc(c.code)}</div>
            </div>
          </div>
          <div style="padding:12px 14px;display:flex;flex-direction:column;justify-content:space-between;gap:10px;flex:1;">
            <div class="oca-course-mob-meta">
              <span data-i18n-locked="true" class="oca-course-mob-code">${esc(c.code)}</span>
              <span class="oca-cat-pill">${esc(c.level || 'OCA')}</span>
              ${rightBadge}
            </div>
            <div data-i18n-locked="true" class="oca-course-title">${esc(c.name)}</div>
            <div class="oca-course-foot">
              <button type="button" class="st-btn-outline oca-course-enroll-btn" onclick="OcaStudentPortal.openCheckout('${esc(c.id || c.code)}')">${esc(t('enrollBtn'))}</button>
              <strong class="oca-course-price">฿${Number(c.price || 0).toLocaleString('en-US')}</strong>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  function openCheckout(courseId) {
    const c = _courses.find(x => String(x.id || x.code) === String(courseId));
    if (!c) return;
    _checkoutCourse = c;
    document.getElementById('lblCheckoutCourseTitle').textContent = `${c.code} — ${c.name}`;
    const selSched = document.getElementById('selCheckoutSched');
    if (selSched) {
      selSched.innerHTML = _schedules.map(s => `<option value="${esc(s.name + ' ' + (s.day_time || ''))}">${esc(s.name)} (${esc(s.day_time || '')})</option>`).join('');
    }
    const selDeliv = document.getElementById('selCheckoutDelivery');
    if (selDeliv && selDeliv.options[1]) {
      selDeliv.options[1].textContent = `${t('delivShip')} (+฿${_shippingFee})`;
    }
    recalcCheckout();
    document.getElementById('modalStudentCheckout')?.classList.remove('st-hidden');
  }

  function closeCheckout() { document.getElementById('modalStudentCheckout')?.classList.add('st-hidden'); }

  function recalcCheckout() {
    if (!_checkoutCourse) return;
    const deliv = document.getElementById('selCheckoutDelivery')?.value || 'รับเอง';
    const b = computeCheckoutBreakdown(_checkoutCourse, deliv);
    const box = document.getElementById('boxCheckoutFeeBreakdown');
    if (box) {
      const rows = [`<div style="display:flex;justify-content:space-between;"><span>${esc(t('feeTuition'))} (${esc(_checkoutCourse.code)})</span><span>฿${b.base.toLocaleString('en-US')}</span></div>`];
      if (b.regFee > 0) rows.push(`<div style="display:flex;justify-content:space-between;"><span>${esc(t('feeReg'))}</span><span>+฿${b.regFee.toLocaleString('en-US')}</span></div>`);
      if (b.otherFee > 0) rows.push(`<div style="display:flex;justify-content:space-between;"><span>${esc(t('feeOther'))}</span><span>+฿${b.otherFee.toLocaleString('en-US')}</span></div>`);
      if (b.latePenalty > 0) rows.push(`<div style="display:flex;justify-content:space-between;color:#D97706;"><span>${esc(t('feeLatePenalty'))}</span><span>+฿${b.latePenalty.toLocaleString('en-US')}</span></div>`);
      if (b.shipping > 0) rows.push(`<div style="display:flex;justify-content:space-between;"><span>${esc(t('feeShipping'))}</span><span>+฿${b.shipping.toLocaleString('en-US')}</span></div>`);
      if (b.discount > 0) rows.push(`<div class="st-accent-text" style="display:flex;justify-content:space-between;"><span>${esc(t('feeDiscount'))}</span><span>-฿${b.discount.toLocaleString('en-US')}</span></div>`);
      box.innerHTML = rows.join('');
    }
    document.getElementById('lblCheckoutTotal').textContent = '฿' + b.total.toLocaleString('en-US', { minimumFractionDigits: 2 });
  }

  async function submitEnrollment() {
    if (!_sb || !_student || !_checkoutCourse) return;
    const fileInput = document.getElementById('inpCheckoutSlipFile');
    const file = fileInput && fileInput.files && fileInput.files[0];
    const fileErr = validateImageFile(file);
    if (fileErr) { showToast(fileErr); return; }

    const btn = document.getElementById('btnSubmitCheckout');
    if (btn) btn.disabled = true;

    try {
      if (global.OcaSlipGuard && typeof global.OcaSlipGuard.verifySlipBeforeUpload === 'function') {
        const gRes = await global.OcaSlipGuard.verifySlipBeforeUpload(file, _sb);
        if (gRes && gRes.blocked) throw new Error(gRes.reason || t('errDupSlip'));
      }
      const sid = String(_student.student_id).trim();
      const deliv = document.getElementById('selCheckoutDelivery')?.value || 'รับเอง';
      const total = computeCheckoutBreakdown(_checkoutCourse, deliv).total;
      const ext = (file.name.split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '');
      const path = `student_slip_${sid}_${Date.now()}.${ext}`;
      const { error: upErr } = await _sb.storage.from('payment-slips').upload(path, file, { upsert: true });
      if (upErr) throw upErr;

      const summaryName = (`${_checkoutCourse.code} ${deliv}`).slice(0, 90);
      const { error: pErr } = await _sb.from('fee_settings').upsert([
        { key: 'pending_slip:' + sid, name: summaryName, amount: total, mode: 'PENDING', updated_at: new Date().toISOString() },
        { key: 'pending_slip_url:' + sid, name: String('payment-slips/' + path).slice(0, 90), amount: 1, mode: 'SLIP_URL', updated_at: new Date().toISOString() }
      ], { onConflict: 'key' });
      if (pErr) throw pErr;

      closeCheckout();
      await loadStudentAppData();
      switchTab('finance');
      showToast(t('slipSubmitSuccess'));
    } catch (err) {
      showToast(`${t('slipSubmitFail')} ${err.message || err}`);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function renderScheduleTab() {
    const box = document.getElementById('boxStudentScheduleList');
    if (!box) return;
    const curCourse = String(_student?.current_course || '').trim();
    const curSched = String(_student?.current_schedule || '').trim();
    const latestRc = _receipts[0] || null;

    if (!curCourse && !latestRc) {
      box.innerHTML = `<div class="st-muted-text" style="font-size:13px;">${esc(t('noScheduleMsg'))}</div>`;
      return;
    }

    const displayCourse = curCourse || (latestRc ? (latestRc.item_name || latestRc.item_code) : '-');
    const displaySched = curSched || (latestRc ? latestRc.schedule_info : '-') || '-';
    const displayMode = latestRc ? (latestRc.learning_mode || 'Onsite') : 'Onsite';

    let lecturerName = '';
    if (_termInfo && Array.isArray(_termInfo.slots)) {
      const codeToken = displayCourse.split(/[\s-]/)[0].toUpperCase();
      for (const slot of _termInfo.slots) {
        const hit = (slot.classes || []).find(cl => String(cl.courseCode || '').toUpperCase() === codeToken);
        if (hit) {
          const lecObj = _lecturerMap && _lecturerMap.lecturers && hit.lecturerId ? _lecturerMap.lecturers[String(hit.lecturerId)] : null;
          lecturerName = hit.lecturerName || (lecObj && lecObj.name) || '';
          break;
        }
      }
    }
    const termDates = (_termInfo && _termInfo.dateFrom && _termInfo.dateTo) ? `${_termInfo.dateFrom} - ${_termInfo.dateTo}` : '';

    box.innerHTML = `
      <div class="st-schedule-active-card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
          <span style="background:#022C22;color:#FDE68A;font-size:11.5px;font-weight:800;padding:3px 10px;border-radius:999px;"><i class="fa-solid fa-star"></i> ${esc(t('currentCourseBadge'))}</span>
          ${latestRc ? `<span style="background:#DCFCE7;color:#166534;font-size:11.5px;font-weight:700;padding:3px 10px;border-radius:999px;">#${esc(latestRc.receipt_no)}</span>` : ''}
        </div>
        <div data-i18n-locked="true" style="font-size:16.5px;font-weight:800;">${esc(displayCourse)}</div>
        <div data-i18n-locked="true" class="st-accent-text" style="font-size:13.5px;font-weight:700;"><i class="fa-regular fa-clock"></i> ${esc(displaySched)} • ${esc(displayMode)}</div>
        ${lecturerName ? `<div class="st-muted-text" style="font-size:13px;"><i class="fa-solid fa-chalkboard-user"></i> <strong>${esc(t('lecturerLbl'))}:</strong> ${esc(lecturerName)}</div>` : ''}
        ${termDates ? `<div class="st-muted-text" style="font-size:12.5px;"><i class="fa-solid fa-calendar-check"></i> <strong>${esc(t('termPeriodLbl'))}:</strong> ${esc(termDates)}</div>` : ''}
      </div>
    `;
  }

  function renderFinanceTab() {
    const pendBox = document.getElementById('boxStudentPendingSlips');
    if (pendBox) {
      pendBox.innerHTML = _pendingSlips.map(p => `
        <div class="st-card st-warn-card" style="padding:14px;display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <div>
            <div class="st-warn-label" style="font-size:13px;font-weight:800;">${esc(t('slipPendingCount'))}</div>
            <div style="font-size:14px;font-weight:700;">${esc(p.name)} • ฿${Number(p.amount || 0).toLocaleString('en-US')}</div>
          </div>
          <span style="background:#F59E0B;color:#0F172A;font-size:11.5px;font-weight:800;padding:4px 10px;border-radius:999px;">PENDING</span>
        </div>
      `).join('');
    }
    const rcBox = document.getElementById('boxStudentReceiptsList');
    if (!rcBox) return;
    if (!_receipts.length) {
      rcBox.innerHTML = `<div class="st-muted-text" style="font-size:13px;">${esc(t('noReceiptsMsg'))}</div>`;
      return;
    }
    rcBox.innerHTML = _receipts.map(r => `
      <div class="st-receipt-item" onmouseenter="OcaStudentPortal.hoverReceipt('${esc(r.receipt_no)}', this)" onmouseleave="OcaStudentPortal.scheduleHideHoverPopover()">
        <div>
          <div data-i18n-locked="true" style="font-size:14px;font-weight:800;">#${esc(r.receipt_no)} • ${esc(r.item_name || r.item_code || '-')}</div>
          <div class="st-muted-text" style="font-size:12px;margin-top:2px;">
            ฿${Number(r.grand_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} • ${esc(r.delivery_method || t('delivPickupShort'))}
            ${r.tracking_number ? ` • <strong class="st-link-accent">Tracking: ${esc(r.tracking_number)}</strong>` : ''}
          </div>
        </div>
        <button type="button" class="st-btn-outline" style="font-size:12px;padding:6px 10px;" onclick="OcaStudentPortal.openReceiptDetail('${esc(r.receipt_no)}')">
          <i class="fa-solid fa-qrcode"></i> ${esc(t('btnReceiptQr'))}
        </button>
      </div>
    `).join('');
  }

  async function onProfilePhotoSelected(input) {
    const file = input && input.files && input.files[0];
    const fileErr = validateImageFile(file);
    if (fileErr) { showToast(fileErr); return; }
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
      showToast(t('photoSaveSuccess'));
    } catch (err) {
      showToast(`${t('photoSaveFail')} ${err.message || err}`);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function saveProfile(ev) {
    ev.preventDefault();
    if (!_sb || !_student) return;
    const dobIso = normalizeDobIso(document.getElementById('profDob')?.value || '');
    if (!dobIso) { showToast(t('errBadDob')); return; }
    const btn = document.getElementById('btnSaveProfile');
    if (btn) btn.disabled = true;
    try {
      const sid = String(_student.student_id).trim();
      const prefix = (document.getElementById('profPrefix')?.value || '').trim();
      const fullName = (document.getElementById('profFullName')?.value || '').trim();
      const citizenId = (document.getElementById('profCitizenId')?.value || '').trim();
      const passportNo = (document.getElementById('profPassportNo')?.value || '').trim();
      const ethnicity = (document.getElementById('profEthnicity')?.value || '').trim();
      const nationality = (document.getElementById('profNationality')?.value || '').trim();
      const phone = (document.getElementById('profPhone')?.value || '').trim();
      const lineId = (document.getElementById('profLine')?.value || '').trim();
      const email = (document.getElementById('profEmail')?.value || '').trim();
      const languageLevel = (document.getElementById('profLanguageLevel')?.value || '').trim();
      const address = (document.getElementById('profAddress')?.value || '').trim();
      const emergName = (document.getElementById('profEmergName')?.value || '').trim();
      const emergRel = (document.getElementById('profEmergRelation')?.value || '').trim();
      const emergPhone = (document.getElementById('profEmergPhone')?.value || '').trim();
      const notes = (document.getElementById('profNotes')?.value || '').trim().slice(0, 300);

      const { error: rpcErr } = await _sb.rpc('student_portal_update_profile', {
        p_student_id: sid, p_birth_date: dobIso, p_phone: phone, p_line_id: lineId, p_email: email, p_address: address
      });
      const extendedFields = {
        prefix,
        full_name: fullName || _student.full_name,
        citizen_id: citizenId,
        passport_no: passportNo,
        ethnicity,
        nationality,
        birth_date: dobIso,
        phone_number: phone,
        line_id: lineId,
        email,
        language_level: languageLevel,
        address,
        emergency_name: emergName,
        emergency_relation: emergRel,
        emergency_phone: emergPhone,
        notes,
        updated_at: new Date().toISOString()
      };
      const { error: updErr } = await _sb.from('students').update(extendedFields).eq('student_id', sid);
      if (updErr && rpcErr) throw updErr;
      if (updErr) console.warn('[saveProfile extended]', updErr.message || updErr);

      Object.assign(_student, extendedFields);
      _needsDobSetup = false;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ student: _student, needsDobSetup: false }));
      renderHeaderAndProfile();
      showToast(t('profSaveSuccess'));
    } catch (err) {
      showToast(`${t('profSaveFail')} ${err.message || err}`);
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

  let _activeStudentNotifSid = '';

  function subscribeStudentNotifications() {
    if (!_sb || !_student || typeof _sb.channel !== 'function') return;
    const sid = String(_student.student_id || '').trim();
    const existing = global._activeStudentNotifChannel;
    if (existing && _activeStudentNotifSid === sid && (existing.state === 'joined' || existing.state === 'joining')) {
      return;
    }
    if (existing && existing.state === 'joined' && typeof _sb.removeChannel === 'function') {
      _sb.removeChannel(existing);
    }
    global._activeStudentNotifChannel = null;
    _activeStudentNotifSid = sid;
    global._activeStudentNotifChannel = _sb
      .channel('oca_student_notif_' + sid)
      .on('broadcast', { event: 'student_receipt_issued' }, async (msg) => {
        const p = (msg && msg.payload) ? msg.payload : msg;
        if (!p || String(p.studentId || '') !== sid) return;
        showToast(t('rcIssuedToast') + (p.receiptNo || ''));
        await loadStudentAppData();
        if ('Notification' in global && Notification.permission === 'granted' && 'serviceWorker' in navigator) {
          try {
            const reg = await navigator.serviceWorker.ready;
            if (reg && typeof reg.showNotification === 'function') {
              await reg.showNotification(t('rcIssuedToast') + (p.receiptNo || ''), {
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
    if (!('Notification' in global)) { showToast(t('notifUnsupported')); return; }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { showToast(t('notifDenied')); return; }
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        if (reg && typeof reg.showNotification === 'function') {
          await reg.showNotification('OCA Student', {
            body: t('notifActiveBody'),
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
    showToast(t('notifEnabledToast'));
  }

  function renderNotifModalList() {
    const list = document.getElementById('boxStudentNotifList');
    if (!list) return;
    const noticeHtml = _notices.map((n) => {
      const dtStr = n.createdMs ? new Date(n.createdMs).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
      return `
        <div class="st-notif-notice" onclick="OcaStudentPortal.openNoticeDetail('${esc(n.id)}')">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
            <span class="st-warn-label" style="font-size:11px;font-weight:800;"><i class="fa-solid fa-bullhorn"></i> ${esc(t('noticeBoardTitle'))}</span>
            <span class="st-muted-text" style="font-size:11px;">${esc(dtStr)}</span>
          </div>
          <div style="font-size:13.5px;font-weight:800;margin-top:3px;">${esc(n.title)}</div>
          ${n.body ? `<div class="st-muted-text" style="font-size:12px;margin-top:2px;">${esc(n.body)}</div>` : ''}
        </div>`;
    });

    const receiptHtml = _notifs.map((n) => {
      const dt = n.updated_at ? new Date(n.updated_at).toLocaleString('th-TH') : '';
      return `
        <div class="st-notif-receipt">
          <div style="font-size:13.5px;font-weight:700;"><i class="fa-solid fa-receipt st-accent-text"></i> ${esc(n.name || '-')}</div>
          <div class="st-muted-text" style="font-size:12px;margin-top:2px;">฿${Number(n.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} • ${esc(n.mode || '')} • ${esc(dt)}</div>
        </div>`;
    });

    const combined = noticeHtml.concat(receiptHtml);
    list.innerHTML = combined.length ? combined.join('') : `<div class="st-muted-text" style="font-size:13px;">${esc(t('noNotifsMsg'))}</div>`;
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
      `<div><strong class="st-accent-text">฿${Number(r.grand_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></div>` +
      `<div>${esc(r.delivery_method || t('delivPickupShort'))} • ${esc(r.claim_status || 'PENDING')}</div>` +
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
        <div class="oca-notice-item" style="padding:8px 11px;display:flex;align-items:center;gap:7px;" onmouseenter="OcaStudentPortal.hoverNotice('${esc(n.id)}', this)" onmouseleave="OcaStudentPortal.scheduleHideHoverPopover()" onclick="OcaStudentPortal.openNoticeDetail('${esc(n.id)}')">
          ${n.pinned ? '<span style="background:#FEF3C7;color:#92400E;font-size:10px;font-weight:800;padding:1px 6px;border-radius:999px;flex-shrink:0;"><i class="fa-solid fa-thumbtack"></i></span>' : ''}
          <span style="background:${cat.bg};color:${cat.fg};font-size:10px;font-weight:800;padding:1px 7px;border-radius:999px;flex-shrink:0;">${esc(catLabel)}</span>
          <span style="font-size:13px;font-weight:700;color:#FFFFFF;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;">${esc(n.title)}</span>
          <span style="font-size:11px;color:#A7F3D0;flex-shrink:0;">${esc(dtStr)}</span>
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
    const n = _notices.find(x => String(x.id) === String(id)) || (String(id) === 'default' ? getFallbackNotice() : null);
    if (!n) return;
    document.getElementById('lblNoticeModalTitle').textContent = n.title || t('noticeBoardTitle');
    const dtStr = n.createdMs ? new Date(n.createdMs).toLocaleDateString('th-TH', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
    document.getElementById('boxNoticeModalMeta').textContent = dtStr;
    document.getElementById('boxNoticeModalBody').textContent = n.body || '-';
    document.getElementById('modalStudentNoticeDetail')?.classList.remove('st-hidden');
  }

  function closeNoticeDetail() { document.getElementById('modalStudentNoticeDetail')?.classList.add('st-hidden'); }

  function logout() {
    if (_idleTimer) { clearTimeout(_idleTimer); _idleTimer = null; }
    const ch = global._activeStudentNotifChannel;
    if (ch) {
      try {
        if (_sb && ch.state === 'joined' && typeof _sb.removeChannel === 'function') {
          _sb.removeChannel(ch);
        } else if (typeof ch.unsubscribe === 'function') {
          ch.unsubscribe();
        }
      } catch (_) {}
      global._activeStudentNotifChannel = null;
    }
    _activeStudentNotifSid = '';
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
        const choice = await promptEvt.userChoice;
        if (choice && choice.outcome === 'accepted') {
          showToast(t('pwaInstalling'));
        }
      } catch (_) {}
      global.__ocaStudentDeferredPrompt = null;
      _deferredPwaPrompt = null;
      global.__ocaStudentWaitingInstall = false;
      return;
    }
    if (isIosNonStandalone()) {
      document.getElementById('modalStudentPwaGuide')?.classList.remove('st-hidden');
      return;
    }
    global.__ocaStudentWaitingInstall = true;
    showToast(t('pwaPreparing'));
    if ('serviceWorker' in navigator) {
      try { await navigator.serviceWorker.ready; } catch (_) {}
    }
    setTimeout(() => {
      if (!global.__ocaStudentWaitingInstall) return;
      global.__ocaStudentWaitingInstall = false;
      const lateEvt = global.__ocaStudentDeferredPrompt || _deferredPwaPrompt;
      if (lateEvt && typeof lateEvt.prompt === 'function') {
        installPwa();
      } else {
        document.getElementById('modalStudentPwaGuide')?.classList.remove('st-hidden');
      }
    }, 3500);
  }

  function closePwaGuide() { document.getElementById('modalStudentPwaGuide')?.classList.add('st-hidden'); }

  global.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _deferredPwaPrompt = e;
    global.__ocaStudentDeferredPrompt = e;
    const btn = document.getElementById('btnStudentPwaInstall');
    if (btn) btn.classList.remove('st-hidden');
    if (global.__ocaStudentWaitingInstall) {
      global.__ocaStudentWaitingInstall = false;
      installPwa();
    }
  });

  global.addEventListener('appinstalled', () => {
    _deferredPwaPrompt = null;
    global.__ocaStudentDeferredPrompt = null;
    global.__ocaStudentWaitingInstall = false;
    document.documentElement.classList.add('oca-standalone');
    showToast(t('pwaInstalled'));
  });

  if ('serviceWorker' in navigator) {
    global.addEventListener('load', () => {
      const inStudentDir = /\/student(\/|$)/i.test(global.location.pathname || '');
      const swPath = inStudentDir ? './student/sw.js' : './sw.js';
      navigator.serviceWorker.register(swPath, { updateViaCache: 'none' }).catch(() => {});
    });
  }

  function syncThemeIcons() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.querySelectorAll('.st-theme-icon').forEach((ic) => {
      ic.className = (isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon') + ' st-theme-icon';
    });
  }

  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('oca_student_theme', next); } catch (_) {}
    syncThemeIcons();
  }

  async function downloadElAsPng(el, filename) {
    if (!el || typeof global.html2canvas !== 'function') {
      showToast(t('imgGenNotReady'));
      return;
    }
    try {
      const canvas = await global.html2canvas(el, { useCORS: true, scale: 2, backgroundColor: null });
      const link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast(t('imgSaveSuccess'));
    } catch (err) {
      showToast(`${t('imgSaveFail')} ${err.message || err}`);
    }
  }

  function downloadCardPng() {
    const face = document.querySelector(_isCardFlipped ? '.oca-id-face-back' : '.oca-id-face-front');
    const sid = (_student && _student.student_id) ? _student.student_id : 'student';
    downloadElAsPng(face, `oca-student-card-${sid}.png`);
  }

  function downloadReceiptPng() {
    const area = document.getElementById('boxReceiptCaptureArea');
    const title = (document.getElementById('lblRcDetailTitle')?.textContent || 'receipt').replace(/[^0-9A-Za-z_-]/g, '');
    downloadElAsPng(area, `oca-receipt-${title}.png`);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const isRedirectingHtml = /^https?:$/i.test(global.location.protocol) && /\/student\.html$/i.test(global.location.pathname || '');
    if (isRedirectingHtml) return;
    syncThemeIcons();
    initRealtimeI18nObserver();
    initIdleMonitor();
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
    toggleTheme,
    downloadCardPng,
    downloadReceiptPng,
    toggleLoginSecret,
    enterLoginFromWelcome,
    backToWelcome,
    openRegisterView,
    backToLogin,
    toggleSidebar,
    flipIdCard,
    onAddrSearch,
    pickThaiAddress,
    hoverNotice,
    hoverCourse,
    hoverReceipt,
    scheduleHideHoverPopover,
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
    updateAgeDisplay,
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
