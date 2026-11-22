/* ============================================================================
 * OCA SLIP ANTI-FRAUD GUARD MODULE (v217)
 * - Genuine EMVCo CRC-16/CCITT-FALSE validation (Tag 63)
 * - Strict Thai Bank Mini-QR / EMVCo parser (zero fabricated TX_ refs)
 * - Unified Slip Lock Keys across Public Kiosk & Offline Enrollment
 * - 64-bit Perceptual Hash (dHash) via Canvas for cropped/recompressed slips
 * - Blacklist persistence for fake/duplicate rejected slips
 * - Receiving Bank Account Comparison & Slip Age Guard
 * ============================================================================ */
(function (global) {
  'use strict';

  const DEFAULT_SLIP_GUARD_CONFIG = Object.freeze({
    strictCrc16: true,
    maxSlipAgeDays: 7,
    bankName: 'ธนาคารกรุงเทพ / กสิกรไทย (บัญชีโรงเรียน)',
    bankAccountName: 'โรงเรียนวิทยสถานแห่งวัฒนธรรมตะวันออก (OCA)',
    bankAccountNo: '',
    bankApiProvider: 'disabled', // 'disabled' | 'slipok' | 'easyslip'
    autoBlacklistFakeSlip: true
  });

  let _cachedSlipGuardConfig = { ...DEFAULT_SLIP_GUARD_CONFIG };

  function escapeGuardHtml(str) {
    if (typeof global.escapeHtml === 'function') return global.escapeHtml(str);
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Standard EMVCo CRC-16/CCITT-FALSE
   * Poly: 0x1021, Init: 0xFFFF, RefIn: false, RefOut: false, XorOut: 0x0000
   */
  function computeEmvCoCrc16(payloadStr) {
    const str = String(payloadStr || '');
    let crc = 0xFFFF;
    for (let i = 0; i < str.length; i++) {
      crc ^= (str.charCodeAt(i) & 0xFF) << 8;
      for (let bit = 0; bit < 8; bit++) {
        if ((crc & 0x8000) !== 0) {
          crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
        } else {
          crc = (crc << 1) & 0xFFFF;
        }
      }
    }
    return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
  }

  /**
   * Verify Tag 63 (6304XXXX) EMVCo CRC-16 checksum on raw QR payload
   */
  function verifyEmvCoCrc16(rawQr) {
    const raw = String(rawQr || '').trim();
    if (raw.length < 12) {
      return { hasCrcTag: false, valid: false, expected: '', actual: '' };
    }
    // Standard EMVCo places 6304XXXX at the tail of the QR payload
    const tailPrefix = raw.slice(-8, -4);
    if (tailPrefix === '6304') {
      const dataPart = raw.slice(0, -4);
      const actual = raw.slice(-4).toUpperCase();
      if (!/^[0-9A-F]{4}$/.test(actual)) {
        return { hasCrcTag: true, valid: false, expected: computeEmvCoCrc16(dataPart), actual };
      }
      const expected = computeEmvCoCrc16(dataPart);
      return {
        hasCrcTag: true,
        valid: expected === actual,
        expected,
        actual
      };
    }
    // Some ITMX Mini-QR payloads use tag 91 (checksum) rather than tag 63
    const crcIdx = raw.lastIndexOf('6304');
    if (crcIdx >= 0 && crcIdx + 8 === raw.length) {
      const dataPart = raw.slice(0, crcIdx + 4);
      const actual = raw.slice(crcIdx + 4).toUpperCase();
      const expected = computeEmvCoCrc16(dataPart);
      return { hasCrcTag: true, valid: expected === actual, expected, actual };
    }
    return { hasCrcTag: false, valid: false, expected: '', actual: '' };
  }

  /**
   * Best-effort extraction of slip date (YYYY-MM-DD) from ITMX/bank transRef
   * Many Thai bank refs start with YYYYMMDD (e.g. 20261121...) or YYMMDD
   */
  function extractSlipDateFromRef(transRef) {
    const ref = String(transRef || '').trim();
    const mFull = ref.match(/(20[2-3]\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/);
    if (mFull) {
      const dt = new Date(Number(mFull[1]), Number(mFull[2]) - 1, Number(mFull[3]));
      if (!isNaN(dt.getTime())) return dt;
    }
    return null;
  }

  function evaluateSlipAge(slipDateOrRef, maxAgeDays) {
    const limit = Math.max(1, Number(maxAgeDays || _cachedSlipGuardConfig.maxSlipAgeDays || 7));
    let dt = null;
    if (slipDateOrRef instanceof Date && !isNaN(slipDateOrRef.getTime())) {
      dt = slipDateOrRef;
    } else if (typeof slipDateOrRef === 'string' && slipDateOrRef.trim()) {
      dt = extractSlipDateFromRef(slipDateOrRef);
      if (!dt && /^\d{4}-\d{2}-\d{2}/.test(slipDateOrRef)) {
        const parsed = new Date(slipDateOrRef);
        if (!isNaN(parsed.getTime())) dt = parsed;
      }
    }
    if (!dt) return { checked: false, ageDays: null, isExpired: false, limitDays: limit };
    const diffMs = Date.now() - dt.getTime();
    const ageDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    const localDateIso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    return {
      checked: true,
      dateIso: localDateIso,
      ageDays,
      isExpired: ageDays > limit,
      limitDays: limit
    };
  }

  /**
   * Strict Thai Bank Slip QR Parser
   * - Validates EMVCo CRC-16 when Tag 63 is present
   * - NEVER fabricates 'TX_' + raw.slice(-28)
   * - Flags unverifiedQr: true whenever CRC fails or transRef cannot be extracted
   */
  function parseThaiBankSlipQrStrict(qrRaw, opts = {}) {
    if (!qrRaw || typeof qrRaw !== 'string') return null;
    const raw = qrRaw.trim();
    const isItmx = raw.startsWith('00') && (raw.includes('0006000001') || raw.slice(4, 16) === '000600000101');
    const isEmvCo = raw.startsWith('000201') || raw.startsWith('000202');
    if (!isItmx && !isEmvCo && !raw.includes('000201')) {
      return null;
    }

    const strictCrc16 = (opts.strictCrc16 !== undefined)
      ? Boolean(opts.strictCrc16)
      : Boolean(_cachedSlipGuardConfig.strictCrc16);
    const crcCheck = verifyEmvCoCrc16(raw);

    if (crcCheck.hasCrcTag && !crcCheck.valid && strictCrc16) {
      return {
        valid: false,
        crcFailed: true,
        unverifiedQr: true,
        standard: isItmx ? 'ITMX_MINI_QR' : 'EMVCO',
        bankCode: '',
        transRef: '',
        crcValid: false,
        crcResult: crcCheck,
        reason: 'รหัสตรวจสอบความถูกต้อง EMVCo CRC-16 (Tag 63) ไม่ตรงกัน — สลิปอาจถูกดัดแปลงหรือปลอมแปลง',
        qrRaw: raw,
        raw
      };
    }

    const outerTags = {};
    let idx = 0;
    const len = raw.length;
    while (idx + 4 <= len) {
      const tag = raw.slice(idx, idx + 2);
      const valLen = parseInt(raw.slice(idx + 2, idx + 4), 10);
      if (isNaN(valLen) || valLen < 0 || idx + 4 + valLen > len) break;
      outerTags[tag] = raw.slice(idx + 4, idx + 4 + valLen);
      idx += 4 + valLen;
    }

    let bankCode = '';
    let transRef = '';
    let standard = isItmx ? 'ITMX_MINI_QR' : 'EMVCO';

    if (isItmx) {
      const tag00Val = outerTags['00'] || '';
      if (tag00Val) {
        let subIdx = 0;
        const subLen = tag00Val.length;
        while (subIdx + 4 <= subLen) {
          const subTag = tag00Val.slice(subIdx, subIdx + 2);
          const subValLen = parseInt(tag00Val.slice(subIdx + 2, subIdx + 4), 10);
          if (isNaN(subValLen) || subValLen < 0 || subIdx + 4 + subValLen > subLen) break;
          const subVal = tag00Val.slice(subIdx + 4, subIdx + 4 + subValLen);
          if (subTag === '01') bankCode = subVal;
          else if (subTag === '02') transRef = subVal;
          subIdx += 4 + subValLen;
        }
      }
      if (!transRef) {
        const match = tag00Val.match(/02(\d{2})([A-Za-z0-9_-]+)/);
        if (match) {
          const vLen = parseInt(match[1], 10);
          transRef = match[2].slice(0, vLen);
        }
      }
      if (!bankCode) {
        const matchB = tag00Val.match(/01(\d{2})(\d+)/);
        if (matchB) {
          const bLen = parseInt(matchB[1], 10);
          bankCode = matchB[2].slice(0, bLen);
        }
      }
    } else {
      if (outerTags['62']) {
        const t62 = outerTags['62'];
        let sIdx = 0;
        while (sIdx + 4 <= t62.length) {
          const sTag = t62.slice(sIdx, sIdx + 2);
          const sLen = parseInt(t62.slice(sIdx + 2, sIdx + 4), 10);
          if (isNaN(sLen) || sLen < 0 || sIdx + 4 + sLen > t62.length) break;
          const sVal = t62.slice(sIdx + 4, sIdx + 4 + sLen);
          if (sTag === '05' || sTag === '01' || sTag === '07') {
            if (sVal.length >= 6 && !transRef) {
              transRef = sVal.replace(/[^A-Za-z0-9_-]/g, '');
            }
          }
          sIdx += 4 + sLen;
        }
        if (!transRef && t62.length >= 6) {
          transRef = t62.replace(/[^A-Za-z0-9_-]/g, '');
        }
      }
      for (const tag of ['29', '30', '51']) {
        if (!transRef && outerTags[tag] && outerTags[tag].length >= 8) {
          transRef = outerTags[tag].replace(/[^A-Za-z0-9_-]/g, '');
        }
      }
      bankCode = outerTags['30'] ? outerTags['30'].slice(0, 3) : '';
    }

    transRef = String(transRef || '').trim();
    if (!transRef || transRef.length < 6) {
      return {
        valid: false,
        crcFailed: false,
        unverifiedQr: true,
        standard,
        bankCode,
        transRef: '',
        crcValid: crcCheck.hasCrcTag ? crcCheck.valid : null,
        crcResult: crcCheck,
        reason: 'ไม่พบรหัสอ้างอิงธุรกรรม (transRef) ใน QR — ระบบไม่อนุญาตให้สร้างรหัสจำลอง กรุณาให้แคชเชียร์ตรวจสอบสลิปด้วยตนเอง',
        qrRaw: raw,
        raw
      };
    }

    const ageInfo = evaluateSlipAge(transRef, opts.maxSlipAgeDays);
    return {
      valid: true,
      crcFailed: false,
      unverifiedQr: false,
      standard,
      bankCode,
      transRef,
      crcValid: crcCheck.hasCrcTag ? crcCheck.valid : null,
      crcResult: crcCheck,
      slipAge: ageInfo,
      qrRaw: raw,
      raw
    };
  }

  /**
   * Unified Slip Lock Key Normalizer (Public Kiosk === Offline Enrollment)
   * Canonical keys:
   *  - used_slip_ref:<ref.slice(0,35)>
   *  - used_slip_hash:<sha256.slice(0,40)>
   *  - used_slip_dhash:<dhash.slice(0,16)>
   * Also returns legacy lookup keys so older rows in fee_settings are still matched.
   */
  function normalizeSlipLockKeys(ref, sha256, dhash) {
    const cleanRef = String(ref || '').trim();
    const cleanSha = String(sha256 || '').trim().toLowerCase();
    const cleanDhash = String(dhash || '').trim().toLowerCase();

    const refKey = cleanRef ? ('used_slip_ref:' + cleanRef.slice(0, 35)) : '';
    const hashKey = cleanSha ? ('used_slip_hash:' + cleanSha.slice(0, 40)) : '';
    const dhashKey = cleanDhash ? ('used_slip_dhash:' + cleanDhash.slice(0, 16)) : '';
    const blacklistKey = cleanRef ? ('blacklist_slip:' + cleanRef.slice(0, 35)) : '';

    const lookupSet = new Set();
    if (refKey) lookupSet.add(refKey);
    if (cleanRef && cleanRef.length > 35) lookupSet.add('used_slip_ref:' + cleanRef);
    if (blacklistKey) lookupSet.add(blacklistKey);
    if (hashKey) lookupSet.add(hashKey);
    if (cleanSha) {
      lookupSet.add('used_hash:' + cleanSha.slice(0, 39));
      lookupSet.add('used_slip_hash:' + cleanSha.slice(0, 34));
      lookupSet.add('used_slip_hash:' + cleanSha);
      lookupSet.add('used_hash:' + cleanSha);
    }
    if (dhashKey) lookupSet.add(dhashKey);

    return {
      cleanRef,
      cleanSha,
      cleanDhash,
      refKey,
      hashKey,
      dhashKey,
      blacklistKey,
      allLookupKeys: Array.from(lookupSet),
      buildLockRows(studentId, amount, nowIso) {
        const ts = nowIso || new Date().toISOString();
        const lockName = ('LOCKED:' + String(studentId || '')).slice(0, 90);
        const amt = Number(amount || 0);
        const rows = [];
        if (refKey) rows.push({ key: refKey, name: lockName, amount: amt, mode: 'SLIP_LOCK', updated_at: ts });
        if (hashKey) rows.push({ key: hashKey, name: lockName, amount: amt, mode: 'SLIP_LOCK', updated_at: ts });
        if (dhashKey) rows.push({ key: dhashKey, name: lockName, amount: amt, mode: 'SLIP_LOCK', updated_at: ts });
        return rows;
      }
    };
  }

  /**
   * 64-bit Perceptual Difference Hash (dHash) via 9x8 grayscale Canvas
   * Detects reused slips even after LINE recompression or slight cropping/resizing
   */
  async function computeSlipDHash(dataUri) {
    if (!dataUri || typeof document === 'undefined') return '';
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = dataUri;
      });
      const canvas = document.createElement('canvas');
      canvas.width = 9;
      canvas.height = 8;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return '';
      ctx.drawImage(img, 0, 0, 9, 8);
      const pixels = ctx.getImageData(0, 0, 9, 8).data;
      const gray = new Float32Array(72);
      for (let i = 0; i < 72; i++) {
        const p = i * 4;
        gray[i] = pixels[p] * 0.299 + pixels[p + 1] * 0.587 + pixels[p + 2] * 0.114;
      }
      let hex = '';
      let nibble = 0;
      let bitCount = 0;
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const left = gray[row * 9 + col];
          const right = gray[row * 9 + col + 1];
          nibble = (nibble << 1) | (left > right ? 1 : 0);
          bitCount++;
          if (bitCount === 4) {
            hex += nibble.toString(16);
            nibble = 0;
            bitCount = 0;
          }
        }
      }
      return hex.padStart(16, '0');
    } catch (err) {
      console.warn('[OcaSlipGuard.computeSlipDHash] Warning:', err);
      return '';
    }
  }

  function hammingDistanceHex64(h1, h2) {
    const a = String(h1 || '').trim().toLowerCase();
    const b = String(h2 || '').trim().toLowerCase();
    if (a.length !== 16 || b.length !== 16) return 64;
    let dist = 0;
    for (let i = 0; i < 16; i++) {
      let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
      if (isNaN(x)) return 64;
      while (x > 0) {
        dist += (x & 1);
        x >>= 1;
      }
    }
    return dist;
  }

  function isFakeOrDuplicateRejectReason(reason) {
    const r = String(reason || '').toLowerCase();
    return (
      r.includes('สลิปซ้ำ') ||
      r.includes('ปลอม') ||
      r.includes('ไม่พบรายการโอน') ||
      r.includes('duplicate') ||
      r.includes('fake') ||
      r.includes('forged')
    );
  }

  async function loadSlipGuardConfig(force = false) {
    if (!force && global._ocaSlipGuardConfigLoaded) {
      return { ..._cachedSlipGuardConfig };
    }
    try {
      if (global.OcaAppConfig && typeof global.OcaAppConfig.get === 'function') {
        const stored = await global.OcaAppConfig.get('slip_guard_config', null);
        if (stored && typeof stored === 'object') {
          _cachedSlipGuardConfig = { ...DEFAULT_SLIP_GUARD_CONFIG, ...stored };
          global._ocaSlipGuardConfigLoaded = true;
          return { ..._cachedSlipGuardConfig };
        }
      }
    } catch (err) {
      console.warn('[OcaSlipGuard.loadSlipGuardConfig] Warning:', err);
    }
    return { ..._cachedSlipGuardConfig };
  }

  async function saveSlipGuardConfig(partialCfg) {
    const merged = {
      ...DEFAULT_SLIP_GUARD_CONFIG,
      ..._cachedSlipGuardConfig,
      ...(partialCfg || {})
    };
    merged.strictCrc16 = Boolean(merged.strictCrc16);
    merged.autoBlacklistFakeSlip = Boolean(merged.autoBlacklistFakeSlip);
    merged.maxSlipAgeDays = Math.max(1, Math.min(365, Number(merged.maxSlipAgeDays) || 7));
    merged.bankName = String(merged.bankName || '').trim().slice(0, 120);
    merged.bankAccountName = String(merged.bankAccountName || '').trim().slice(0, 120);
    merged.bankAccountNo = String(merged.bankAccountNo || '').trim().slice(0, 40);
    if (!['disabled', 'slipok', 'easyslip'].includes(merged.bankApiProvider)) {
      merged.bankApiProvider = 'disabled';
    }
    _cachedSlipGuardConfig = merged;
    global._ocaSlipGuardConfigLoaded = true;
    if (global.OcaAppConfig && typeof global.OcaAppConfig.set === 'function') {
      return await global.OcaAppConfig.set('slip_guard_config', merged, 'security');
    }
    return false;
  }

  /**
   * Blacklist a rejected fake/duplicate slip instead of deleting its lock
   */
  async function blacklistRejectedSlip(studentId, slipRef, reason) {
    const sb = global._supabase;
    if (!sb) return { blacklisted: false, count: 0 };
    const cleanSid = String(studentId || '').trim();
    const cleanRef = String(slipRef || '').trim();
    const blName = ('BLACKLISTED:' + (cleanRef || cleanSid)).slice(0, 90);
    const nowIso = new Date().toISOString();
    let updatedCount = 0;
    try {
      const { data: lockedRows, error: fetchErr } = await sb
        .from('fee_settings')
        .select('key, amount')
        .eq('name', ('LOCKED:' + cleanSid).slice(0, 90));
      if (fetchErr) console.warn('[OcaSlipGuard.blacklistRejectedSlip] fetch warning:', fetchErr);
      const upsertBatch = [];
      if (Array.isArray(lockedRows) && lockedRows.length > 0) {
        for (const r of lockedRows) {
          upsertBatch.push({
            key: r.key,
            name: blName,
            amount: Number(r.amount || 0),
            mode: 'SLIP_BLACKLIST',
            updated_at: nowIso
          });
        }
      }
      if (cleanRef) {
        const keys = normalizeSlipLockKeys(cleanRef, '', '');
        if (keys.blacklistKey) {
          upsertBatch.push({
            key: keys.blacklistKey,
            name: blName,
            amount: 0,
            mode: 'SLIP_BLACKLIST',
            updated_at: nowIso
          });
        }
      } else if (upsertBatch.length === 0 && cleanSid) {
        upsertBatch.push({
          key: ('blacklist_slip:SID_' + cleanSid).slice(0, 50),
          name: blName,
          amount: 0,
          mode: 'SLIP_BLACKLIST',
          updated_at: nowIso
        });
      }
      if (upsertBatch.length > 0) {
        const { error: upErr } = await sb.from('fee_settings').upsert(upsertBatch, { onConflict: 'key' });
        if (upErr) throw upErr;
        updatedCount = upsertBatch.length;
      }
      return { blacklisted: true, count: updatedCount, label: blName, reason: String(reason || '') };
    } catch (err) {
      console.error('[OcaSlipGuard.blacklistRejectedSlip] error:', err);
      return { blacklisted: false, count: 0, error: err.message || String(err) };
    }
  }

  async function listBlacklistedSlips() {
    const sb = global._supabase;
    if (!sb) return [];
    try {
      const { data, error } = await sb
        .from('fee_settings')
        .select('key, name, amount, mode, updated_at')
        .or('mode.eq.SLIP_BLACKLIST,name.like.BLACKLISTED:%')
        .order('updated_at', { ascending: false })
        .limit(1000);
      if (error) {
        console.warn('[OcaSlipGuard.listBlacklistedSlips] query error:', error);
        return [];
      }
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.warn('[OcaSlipGuard.listBlacklistedSlips] error:', err);
      return [];
    }
  }

  async function removeBlacklistedSlip(key) {
    const sb = global._supabase;
    if (!sb || !key) return false;
    try {
      const { error } = await sb.from('fee_settings').delete().eq('key', String(key));
      if (error) throw error;
      return true;
    } catch (err) {
      console.error('[OcaSlipGuard.removeBlacklistedSlip] error:', err);
      return false;
    }
  }

  /**
   * Render school receiving bank comparison strip + slip age / unverified QR warnings
   * inside #modalVerifySlipVariance
   */
  function buildReceivingBankComparisonHtml(info) {
    const cfg = _cachedSlipGuardConfig || DEFAULT_SLIP_GUARD_CONFIG;
    const bankName = escapeGuardHtml(cfg.bankName || 'ยังไม่ได้ตั้งค่าชื่อธนาคาร');
    const accName = escapeGuardHtml(cfg.bankAccountName || 'โรงเรียนวิทยสถานแห่งวัฒนธรรมตะวันออก (OCA)');
    const accNo = escapeGuardHtml(cfg.bankAccountNo || 'ตั้งค่าเลขบัญชีได้ที่เมนู การตั้งค่า -> ป้องกันสลิป & อีเมล');
    const ageInfo = evaluateSlipAge(info && (info.slipRef || info.createdAt), cfg.maxSlipAgeDays);
    const isUnverified = Boolean(info && (info.unverifiedQr || !info.slipRef || String(info.slipRef).startsWith('TX_')));
    const providerLabel = cfg.bankApiProvider === 'slipok'
      ? 'SlipOK API (Edge Function)'
      : (cfg.bankApiProvider === 'easyslip' ? 'EasySlip API (Edge Function)' : 'ตรวจมือ + QR EMVCo (ปิด Bank API)');

    let warningsHtml = '';
    if (isUnverified) {
      warningsHtml += `<div style="margin-top:8px; padding:8px 10px; border-radius:8px; background:#FEE2E2; border:1px solid #DC2626; color:#991B1B; font-size:12px; font-weight:700; display:flex; align-items:flex-start; gap:6px;"><i class="fa-solid fa-triangle-exclamation" style="margin-top:2px;"></i><span>สลิปนี้ไม่ผ่านการแกะรหัส QR อัตโนมัติ (UNVERIFIED_QR) กรุณาตรวจสอบยอดเงินเข้าบัญชีธนาคารจริงก่อนอนุมัติ</span></div>`;
    }
    if (ageInfo.checked && ageInfo.isExpired) {
      warningsHtml += `<div style="margin-top:8px; padding:8px 10px; border-radius:8px; background:#FEF3C7; border:1px solid #D97706; color:#92400E; font-size:12px; font-weight:700; display:flex; align-items:flex-start; gap:6px;"><i class="fa-solid fa-clock-rotate-left" style="margin-top:2px;"></i><span>คำเตือนอายุสลิป: วันที่บนรหัสสลิป (${escapeGuardHtml(ageInfo.dateIso)}) เก่ากว่ากำหนด ${ageInfo.limitDays} วัน (ผ่านมาแล้ว ${ageInfo.ageDays} วัน)</span></div>`;
    }

    return `
      <div id="boxVerifySlipBankCompare" style="background:#EFF6FF; border:1px solid #3B82F6; border-radius:10px; padding:10px 12px; color:#1E3A8A; font-size:12px; line-height:1.55;">
        <div style="font-weight:800; color:#1D4ED8; margin-bottom:4px; display:flex; align-items:center; justify-content:space-between; gap:6px; flex-wrap:wrap;">
          <span><i class="fa-solid fa-building-columns"></i> บัญชีรับโอนของโรงเรียน (เทียบกับสลิป)</span>
          <span style="font-size:10.5px; background:#DBEAFE; color:#1E40AF; padding:1px 7px; border-radius:999px; font-weight:700;">${escapeGuardHtml(providerLabel)}</span>
        </div>
        <div><strong>ธนาคาร:</strong> ${bankName}</div>
        <div><strong>ชื่อบัญชี:</strong> ${accName}</div>
        <div><strong>เลขบัญชี:</strong> <span style="font-family:monospace; font-weight:800;">${accNo}</span></div>
        ${warningsHtml}
      </div>
    `;
  }

  global.OcaSlipGuard = {
    DEFAULT_CONFIG: DEFAULT_SLIP_GUARD_CONFIG,
    getConfigSync: () => ({ ..._cachedSlipGuardConfig }),
    loadConfig: loadSlipGuardConfig,
    saveConfig: saveSlipGuardConfig,
    computeEmvCoCrc16,
    verifyEmvCoCrc16,
    parseThaiBankSlipQrStrict,
    normalizeSlipLockKeys,
    computeSlipDHash,
    hammingDistanceHex64,
    evaluateSlipAge,
    isFakeOrDuplicateRejectReason,
    blacklistRejectedSlip,
    listBlacklistedSlips,
    removeBlacklistedSlip,
    buildReceivingBankComparisonHtml
  };

  // Expose top-level helpers for direct calls and Playwright verification
  global.verifyEmvCoCrc16 = verifyEmvCoCrc16;
  global.normalizeSlipLockKeys = normalizeSlipLockKeys;
  global.computeSlipDHash = computeSlipDHash;
})(window);
