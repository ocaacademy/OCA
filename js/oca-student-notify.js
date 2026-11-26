/**
 * OCA Student Receipt & Push Notification Bridge (v357)
 * Called by Staff Portal after saveReceipt succeeds (runs in parallel with email).
 * Persists atomic notification in fee_settings, broadcasts Realtime, and invokes
 * optional Edge Function 'send-student-push' when enabled.
 */
(function (global) {
  'use strict';

  async function notifyReceiptIssued(studentId, receiptNo, itemName, grandTotal) {
    const sid = String(studentId || '').trim();
    const rcNo = String(receiptNo || '').trim();
    const sb = global._supabase;
    if (!sid || !rcNo || !sb) return false;
    try {
      const safeName = ('ใบเสร็จ #' + rcNo + ' ' + String(itemName || '')).slice(0, 90);
      const { error: upErr } = await sb.from('fee_settings').upsert([{
        key: 'student_notif:' + sid,
        name: safeName,
        amount: Number(grandTotal || 0),
        mode: ('RECEIPT:' + rcNo).slice(0, 90),
        updated_at: new Date().toISOString()
      }], { onConflict: 'key' });
      if (upErr) console.warn('[OcaStudentNotify] fee_settings upsert warning:', upErr.message || upErr);

      if (typeof sb.channel === 'function') {
        const ch = sb.channel('oca_student_notif_' + sid);
        ch.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            ch.send({
              type: 'broadcast',
              event: 'student_receipt_issued',
              payload: {
                studentId: sid,
                receiptNo: rcNo,
                itemName: String(itemName || ''),
                grandTotal: Number(grandTotal || 0),
                ts: Date.now()
              }
            }).finally(() => {
              if (typeof sb.removeChannel === 'function') sb.removeChannel(ch);
            });
          }
        });
      }

      const { data: pushFlag, error: flagErr } = await sb
        .from('fee_settings')
        .select('amount')
        .eq('key', 'student_push_enabled')
        .maybeSingle();
      if (!flagErr && pushFlag && Number(pushFlag.amount) === 1 && sb.functions && typeof sb.functions.invoke === 'function') {
        const { error: fnErr } = await sb.functions.invoke('send-student-push', {
          body: {
            studentId: sid,
            receiptNo: rcNo,
            title: 'ออกใบเสร็จรับเงินแล้ว #' + rcNo,
            body: String(itemName || 'คอร์สเรียน OCA') + ' • ฿' + Number(grandTotal || 0).toLocaleString('en-US')
          }
        });
        if (fnErr) console.warn('[OcaStudentNotify] Edge push warning:', fnErr.message || fnErr);
      }
      return true;
    } catch (err) {
      console.warn('[OcaStudentNotify.notifyReceiptIssued] warning:', err);
      return false;
    }
  }

  global.OcaStudentNotify = {
    notifyReceiptIssued
  };
})(window);
