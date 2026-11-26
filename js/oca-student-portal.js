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
  let _idleTimeoutMs = 30 * 60 * 1000;
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
  let _courseDiscounts = {};
  let _courseAudiences = {};
  let _enrollWindow = null;
  let _lockedCategories = new Set();
  let _bankAccountInfo = 'ธนาคารกสิกรไทย • โรงเรียนวิทยสถานแห่งวัฒนธรรมตะวันออก';
  let _activeCat = 'ALL';
  let _cart = [];
  let _checkoutItems = [];
  let _checkoutCourse = null;
  let _pendingAiPhoto = null;
  let _pendingRegPhoto = null;
  let _camStream = null;
  let _camMode = '';
  let _camFacing = 'user';
  let _lookupTimestamps = [];
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
  let _realtimeSyncTimer = null;
  let _photoFallbackTriedSid = '';

  const I18N = {
    th: {
      hdrSub: 'ระบบนักศึกษาออนไลน์ (สมัครเรียน • ตารางเรียน • บัตรนักศึกษา)',
      installPwa: 'ติดตั้งแอป',
      installPwaFull: 'ติดตั้งแอป OCA Student',
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
      aiDone: 'ตัดพื้นหลัง AI สำเร็จ',
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
      btnReceiptQr: 'ใบเสร็จ & QR รับตำรา',
      btnLookupSid: 'ตรวจสอบรหัสนักศึกษา',
      lookupModalTitle: 'ตรวจสอบรหัสนักศึกษา',
      lookupSub: 'ค้นหารหัสนักศึกษาด้วยช่องค้นหาเดียว (ชื่อ-นามสกุล, บัตรประชาชน, พาสปอร์ต หรือเบอร์โทร)',
      lookupSingleLbl: 'ชื่อ-นามสกุล / เลขบัตรประชาชน / พาสปอร์ต / เบอร์โทรศัพท์',
      lookupSinglePh: 'กรอกชื่อ-นามสกุล, เลขบัตรประชาชน, เลขพาสปอร์ต หรือเบอร์โทรศัพท์',
      btnSearchSid: 'ค้นหารหัสนักศึกษา',
      lookupNeedInput: 'กรุณากรอกข้อมูลอย่างน้อย 3 ตัวอักษร (หรือ 6 หลักสำหรับเลขบัตร/เบอร์โทร)',
      btnAddCart: 'ใส่ตะกร้า',
      btnInCart: 'อยู่ในตะกร้า',
      btnClearCart: 'ล้างตะกร้า',
      btnCheckoutCart: 'ชำระเงินในตะกร้า',
      btnCopyBank: 'คัดลอกข้อมูลโอนเงิน',
      bankCopiedToast: 'คัดลอกข้อมูลบัญชีธนาคารแล้ว',
      errCategoryLocked: 'หมวดคอร์สนี้ถูกเจ้าหน้าที่ปิดรับสมัครชั่วคราว',
      errMagicBytes: 'ไฟล์ภาพไม่ถูกต้องหรือเสียหาย (กรุณาใช้ JPG, PNG หรือ WEBP แท้)',
      cartEmptyToast: 'กรุณาเลือกคอร์สลงตะกร้าอย่างน้อย 1 รายการ',
      secRegDoc: '1. เอกสารยืนยันตัวตน',
      secRegPersonal: '2. ข้อมูลส่วนตัวผู้เรียน',
      secRegAddress: '3. ที่อยู่ปัจจุบัน (สำหรับออกใบเสร็จและจัดส่งตำรา)',
      secRegContact: '4. ข้อมูลติดต่อ & ผู้ติดต่อฉุกเฉิน',
      secRegCorporate: '5. ข้อมูลบริษัท / นิติบุคคล (กรอกเฉพาะกรณีบริษัทสนับสนุนค่าเล่าเรียน)',
      fldIdType: 'ประเภทเอกสารยืนยันตัวตน',
      idTypeCitizen: 'บัตรประชาชนไทย (13 หลัก)',
      idTypePassport: 'พาสปอร์ตชาวต่างชาติ (Passport)',
      fldFullNameEn: 'ชื่อ-นามสกุล (ภาษาอังกฤษ)',
      fldGender: 'เพศ (Gender)',
      genderUnspecified: 'ไม่ระบุ',
      genderMale: 'ชาย (Male)',
      genderFemale: 'หญิง (Female)',
      genderOther: 'อื่นๆ',
      fldHouseNo: 'บ้านเลขที่',
      fldMoo: 'หมู่ที่',
      fldVillage: 'หมู่บ้าน / อาคาร / คอนโด',
      fldSoi: 'ซอย',
      fldRoad: 'ถนน',
      fldProvince: 'จังหวัด (ฐานข้อมูลไทย)',
      fldDistrict: 'อำเภอ / เขต',
      fldSubdistrict: 'ตำบล / แขวง',
      fldZipcode: 'รหัสไปรษณีย์ (อัตโนมัติ)',
      fldCompanyName: 'ชื่อเต็มบริษัท / นิติบุคคล (Company Name)',
      fldCompanyBranch: 'สาขา (สำนักงานใหญ่ / สาขาที่...)',
      fldCompanyTaxId: 'เลขประจำตัวผู้เสียภาษีอากร 13 หลัก',
      fldCompanyAddress: 'ที่อยู่สำนักงานสำหรับออกใบเสร็จ',
      errBadTaxId: 'เลขประจำตัวผู้เสียภาษีอากรของบริษัทต้องครบ 13 หลัก',
      rcClaimHeader: 'สิทธิ์รับตำราและอุปกรณ์การเรียน (One-Time Claim)',
      rcClaimRule1: 'ต้องสแกน QR Code ณ สถาบันก่อน จึงจะทราบและแสดงรายการอุปกรณ์ที่ได้รับ',
      rcClaimRule2: '(ระบบจะแสดงรายการตำราและอุปกรณ์ที่ได้รับบนหน้าจอเจ้าหน้าที่เมื่อสแกน QR Code นี้เท่านั้น)',
      rcClaimRule3: 'สแกนรับสิทธิ์ได้ 1 ครั้งเท่านั้น ผ่านระบบกล้อง OCA ภายในสถาบัน (ไม่สามารถใช้แอปภายนอกสแกนได้)',
      loginSecNotice: 'ระบบความปลอดภัย: ออกจากระบบอัตโนมัติเมื่อไม่มีการใช้งาน และล้างข้อมูลการเข้าสู่ระบบทุกแท็บเมื่อออกจากระบบ',
      errPendingSlipExists: 'คุณมีสลิปที่รอเจ้าหน้าที่ตรวจสอบอยู่แล้ว กรุณารอการอนุมัติก่อนส่งรายการใหม่',
      errEnrollClosed: 'ขณะนี้อยู่นอกช่วงเวลาที่สถาบันเปิดรับสมัครออนไลน์',
      errDupPassport: 'เลขพาสปอร์ตนี้มีอยู่ในระบบแล้ว (รหัสนักศึกษา:',
      lookupRateLimit: 'ค้นหาบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
      lookupNotFound: 'ไม่พบข้อมูลนักศึกษาที่ตรงกับเงื่อนไข',
      lookupUseSidBtn: 'ใช้รหัสนี้เข้าสู่ระบบ',
      btnOpenCam: 'เปิดกล้องสด',
      btnSnapPhoto: 'กดถ่ายภาพ',
      btnFlipCam: 'สลับกล้อง',
      btnCloseCam: 'ปิดกล้อง',
      camNotSupported: 'อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับกล้องสด',
      camDenied: 'ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตการใช้กล้องหรือเลือกรูปภาพจากเครื่อง',
      regPhotoReady: 'พร้อมถ่ายรูปหรือเลือกรูปหน้าตรง',
      regSuccessTitle: 'ลงทะเบียนนักศึกษาใหม่สำเร็จ!',
      regSuccessSidLbl: 'รหัสนักศึกษาของคุณคือ',
      btnCopySid: 'คัดลอกรหัส',
      sidCopiedToast: 'คัดลอกรหัสนักศึกษาแล้ว',
      regSuccessHint: 'กรุณาจดหรือบันทึกรหัสนักศึกษานี้ไว้ใช้เข้าสู่ระบบคู่กับวันเดือนปีเกิด 8 หลัก',
      btnAckRegSuccess: 'รับทราบและเข้าสู่หน้าเลือกคอร์สเรียน',
      noticeValidRange: 'ระยะเวลาประชาสัมพันธ์',
      noticeOpenLink: 'เปิดลิงก์แนบ',
      noticeDownloadDoc: 'ดาวน์โหลดเอกสารแนบ',
      rcPaperTitle: 'โรงเรียนวิทยสถานแห่งวัฒนธรรมตะวันออก',
      rcPaperSub: 'ใบเสร็จรับเงิน / RECEIPT',
      rcColItem: 'รายการ',
      rcColAmount: 'จำนวนเงิน (บาท)',
      rcPaymentMethod: 'วิธีชำระเงิน',
      rcDeliveryStatus: 'รับ/จัดส่งตำรา',
      rcTotalLabel: 'ยอดชำระสุทธิ',
      qrOneTimeNote: 'One-Time QR • ใช้สแกนรับตำราเรียนที่สถาบันได้เพียง 1 ครั้ง',
      qrClaimedStamp: 'รับตำราเรียนเรียบร้อยแล้ว (CLAIMED)',
      qrVoidedStamp: 'ใบเสร็จถูกยกเลิก (VOIDED)',
      qrShippingNoCounter: 'จัดส่งพัสดุตามที่อยู่ (งดใช้ QR รับหน้าร้านเพื่อป้องกันการรับซ้ำ)',
      qrNoBookRequired: 'รายการนี้ไม่มีการเบิกตำราเรียนที่เคาน์เตอร์',
      qrNoTokenBlocked: 'ไม่พบรหัส Token ยืนยันตัวตน (กรุณาติดต่อเจ้าหน้าที่)'
    },
    en: {
      hdrSub: 'Student Self-Service Portal (Enroll • Schedule • Digital ID)',
      installPwa: 'Install App',
      installPwaFull: 'Install OCA Student App',
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
      aiDone: 'AI Background Ready',
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
      btnReceiptQr: 'Receipt & Book QR',
      btnLookupSid: 'Find Student ID',
      lookupModalTitle: 'Check Student ID',
      lookupSub: 'Search in one box by Full Name, Citizen ID, Passport No., or Phone Number.',
      lookupSingleLbl: 'Full Name / Citizen ID / Passport No. / Phone Number',
      lookupSinglePh: 'Enter Full Name, Citizen ID, Passport No., or Phone Number',
      btnSearchSid: 'Search Student ID',
      lookupNeedInput: 'Please enter at least 3 characters (or 6 digits for ID/Phone).',
      btnAddCart: 'Add to Cart',
      btnInCart: 'In Cart',
      btnClearCart: 'Clear Cart',
      btnCheckoutCart: 'Checkout Cart',
      btnCopyBank: 'Copy Bank Details',
      bankCopiedToast: 'Bank details copied to clipboard',
      errCategoryLocked: 'This course category is temporarily locked by staff.',
      errMagicBytes: 'Invalid or corrupted image file signature (use valid JPG, PNG, or WEBP).',
      cartEmptyToast: 'Please add at least 1 course to the cart.',
      secRegDoc: '1. Identity Document',
      secRegPersonal: '2. Personal Information',
      secRegAddress: '3. Current Address (Receipt & Textbook Delivery)',
      secRegContact: '4. Contact & Emergency Contact',
      secRegCorporate: '5. Corporate Billing Info (Optional — Company Sponsored)',
      fldIdType: 'Document Type',
      idTypeCitizen: 'Thai National ID (13 Digits)',
      idTypePassport: 'Foreign Passport',
      fldFullNameEn: 'Full Name (English)',
      fldGender: 'Gender',
      genderUnspecified: 'Unspecified',
      genderMale: 'Male',
      genderFemale: 'Female',
      genderOther: 'Other',
      fldHouseNo: 'House No.',
      fldMoo: 'Moo',
      fldVillage: 'Village / Building',
      fldSoi: 'Soi / Lane',
      fldRoad: 'Road',
      fldProvince: 'Province',
      fldDistrict: 'District / Amphoe',
      fldSubdistrict: 'Subdistrict / Tambon',
      fldZipcode: 'Postal Code (Auto)',
      fldCompanyName: 'Company / Legal Entity Name',
      fldCompanyBranch: 'Branch (Head Office / Branch No.)',
      fldCompanyTaxId: '13-Digit Corporate Tax ID',
      fldCompanyAddress: 'Registered Office Address',
      errBadTaxId: 'Corporate Tax ID must be exactly 13 digits.',
      rcClaimHeader: 'Textbook & Materials Claim (One-Time Claim)',
      rcClaimRule1: 'Present this QR Code at OCA counter to reveal & claim eligible textbooks/materials.',
      rcClaimRule2: '(Exact eligible textbook items appear on Staff terminal upon official QR verification only.)',
      rcClaimRule3: 'Valid for 1-time scan via OCA internal camera only (external QR apps are not supported).',
      loginSecNotice: 'Security Policy: Sessions auto-sign out on inactivity and clear credentials across all tabs upon logout.',
      errPendingSlipExists: 'You already have a payment slip awaiting staff approval. Please wait before submitting another.',
      errEnrollClosed: 'Online enrollment is currently closed outside the scheduled window.',
      errDupPassport: 'This Passport No. is already registered (Student ID:',
      lookupRateLimit: 'Too many lookup attempts. Please wait a moment.',
      lookupNotFound: 'No matching student record found.',
      lookupUseSidBtn: 'Use This ID to Sign In',
      btnOpenCam: 'Open Camera',
      btnSnapPhoto: 'Take Photo',
      btnFlipCam: 'Flip Camera',
      btnCloseCam: 'Close Camera',
      camNotSupported: 'Live camera is not supported in this browser.',
      camDenied: 'Camera access denied. Please allow camera permission or upload an image file.',
      regPhotoReady: 'Ready to take or upload a portrait photo',
      regSuccessTitle: 'Registration Successful!',
      regSuccessSidLbl: 'Your Student ID is',
      btnCopySid: 'Copy ID',
      sidCopiedToast: 'Student ID copied to clipboard',
      regSuccessHint: 'Please save this 7-digit Student ID to sign in together with your 8-digit birth date.',
      btnAckRegSuccess: 'Acknowledge & Continue to Courses',
      noticeValidRange: 'Display Period',
      noticeOpenLink: 'Open Link',
      noticeDownloadDoc: 'Download Attachment',
      rcPaperTitle: 'Oriental Culture Academy',
      rcPaperSub: 'OFFICIAL RECEIPT',
      rcColItem: 'Description',
      rcColAmount: 'Amount (THB)',
      rcPaymentMethod: 'Payment Method',
      rcDeliveryStatus: 'Textbook Delivery',
      rcTotalLabel: 'Grand Total',
      qrOneTimeNote: 'One-Time QR • Valid for 1-time textbook pickup only',
      qrClaimedStamp: 'TEXTBOOK ALREADY CLAIMED',
      qrVoidedStamp: 'RECEIPT VOIDED',
      qrShippingNoCounter: 'Parcel Delivery Order (Counter QR disabled to prevent duplicate claim)',
      qrNoBookRequired: 'No counter textbook pickup required for this receipt',
      qrNoTokenBlocked: 'Verification token unavailable (Please contact Academy staff)'
    },
    zh: {
      hdrSub: '东方文化书院学员在线门户（在线报名 • 课表 • 电子学生证）',
      installPwa: '安装应用',
      installPwaFull: '安装 OCA Student 应用',
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
      aiDone: 'AI 抠图完成',
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
      btnReceiptQr: '收据与领书二维码',
      btnLookupSid: '查询学号',
      lookupModalTitle: '查询学号',
      lookupSub: '单一搜索框查询学号（支持姓名、身份证号、护照号或手机号）',
      lookupSingleLbl: '姓名 / 身份证号 / 护照号 / 手机号',
      lookupSinglePh: '输入姓名、身份证号、护照号或手机号',
      btnSearchSid: '查询学号',
      lookupNeedInput: '请输入至少 3 个字符（证件号/手机号至少 6 位）',
      btnAddCart: '加入购物车',
      btnInCart: '已在购物车',
      btnClearCart: '清空购物车',
      btnCheckoutCart: '结算购物车',
      btnCopyBank: '复制收款账户',
      bankCopiedToast: '已复制收款账户信息',
      errCategoryLocked: '该课程分类已被教务暂时锁定报名',
      errMagicBytes: '图片文件签名无效，请上传真实的 JPG/PNG/WEBP 图片',
      cartEmptyToast: '请至少选择 1 门课程加入购物车',
      secRegDoc: '1. 身份证明文件',
      secRegPersonal: '2. 学员个人信息',
      secRegAddress: '3. 现居地址（收据与教材邮寄）',
      secRegContact: '4. 联系方式与紧急联系人',
      secRegCorporate: '5. 公司/法人开票信息（选填 — 仅限公司赞助学费）',
      fldIdType: '证件类型',
      idTypeCitizen: '泰国身份证（13位）',
      idTypePassport: '外籍护照 (Passport)',
      fldFullNameEn: '英文全名',
      fldGender: '性别',
      genderUnspecified: '未指定',
      genderMale: '男 (Male)',
      genderFemale: '女 (Female)',
      genderOther: '其他',
      fldHouseNo: '门牌号',
      fldMoo: '村组 (Moo)',
      fldVillage: '小区/大厦',
      fldSoi: '巷 (Soi)',
      fldRoad: '路 (Road)',
      fldProvince: '府/省 (Province)',
      fldDistrict: '县/区 (District)',
      fldSubdistrict: '镇/区 (Subdistrict)',
      fldZipcode: '邮政编码（自动）',
      fldCompanyName: '公司全称 / 法人名称',
      fldCompanyBranch: '分支机构（总部 / 分部）',
      fldCompanyTaxId: '13位公司税号',
      fldCompanyAddress: '公司开票注册地址',
      errBadTaxId: '公司税号必须为13位数字',
      rcClaimHeader: '教材与教具领取凭证（单次核销）',
      rcClaimRule1: '请于书院现场出示此二维码，经系统核验后显示并领取教材与教具。',
      rcClaimRule2: '（具体教材清单仅在书院工作人员扫码核销时于终端显示）',
      rcClaimRule3: '仅限书院内部相机单次核销有效（不支持第三方外部扫码应用）',
      loginSecNotice: '安全策略：长时间无操作将自动退出登录，退出时自动清除所有标签页登录凭证。',
      errPendingSlipExists: '您已有一笔待审核的转账凭证，请等待财务审核后再提交新订单。',
      errEnrollClosed: '当前不在书院开放网上报名时间范围内。',
      errDupPassport: '该护照号已注册（学号：',
      lookupRateLimit: '查询次数过多，请稍后再试',
      lookupNotFound: '未找到匹配的学员记录',
      lookupUseSidBtn: '使用此学号登录',
      btnOpenCam: '开启摄像头',
      btnSnapPhoto: '拍照',
      btnFlipCam: '切换镜头',
      btnCloseCam: '关闭摄像头',
      camNotSupported: '当前浏览器不支持实时摄像头',
      camDenied: '无法访问摄像头，请授予权限或直接上传照片',
      regPhotoReady: '可现场拍照或上传正面免冠照片',
      regSuccessTitle: '新学员注册成功！',
      regSuccessSidLbl: '您的学号为',
      btnCopySid: '复制学号',
      sidCopiedToast: '已复制学号',
      regSuccessHint: '请妥善保存此7位学号，用于搭配8位出生日期登录系统。',
      btnAckRegSuccess: '已知晓并前往选课页面',
      noticeValidRange: '公告有效期',
      noticeOpenLink: '打开附件链接',
      noticeDownloadDoc: '下载附件文档',
      rcPaperTitle: '东方文化书院 (Oriental Culture Academy)',
      rcPaperSub: '正式收据 / RECEIPT',
      rcColItem: '收费项目',
      rcColAmount: '金额 (泰铢)',
      rcPaymentMethod: '支付方式',
      rcDeliveryStatus: '教材领取/物流',
      rcTotalLabel: '实付总额',
      qrOneTimeNote: '一次性核销二维码 • 仅限现场领取教材使用1次',
      qrClaimedStamp: '教材已领取 (CLAIMED)',
      qrVoidedStamp: '收据已作废 (VOIDED)',
      qrShippingNoCounter: '快递邮寄订单（已关闭现场核销码以防重复领取）',
      qrNoBookRequired: '此收据无需现场领取教材',
      qrNoTokenBlocked: '未检测到有效核销令牌（请联系教务人员）'
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

  const DEFAULT_STUDENT_AVATAR = 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20160%20200%22%3E%3Crect%20width%3D%22160%22%20height%3D%22200%22%20fill%3D%22%23F1F5F9%22%2F%3E%3Ccircle%20cx%3D%2280%22%20cy%3D%2274%22%20r%3D%2232%22%20fill%3D%22%23CBD5E1%22%2F%3E%3Cpath%20d%3D%22M24%20188c0-34%2025-56%2056-56s56%2022%2056%2056%22%20fill%3D%22%23CBD5E1%22%2F%3E%3C%2Fsvg%3E';

  function resolveStudentPhotoUrl(raw) {
    const s = String(raw || '').trim();
    if (!s) return DEFAULT_STUDENT_AVATAR;
    if (s.startsWith('data:image/') || s.startsWith('./') || s.startsWith('/')) return s;
    const g1 = s.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
    if (g1 && g1[1]) return 'https://lh3.googleusercontent.com/d/' + g1[1];
    const g2 = s.match(/drive\.google\.com\/(?:open|uc)\?(?:[^#]*&)?id=([^&]+)/i);
    if (g2 && g2[1]) return 'https://lh3.googleusercontent.com/d/' + g2[1];
    if (s.startsWith('http://') || s.startsWith('https://')) return s;
    const cleanPath = s.replace(/^\/+/, '').replace(/^student-photos\//i, '');
    if (_sb && _sb.storage) {
      const pub = _sb.storage.from('student-photos').getPublicUrl(cleanPath);
      if (pub && pub.data && pub.data.publicUrl) return pub.data.publicUrl;
    }
    return s;
  }

  async function resolveStudentPhotoBySidAsync(sid) {
    const cleanSid = String(sid || '').trim();
    if (!cleanSid || !_sb || !_sb.storage) return '';
    try {
      const { data, error } = await _sb.storage.from('student-photos').list('', { search: cleanSid, limit: 15 });
      if (error || !Array.isArray(data) || !data.length) return '';
      const imgFiles = data
        .filter(f => f && f.name && f.name.includes(cleanSid) && /\.(jpe?g|png|webp)$/i.test(f.name))
        .sort((a, b) => String(b.updated_at || b.created_at || b.name).localeCompare(String(a.updated_at || a.created_at || a.name)));
      if (!imgFiles.length) return '';
      const pub = _sb.storage.from('student-photos').getPublicUrl(imgFiles[0].name);
      return (pub && pub.data && pub.data.publicUrl) ? pub.data.publicUrl : '';
    } catch (_) {
      return '';
    }
  }

  async function verifyImageMagicBytes(file) {
    if (!file || typeof file.slice !== 'function') return false;
    try {
      const buf = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      if (buf.length < 4) return false;
      const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
      const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
      const isWebp = buf.length >= 12 &&
        buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
        buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;
      return isJpeg || isPng || isWebp;
    } catch (_) {
      return false;
    }
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

  async function logStudentAudit(action, details, status, overrideSid, overrideName) {
    if (!_sb) return;
    try {
      const sid = String(overrideSid || (_student && _student.student_id) || 'GUEST').slice(0, 60);
      const name = String(overrideName || (_student && formatStudentDisplayName(_student)) || sid).slice(0, 80);
      const { error } = await _sb.from('security_audit_logs').insert([{
        action: String(action || 'STUDENT_ACTION').slice(0, 60),
        username: sid,
        full_name: name,
        role: 'STUDENT',
        device_id: 'STUDENT_WEBAPP',
        device_info: String(navigator.userAgent || '').slice(0, 140),
        details: String(details || '').slice(0, 240),
        status: String(status || 'SUCCESS').slice(0, 24),
        created_at: new Date().toISOString()
      }]);
      if (error) console.warn('[StudentAudit]', error.message || error);
    } catch (_) {}
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
      if (ev.key === 'oca_st_logout_signal' && _student) {
        logout(true);
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

  /* THAI ADDRESS CASCADING DROPDOWNS + AUTOCOMPLETE (77 PROVINCES DB) */
  let _thaiAddrData = null;

  async function loadThaiAddressDb() {
    if (_thaiAddrData) return _thaiAddrData;
    try {
      const res = await fetch('./assets/data/thai_address_compact.json');
      if (!res.ok) return null;
      _thaiAddrData = await res.json();
      return _thaiAddrData;
    } catch (_) {
      return null;
    }
  }

  function addrIds(mode) {
    const p = mode === 'reg' ? 'reg' : 'prof';
    return {
      house: p + 'AddrHouseNo',
      moo: p + 'AddrMoo',
      village: p + 'AddrVillage',
      soi: p + 'AddrSoi',
      road: p + 'AddrRoad',
      prov: p + 'AddrProvince',
      dist: p + 'AddrDistrict',
      sub: p + 'AddrSubdistrict',
      zip: p + 'AddrZipcode',
      full: p + 'Address'
    };
  }

  async function initThaiAddressDropdowns(mode) {
    const db = await loadThaiAddressDb();
    const ids = addrIds(mode);
    const provSel = document.getElementById(ids.prov);
    if (!db || !provSel) return;
    const prev = provSel.value;
    const provs = Array.isArray(db.provinces) ? db.provinces : [];
    provSel.innerHTML = '<option value="">-- เลือกจังหวัด --</option>' +
      provs.map(pr => `<option value="${esc(pr.name)}">${esc(pr.name)}</option>`).join('');
    if (prev) provSel.value = prev;
  }

  async function onAddrProvinceChange(mode) {
    const db = await loadThaiAddressDb();
    const ids = addrIds(mode);
    const provName = document.getElementById(ids.prov)?.value || '';
    const distSel = document.getElementById(ids.dist);
    const subSel = document.getElementById(ids.sub);
    const zipInp = document.getElementById(ids.zip);
    if (distSel) {
      const dists = (db && db.districtsByProv && db.districtsByProv[provName]) || [];
      distSel.innerHTML = '<option value="">-- เลือกอำเภอ / เขต --</option>' +
        dists.map(d => `<option value="${esc(d.name)}" data-id="${esc(d.id)}">${esc(d.name)}</option>`).join('');
    }
    if (subSel) subSel.innerHTML = '<option value="">-- เลือกตำบล / แขวง --</option>';
    if (zipInp) zipInp.value = '';
    composeThaiAddress(mode);
  }

  async function onAddrDistrictChange(mode) {
    const db = await loadThaiAddressDb();
    const ids = addrIds(mode);
    const distSel = document.getElementById(ids.dist);
    const subSel = document.getElementById(ids.sub);
    const zipInp = document.getElementById(ids.zip);
    const distOpt = distSel && distSel.options[distSel.selectedIndex];
    const distId = distOpt ? distOpt.getAttribute('data-id') : '';
    if (subSel) {
      const subs = (db && db.subdistrictsByDist && distId && db.subdistrictsByDist[String(distId)]) || [];
      subSel.innerHTML = '<option value="">-- เลือกตำบล / แขวง --</option>' +
        subs.map(s => `<option value="${esc(s.name)}" data-zip="${esc(s.zipCode || '')}">${esc(s.name)}</option>`).join('');
    }
    if (zipInp) zipInp.value = '';
    composeThaiAddress(mode);
  }

  function onAddrSubdistrictChange(mode) {
    const ids = addrIds(mode);
    const subSel = document.getElementById(ids.sub);
    const zipInp = document.getElementById(ids.zip);
    const opt = subSel && subSel.options[subSel.selectedIndex];
    const zip = opt ? (opt.getAttribute('data-zip') || '') : '';
    if (zipInp && zip) zipInp.value = zip;
    composeThaiAddress(mode);
  }

  function composeThaiAddress(mode) {
    const ids = addrIds(mode);
    const house = (document.getElementById(ids.house)?.value || '').trim();
    const moo = (document.getElementById(ids.moo)?.value || '').trim();
    const village = (document.getElementById(ids.village)?.value || '').trim();
    const soi = (document.getElementById(ids.soi)?.value || '').trim();
    const road = (document.getElementById(ids.road)?.value || '').trim();
    const prov = (document.getElementById(ids.prov)?.value || '').trim();
    const dist = (document.getElementById(ids.dist)?.value || '').trim();
    const sub = (document.getElementById(ids.sub)?.value || '').trim();
    const zip = (document.getElementById(ids.zip)?.value || '').trim();
    const isBkk = prov.includes('กรุงเทพ');
    const parts = [
      house,
      moo ? `หมู่ ${moo}` : '',
      village,
      soi ? `ซ.${soi}` : '',
      road ? `ถ.${road}` : '',
      sub ? `${isBkk ? 'แขวง' : 'ต.'}${sub}` : '',
      dist ? `${isBkk ? 'เขต' : 'อ.'}${dist}` : '',
      prov ? (isBkk ? prov : `จ.${prov}`) : '',
      zip
    ].filter(Boolean);
    const fullEl = document.getElementById(ids.full);
    if (fullEl && parts.length) fullEl.value = parts.join(' ');
  }

  function onIdTypeChange(mode) {
    const isReg = mode === 'reg';
    const sel = document.getElementById(isReg ? 'regIdType' : 'profIdType');
    const cidInp = document.getElementById(isReg ? 'regCitizenId' : 'profCitizenId');
    if (!sel || !cidInp) return;
    if (sel.value === 'passport') {
      cidInp.maxLength = 20;
      cidInp.placeholder = 'Passport No. (6-20 chars)';
    } else {
      cidInp.maxLength = 17;
      cidInp.placeholder = t('phCitizen');
    }
  }

  function encodeStudentExtNotes(rawNotes, extObj) {
    const cleanText = String(rawNotes || '').replace(/\s*\[EXT:\{[\s\S]*?\}\]\s*/g, '').trim();
    const cleanExt = {};
    Object.keys(extObj || {}).forEach((k) => {
      const v = String(extObj[k] || '').trim();
      if (v) cleanExt[k] = v;
    });
    if (!Object.keys(cleanExt).length) return cleanText;
    return (cleanText ? cleanText + ' ' : '') + '[EXT:' + JSON.stringify(cleanExt) + ']';
  }

  function decodeStudentExtNotes(notesStr) {
    const raw = String(notesStr || '');
    const m = raw.match(/\[EXT:(\{[\s\S]*?\})\]/);
    let ext = {};
    if (m && m[1]) {
      try { ext = JSON.parse(m[1]) || {}; } catch (_) { ext = {}; }
    }
    const cleanText = raw.replace(/\s*\[EXT:\{[\s\S]*?\}\]\s*/g, '').trim();
    return { cleanText, ext };
  }

  async function ensureThaiAddressIndex() {
    if (_thaiAddrIndex) return _thaiAddrIndex;
    const data = await loadThaiAddressDb();
    if (!data) return [];
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
    }, _idleTimeoutMs || IDLE_TIMEOUT_MS);
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
    if (document.body) document.body.classList.toggle('oca-app-logged-in', viewId === 'viewStudentApp');
  }

  function enterLoginFromWelcome() { showOnlyView('viewStudentAuth'); }
  function backToWelcome() { showOnlyView('viewStudentWelcome'); }
  function openRegisterView() {
    showOnlyView('viewStudentRegister');
    initThaiAddressDropdowns('reg');
  }
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
      logStudentAudit('STUDENT_LOGIN_SUCCESS', `Student ${sid} signed in via Student WebApp`, 'SUCCESS', sid, formatStudentDisplayName(studentRow));
      await enterApp('home');
    } catch (err) {
      const nextFails = (guard.fails || 0) + 1;
      const nextLock = nextFails >= MAX_LOGIN_FAILS ? (Date.now() + LOCKOUT_MS) : 0;
      setLoginGuard({ fails: nextLock ? 0 : nextFails, lockedUntil: nextLock });
      if (nextLock) {
        await logStudentAudit('STUDENT_LOGIN_LOCKOUT', `Student ${sid} exceeded 5 failed login attempts`, 'BLOCKED', sid, sid);
      } else {
        await logStudentAudit('STUDENT_LOGIN_FAILED', `Failed login for ${sid}: ${err.message || err}`, 'FAILED', sid, sid);
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
    const companyTaxId = (document.getElementById('regCompanyTaxId')?.value || '').trim().replace(/\D/g, '');
    if (companyTaxId && companyTaxId.length !== 13) {
      if (errEl) { errEl.textContent = t('errBadTaxId'); errEl.classList.remove('st-hidden'); }
      return;
    }

    if (btn) btn.disabled = true;
    try {
      const { yearBE, term } = await resolveActiveYearTerm();
      const yy = String(yearBE).slice(-2);
      const prefixCode = yy + String(term);
      const fullName = (document.getElementById('regFullName')?.value || '').trim();
      const fullNameEn = (document.getElementById('regFullNameEn')?.value || '').trim();
      const gender = (document.getElementById('regGender')?.value || '').trim();
      const idType = (document.getElementById('regIdType')?.value || 'citizen').trim();
      const prefix = (document.getElementById('regPrefix')?.value || '').trim();
      const citizenId = (document.getElementById('regCitizenId')?.value || '').trim();
      const passportNo = (document.getElementById('regPassportNo')?.value || '').trim();
      const ethnicity = (document.getElementById('regEthnicity')?.value || 'ไทย').trim();
      const phone = (document.getElementById('regPhone')?.value || '').trim();
      const lineId = (document.getElementById('regLine')?.value || '').trim();
      const email = (document.getElementById('regEmail')?.value || '').trim();
      const nationality = (document.getElementById('regNationality')?.value || 'ไทย').trim();
      const languageLevel = (document.getElementById('regLanguageLevel')?.value || '').trim();
      composeThaiAddress('reg');
      const address = (document.getElementById('regAddress')?.value || '').trim();
      const emergName = (document.getElementById('regEmergName')?.value || '').trim();
      const emergRel = (document.getElementById('regEmergRelation')?.value || '').trim();
      const emergPhone = (document.getElementById('regEmergPhone')?.value || '').trim();
      const companyName = (document.getElementById('regCompanyName')?.value || '').trim();
      const companyBranch = (document.getElementById('regCompanyBranch')?.value || '').trim();
      const companyAddress = (document.getElementById('regCompanyAddress')?.value || '').trim();
      const rawNotes = (document.getElementById('regNotes')?.value || '').trim().slice(0, 300);
      const notes = encodeStudentExtNotes(rawNotes, {
        id_type: idType,
        full_name_en: fullNameEn,
        gender,
        company_name: companyName,
        company_branch: companyBranch,
        company_tax_id: companyTaxId,
        company_address: companyAddress
      });

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
      if (passportNo.length >= 6) {
        const { data: dupPassRows, error: dupPassErr } = await _sb
          .from('students')
          .select('student_id, status')
          .eq('passport_no', passportNo)
          .limit(1);
        if (!dupPassErr && Array.isArray(dupPassRows) && dupPassRows[0] && String(dupPassRows[0].status || '').toUpperCase() !== 'DELETED') {
          throw new Error(`${t('errDupPassport')} ${dupPassRows[0].student_id}${t('errDupCid2')}`);
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
      if (_pendingRegPhoto && _pendingRegPhoto.blob) {
        try {
          const pPath = `student_ai_${newSid}_${Date.now()}.jpg`;
          const { error: upErr } = await _sb.storage.from('student-photos').upload(pPath, _pendingRegPhoto.blob, { contentType: 'image/jpeg', upsert: true });
          if (!upErr) {
            const pubUrl = _sb.storage.from('student-photos').getPublicUrl(pPath)?.data?.publicUrl;
            if (pubUrl) {
              const { error: phErr } = await _sb.from('students').update({ photo_url: pubUrl }).eq('student_id', newSid);
              if (!phErr) _student.photo_url = pubUrl;
            }
          }
        } catch (_) {}
        _pendingRegPhoto = null;
      }
      stopCamera();
      _needsDobSetup = false;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ student: _student, needsDobSetup: false }));
      logStudentAudit('STUDENT_REGISTER', `New student registered: ${newSid} (${fullName})`, 'SUCCESS', newSid, fullName);
      const sidLbl = document.getElementById('lblRegSuccessSid');
      if (sidLbl) sidLbl.textContent = newSid;
      document.getElementById('modalRegSuccessSid')?.classList.remove('st-hidden');
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
    const sid = String(_student.student_id || '').trim();
    const photo = resolveStudentPhotoUrl(_student.photo_url);

    const trySidFallback = async () => {
      if (!sid || _photoFallbackTriedSid === sid) return;
      _photoFallbackTriedSid = sid;
      const foundUrl = await resolveStudentPhotoBySidAsync(sid);
      if (foundUrl && _student && String(_student.student_id || '').trim() === sid) {
        _student.photo_url = foundUrl;
        ['imgAppAvatar', 'imgAppAvatarMob', 'imgCardPhoto', 'imgProfileAiPreview'].forEach((id) => {
          const im = document.getElementById(id);
          if (im) im.src = foundUrl;
        });
      }
    };

    const setImg = (id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.onerror = () => {
        el.onerror = null;
        el.src = DEFAULT_STUDENT_AVATAR;
        trySidFallback();
      };
      el.src = photo;
    };
    setImg('imgAppAvatar');
    setImg('imgAppAvatarMob');
    setImg('imgCardPhoto');
    setImg('imgProfileAiPreview');
    if (photo === DEFAULT_STUDENT_AVATAR) {
      trySidFallback();
    }

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

    const decodedNotes = decodeStudentExtNotes(_student.notes || '');
    const ext = decodedNotes.ext || {};

    document.getElementById('lblCardSid').textContent = _student.student_id;
    document.getElementById('lblCardName').textContent = fullName;
    const cardNameEn = document.getElementById('lblCardNameEn');
    if (cardNameEn) cardNameEn.textContent = ext.full_name_en || _student.full_name_en || _student.nickname || '';
    const issueEl = document.getElementById('lblCardIssueDate');
    if (issueEl) {
      const dt = _student.created_at ? new Date(_student.created_at) : new Date();
      issueEl.textContent = dt.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    initThaiAddressDropdowns('prof');
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    setVal('profPrefix', _student.prefix || '');
    setVal('profFullName', _student.full_name || '');
    setVal('profFullNameEn', ext.full_name_en || '');
    setVal('profGender', ext.gender || '');
    setVal('profIdType', ext.id_type || ((_student.passport_no && !_student.citizen_id) ? 'passport' : 'citizen'));
    setVal('profCitizenId', _student.citizen_id || '');
    setVal('profPassportNo', _student.passport_no || '');
    setVal('profEthnicity', _student.ethnicity || '');
    setVal('profNationality', _student.nationality || '');
    setVal('profDob', formatIsoToThaiDob(_student.birth_date || ''));
    setVal('profAge', calcAgeFromDobInput(_student.birth_date || ''));
    setVal('profPhone', _student.phone_number || '');
    setVal('profLine', _student.line_id || '');
    setVal('profCompanyName', ext.company_name || '');
    setVal('profCompanyBranch', ext.company_branch || '');
    setVal('profCompanyTaxId', ext.company_tax_id || '');
    setVal('profCompanyAddress', ext.company_address || '');
    setVal('profEmail', _student.email || '');
    setVal('profLanguageLevel', _student.language_level || '');
    setVal('profAddress', _student.address || '');
    setVal('profEmergName', _student.emergency_name || '');
    setVal('profEmergRelation', _student.emergency_relation || '');
    setVal('profEmergPhone', _student.emergency_phone || '');
    setVal('profNotes', String(_student.notes || '').replace(/\s*\[EXT:\{[\s\S]*?\}\]\s*/g, '').trim());

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

  function computeCheckoutBreakdown(itemsOrCourse, deliveryMethod) {
    const items = Array.isArray(itemsOrCourse) ? itemsOrCourse : (itemsOrCourse ? [itemsOrCourse] : []);
    const base = items.reduce((acc, c) => acc + Number((c && c.price) || 0), 0);
    const isNewStudent = _receipts.length === 0;
    const regFee = isNewStudent && isFeeRuleActive(_feeRules.regFee) ? Number(_feeRules.regFee.amount) : 0;
    const otherFee = isFeeRuleActive(_feeRules.otherRegFee) ? Number(_feeRules.otherRegFee.amount) : 0;
    const hasKids = items.some((c) => detectCategory(c) === 'KIDS');
    const lateRule = (hasKids && _feeRules.lateRegPenaltyKids) ? _feeRules.lateRegPenaltyKids : _feeRules.lateRegPenalty;
    const latePenalty = isFeeRuleActive(lateRule) ? Number(lateRule.amount) : 0;
    const shipping = deliveryMethod === 'ส่งตำรา'
      ? (isFeeRuleActive(_feeRules.shippingFee) ? Number(_feeRules.shippingFee.amount) : _shippingFee)
      : 0;
    const kidsRow = _feeRules.discountKids || _feeRules.discount_kids;
    const customCourseDisc = items.reduce((acc, c) => {
      const cd = _courseDiscounts['course_disc_' + c.id] || _courseDiscounts['course_disc_' + c.code];
      return acc + (cd && isFeeRuleActive(cd) ? Number(cd.amount) : 0);
    }, 0);
    const baseDisc = customCourseDisc > 0
      ? customCourseDisc
      : (hasKids && isFeeRuleActive(kidsRow)
        ? Number(kidsRow.amount)
        : (isFeeRuleActive(_feeRules.discountNormal) ? Number(_feeRules.discountNormal.amount) : 0));
    const otherDisc = isFeeRuleActive(_feeRules.discountOther) ? Number(_feeRules.discountOther.amount) : 0;
    const discount = baseDisc + otherDisc;
    const total = Math.max(0, base + regFee + otherFee + latePenalty + shipping - discount);
    return { base, regFee, otherFee, latePenalty, shipping, discount, total };
  }

  async function loadStudentAppData() {
    if (!_sb || !_student) return;
    const sid = String(_student.student_id || '').trim();
    const [resSt, resC, resSc, resRc, resPend, resNotif, resFees, resLocks, resCourseDisc, resAud] = await Promise.all([
      _sb.from('students').select('*').eq('student_id', sid).maybeSingle(),
      _sb.from('courses').select('*').eq('is_active', true).order('code', { ascending: true }),
      _sb.from('schedules').select('*').eq('is_active', true).order('id', { ascending: true }),
      _sb.from('receipts').select('*').eq('student_id', sid).order('created_at', { ascending: false }),
      _sb.from('fee_settings').select('key,name,amount,mode,updated_at').like('key', 'pending_slip%:' + sid),
      _sb.from('fee_settings').select('key,name,amount,mode,updated_at').eq('key', 'student_notif:' + sid).maybeSingle(),
      _sb.from('fee_settings').select('key,name,amount,mode,start_date,end_date').in('key', [
        'regFee', 'otherRegFee', 'shippingFee', 'discountNormal', 'discountKids', 'discount_kids', 'discountOther', 'lateRegPenalty', 'lateRegPenaltyKids', 'shipping_fee', 'textbook_shipping', 'idle_timeout_minutes', 'cfg_cashier_payee', 'online_enroll_schedule'
      ]),
      _sb.from('fee_settings').select('key,amount,mode').like('key', 'kiosk_cat_lock:%'),
      _sb.from('fee_settings').select('key,amount,mode,start_date,end_date').like('key', 'course_disc_%'),
      _sb.from('fee_settings').select('key,name,amount,mode').like('key', 'course_audience_%')
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
    _enrollWindow = _feeRules.online_enroll_schedule || null;
    _courseDiscounts = {};
    if (Array.isArray(resCourseDisc.data)) {
      resCourseDisc.data.forEach((r) => { if (r && r.key) _courseDiscounts[r.key] = r; });
    }
    _courseAudiences = {};
    if (Array.isArray(resAud.data)) {
      resAud.data.forEach((r) => { if (r && r.key) _courseAudiences[r.key] = r.name || ''; });
    }
    _lockedCategories = new Set();
    if (Array.isArray(resLocks.data)) {
      resLocks.data.forEach((r) => {
        if (r && r.key && (Number(r.amount) === 1 || String(r.mode || '').toUpperCase() === 'LOCKED')) {
          _lockedCategories.add(r.key.replace('kiosk_cat_lock:', '').toUpperCase());
        }
      });
    }
    if (_feeRules.idle_timeout_minutes && Number(_feeRules.idle_timeout_minutes.amount) >= 5) {
      const mins = Math.min(240, Math.max(5, Number(_feeRules.idle_timeout_minutes.amount)));
      _idleTimeoutMs = mins * 60 * 1000;
    }
    if (_feeRules.cfg_cashier_payee && _feeRules.cfg_cashier_payee.name) {
      const payeeName = String(_feeRules.cfg_cashier_payee.name).trim();
      const payeeMode = String(_feeRules.cfg_cashier_payee.mode || '').toLowerCase();
      if (payeeName && payeeMode !== 'dynamic' && !payeeName.includes('ตามผู้ใช้ที่ล็อกอิน')) {
        _bankAccountInfo = payeeName;
      }
    }
    const bankEl = document.getElementById('lblCheckoutBankAccount');
    if (bankEl) bankEl.textContent = _bankAccountInfo;
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
    const codeUp = String((c && c.code) || '').toUpperCase().trim();
    const txt = ((c && c.code || '') + ' ' + (c && c.name || '') + ' ' + (c && c.level || '')).toLowerCase();
    if (txt.includes('ตำรา') || txt.includes('หนังสือ') || txt.includes('book') || /^TB/.test(codeUp)) return 'BOOKS';
    if (txt.includes('hsk')) return 'HSK';
    if (txt.includes('สอบ') || txt.includes('exam') || txt.includes('test')) return 'EXAM';
    if (txt.includes('เด็ก') || txt.includes('kid') || txt.includes('เยาวชน') || /^K\d/.test(codeUp)) return 'KIDS';
    if (txt.includes('สนทนา') || txt.includes('convo') || txt.includes('สื่อสาร')) return 'CONVO';
    if (txt.includes('ศิลป') || txt.includes('วาด') || txt.includes('พู่กัน') || txt.includes('เขียนอักษร')) return 'ART';
    if (txt.includes('ดนตรี') || txt.includes('กู่เจิง') || txt.includes('ขลุ่ย') || txt.includes('ผีผา')) return 'MUSIC';
    if (txt.includes('ขั้นสูง') || txt.includes('ระดับสูง') || txt.includes('advanced') || /^OC3|^C3/.test(codeUp)) return 'ADV';
    if (txt.includes('ขั้นกลาง') || txt.includes('ระดับกลาง') || txt.includes('intermediate') || /^OC2|^C2/.test(codeUp)) return 'INT';
    if (txt.includes('ขั้นต้น') || txt.includes('ระดับต้น') || txt.includes('beginner') || txt.includes('พื้นฐาน') || txt.includes('พินอิน') || /^OC1|^C1/.test(codeUp)) return 'BEG';
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
    box.innerHTML = ids.map(id => {
      const isLocked = _lockedCategories.has(id);
      return `<button type="button" class="st-cat-btn ${_activeCat === id ? 'active' : ''}" onclick="OcaStudentPortal.selectCategory('${id}')">` +
      `<span style="display:inline-flex;align-items:center;gap:7px;"><span class="oca-cat-dot" style="background:${_activeCat === id ? '#FDE68A' : (dotColors[id] || '#047857')};"></span><i class="fa-solid ${isLocked ? 'fa-lock' : icons[id]}"></i><span>${esc(l[id])}</span></span>` +
      `<span style="font-size:11px;font-weight:800;padding:1px 7px;border-radius:999px;background:${_activeCat === id ? 'rgba(255,255,255,0.2)' : '#F1F5F9'};color:${_activeCat === id ? '#FFFFFF' : '#475569'};">${counts[id] || 0}</span>` +
      `</button>`;
    }).join('');
  }

  function selectCategory(catId) {
    if (_lockedCategories.has(catId)) {
      showToast(t('errCategoryLocked'));
      return;
    }
    _activeCat = catId;
    renderEnrollCategories();
    renderCoursesGrid();
  }

  function renderCartBar() {
    const bar = document.getElementById('boxStudentCartBar');
    if (!bar) return;
    if (!_cart.length) {
      bar.classList.add('st-hidden');
      return;
    }
    const sum = _cart.reduce((acc, c) => acc + Number((c && c.price) || 0), 0);
    const cntEl = document.getElementById('lblCartCount');
    const totEl = document.getElementById('lblCartTotal');
    if (cntEl) cntEl.textContent = String(_cart.length);
    if (totEl) totEl.textContent = '฿' + sum.toLocaleString('en-US');
    bar.classList.remove('st-hidden');
  }

  function toggleCartItem(courseId) {
    const c = _courses.find(x => String(x.id || x.code) === String(courseId));
    if (!c) return;
    const cat = detectCategory(c);
    if (_lockedCategories.has(cat)) {
      showToast(t('errCategoryLocked'));
      return;
    }
    const key = String(c.id || c.code);
    const idx = _cart.findIndex(x => String(x.id || x.code) === key);
    if (idx >= 0) _cart.splice(idx, 1);
    else _cart.push(c);
    renderCartBar();
    renderCoursesGrid();
  }

  function clearCart() {
    _cart = [];
    renderCartBar();
    renderCoursesGrid();
  }

  function openCartCheckout() {
    if (!_cart.length) {
      showToast(t('cartEmptyToast'));
      return;
    }
    openCheckoutList(_cart.slice());
  }

  function copyBankAccount() {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(_bankAccountInfo).then(() => showToast(t('bankCopiedToast'))).catch(() => {});
    }
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
      const cat = detectCategory(c);
      if (_lockedCategories.has(cat)) return false;
      if (_activeCat === 'LEARNED' && !learnedCodes.has(String(c.code || '').toUpperCase())) return false;
      if (_activeCat !== 'ALL' && _activeCat !== 'LEARNED' && cat !== _activeCat) return false;
      if (q && !((c.code || '') + ' ' + (c.name || '')).toLowerCase().includes(q)) return false;
      return true;
    });

    if (lblCount) lblCount.textContent = `${filtered.length} ${t('coursesUnit')}`;
    grid.innerHTML = filtered.map(c => {
      const cat = detectCategory(c);
      const codeUp = String(c.code || '').toUpperCase();
      const cKey = String(c.id || c.code);
      const inCart = _cart.some(x => String(x.id || x.code) === cKey);
      const isLearned = learnedCodes.has(codeUp);
      const isRec = recCode && codeUp === recCode;
      const rightBadge = isRec
        ? `<span style="background:#FEF3C7;color:#92400E;border:1px solid #F59E0B;font-size:10.5px;font-weight:800;padding:2px 8px;border-radius:999px;"><i class="fa-solid fa-star"></i> ${esc(t('recommendedBadge'))}</span>`
        : (isLearned
          ? `<span style="background:#022C22;color:#FFFFFF;font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:999px;"><i class="fa-solid fa-check"></i> ${esc(t('learnedBadge'))}</span>`
          : '');
      return `
        <div class="oca-course-card oca-cat-theme-${esc(cat)}" onmouseenter="OcaStudentPortal.hoverCourse('${esc(cKey)}', this)" onmouseleave="OcaStudentPortal.scheduleHideHoverPopover()">
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
            <div class="oca-course-foot" style="gap:6px;flex-wrap:wrap;">
              <div style="display:flex;gap:6px;align-items:center;">
                <button type="button" class="${inCart ? 'st-btn-gold' : 'st-btn-info'}" style="padding:6px 10px;font-size:11.5px;border-radius:10px;" onclick="OcaStudentPortal.toggleCartItem('${esc(cKey)}')">
                  <i class="fa-solid ${inCart ? 'fa-check' : 'fa-cart-plus'}"></i> ${esc(inCart ? t('btnInCart') : t('btnAddCart'))}
                </button>
                <button type="button" class="oca-course-enroll-btn" onclick="OcaStudentPortal.openCheckout('${esc(cKey)}')">${esc(t('enrollBtn'))}</button>
              </div>
              <strong class="oca-course-price">฿${Number(c.price || 0).toLocaleString('en-US')}</strong>
            </div>
          </div>
        </div>`;
    }).join('');
    renderCartBar();
  }

  function isEnrollmentWindowOpen() {
    if (!_enrollWindow) return true;
    const mode = String(_enrollWindow.mode || '').toUpperCase();
    if (mode === 'OFF' || mode === 'CLOSED') return false;
    if (mode === 'RANGE' || mode === 'DATE_RANGE') {
      const nowIso = todayLocalIso();
      if (_enrollWindow.start_date && nowIso < String(_enrollWindow.start_date)) return false;
      if (_enrollWindow.end_date && nowIso > String(_enrollWindow.end_date)) return false;
    }
    return true;
  }

  function openCheckoutList(items) {
    if (!items || !items.length) return;
    if (!isEnrollmentWindowOpen()) {
      showToast(t('errEnrollClosed'));
      return;
    }
    if (_pendingSlips.length > 0) {
      showToast(t('errPendingSlipExists'));
      return;
    }
    _checkoutItems = items;
    _checkoutCourse = items[0];
    document.getElementById('lblCheckoutCourseTitle').textContent = items.length === 1
      ? `${items[0].code} — ${items[0].name}`
      : `${items.length} ${t('coursesUnit')} (${items.map(x => x.code).join(', ')})`;
    const itemsBox = document.getElementById('boxCheckoutItemsList');
    if (itemsBox) {
      itemsBox.innerHTML = items.map(c =>
        `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;"><span><strong>${esc(c.code)}</strong> — ${esc(c.name)}</span><span style="font-family:monospace;font-weight:700;">฿${Number(c.price || 0).toLocaleString('en-US')}</span></div>`
      ).join('');
    }
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

  function openCheckout(courseId) {
    const c = _courses.find(x => String(x.id || x.code) === String(courseId));
    if (!c) return;
    if (_lockedCategories.has(detectCategory(c))) {
      showToast(t('errCategoryLocked'));
      return;
    }
    openCheckoutList([c]);
  }

  function closeCheckout() { document.getElementById('modalStudentCheckout')?.classList.add('st-hidden'); }

  function recalcCheckout() {
    if (!_checkoutItems.length && !_checkoutCourse) return;
    const items = _checkoutItems.length ? _checkoutItems : [_checkoutCourse];
    const deliv = document.getElementById('selCheckoutDelivery')?.value || 'รับเอง';
    const b = computeCheckoutBreakdown(items, deliv);
    const box = document.getElementById('boxCheckoutFeeBreakdown');
    if (box) {
      const codeLabel = items.map(c => c.code).join(', ');
      const rows = [`<div style="display:flex;justify-content:space-between;"><span>${esc(t('feeTuition'))} (${esc(codeLabel)})</span><span>฿${b.base.toLocaleString('en-US')}</span></div>`];
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
    const items = _checkoutItems.length ? _checkoutItems : (_checkoutCourse ? [_checkoutCourse] : []);
    if (!_sb || !_student || !items.length) return;
    if (!isEnrollmentWindowOpen()) { showToast(t('errEnrollClosed')); return; }
    if (_pendingSlips.length > 0) { showToast(t('errPendingSlipExists')); return; }
    const fileInput = document.getElementById('inpCheckoutSlipFile');
    const file = fileInput && fileInput.files && fileInput.files[0];
    const fileErr = validateImageFile(file);
    if (fileErr) { showToast(fileErr); return; }
    if (!(await verifyImageMagicBytes(file))) { showToast(t('errMagicBytes')); return; }

    const btn = document.getElementById('btnSubmitCheckout');
    if (btn) btn.disabled = true;

    try {
      if (global.OcaSlipGuard && typeof global.OcaSlipGuard.verifySlipBeforeUpload === 'function') {
        const gRes = await global.OcaSlipGuard.verifySlipBeforeUpload(file, _sb);
        if (gRes && gRes.blocked) throw new Error(gRes.reason || t('errDupSlip'));
      }
      const sid = String(_student.student_id).trim();
      const deliv = document.getElementById('selCheckoutDelivery')?.value || 'รับเอง';
      const total = computeCheckoutBreakdown(items, deliv).total;
      const ext = (file.name.split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '');
      const path = `slips/student_slip_${sid}_${Date.now()}.${ext}`;
      const upOpts = { contentType: file.type || 'image/jpeg', upsert: true };
      let storedPath = 'student-photos/' + path;
      const { error: upErr } = await _sb.storage.from('student-photos').upload(path, file, upOpts);
      if (upErr) {
        const fbPath = `student_slip_${sid}_${Date.now()}.${ext}`;
        const { error: fbErr } = await _sb.storage.from('payment-slips').upload(fbPath, file, upOpts);
        if (fbErr) throw upErr;
        storedPath = 'payment-slips/' + fbPath;
      }

      const codesStr = items.map(c => c.code).join('+');
      const summaryName = (`${codesStr} ${deliv}`).slice(0, 90);
      const { error: pErr } = await _sb.from('fee_settings').upsert([
        { key: 'pending_slip:' + sid, name: summaryName, amount: total, mode: 'PENDING', updated_at: new Date().toISOString() },
        { key: 'pending_slip_url:' + sid, name: String(storedPath).slice(0, 90), amount: 1, mode: 'SLIP_URL', updated_at: new Date().toISOString() }
      ], { onConflict: 'key' });
      if (pErr) throw pErr;

      if (items.length > 1 || _cart.some(x => String(x.id || x.code) === String(items[0].id || items[0].code))) {
        _cart = [];
        renderCartBar();
      }
      closeCheckout();
      await loadStudentAppData();
      switchTab('finance');
      logStudentAudit('STUDENT_ENROLL_SLIP', `Submitted slip for ${codesStr} (${deliv}) ฿${total}`, 'SUCCESS');
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
        <button type="button" class="st-btn-gold" style="font-size:12px;padding:6px 12px;" onclick="OcaStudentPortal.openReceiptDetail('${esc(r.receipt_no)}')">
          <i class="fa-solid fa-qrcode"></i> ${esc(t('btnReceiptQr'))}
        </button>
      </div>
    `).join('');
  }

  async function onProfilePhotoSelected(input) {
    const file = input && input.files && input.files[0];
    const fileErr = validateImageFile(file);
    if (fileErr) { showToast(fileErr); return; }
    if (!(await verifyImageMagicBytes(file))) { showToast(t('errMagicBytes')); return; }
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
      if (statusEl) {
        statusEl.removeAttribute('data-i18n');
        statusEl.textContent = (t('aiDone') || 'ตัดพื้นหลัง AI สำเร็จ') + ' (' + res.engine.toUpperCase() + ')';
      }
      if (saveBtn) saveBtn.classList.remove('st-hidden');
    } catch (err) {
      if (statusEl) statusEl.textContent = 'Error: ' + (err.message || err);
    } finally {
      if (input) input.value = '';
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
      logStudentAudit('STUDENT_PHOTO_UPDATE', `Student ${sid} updated profile portrait`, 'SUCCESS');
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
    const companyTaxId = (document.getElementById('profCompanyTaxId')?.value || '').trim().replace(/\D/g, '');
    if (companyTaxId && companyTaxId.length !== 13) { showToast(t('errBadTaxId')); return; }
    const btn = document.getElementById('btnSaveProfile');
    if (btn) btn.disabled = true;
    try {
      const sid = String(_student.student_id).trim();
      const prefix = (document.getElementById('profPrefix')?.value || '').trim();
      const fullName = (document.getElementById('profFullName')?.value || '').trim();
      const fullNameEn = (document.getElementById('profFullNameEn')?.value || '').trim();
      const gender = (document.getElementById('profGender')?.value || '').trim();
      const idType = (document.getElementById('profIdType')?.value || 'citizen').trim();
      const citizenId = (document.getElementById('profCitizenId')?.value || '').trim();
      const passportNo = (document.getElementById('profPassportNo')?.value || '').trim();
      const ethnicity = (document.getElementById('profEthnicity')?.value || '').trim();
      const nationality = (document.getElementById('profNationality')?.value || '').trim();
      const phone = (document.getElementById('profPhone')?.value || '').trim();
      const lineId = (document.getElementById('profLine')?.value || '').trim();
      const email = (document.getElementById('profEmail')?.value || '').trim();
      const languageLevel = (document.getElementById('profLanguageLevel')?.value || '').trim();
      composeThaiAddress('prof');
      const address = (document.getElementById('profAddress')?.value || '').trim();
      const emergName = (document.getElementById('profEmergName')?.value || '').trim();
      const emergRel = (document.getElementById('profEmergRelation')?.value || '').trim();
      const emergPhone = (document.getElementById('profEmergPhone')?.value || '').trim();
      const companyName = (document.getElementById('profCompanyName')?.value || '').trim();
      const companyBranch = (document.getElementById('profCompanyBranch')?.value || '').trim();
      const companyAddress = (document.getElementById('profCompanyAddress')?.value || '').trim();
      const rawNotes = (document.getElementById('profNotes')?.value || '').trim().slice(0, 300);
      const notes = encodeStudentExtNotes(rawNotes, {
        id_type: idType,
        full_name_en: fullNameEn,
        gender,
        company_name: companyName,
        company_branch: companyBranch,
        company_tax_id: companyTaxId,
        company_address: companyAddress
      });

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
      logStudentAudit('STUDENT_PROFILE_UPDATE', `Student ${sid} updated personal profile`, 'SUCCESS');
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

  function scheduleRealtimeRefresh(refreshOpenRc) {
    if (_realtimeSyncTimer) clearTimeout(_realtimeSyncTimer);
    _realtimeSyncTimer = setTimeout(async () => {
      if (!_student) return;
      await loadStudentAppData();
      if (!document.getElementById('modalStudentCheckout')?.classList.contains('st-hidden')) {
        recalcCheckout();
      }
      if (refreshOpenRc) {
        const rcModal = document.getElementById('modalStudentReceiptDetail');
        if (rcModal && !rcModal.classList.contains('st-hidden')) {
          const rcNo = (document.getElementById('lblRcDetailTitle')?.textContent || '').replace(/^#/, '').trim();
          if (rcNo) openReceiptDetail(rcNo);
        }
      }
    }, 600);
  }

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
        if (p.receiptNo) openReceiptDetail(p.receiptNo);
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fee_settings' }, () => scheduleRealtimeRefresh(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'courses' }, () => scheduleRealtimeRefresh(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules' }, () => scheduleRealtimeRefresh(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'students', filter: 'student_id=eq.' + sid }, (payload) => {
        const ev = String(payload && payload.eventType || '').toUpperCase();
        const row = payload && payload.new;
        const stStatus = row ? String(row.status || 'ACTIVE').toUpperCase() : 'DELETED';
        if (ev === 'DELETE' || stStatus === 'SUSPENDED' || stStatus === 'DELETED' || stStatus === 'INACTIVE') {
          logout();
          showToast(t('errAccountSuspended'));
          return;
        }
        scheduleRealtimeRefresh(false);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'receipts', filter: 'student_id=eq.' + sid }, () => scheduleRealtimeRefresh(true))
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
    const noticeHtml = getActiveNotices().map((n) => {
      const dtStr = n.createdMs ? new Date(n.createdMs).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
      return `
        <div class="st-notif-notice" onclick="OcaStudentPortal.openNoticeDetail('${esc(n.id)}')">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
            <span class="st-warn-label" style="font-size:11px;font-weight:800;display:inline-flex;align-items:center;gap:5px;"><i class="fa-solid fa-bullhorn"></i> ${esc(t('noticeBoardTitle'))} ${n.isNew ? '<span class="oca-notice-new-badge" style="background:#DC2626;color:#FFFFFF;font-size:9.5px;font-weight:800;padding:1px 6px;border-radius:999px;">NEW</span>' : ''}</span>
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

  function numberToThaiBahtText(amount) {
    const num = Number(amount || 0);
    if (!Number.isFinite(num) || num === 0) return 'ศูนย์บาทถ้วน';
    const digits = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
    const units = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];
    const readInt = (s) => {
      let out = '';
      const len = s.length;
      for (let i = 0; i < len; i++) {
        const d = Number(s[i]);
        const pos = len - i - 1;
        if (d === 0) continue;
        if (pos % 6 === 1 && d === 1) out += 'สิบ';
        else if (pos % 6 === 1 && d === 2) out += 'ยี่สิบ';
        else if (pos % 6 === 0 && d === 1 && len > 1 && Number(s[i - 1]) > 0) out += 'เอ็ด';
        else out += digits[d] + units[pos % 6];
        if (pos >= 6 && pos % 6 === 0) out += 'ล้าน';
      }
      return out;
    };
    const [bahtStr, satangStr] = num.toFixed(2).split('.');
    let res = bahtStr === '0' ? '' : (readInt(bahtStr) + 'บาท');
    if (satangStr === '00') res += 'ถ้วน';
    else res += readInt(satangStr) + 'สตางค์';
    return res || 'ศูนย์บาทถ้วน';
  }

  async function openReceiptDetail(rcNo) {
    let r = _receipts.find(x => String(x.receipt_no) === String(rcNo));
    if (!r) return;
    if (_sb) {
      try {
        const { data: liveRow, error: liveErr } = await _sb
          .from('receipts')
          .select('*')
          .eq('receipt_no', rcNo)
          .maybeSingle();
        if (!liveErr && liveRow) r = liveRow;
      } catch (_) {}
    }

    const fmtAmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
    const dtStr = r.created_at ? new Date(r.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
    const stName = r.buyer_name || (_student ? formatStudentDisplayName(_student) : '-');
    const stSid = r.student_id || (_student ? _student.student_id : '-');
    const stAddr = r.buyer_address || (_student && _student.address) || '-';
    const schedModeSub = `รอบ ${esc(r.schedule || r.schedule_info || '-')} (${esc(r.learning_mode || 'Onsite')})`;
    const feeRows = [
      `<tr><td><div>${esc(r.item_name || r.item_code || '-')}</div><div style="font-size:10.5px;color:#64748b;margin-top:1px;">${schedModeSub}</div></td><td style="text-align:right;font-family:monospace;font-weight:700;color:#0369A1;">${fmtAmt(r.base_amount || r.grand_total)}</td></tr>`
    ];
    if (Number(r.reg_fee || 0) > 0) feeRows.push(`<tr><td>${esc(t('feeReg'))}</td><td style="text-align:right;font-family:monospace;color:#0369A1;">${fmtAmt(r.reg_fee)}</td></tr>`);
    if (Number(r.card_fee || 0) > 0) feeRows.push(`<tr><td>Smart Card Fee</td><td style="text-align:right;font-family:monospace;color:#0369A1;">${fmtAmt(r.card_fee)}</td></tr>`);
    if (Number(r.other_reg_fee || 0) > 0) feeRows.push(`<tr><td>${esc(t('feeOther'))}</td><td style="text-align:right;font-family:monospace;color:#0369A1;">${fmtAmt(r.other_reg_fee)}</td></tr>`);
    if (Number(r.shipping_fee || 0) > 0) feeRows.push(`<tr><td>${esc(t('feeShipping'))}</td><td style="text-align:right;font-family:monospace;color:#0369A1;">${fmtAmt(r.shipping_fee)}</td></tr>`);

    const subTotal = Number(r.base_amount || r.grand_total || 0) + Number(r.reg_fee || 0) + Number(r.card_fee || 0) + Number(r.other_reg_fee || 0) + Number(r.shipping_fee || 0);
    const discSum = Number(r.discount_normal || 0) + Number(r.discount_other || 0);
    const isCredit = /credit|บัตร/i.test(String(r.payment_method || ''));
    const termDateText = (_termInfo && _termInfo.dateFrom) ? _termInfo.dateFrom : 'ตามประกาศสถาบัน';

    document.getElementById('lblRcDetailTitle').textContent = '#' + (r.receipt_no || '');
    const cashierEl = document.getElementById('lblRcCashierName');
    if (cashierEl) cashierEl.textContent = r.cashier_name || r.issued_by || 'ฝ่ายการเงิน OCA';

    document.getElementById('boxRcDetailBody').innerHTML = `
      <div style="text-align:center;margin-bottom:10px;">
        <img src="./oca_logo.png" alt="OCA" style="width:42px;height:42px;object-fit:contain;display:block;margin:0 auto 4px auto;" />
        <div class="oca-weibei-brand" style="font-size:21px;font-weight:800;color:#8A5A00;line-height:1.15;">東方文化書院</div>
        <div style="font-size:13px;font-weight:800;color:#0F172A;margin-top:2px;">วิทยสถานแห่งวัฒนธรรมตะวันออก</div>
        <div style="font-size:10.5px;font-weight:700;color:#334155;letter-spacing:0.6px;">ORIENTAL CULTURE ACADEMY (OCA)</div>
        <div style="font-size:10px;color:#475569;margin-top:2px;">64/28 ถ.รองเมือง ซอย 1 แขวงรองเมือง เขตปทุมวัน กรุงเทพมหานคร 10330</div>
        <div style="font-size:10px;color:#334155;margin-top:2px;"><strong>เบอร์โทรศัพท์ :</strong> 02-216-2826, 02-216-2827, 02-216-2828 &nbsp; <i class="fa-brands fa-line" style="color:#16A34A;"></i> <strong>Line Official :</strong> @OCANIHAO</div>
        <div style="font-size:10px;color:#475569;margin-top:1px;"><i class="fa-brands fa-facebook" style="color:#1D4ED8;"></i> <strong>Facebook :</strong> โรงเรียนวิทยสถานแห่งวัฒนธรรมตะวันออก &nbsp; <i class="fa-brands fa-tiktok"></i> <strong>TikTok :</strong> orientalcultureacademy</div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin:10px 0 8px 0;">
        <div style="border-left:4px solid #0284C7;padding-left:9px;font-size:15px;font-weight:800;color:#0F172A;">${esc(t('rcPaperSub'))}</div>
        <div style="background:#F8FAFC;border:1px solid #CBD5E1;border-radius:6px;padding:6px 10px;font-size:11px;min-width:165px;line-height:1.5;">
          <div style="display:flex;justify-content:space-between;gap:8px;"><span style="color:#475569;">เลขที่ / No.</span><strong class="oca-dm-blue" style="font-family:monospace;">${esc(r.receipt_no)}</strong></div>
          <div style="display:flex;justify-content:space-between;gap:8px;"><span style="color:#475569;">ภาค/ปี / Term:</span><strong class="oca-dm-blue">${esc(r.term || '-')}/${esc(r.year_be || '-')}</strong></div>
          <div style="display:flex;justify-content:space-between;gap:8px;"><span style="color:#475569;">วันที่ / Date:</span><strong class="oca-dm-blue">${esc(dtStr)}</strong></div>
        </div>
      </div>

      <div style="border-top:1px solid #E2E8F0;padding-top:8px;margin-bottom:6px;font-size:11.5px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <div>ได้รับเงินจาก / Received From: <strong class="oca-dm-blue" data-i18n-locked="true">${esc(stName)}</strong></div>
        <div>รหัสประจำตัว / ID: <strong class="oca-dm-blue" style="font-family:monospace;">${esc(stSid)}</strong></div>
        <div style="width:100%;color:#334155;">ที่อยู่ / Address: <span>${esc(stAddr)}</span></div>
      </div>

      <table class="oca-dm-table">
        <thead><tr><th style="text-align:left;">${esc(t('rcColItem'))}</th><th style="text-align:right;width:125px;">${esc(t('rcColAmount'))}</th></tr></thead>
        <tbody>
          ${feeRows.join('')}
          <tr><td style="text-align:right;font-weight:700;">รวมเงิน / Total:</td><td style="text-align:right;font-family:monospace;" class="oca-dm-blue">${fmtAmt(subTotal)}</td></tr>
          ${discSum > 0 ? `<tr><td style="text-align:right;color:#DC2626;">${esc(t('feeDiscount'))}:</td><td style="text-align:right;font-family:monospace;color:#DC2626;">-${fmtAmt(discSum)}</td></tr>` : ''}
          <tr style="background:#F8FAFC;font-weight:800;font-size:13px;">
            <td style="text-align:right;">จำนวนเงินรวมทั้งสิ้น / Net Total:</td>
            <td style="text-align:right;font-family:monospace;" class="oca-dm-blue">${fmtAmt(r.grand_total)}</td>
          </tr>
        </tbody>
      </table>

      <div style="background:#F8FAFC;border:1px solid #CBD5E1;border-radius:4px;padding:6px 10px;margin:7px 0;font-size:11.5px;">
        จำนวนเงินตัวอักษร / (Baht in words): <strong>( <span class="oca-dm-blue">${esc(numberToThaiBahtText(r.grand_total))}</span> )</strong>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;font-size:11.5px;margin:7px 0;color:#334155;">
        <div>ชำระโดย: <strong class="oca-dm-blue">[${isCredit ? '&nbsp;' : '<i class="fa-solid fa-check"></i>'}] โอนเงิน</strong> &nbsp; <strong class="${isCredit ? 'oca-dm-blue' : ''}">[${isCredit ? '<i class="fa-solid fa-check"></i>' : '&nbsp;'}] เครดิต</strong></div>
        <div>รูปแบบ: <strong class="oca-dm-blue">${esc(r.learning_mode || 'Onsite')}</strong></div>
      </div>

      <div style="background:#F8FAFC;border:1px solid #BAE6FD;border-radius:4px;padding:6px 10px;font-size:11.5px;color:#1E293B;margin-bottom:8px;">
        <div><strong>หมายเหตุ:</strong> กำหนดวันเปิดเรียน วันที่ <strong class="oca-dm-blue">${esc(termDateText)}</strong> <span style="color:#0369A1;">(ห้องเรียนสามารถมาดูได้ในวันเปิดเรียน)</span></div>
        ${(r.class_group || r.teacher_name) ? `<div style="font-size:11px;margin-top:2px;color:#334155;">${r.class_group ? `กลุ่ม: <strong class="oca-dm-blue">${esc(r.class_group)}</strong> ` : ''}${r.teacher_name ? `| อาจารย์ผู้สอน: <strong class="oca-dm-blue">${esc(r.teacher_name)}</strong>` : ''}</div>` : ''}
        ${r.tracking_number ? `<div style="font-size:11.5px;font-weight:800;color:#0369A1;margin-top:3px;">Tracking: <span style="font-family:monospace;">${esc(r.tracking_number)}</span></div>` : ''}
      </div>
    `;

    const qrBox = document.getElementById('boxRcDetailQr');
    const qrMsg = document.getElementById('lblRcQrStatusMsg');
    const stUpper = String(r.claim_status || 'PENDING').toUpperCase();
    const matStr = String(r.material_type || '');
    const isShip = /ส่ง|ship|parcel|ems|flash|kerry|จัดส่ง/i.test(String(r.delivery_method || '') + ' ' + stUpper);
    const noBook = stUpper === 'NO_BOOK_CLAIM' || stUpper === 'NOT_REQUIRED' || matStr.includes('ไม่มี') || matStr === 'NONE' || matStr === 'บัตรนักศึกษา';
    const token = String(r.claim_token || '').trim();

    if (qrBox) qrBox.innerHTML = '';
    if (stUpper === 'VOIDED' || stUpper === 'CANCELLED') {
      if (qrMsg) qrMsg.innerHTML = `<span class="oca-dm-stamp-void"><i class="fa-solid fa-ban"></i> ${esc(t('qrVoidedStamp'))}</span>`;
    } else if (stUpper === 'CLAIMED') {
      const claimMeta = [r.claimed_at ? new Date(r.claimed_at).toLocaleString('th-TH') : '', r.claimed_by || ''].filter(Boolean).join(' • ');
      if (qrMsg) qrMsg.innerHTML = `<span class="oca-dm-stamp-claimed"><i class="fa-solid fa-circle-check"></i> ${esc(t('qrClaimedStamp'))}</span>${claimMeta ? `<div style="margin-top:4px;font-size:11px;color:#475569;">${esc(claimMeta)}</div>` : ''}`;
    } else if (isShip) {
      if (qrMsg) qrMsg.innerHTML = `<span class="oca-dm-stamp-warn"><i class="fa-solid fa-truck-fast"></i> ${esc(t('qrShippingNoCounter'))}</span>`;
    } else if (noBook) {
      if (qrMsg) qrMsg.innerHTML = `<span class="oca-dm-stamp-warn"><i class="fa-solid fa-circle-info"></i> ${esc(t('qrNoBookRequired'))}</span>`;
    } else if (!token) {
      if (qrMsg) qrMsg.innerHTML = `<span class="oca-dm-stamp-warn"><i class="fa-solid fa-shield-halved"></i> ${esc(t('qrNoTokenBlocked'))}</span>`;
    } else {
      if (qrBox && global.QRCode) {
        new global.QRCode(qrBox, { text: token, width: 120, height: 120 });
      }
      if (qrMsg) qrMsg.textContent = `${t('qrOneTimeNote')} • #${r.receipt_no}`;
    }

    document.getElementById('modalStudentReceiptDetail')?.classList.remove('st-hidden');
  }

  function closeReceiptDetail() { document.getElementById('modalStudentReceiptDetail')?.classList.add('st-hidden'); }

  function todayLocalIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function getActiveNotices() {
    const today = todayLocalIso();
    return _notices.filter((n) => {
      if (n.end_date && n.end_date < today) return false;
      if (n.start_date && n.start_date > today) return false;
      return true;
    });
  }

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
    const activeList = getActiveNotices();
    const items = activeList.length > 0 ? activeList : [fallbackNotice];

    loginBox.innerHTML = items.map((n) => {
      const cat = cats[n.category] || { th: 'ประกาศ', en: 'Notice', zh: '公告', bg: '#E0F2FE', fg: '#0369A1' };
      const catLabel = cat[_currentLang] || cat.th;
      const dtStr = n.createdMs ? new Date(n.createdMs).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '';
      const mediaIcons = [
        n.imageUrl ? '<i class="fa-regular fa-image" style="color:#6EE7B7;font-size:11px;"></i>' : '',
        n.linkUrl ? '<i class="fa-solid fa-link" style="color:#93C5FD;font-size:11px;"></i>' : '',
        n.docUrl ? '<i class="fa-regular fa-file-pdf" style="color:#FCD34D;font-size:11px;"></i>' : ''
      ].filter(Boolean).join('');
      return `
        <div class="oca-notice-item" style="padding:8px 11px;display:flex;align-items:center;gap:7px;" onmouseenter="OcaStudentPortal.hoverNotice('${esc(n.id)}', this)" onmouseleave="OcaStudentPortal.scheduleHideHoverPopover()" onclick="OcaStudentPortal.openNoticeDetail('${esc(n.id)}')">
          ${n.pinned ? '<span style="background:#FEF3C7;color:#92400E;font-size:10px;font-weight:800;padding:1px 6px;border-radius:999px;flex-shrink:0;"><i class="fa-solid fa-thumbtack"></i></span>' : ''}
          ${n.isNew ? '<span class="oca-notice-new-badge" style="background:#DC2626;color:#FFFFFF;font-size:9.5px;font-weight:800;padding:1px 6px;border-radius:999px;flex-shrink:0;">NEW</span>' : ''}
          <span style="background:${cat.bg};color:${cat.fg};font-size:10px;font-weight:800;padding:1px 7px;border-radius:999px;flex-shrink:0;">${esc(catLabel)}</span>
          <span style="font-size:13px;font-weight:700;color:#FFFFFF;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;">${esc(n.title)}</span>
          ${mediaIcons}
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
    const validStr = (n.start_date || n.end_date)
      ? ` • ${t('noticeValidRange')}: ${n.start_date || '-'} – ${n.end_date || '-'}`
      : '';
    document.getElementById('boxNoticeModalMeta').textContent = dtStr + validStr;
    document.getElementById('boxNoticeModalBody').textContent = n.body || '-';
    const mediaBox = document.getElementById('boxNoticeModalMedia');
    if (mediaBox) {
      const parts = [];
      if (n.imageUrl && /^https?:\/\//i.test(n.imageUrl)) {
        parts.push(`<a href="${esc(n.imageUrl)}" target="_blank" rel="noopener noreferrer"><img src="${esc(n.imageUrl)}" alt="Notice Attachment" style="width:100%;max-height:260px;object-fit:contain;border-radius:10px;border:1px solid #E2E8F0;" /></a>`);
      }
      if (n.linkUrl && /^https?:\/\//i.test(n.linkUrl)) {
        parts.push(`<a href="${esc(n.linkUrl)}" target="_blank" rel="noopener noreferrer" class="st-btn-info" style="text-decoration:none;justify-content:center;"><i class="fa-solid fa-arrow-up-right-from-square"></i> ${esc(t('noticeOpenLink'))}</a>`);
      }
      if (n.docUrl && /^https?:\/\//i.test(n.docUrl)) {
        parts.push(`<a href="${esc(n.docUrl)}" target="_blank" rel="noopener noreferrer" class="st-btn-primary" style="text-decoration:none;justify-content:center;"><i class="fa-solid fa-file-arrow-down"></i> ${esc(t('noticeDownloadDoc'))}: ${esc(n.docName || 'Document')}</a>`);
      }
      mediaBox.innerHTML = parts.join('');
    }
    document.getElementById('modalStudentNoticeDetail')?.classList.remove('st-hidden');
  }

  function closeNoticeDetail() { document.getElementById('modalStudentNoticeDetail')?.classList.add('st-hidden'); }

  function copyRegSuccessSid() {
    const sid = (document.getElementById('lblRegSuccessSid')?.textContent || '').trim();
    if (!sid || sid === '-') return;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(sid).then(() => showToast(t('sidCopiedToast'))).catch(() => {});
    }
  }

  async function acknowledgeRegSuccess() {
    document.getElementById('modalRegSuccessSid')?.classList.add('st-hidden');
    await enterApp('enroll');
  }

  function camDomIds(mode) {
    const isReg = mode === 'reg';
    return {
      vid: isReg ? 'vidRegCam' : 'vidProfCam',
      img: isReg ? 'imgRegPhotoPreview' : 'imgProfileAiPreview',
      status: isReg ? 'lblRegPhotoStatus' : 'lblAiPhotoStatus',
      btnStart: isReg ? 'btnRegCamStart' : 'btnProfCamStart',
      btnSnap: isReg ? 'btnRegCamSnap' : 'btnProfCamSnap',
      btnFlip: isReg ? 'btnRegCamFlip' : 'btnProfCamFlip',
      btnStop: isReg ? 'btnRegCamStop' : 'btnProfCamStop'
    };
  }

  function stopCamera() {
    if (_camStream) {
      try { _camStream.getTracks().forEach(tr => tr.stop()); } catch (_) {}
      _camStream = null;
    }
    ['reg', 'prof'].forEach((m) => {
      const ids = camDomIds(m);
      const v = document.getElementById(ids.vid);
      if (v) { v.srcObject = null; v.classList.add('st-hidden'); }
      document.getElementById(ids.img)?.classList.remove('st-hidden');
      document.getElementById(ids.btnStart)?.classList.remove('st-hidden');
      document.getElementById(ids.btnSnap)?.classList.add('st-hidden');
      document.getElementById(ids.btnFlip)?.classList.add('st-hidden');
      document.getElementById(ids.btnStop)?.classList.add('st-hidden');
    });
    _camMode = '';
  }

  async function startCamera(mode) {
    stopCamera();
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      showToast(t('camNotSupported'));
      return;
    }
    _camMode = mode === 'reg' ? 'reg' : 'prof';
    const ids = camDomIds(_camMode);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: _camFacing, width: { ideal: 640 }, height: { ideal: 800 } },
        audio: false
      });
      _camStream = stream;
      const vid = document.getElementById(ids.vid);
      if (vid) {
        vid.srcObject = stream;
        vid.style.transform = _camFacing === 'user' ? 'scaleX(-1)' : 'none';
        vid.classList.remove('st-hidden');
      }
      document.getElementById(ids.img)?.classList.add('st-hidden');
      document.getElementById(ids.btnStart)?.classList.add('st-hidden');
      document.getElementById(ids.btnSnap)?.classList.remove('st-hidden');
      document.getElementById(ids.btnFlip)?.classList.remove('st-hidden');
      document.getElementById(ids.btnStop)?.classList.remove('st-hidden');
    } catch (_) {
      stopCamera();
      showToast(t('camDenied'));
    }
  }

  async function flipCamera(mode) {
    _camFacing = _camFacing === 'user' ? 'environment' : 'user';
    await startCamera(mode);
  }

  async function processPortraitInput(sourceBlobOrFile, mode) {
    const isReg = mode === 'reg';
    const ids = camDomIds(isReg ? 'reg' : 'prof');
    const statusEl = document.getElementById(ids.status);
    const previewEl = document.getElementById(ids.img);
    if (!isReg) document.getElementById('btnSaveAiPhoto')?.classList.add('st-hidden');
    if (statusEl) statusEl.textContent = 'AI Processing...';
    try {
      let res = null;
      if (global.OcaStudentAiPhoto && typeof global.OcaStudentAiPhoto.processPortraitToCrimson === 'function') {
        res = await global.OcaStudentAiPhoto.processPortraitToCrimson(sourceBlobOrFile, (msg) => {
          if (statusEl) statusEl.textContent = msg;
        });
      } else {
        res = { blob: sourceBlobOrFile, dataUrl: URL.createObjectURL(sourceBlobOrFile) };
      }
      if (isReg) {
        _pendingRegPhoto = res;
      } else {
        _pendingAiPhoto = res;
        document.getElementById('btnSaveAiPhoto')?.classList.remove('st-hidden');
      }
      if (previewEl && res && res.dataUrl) previewEl.src = res.dataUrl;
      if (statusEl) {
        statusEl.removeAttribute('data-i18n');
        statusEl.textContent = t('aiDone') || 'ตัดพื้นหลัง AI สำเร็จ';
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = 'Error: ' + (err.message || err);
    }
  }

  async function snapCamera(mode) {
    const m = mode === 'reg' ? 'reg' : 'prof';
    const ids = camDomIds(m);
    const vid = document.getElementById(ids.vid);
    if (!vid || !vid.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = vid.videoWidth;
    canvas.height = vid.videoHeight;
    const ctx = canvas.getContext('2d');
    if (_camFacing === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
    stopCamera();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (blob) await processPortraitInput(blob, m);
  }

  async function onRegPhotoSelected(input) {
    const file = input && input.files && input.files[0];
    try {
      const fileErr = validateImageFile(file);
      if (fileErr) { showToast(fileErr); return; }
      if (!(await verifyImageMagicBytes(file))) { showToast(t('errMagicBytes')); return; }
      await processPortraitInput(file, 'reg');
    } finally {
      if (input) input.value = '';
    }
  }

  function maskPhone(p) {
    const s = String(p || '').replace(/\s+/g, '');
    if (s.length < 6) return '***';
    return s.slice(0, 2) + 'x-xxx-' + s.slice(-4);
  }

  function openSidLookupModal() {
    document.getElementById('lblLookupErr')?.classList.add('st-hidden');
    const qEl = document.getElementById('inpLookupQuery');
    if (qEl) qEl.value = '';
    const resBox = document.getElementById('boxLookupResults');
    if (resBox) resBox.innerHTML = '';
    document.getElementById('modalStudentIdLookup')?.classList.remove('st-hidden');
    setTimeout(() => qEl?.focus(), 60);
  }

  function closeSidLookupModal() {
    document.getElementById('modalStudentIdLookup')?.classList.add('st-hidden');
  }

  function useLookupSid(sid) {
    const inp = document.getElementById('inpLoginSid');
    if (inp) inp.value = sid;
    closeSidLookupModal();
    document.getElementById('inpLoginSecret')?.focus();
  }

  async function runSidLookup(ev) {
    ev.preventDefault();
    const errEl = document.getElementById('lblLookupErr');
    const resBox = document.getElementById('boxLookupResults');
    const btn = document.getElementById('btnRunSidLookup');
    if (errEl) errEl.classList.add('st-hidden');
    if (resBox) resBox.innerHTML = '';
    if (!_sb) return;

    const now = Date.now();
    _lookupTimestamps = _lookupTimestamps.filter(ts => (now - ts) < 60000);
    if (_lookupTimestamps.length >= 10) {
      if (errEl) { errEl.textContent = t('lookupRateLimit'); errEl.classList.remove('st-hidden'); }
      return;
    }

    const raw = (document.getElementById('inpLookupQuery')?.value || '').trim();
    const safeRaw = raw.replace(/[,()%*\\]/g, '').trim();
    const norm = safeRaw.replace(/[\s-]/g, '');

    if (safeRaw.length < 3) {
      if (errEl) { errEl.textContent = t('lookupNeedInput'); errEl.classList.remove('st-hidden'); }
      return;
    }

    const isDigits = /^\d{6,15}$/.test(norm);
    const isAlnumPassport = !isDigits && /^[A-Za-z0-9]{6,15}$/.test(norm) && /\d/.test(norm);

    _lookupTimestamps.push(now);
    if (btn) btn.disabled = true;
    try {
      let query = _sb
        .from('students')
        .select('student_id, prefix, full_name, citizen_id, passport_no, phone_number, status')
        .neq('status', 'DELETED')
        .limit(20);
      if (isDigits) {
        query = query.or(`student_id.eq.${norm},citizen_id.ilike.%${norm.slice(-6)}%,phone_number.ilike.%${norm.slice(-4)}%,passport_no.ilike.%${norm}%`);
      } else if (isAlnumPassport) {
        query = query.or(`passport_no.ilike.%${norm}%,full_name.ilike.%${safeRaw}%`);
      } else {
        query = query.ilike('full_name', `%${safeRaw}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      const qLow = safeRaw.toLowerCase();
      const normLow = norm.toLowerCase();
      const rows = (Array.isArray(data) ? data : []).filter((r) => {
        const sidClean = String(r.student_id || '').trim().toLowerCase();
        const cidClean = String(r.citizen_id || '').replace(/[\s-]/g, '').toLowerCase();
        const passClean = String(r.passport_no || '').trim().toLowerCase();
        const phoneClean = String(r.phone_number || '').replace(/[\s-]/g, '').toLowerCase();
        const nameLow = String(r.full_name || '').toLowerCase();
        if (isDigits) {
          return sidClean === normLow || cidClean === normLow || phoneClean === normLow || passClean === normLow;
        }
        if (isAlnumPassport) {
          return passClean === normLow || nameLow.includes(qLow);
        }
        return nameLow.includes(qLow);
      });

      if (!rows.length) {
        logStudentAudit('STUDENT_ID_LOOKUP', `Lookup returned 0 matches`, 'FAILED', 'GUEST', safeRaw || 'GUEST');
        if (errEl) { errEl.textContent = t('lookupNotFound'); errEl.classList.remove('st-hidden'); }
        return;
      }
      logStudentAudit('STUDENT_ID_LOOKUP', `Lookup matched ${rows.length} record(s)`, 'SUCCESS', rows[0].student_id, formatStudentDisplayName(rows[0]));
      if (resBox) {
        resBox.innerHTML = rows.slice(0, 5).map(r => `
          <div class="st-receipt-item" style="padding:10px 12px;">
            <div>
              <div class="st-accent-text" style="font-size:16px;font-weight:800;font-family:monospace;">${esc(r.student_id)}</div>
              <div style="font-size:13px;font-weight:700;">${esc(formatStudentDisplayName(r))}</div>
              <div class="st-muted-text" style="font-size:11.5px;">${esc(maskPhone(r.phone_number))}</div>
            </div>
            <button type="button" class="st-btn-gold" style="padding:7px 12px;font-size:12px;" onclick="OcaStudentPortal.useLookupSid('${esc(r.student_id)}')">
              ${esc(t('lookupUseSidBtn'))}
            </button>
          </div>
        `).join('');
      }
    } catch (err) {
      if (errEl) { errEl.textContent = err.message || String(err); errEl.classList.remove('st-hidden'); }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function logout(fromStorageSync) {
    if (_student) {
      logStudentAudit('STUDENT_LOGOUT', `Student ${_student.student_id} signed out`, 'SUCCESS');
    }
    stopCamera();
    if (_idleTimer) { clearTimeout(_idleTimer); _idleTimer = null; }
    if (_realtimeSyncTimer) { clearTimeout(_realtimeSyncTimer); _realtimeSyncTimer = null; }
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
    _photoFallbackTriedSid = '';
    _student = null;
    _needsDobSetup = false;
    _courses = [];
    _schedules = [];
    _receipts = [];
    _pendingSlips = [];
    _notifs = [];
    _cart = [];
    _checkoutItems = [];
    _checkoutCourse = null;
    _feeRules = {};
    _courseDiscounts = {};
    _courseAudiences = {};
    _enrollWindow = null;
    _lockedCategories.clear();
    sessionStorage.removeItem(SESSION_KEY);
    const sidInp = document.getElementById('inpLoginSid');
    const secInp = document.getElementById('inpLoginSecret');
    const eyeIc = document.getElementById('iconLoginSecretEye');
    if (sidInp) sidInp.value = '';
    if (secInp) { secInp.value = ''; secInp.type = 'password'; }
    if (eyeIc) eyeIc.className = 'fa-solid fa-eye';
    if (!fromStorageSync) {
      try { localStorage.setItem('oca_st_logout_signal', String(Date.now())); } catch (_) {}
    }
    showOnlyView('viewStudentAuth');
  }

  function markPwaInstalled(installed) {
    document.documentElement.classList.toggle('oca-pwa-installed', Boolean(installed));
    try {
      if (installed) localStorage.setItem('oca_student_pwa_installed', '1');
      else localStorage.removeItem('oca_student_pwa_installed');
    } catch (_) {}
  }

  async function syncPwaInstalledState() {
    const isStandalone = (global.matchMedia && global.matchMedia('(display-mode: standalone)').matches) || global.navigator.standalone === true;
    if (isStandalone) {
      document.documentElement.classList.add('oca-standalone');
      markPwaInstalled(true);
      return;
    }
    if (navigator && typeof navigator.getInstalledRelatedApps === 'function') {
      try {
        const apps = await navigator.getInstalledRelatedApps();
        markPwaInstalled(Array.isArray(apps) && apps.length > 0);
      } catch (_) {}
    }
  }

  async function installPwa() {
    const ua = (navigator && navigator.userAgent) || '';
    const isAndroid = /android/i.test(ua);
    const isInAppWebView = isAndroid && /line\/|fban|fbav|instagram|micromessenger|\bwv\b/i.test(ua);
    const isIos = isIosNonStandalone();
    const promptEvt = global.__ocaStudentDeferredPrompt || _deferredPwaPrompt;
    if (promptEvt && typeof promptEvt.prompt === 'function' && !isIos) {
      try {
        promptEvt.prompt();
        const choice = await promptEvt.userChoice;
        if (choice && choice.outcome === 'accepted') {
          markPwaInstalled(true);
        }
      } catch (_) {}
      global.__ocaStudentDeferredPrompt = null;
      _deferredPwaPrompt = null;
      global.__ocaStudentWaitingInstall = false;
      return;
    }
    if (isInAppWebView) {
      try { global.location.href = 'intent://ocaacademy.github.io/OCA/student/#Intent;scheme=https;package=com.android.chrome;end'; } catch (_) {}
      setTimeout(() => { document.getElementById('modalStudentPwaGuide')?.classList.remove('st-hidden'); }, 1200);
      return;
    }
    // Zero async await/setTimeout before prompt(): if Chrome hasn't fired beforeinstallprompt yet, show actionable guide immediately.
    document.getElementById('modalStudentPwaGuide')?.classList.remove('st-hidden');
  }

  function closePwaGuide() { document.getElementById('modalStudentPwaGuide')?.classList.add('st-hidden'); }

  global.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _deferredPwaPrompt = e;
    global.__ocaStudentDeferredPrompt = e;
    markPwaInstalled(false);
  });

  global.addEventListener('appinstalled', () => {
    _deferredPwaPrompt = null;
    global.__ocaStudentDeferredPrompt = null;
    global.__ocaStudentWaitingInstall = false;
    document.documentElement.classList.add('oca-standalone');
    markPwaInstalled(true);
    showToast(t('pwaInstalled'));
  });

  if (typeof global.addEventListener === 'function') {
    global.addEventListener('load', () => { syncPwaInstalledState(); });
  }

  if ('serviceWorker' in navigator) {
    global.addEventListener('load', () => {
      const inStudentDir = /\/student(\/|$)/i.test(global.location.pathname || '');
      const swPath = inStudentDir ? (global.location.pathname.endsWith('/') ? new URL('./sw.js', global.location.href).href : (global.location.origin + global.location.pathname + '/sw.js')) : './sw.js';
      const swOpts = inStudentDir
        ? { scope: global.location.pathname.endsWith('/') ? new URL('./', global.location.href).href : (global.location.origin + global.location.pathname + '/'), updateViaCache: 'none' }
        : { updateViaCache: 'none' };
      navigator.serviceWorker.register(swPath, swOpts).catch(() => {});
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
    onAddrProvinceChange,
    onAddrDistrictChange,
    onAddrSubdistrictChange,
    composeThaiAddress,
    onIdTypeChange,
    hoverNotice,
    hoverCourse,
    hoverReceipt,
    scheduleHideHoverPopover,
    handleLogin,
    handleRegister,
    switchTab,
    selectCategory,
    renderCoursesGrid,
    toggleCartItem,
    clearCart,
    openCartCheckout,
    copyBankAccount,
    openCheckout,
    closeCheckout,
    recalcCheckout,
    submitEnrollment,
    onProfilePhotoSelected,
    onRegPhotoSelected,
    startCamera,
    snapCamera,
    flipCamera,
    stopCamera,
    copyRegSuccessSid,
    acknowledgeRegSuccess,
    openSidLookupModal,
    closeSidLookupModal,
    runSidLookup,
    useLookupSid,
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
  if (global.__ocaPendingEnterLogin) {
    global.__ocaPendingEnterLogin = false;
    enterLoginFromWelcome();
  }
})(window);
