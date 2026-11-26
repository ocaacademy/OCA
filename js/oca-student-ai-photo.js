/**
 * OCA Student Portrait AI Matting Engine (v356)
 * Uses the same AI stack as Staff Portal:
 *   1. Primary: BRIA RMBG-1.4 (1024x1024, cached in 'oca-ai-models-v1')
 *   2. Fallback: ./modnet_quantized.onnx (512x512)
 * Composites foreground onto official OCA studio crimson (#800000) at 600x800 (3:4).
 */
(function (global) {
  'use strict';

  const RMBG14_URL = 'https://huggingface.co/briaai/RMBG-1.4/resolve/main/onnx/model_quantized.onnx';
  const RMBG14_CACHE = 'oca-ai-models-v1';
  const TARGET_BG_HEX = '#800000';
  let _rmbgPromise = null;
  let _modnetPromise = null;

  function loadImageFromSource(fileOrDataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์รูปภาพได้'));
      if (typeof fileOrDataUrl === 'string') {
        img.src = fileOrDataUrl;
      } else {
        const reader = new FileReader();
        reader.onload = (e) => { img.src = e.target.result; };
        reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
        reader.readAsDataURL(fileOrDataUrl);
      }
    });
  }

  function configureOrt() {
    if (!global.ort || !global.ort.env || !global.ort.env.wasm) {
      throw new Error('ONNX Runtime Web ยังไม่พร้อมใช้งาน');
    }
    global.ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/';
    global.ort.env.wasm.numThreads = 1;
  }

  async function getRmbgSession() {
    if (_rmbgPromise) return _rmbgPromise;
    _rmbgPromise = (async () => {
      configureOrt();
      let buf = null;
      try {
        if ('caches' in global) {
          const cache = await global.caches.open(RMBG14_CACHE);
          let res = await cache.match(RMBG14_URL);
          if (!res) {
            res = await fetch(RMBG14_URL, { mode: 'cors' });
            if (!res.ok) throw new Error('RMBG-1.4 HTTP ' + res.status);
            await cache.put(RMBG14_URL, res.clone());
          }
          buf = await res.arrayBuffer();
        }
      } catch (_) {}
      if (!buf) {
        const res = await fetch(RMBG14_URL, { mode: 'cors' });
        if (!res.ok) throw new Error('RMBG-1.4 HTTP ' + res.status);
        buf = await res.arrayBuffer();
      }
      return global.ort.InferenceSession.create(buf, { executionProviders: ['wasm'] });
    })().catch((err) => {
      _rmbgPromise = null;
      throw err;
    });
    return _rmbgPromise;
  }

  async function getModnetSession() {
    if (_modnetPromise) return _modnetPromise;
    _modnetPromise = (async () => {
      configureOrt();
      return global.ort.InferenceSession.create('./modnet_quantized.onnx', { executionProviders: ['wasm'] });
    })().catch((err) => {
      _modnetPromise = null;
      throw err;
    });
    return _modnetPromise;
  }

  function drawCoverCanvas(img, outW, outH) {
    const c = document.createElement('canvas');
    c.width = outW;
    c.height = outH;
    const ctx = c.getContext('2d');
    const srcRatio = img.naturalWidth / Math.max(1, img.naturalHeight);
    const dstRatio = outW / outH;
    let sw = img.naturalWidth, sh = img.naturalHeight, sx = 0, sy = 0;
    if (srcRatio > dstRatio) {
      sw = Math.round(img.naturalHeight * dstRatio);
      sx = Math.round((img.naturalWidth - sw) / 2);
    } else {
      sh = Math.round(img.naturalWidth / dstRatio);
      sy = Math.max(0, Math.round((img.naturalHeight - sh) * 0.25));
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
    return c;
  }

  async function runRmbgMatte(srcCanvas) {
    const size = 1024;
    const sess = await getRmbgSession();
    const tmp = document.createElement('canvas');
    tmp.width = size;
    tmp.height = size;
    const tCtx = tmp.getContext('2d');
    tCtx.drawImage(srcCanvas, 0, 0, size, size);
    const pixels = tCtx.getImageData(0, 0, size, size).data;
    const P = size * size;
    const tensorData = new Float32Array(3 * P);
    for (let i = 0; i < P; i++) {
      tensorData[i] = pixels[i * 4] / 255 - 0.5;
      tensorData[P + i] = pixels[i * 4 + 1] / 255 - 0.5;
      tensorData[2 * P + i] = pixels[i * 4 + 2] / 255 - 0.5;
    }
    const inputName = sess.inputNames[0];
    const out = await sess.run({ [inputName]: new global.ort.Tensor('float32', tensorData, [1, 3, size, size]) });
    const outTensor = out[sess.outputNames[0]].data;
    let minV = Infinity, maxV = -Infinity;
    for (let i = 0; i < outTensor.length; i++) {
      if (outTensor[i] < minV) minV = outTensor[i];
      if (outTensor[i] > maxV) maxV = outTensor[i];
    }
    const span = Math.max(1e-5, maxV - minV);
    const mCanvas = document.createElement('canvas');
    mCanvas.width = size;
    mCanvas.height = size;
    const mCtx = mCanvas.getContext('2d');
    const mImg = mCtx.createImageData(size, size);
    for (let i = 0; i < P; i++) {
      const a = Math.round(((outTensor[i] - minV) / span) * 255);
      mImg.data[i * 4] = 255;
      mImg.data[i * 4 + 1] = 255;
      mImg.data[i * 4 + 2] = 255;
      mImg.data[i * 4 + 3] = a;
    }
    mCtx.putImageData(mImg, 0, 0);
    return mCanvas;
  }

  async function runModnetMatte(srcCanvas) {
    const size = 512;
    const sess = await getModnetSession();
    const tmp = document.createElement('canvas');
    tmp.width = size;
    tmp.height = size;
    const tCtx = tmp.getContext('2d');
    tCtx.drawImage(srcCanvas, 0, 0, size, size);
    const pixels = tCtx.getImageData(0, 0, size, size).data;
    const P = size * size;
    const tensorData = new Float32Array(3 * P);
    for (let i = 0; i < P; i++) {
      tensorData[i] = (pixels[i * 4] / 127.5) - 1.0;
      tensorData[P + i] = (pixels[i * 4 + 1] / 127.5) - 1.0;
      tensorData[2 * P + i] = (pixels[i * 4 + 2] / 127.5) - 1.0;
    }
    const inputName = sess.inputNames[0];
    const out = await sess.run({ [inputName]: new global.ort.Tensor('float32', tensorData, [1, 3, size, size]) });
    const outTensor = out[sess.outputNames[0]].data;
    const mCanvas = document.createElement('canvas');
    mCanvas.width = size;
    mCanvas.height = size;
    const mCtx = mCanvas.getContext('2d');
    const mImg = mCtx.createImageData(size, size);
    for (let i = 0; i < P; i++) {
      const a = Math.max(0, Math.min(255, Math.round(outTensor[i] * 255)));
      mImg.data[i * 4] = 255;
      mImg.data[i * 4 + 1] = 255;
      mImg.data[i * 4 + 2] = 255;
      mImg.data[i * 4 + 3] = a;
    }
    mCtx.putImageData(mImg, 0, 0);
    return mCanvas;
  }

  function compositeCrimson(srcCanvas, maskCanvas) {
    const W = srcCanvas.width, H = srcCanvas.height;
    const fg = document.createElement('canvas');
    fg.width = W;
    fg.height = H;
    const fgCtx = fg.getContext('2d');
    fgCtx.drawImage(srcCanvas, 0, 0, W, H);
    fgCtx.globalCompositeOperation = 'destination-in';
    fgCtx.drawImage(maskCanvas, 0, 0, W, H);

    const out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    const oCtx = out.getContext('2d');
    oCtx.fillStyle = TARGET_BG_HEX;
    oCtx.fillRect(0, 0, W, H);
    oCtx.drawImage(fg, 0, 0);
    return out;
  }

  async function processPortraitToCrimson(fileOrDataUrl, onStatus) {
    const notify = typeof onStatus === 'function' ? onStatus : () => {};
    notify('กำลังเตรียมภาพ...');
    const img = await loadImageFromSource(fileOrDataUrl);
    const srcCanvas = drawCoverCanvas(img, 600, 800);
    let maskCanvas = null;
    let engine = 'rmbg14';
    try {
      notify('AI (BRIA RMBG-1.4) กำลังตัดพื้นหลัง...');
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('RMBG timeout')), 28000));
      maskCanvas = await Promise.race([runRmbgMatte(srcCanvas), timeout]);
    } catch (_) {
      engine = 'modnet';
      notify('กำลังสลับใช้ AI สำรอง (MODNet)...');
      maskCanvas = await runModnetMatte(srcCanvas);
    }
    const outCanvas = compositeCrimson(srcCanvas, maskCanvas);
    const dataUrl = outCanvas.toDataURL('image/jpeg', 0.92);
    const blob = await new Promise((resolve) => outCanvas.toBlob(resolve, 'image/jpeg', 0.92));
    return { dataUrl, blob, engine };
  }

  global.OcaStudentAiPhoto = {
    TARGET_BG_HEX,
    processPortraitToCrimson
  };
})(window);
