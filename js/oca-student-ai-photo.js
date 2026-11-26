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
    let inTensor = null;
    let out = null;
    try {
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
      inTensor = new global.ort.Tensor('float32', tensorData, [1, 3, size, size]);
      out = await sess.run({ [inputName]: inTensor });
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
    } finally {
      try { if (inTensor && typeof inTensor.dispose === 'function') inTensor.dispose(); } catch (_) {}
      try { if (out) Object.values(out).forEach(t => { if (t && typeof t.dispose === 'function') t.dispose(); }); } catch (_) {}
      tmp.width = 0; tmp.height = 0;
    }
  }

  async function runModnetMatte(srcCanvas) {
    const size = 512;
    const sess = await getModnetSession();
    const tmp = document.createElement('canvas');
    tmp.width = size;
    tmp.height = size;
    let inTensor = null;
    let out = null;
    try {
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
      inTensor = new global.ort.Tensor('float32', tensorData, [1, 3, size, size]);
      out = await sess.run({ [inputName]: inTensor });
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
    } finally {
      try { if (inTensor && typeof inTensor.dispose === 'function') inTensor.dispose(); } catch (_) {}
      try { if (out) Object.values(out).forEach(t => { if (t && typeof t.dispose === 'function') t.dispose(); }); } catch (_) {}
      tmp.width = 0; tmp.height = 0;
    }
  }

  function sealInteriorPortraitHoles(alphaFloat, W, H) {
    const N = W * H;
    const isExtBg = new Uint8Array(N);
    const queue = new Int32Array(N);
    let head = 0, tail = 0;
    const pushIfBg = (idx) => {
      if (isExtBg[idx] || alphaFloat[idx] >= 0.38) return;
      isExtBg[idx] = 1;
      queue[tail++] = idx;
    };
    for (let x = 0; x < W; x++) {
      pushIfBg(x);
      pushIfBg((H - 1) * W + x);
    }
    for (let y = 1; y < H - 1; y++) {
      pushIfBg(y * W);
      pushIfBg(y * W + (W - 1));
    }
    while (head < tail) {
      const idx = queue[head++];
      const x = idx % W;
      const y = (idx - x) / W;
      if (x > 0) pushIfBg(idx - 1);
      if (x + 1 < W) pushIfBg(idx + 1);
      if (y > 0) pushIfBg(idx - W);
      if (y + 1 < H) pushIfBg(idx + W);
    }
    for (let i = 0; i < N; i++) {
      if (!isExtBg[i] && alphaFloat[i] < 0.96) {
        alphaFloat[i] = 1.0;
      }
    }
    return isExtBg;
  }

  function applyRimDecontaminationAndComposite(srcCanvas, maskCanvas, bgHex) {
    const W = srcCanvas.width, H = srcCanvas.height;
    const N = W * H;
    const srcPixels = srcCanvas.getContext('2d').getImageData(0, 0, W, H).data;

    const scaledMask = document.createElement('canvas');
    scaledMask.width = W;
    scaledMask.height = H;
    const smCtx = scaledMask.getContext('2d');
    smCtx.imageSmoothingEnabled = true;
    smCtx.imageSmoothingQuality = 'high';
    smCtx.drawImage(maskCanvas, 0, 0, W, H);
    const maskPixels = smCtx.getImageData(0, 0, W, H).data;
    scaledMask.width = 0; scaledMask.height = 0;

    const alphaFloat = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      alphaFloat[i] = maskPixels[i * 4 + 3] / 255;
    }

    sealInteriorPortraitHoles(alphaFloat, W, H);

    let bgR = 128, bgG = 0, bgB = 0;
    const cleanHex = String(bgHex || TARGET_BG_HEX).replace('#', '');
    if (/^[0-9a-fA-F]{6}$/.test(cleanHex)) {
      bgR = parseInt(cleanHex.slice(0, 2), 16);
      bgG = parseInt(cleanHex.slice(2, 4), 16);
      bgB = parseInt(cleanHex.slice(4, 6), 16);
    }

    const out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    const oCtx = out.getContext('2d');
    const outImg = oCtx.createImageData(W, H);
    const outData = outImg.data;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        let a = alphaFloat[i];
        if (a <= 0.04) {
          outData[i * 4] = bgR;
          outData[i * 4 + 1] = bgG;
          outData[i * 4 + 2] = bgB;
          outData[i * 4 + 3] = 255;
          continue;
        }
        let fr = srcPixels[i * 4];
        let fg = srcPixels[i * 4 + 1];
        let fb = srcPixels[i * 4 + 2];

        if (a < 0.94) {
          let sumR = 0, sumG = 0, sumB = 0, cnt = 0;
          for (let dy = -3; dy <= 3; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= H) continue;
            for (let dx = -3; dx <= 3; dx++) {
              const nx = x + dx;
              if (nx < 0 || nx >= W) continue;
              const ni = ny * W + nx;
              if (alphaFloat[ni] >= 0.94) {
                sumR += srcPixels[ni * 4];
                sumG += srcPixels[ni * 4 + 1];
                sumB += srcPixels[ni * 4 + 2];
                cnt++;
              }
            }
          }
          if (cnt > 0) {
            fr = Math.round(fr * 0.35 + (sumR / cnt) * 0.65);
            fg = Math.round(fg * 0.35 + (sumG / cnt) * 0.65);
            fb = Math.round(fb * 0.35 + (sumB / cnt) * 0.65);
          }
          a = Math.min(1, Math.max(0, (a - 0.04) / 0.90));
        } else {
          a = 1.0;
        }

        const inv = 1 - a;
        outData[i * 4] = Math.round(fr * a + bgR * inv);
        outData[i * 4 + 1] = Math.round(fg * a + bgG * inv);
        outData[i * 4 + 2] = Math.round(fb * a + bgB * inv);
        outData[i * 4 + 3] = 255;
      }
    }
    oCtx.putImageData(outImg, 0, 0);
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
    const outCanvas = applyRimDecontaminationAndComposite(srcCanvas, maskCanvas, TARGET_BG_HEX);
    const dataUrl = outCanvas.toDataURL('image/jpeg', 0.92);
    const blob = await new Promise((resolve) => outCanvas.toBlob(resolve, 'image/jpeg', 0.92));
    srcCanvas.width = 0; srcCanvas.height = 0;
    maskCanvas.width = 0; maskCanvas.height = 0;
    outCanvas.width = 0; outCanvas.height = 0;
    return { dataUrl, blob, engine };
  }

  global.OcaStudentAiPhoto = {
    TARGET_BG_HEX,
    processPortraitToCrimson
  };
})(window);
