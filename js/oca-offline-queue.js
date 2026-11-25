/**
 * OCA Offline Sync Queue (v261)
 * Resilient IndexedDB + localStorage fallback queue for:
 *  - TEACHER_ATTENDANCE (Classroom check-in/attendance when Wi-Fi drops)
 *  - TEXTBOOK_CLAIM (QR textbook distribution outbox status unified badge)
 */
(function (global) {
  'use strict';

  function _t(th, en, zh) {
    const lang = String(global._currentSystemLang || 'th').toLowerCase();
    if (lang === 'en') return en || th;
    if (lang === 'zh') return zh || en || th;
    return th;
  }

  const STORAGE_KEY = 'oca_offline_sync_queue_v261';
  const DEAD_LETTER_KEY = 'oca_offline_sync_dead_v261';
  const LOCK_KEY = 'oca_offline_sync_lock_v261';
  const MAX_RETRIES = 5;
  const LOCK_TTL_MS = 30000;
  const TAB_ID = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const executors = {};
  let _flushing = false;

  function acquireFlushLock() {
    try {
      const now = Date.now();
      const raw = localStorage.getItem(LOCK_KEY);
      if (raw) {
        const lock = JSON.parse(raw);
        if (lock && lock.tabId !== TAB_ID && Number(lock.expiresAt) > now) {
          return false;
        }
      }
      localStorage.setItem(LOCK_KEY, JSON.stringify({ tabId: TAB_ID, expiresAt: now + LOCK_TTL_MS }));
      const verify = JSON.parse(localStorage.getItem(LOCK_KEY) || '{}');
      return verify.tabId === TAB_ID;
    } catch (_) {
      return true;
    }
  }

  function releaseFlushLock() {
    try {
      const raw = localStorage.getItem(LOCK_KEY);
      if (!raw) return;
      const lock = JSON.parse(raw);
      if (!lock || lock.tabId === TAB_ID) {
        localStorage.removeItem(LOCK_KEY);
      }
    } catch (_) {}
  }

  function appendDeadLetter(item, reason) {
    try {
      const raw = localStorage.getItem(DEAD_LETTER_KEY);
      const list = raw ? JSON.parse(raw) : [];
      const arr = Array.isArray(list) ? list : [];
      arr.push({ ...item, failedAt: new Date().toISOString(), reason: String(reason || 'max_retries') });
      localStorage.setItem(DEAD_LETTER_KEY, JSON.stringify(arr.slice(-100)));
    } catch (_) {}
  }

  function readQueue() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function writeQueue(items) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.isArray(items) ? items : []));
      return true;
    } catch (err) {
      console.warn('[OcaOfflineQueue] writeQueue failed (storage quota/disabled):', err);
      return false;
    }
  }

  function registerExecutor(type, fn) {
    if (type && typeof fn === 'function') {
      executors[String(type)] = fn;
    }
  }

  function enqueue(type, payload, dedupeKey = '') {
    const queue = readQueue();
    const item = {
      id: `oq_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: String(type || 'GENERIC'),
      dedupeKey: String(dedupeKey || ''),
      payload: payload || {},
      createdAt: new Date().toISOString()
    };
    const next = item.dedupeKey
      ? queue.filter(q => !(q.type === item.type && q.dedupeKey === item.dedupeKey))
      : queue;
    next.push(item);
    writeQueue(next);
    renderBadge();
    return item;
  }

  function getPendingCount() {
    return readQueue().length;
  }

  function clearAll() {
    writeQueue([]);
    renderBadge();
  }

  function ensurePillElement() {
    let pill = document.getElementById('ocaOfflineQueuePill');
    if (!pill && document.body) {
      pill = document.createElement('div');
      pill.id = 'ocaOfflineQueuePill';
      pill.setAttribute('role', 'status');
      pill.setAttribute('aria-live', 'polite');
      pill.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i><span id="ocaOfflineQueueText"></span><button type="button" id="btnOcaOfflineQueueFlush">${_t('ซิงก์ตอนนี้', 'Sync Now', '立即同步')}</button>`;
      document.body.appendChild(pill);
      const btn = document.getElementById('btnOcaOfflineQueueFlush');
      if (btn) {
        btn.addEventListener('click', () => {
          flush(true);
        });
      }
    }
    return pill;
  }

  function renderBadge() {
    const count = getPendingCount();
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const pill = ensurePillElement();
    if (!pill) return;
    if (!offline && count === 0) {
      pill.style.display = 'none';
      return;
    }
    const textEl = document.getElementById('ocaOfflineQueueText');
    const btnEl = document.getElementById('btnOcaOfflineQueueFlush');
    if (textEl) {
      if (offline && count > 0) {
        textEl.textContent = _t(`ออฟไลน์ • ค้างซิงก์ ${count} รายการ`, `Offline • ${count} pending`, `离线 • 待同步 ${count} 项`);
      } else if (offline) {
        textEl.textContent = _t('โหมดออฟไลน์ • ระบบกำลังสำรองข้อมูลในเครื่อง', 'Offline Mode • Saving locally', '离线模式 • 本地缓存中');
      } else {
        textEl.textContent = _t(`รอซิงก์ขึ้นระบบ ${count} รายการ`, `Pending sync: ${count} item(s)`, `待同步 ${count} 项`);
      }
    }
    if (btnEl) {
      btnEl.textContent = _t('ซิงก์ตอนนี้', 'Sync Now', '立即同步');
      btnEl.style.display = (!offline && count > 0) ? 'inline-block' : 'none';
    }
    pill.style.display = 'inline-flex';
  }

  async function flush(isManual = false) {
    if (_flushing) return { skipped: true, reason: 'busy' };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      renderBadge();
      return { skipped: true, reason: 'offline' };
    }
    if (!acquireFlushLock()) {
      return { skipped: true, reason: 'locked_by_other_tab' };
    }
    _flushing = true;
    let synced = 0;
    let failed = 0;
    let dropped = 0;
    try {
      const queue = readQueue();
      const succeededIds = new Set();
      const retryUpdates = {};
      const deadIds = new Set();
      let remainingSnapshotCount = 0;
      for (const item of queue) {
        const fn = executors[item.type];
        if (typeof fn !== 'function') {
          remainingSnapshotCount++;
          continue;
        }
        try {
          const ok = await fn(item.payload, item);
          if (ok !== false) {
            synced++;
            if (item && item.id) succeededIds.add(item.id);
          } else {
            const nextRetry = (Number(item.retries) || 0) + 1;
            if (nextRetry >= MAX_RETRIES) {
              dropped++;
              if (item && item.id) deadIds.add(item.id);
              appendDeadLetter({ ...item, retries: nextRetry }, 'executor_returned_false');
            } else {
              failed++;
              remainingSnapshotCount++;
              if (item && item.id) retryUpdates[item.id] = nextRetry;
            }
          }
        } catch (err) {
          console.warn('[OcaOfflineQueue] item flush failed:', item.type, err);
          const nextRetry = (Number(item.retries) || 0) + 1;
          if (nextRetry >= MAX_RETRIES) {
            dropped++;
            if (item && item.id) deadIds.add(item.id);
            appendDeadLetter({ ...item, retries: nextRetry }, err && err.message ? err.message : 'exception');
          } else {
            failed++;
            remainingSnapshotCount++;
            if (item && item.id) retryUpdates[item.id] = nextRetry;
          }
        }
      }
      const latestQueue = readQueue();
      const mergedRemaining = latestQueue
        .filter(q => !(q && q.id && (succeededIds.has(q.id) || deadIds.has(q.id))))
        .map(q => (q && q.id && retryUpdates[q.id] !== undefined) ? { ...q, retries: retryUpdates[q.id] } : q);
      writeQueue(mergedRemaining);
      if (dropped > 0 && typeof global.showToast === 'function') {
        global.showToast('รายการซิงก์ไม่สำเร็จ', `ย้าย ${dropped} รายการที่ซิงก์ไม่สำเร็จเกิน ${MAX_RETRIES} ครั้งไปยังรายการรอตรวจสอบ`, '⚠️');
      }
      if (typeof global.syncOfflineQueue === 'function') {
        try {
          await global.syncOfflineQueue(isManual);
        } catch (_) {}
      }
      if (synced > 0 && typeof global.showToast === 'function') {
        global.showToast('ซิงก์ข้อมูลออฟไลน์สำเร็จ', `ส่งข้อมูลค้างซิงก์ขึ้นฐานข้อมูลแล้ว ${synced} รายการ`, '☁️');
      }
      return { success: failed === 0 && dropped === 0, synced, failed, dropped, remaining: mergedRemaining.length, remainingSnapshot: remainingSnapshotCount };
    } finally {
      _flushing = false;
      releaseFlushLock();
      renderBadge();
    }
  }

  if (typeof global.addEventListener === 'function') {
    global.addEventListener('online', () => {
      renderBadge();
      flush(false);
    });
    global.addEventListener('offline', () => {
      renderBadge();
    });
    global.addEventListener('DOMContentLoaded', () => {
      renderBadge();
    });
  }

  global.OcaOfflineQueue = {
    registerExecutor,
    enqueue,
    getPendingCount,
    clearAll,
    renderBadge,
    flush
  };
})(window);
