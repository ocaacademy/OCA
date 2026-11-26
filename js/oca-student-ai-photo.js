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
      try {
        return await global.ort.InferenceSession.create('./modnet_quantized.onnx', { executionProviders: ['wasm'] });
      } catch (_) {
        return await global.ort.InferenceSession.create('https://huggingface.co/Xenova/modnet/resolve/main/onnx/model_quantized.onnx', { executionProviders: ['wasm'] });
      }
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
    const inW = 512, inH = 672;
    const sess = await getModnetSession();
    const tmp = document.createElement('canvas');
    tmp.width = inW;
    tmp.height = inH;
    let inTensor = null;
    let out = null;
    try {
      const tCtx = tmp.getContext('2d');
      tCtx.drawImage(srcCanvas, 0, 0, inW, inH);
      const pixels = tCtx.getImageData(0, 0, inW, inH).data;
      const P = inW * inH;
      const tensorData = new Float32Array(3 * P);
      for (let i = 0; i < P; i++) {
        tensorData[i] = (pixels[i * 4] / 127.5) - 1.0;
        tensorData[P + i] = (pixels[i * 4 + 1] / 127.5) - 1.0;
        tensorData[2 * P + i] = (pixels[i * 4 + 2] / 127.5) - 1.0;
      }
      const inputName = sess.inputNames[0];
      inTensor = new global.ort.Tensor('float32', tensorData, [1, 3, inH, inW]);
      out = await sess.run({ [inputName]: inTensor });
      const outTensor = out[sess.outputNames[0]].data;
      const mCanvas = document.createElement('canvas');
      mCanvas.width = inW;
      mCanvas.height = inH;
      const mCtx = mCanvas.getContext('2d');
      const mImg = mCtx.createImageData(inW, inH);
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

  function normalizeCanvasForAiMatting(srcCanvas) {
    if (!srcCanvas || !srcCanvas.width || !srcCanvas.height) return srcCanvas;
    const w = srcCanvas.width, h = srcCanvas.height;
    const aiCanvas = document.createElement('canvas');
    aiCanvas.width = w;
    aiCanvas.height = h;
    const aiCtx = aiCanvas.getContext('2d');
    aiCtx.drawImage(srcCanvas, 0, 0);
    const imgData = aiCtx.getImageData(0, 0, w, h);
    const pix = imgData.data;
    const hist = new Int32Array(256);
    let sampleCount = 0, totalLuma = 0;
    for (let i = 0; i < pix.length; i += 16) {
      const luma = (77 * pix[i] + 150 * pix[i + 1] + 29 * pix[i + 2]) >> 8;
      hist[luma]++;
      totalLuma += luma;
      sampleCount++;
    }
    if (sampleCount === 0) return srcCanvas;
    const meanLuma = totalLuma / sampleCount;
    const p05Target = Math.floor(sampleCount * 0.05);
    const p90Target = Math.floor(sampleCount * 0.90);
    let accum = 0, p05 = 0, p90 = 255;
    for (let k = 0; k < 256; k++) {
      accum += hist[k];
      if (p05 === 0 && accum >= p05Target) p05 = k;
      if (accum >= p90Target) { p90 = k; break; }
    }
    const needsDehaze = p05 > 35;
    const isOverBright = meanLuma > 165 || p90 > 228;
    if (!needsDehaze && !isOverBright) {
      aiCanvas.width = 0; aiCanvas.height = 0;
      return srcCanvas;
    }
    const blackFloor = needsDehaze ? Math.min(28, p05 - 12) : 0;
    const gamma = meanLuma > 185 ? 1.12 : (meanLuma > 165 ? 1.08 : 1.04);
    const invRange = 1 / Math.max(1, 255 - blackFloor);
    for (let i = 0; i < pix.length; i += 4) {
      let nr = Math.pow(Math.min(1, Math.max(0, (pix[i] - blackFloor) * invRange)), gamma);
      let ng = Math.pow(Math.min(1, Math.max(0, (pix[i + 1] - blackFloor) * invRange)), gamma);
      let nb = Math.pow(Math.min(1, Math.max(0, (pix[i + 2] - blackFloor) * invRange)), gamma);
      const pLuma = 0.299 * nr + 0.587 * ng + 0.114 * nb;
      nr = pLuma + (nr - pLuma) * 1.12;
      ng = pLuma + (ng - pLuma) * 1.12;
      nb = pLuma + (nb - pLuma) * 1.12;
      pix[i] = Math.round(Math.min(255, Math.max(0, nr * 255)));
      pix[i + 1] = Math.round(Math.min(255, Math.max(0, ng * 255)));
      pix[i + 2] = Math.round(Math.min(255, Math.max(0, nb * 255)));
    }
    aiCtx.putImageData(imgData, 0, 0);
    return aiCanvas;
  }

  function isolatePrimarySubjectAlpha(alphaArr, w, h) {
    if (!alphaArr || !w || !h || w <= 0 || h <= 0) return alphaArr;
    const N = w * h;
    const FG_THRESH = 0.22;
    const compLabels = new Int32Array(N);
    const queue = new Int32Array(N);
    const dx = [-1, 0, 1, -1, 1, -1, 0, 1];
    const dy = [-1, -1, -1, 0, 0, 1, 1, 1];
    let cId = 0;
    const components = [];
    const anchorYMin = Math.floor(h * 0.70);
    const anchorXMin = Math.floor(w * 0.18);
    const anchorXMax = Math.floor(w * 0.82);
    for (let i = 0; i < N; i++) {
      if (alphaArr[i] < FG_THRESH || compLabels[i] > 0) continue;
      cId++;
      let head = 0, tail = 0;
      queue[tail++] = i;
      compLabels[i] = cId;
      let count = 0, bottomAnchorHits = 0;
      let minY = h, maxY = 0, minX = w, maxX = 0;
      while (head < tail) {
        const cur = queue[head++];
        count++;
        const cx = cur % w;
        const cy = (cur - cx) / w;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy >= anchorYMin && cx >= anchorXMin && cx <= anchorXMax) bottomAnchorHits++;
        for (let k = 0; k < 8; k++) {
          const nx = cx + dx[k], ny = cy + dy[k];
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            const nIdx = ny * w + nx;
            if (alphaArr[nIdx] >= FG_THRESH && compLabels[nIdx] === 0) {
              compLabels[nIdx] = cId;
              queue[tail++] = nIdx;
            }
          }
        }
      }
      components.push({ id: cId, count, bottomAnchorHits, score: bottomAnchorHits * 10 + count, minY, maxY, minX, maxX });
    }
    if (components.length <= 1) return alphaArr;
    components.sort((a, b) => b.score - a.score);
    const best = components[0];
    const isPrimary = new Uint8Array(N);
    for (const c of components) {
      const cCenterX = (c.minX + c.maxX) * 0.5;
      const overlapW = Math.max(0, Math.min(c.maxX, best.maxX) - Math.max(c.minX, best.minX));
      const cWidth = Math.max(1, c.maxX - c.minX);
      const isAlignedHeadOrHair = (c.maxY <= best.maxY && cCenterX >= best.minX && cCenterX <= best.maxX && overlapW >= cWidth * 0.40 && (best.minY - c.maxY) <= Math.floor(h * 0.12));
      if ((c.id === best.id) || (c.bottomAnchorHits > 50 && c.maxY >= h - 10) || isAlignedHeadOrHair) {
        for (let i = 0; i < N; i++) {
          if (compLabels[i] === c.id) isPrimary[i] = 1;
        }
      }
    }
    const R = 12;
    const tempMask = new Uint8Array(N);
    for (let y = 0; y < h; y++) {
      const rowOffset = y * w;
      let lastOne = -999;
      for (let x = 0; x < w; x++) {
        if (isPrimary[rowOffset + x] === 1) lastOne = x;
        if (x - lastOne <= R) tempMask[rowOffset + x] = 1;
      }
      lastOne = 999999;
      for (let x = w - 1; x >= 0; x--) {
        if (isPrimary[rowOffset + x] === 1) lastOne = x;
        if (lastOne - x <= R) tempMask[rowOffset + x] = 1;
      }
    }
    const dilated = new Uint8Array(N);
    for (let x = 0; x < w; x++) {
      let lastOne = -999;
      for (let y = 0; y < h; y++) {
        const idx = y * w + x;
        if (tempMask[idx] === 1) lastOne = y;
        if (y - lastOne <= R) dilated[idx] = 1;
      }
      lastOne = 999999;
      for (let y = h - 1; y >= 0; y--) {
        const idx = y * w + x;
        if (tempMask[idx] === 1) lastOne = y;
        if (lastOne - y <= R) dilated[idx] = 1;
      }
    }
    for (let i = 0; i < N; i++) {
      if (dilated[i] === 0) alphaArr[i] = 0;
    }
    return alphaArr;
  }

  function sampleBackdropColorFromMask(srcPixels, alphaArr, w, h) {
    let sumR = 0, sumG = 0, sumB = 0, count = 0;
    const topH = Math.floor(h * 0.14);
    const latW1 = Math.floor(w * 0.12), latW2 = Math.floor(w * 0.88);
    for (let y = 0; y < Math.floor(h * 0.45); y += 2) {
      const row = y * w;
      const isTop = y < topH;
      for (let x = 0; x < w; x += 2) {
        if ((isTop || x < latW1 || x >= latW2) && alphaArr[row + x] < 0.08) {
          const j = (row + x) * 4;
          sumR += srcPixels[j]; sumG += srcPixels[j + 1]; sumB += srcPixels[j + 2];
          count++;
        }
      }
    }
    if (count === 0) return null;
    return { r: sumR / count, g: sumG / count, b: sumB / count };
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

    isolatePrimarySubjectAlpha(alphaFloat, W, H);
    sealInteriorPortraitHoles(alphaFloat, W, H);
    const origBg = sampleBackdropColorFromMask(srcPixels, alphaFloat, W, H);

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
        if (a <= 0.06) {
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
          for (let dy = -4; dy <= 4; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= H) continue;
            for (let dx = -4; dx <= 4; dx++) {
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
            fr = Math.round(fr * 0.25 + (sumR / cnt) * 0.75);
            fg = Math.round(fg * 0.25 + (sumG / cnt) * 0.75);
            fb = Math.round(fb * 0.25 + (sumB / cnt) * 0.75);
          } else if (origBg) {
            const bgDist = Math.hypot(fr - origBg.r, fg - origBg.g, fb - origBg.b);
            if (bgDist < 75) a *= 0.25;
          }
          a = Math.min(1, Math.max(0, (a - 0.06) / 0.88));
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
    const aiInputCanvas = normalizeCanvasForAiMatting(srcCanvas);
    let maskCanvas = null;
    let engine = 'rmbg14';
    try {
      notify('AI (BRIA RMBG-1.4) กำลังตัดพื้นหลัง...');
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('RMBG timeout')), 28000));
      maskCanvas = await Promise.race([runRmbgMatte(aiInputCanvas), timeout]);
    } catch (_) {
      engine = 'modnet';
      notify('กำลังสลับใช้ AI สำรอง (MODNet)...');
      maskCanvas = await runModnetMatte(aiInputCanvas);
    }
    const outCanvas = applyRimDecontaminationAndComposite(srcCanvas, maskCanvas, TARGET_BG_HEX);
    const dataUrl = outCanvas.toDataURL('image/jpeg', 0.92);
    const blob = await new Promise((resolve) => outCanvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (aiInputCanvas && aiInputCanvas !== srcCanvas) { aiInputCanvas.width = 0; aiInputCanvas.height = 0; }
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
