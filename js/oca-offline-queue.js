/**
 * OCA Offline Sync Queue (v261)
 * Resilient IndexedDB + localStorage fallback queue for:
 *  - TEACHER_ATTENDANCE (Classroom check-in/attendance when Wi-Fi drops)
 *  - TEXTBOOK_CLAIM (QR textbook distribution outbox status unified badge)
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'oca_offline_sync_queue_v261';
  const executors = {};
  let _flushing = false;

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
      pill.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i><span id="ocaOfflineQueueText"></span><button type="button" id="btnOcaOfflineQueueFlush">ซิงก์ตอนนี้</button>';
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
        textEl.textContent = `ออฟไลน์ • ค้างซิงก์ ${count} รายการ`;
      } else if (offline) {
        textEl.textContent = 'โหมดออฟไลน์ • ระบบกำลังสำรองข้อมูลในเครื่อง';
      } else {
        textEl.textContent = `รอซิงก์ขึ้นระบบ ${count} รายการ`;
      }
    }
    if (btnEl) {
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
    _flushing = true;
    let synced = 0;
    let failed = 0;
    try {
      const queue = readQueue();
      const succeededIds = new Set();
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
            failed++;
            remainingSnapshotCount++;
          }
        } catch (err) {
          console.warn('[OcaOfflineQueue] item flush failed:', item.type, err);
          failed++;
          remainingSnapshotCount++;
        }
      }
      const latestQueue = readQueue();
      const mergedRemaining = latestQueue.filter(q => !(q && q.id && succeededIds.has(q.id)));
      writeQueue(mergedRemaining);
      if (typeof global.syncOfflineQueue === 'function') {
        try {
          await global.syncOfflineQueue(isManual);
        } catch (_) {}
      }
      if (synced > 0 && typeof global.showToast === 'function') {
        global.showToast('ซิงก์ข้อมูลออฟไลน์สำเร็จ', `ส่งข้อมูลค้างซิงก์ขึ้นฐานข้อมูลแล้ว ${synced} รายการ`, '☁️');
      }
      return { success: failed === 0, synced, failed, remaining: mergedRemaining.length, remainingSnapshot: remainingSnapshotCount };
    } finally {
      _flushing = false;
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
