/* Leitor QR - Peppe · js/camera.js
 * Câmera, guia visual (BarcodeDetector) e leitura por imagem.
 * Depende de: base.js, result.js
 * Script clássico: compartilha o escopo global com os demais módulos (carregados em ordem pelo index.html).
 * As instruções soltas (ligação de eventos e renders iniciais) rodam em PeppeGuard.step(): se uma falhar,
 * o erro é registrado em Ajustes > Diagnóstico e o resto do módulo continua.
 */
"use strict";
PeppeGuard.mod("camera");

/* ================= Câmera ================= */
let scanner = null, running = false, scanBusy = false, sessionCount = 0, lastCode = "", lastCodeTime = 0;
let torchOn = false, cameraList = [], camIdx = 0, hintTimer = null, hintCount = 0, statusState = null;
function setStatus(key, params) { statusState = key ? { key, params } : null; $("cameraStatus").textContent = key ? t(key, params) : ""; }
function setCamUi(on) {
  $("startBtn").disabled = on; $("stopBtn").disabled = !on;
  $("torchBtn").disabled = !on;
  if (!on) { ["switchBtn", "zoomWrap"].forEach(i => $(i).classList.add("hidden")); $("torchBtn").textContent = t("torch"); }
}
function formatsFor(mode) {
  const E = window.Html5QrcodeSupportedFormats;
  if (!E) return [];
  const names = mode === "qr" ? ["QR_CODE"] : mode === "barcode" ? C.F1D : [...C.F2D, ...C.F1D];
  return names.map(k => E[k]).filter(x => x !== undefined);
}
function qrboxFor(w, h) {
  const m = settings.mode;
  if (m === "qr") { const s = Math.max(50, Math.floor(Math.min(w, h) * .7)); return { width: s, height: s }; }
  if (m === "barcode") { const bw = Math.floor(w * .9); return { width: bw, height: Math.max(50, Math.min(Math.floor(h * .55), Math.floor(bw * .45))) }; }
  const bw = Math.floor(w * .88);
  return { width: bw, height: Math.max(50, Math.floor(Math.min(h * .8, bw * .8))) };
}
function stopHints() { clearInterval(hintTimer); hintTimer = null; }
function startHints() {
  stopHints(); hintCount = 0;
  if (isCont()) return;
  hintTimer = setInterval(() => {
    if (!running) return;
    hintCount++;
    const key = "say_hint" + ((hintCount - 1) % 4 + 1);
    setStatus(key); say(t(key));
    if (hintCount >= 8) stopHints();
  }, 7000);
}
async function stop() {
  stopHints(); stopGuide();
  if (scanner) {
    try { if (running) await scanner.stop(); } catch {}
    try { scanner.clear(); } catch {}
  }
  running = false; torchOn = false;
  setCamUi(false);
}
function setupCamExtras() {
  try {
    const caps = scanner.getRunningTrackCameraCapabilities();
    const zf = caps.zoomFeature();
    if (zf.isSupported()) {
      const r = $("zoomRange");
      r.min = zf.min(); r.max = Math.min(zf.max(), 8); r.step = zf.step() || 0.1; r.value = zf.value() || zf.min();
      $("zoomWrap").classList.remove("hidden");
      r.oninput = () => { try { Promise.resolve(zf.apply(Number(r.value))).catch(() => {}); } catch {} };
    }
  } catch {}
  Html5Qrcode.getCameras().then(list => {
    cameraList = list || [];
    if (cameraList.length > 1) {
      $("switchBtn").classList.remove("hidden");
      try { const cur = scanner.getRunningTrackSettings().deviceId; const i = cameraList.findIndex(c => c.id === cur); camIdx = i >= 0 ? i : 0; } catch { camIdx = 0; }
    }
  }).catch(() => {});
}
function videoTrack() {
  try { const v = $("reader").querySelector("video"); return (v && v.srcObject && v.srcObject.getVideoTracks()[0]) || null; } catch { return null; }
}
async function setTorch(on) {
  try { const tf = scanner.getRunningTrackCameraCapabilities().torchFeature(); if (tf.isSupported()) { await tf.apply(on); return true; } } catch {}
  try { const tr = videoTrack(), caps = tr && tr.getCapabilities && tr.getCapabilities(); if (caps && caps.torch) { await tr.applyConstraints({ advanced: [{ torch: on }] }); return true; } } catch {}
  return false;
}
PeppeGuard.step("camera#1", () => {
$("torchBtn").onclick = async () => {
  if (!running) return;
  const want = !torchOn;
  if (await setTorch(want)) { torchOn = want; $("torchBtn").textContent = t(torchOn ? "torch_off" : "torch"); }
  else toast(t("torch_unsupported"));
};
});

function onDecoded(text, res) {
  guideFallback.read();
  const fmt = (res && res.result && res.result.format && res.result.format.formatName) || "";
  const now = Date.now();
  if (isCont()) {
    const gap = settings.batchMode ? 1500 : 3000;   // no lote, tirar o código da vista e voltar conta nova leitura
    if (text === lastCode && now - lastCodeTime < gap) { lastCodeTime = now; return; }
    lastCode = text; lastCodeTime = now; sessionCount++;
    handleScan(text, fmt);
    if (settings.batchMode) setStatus("cam_batch", { n: batchCount(), r: batchReads() });
    else setStatus("cam_session", { n: sessionCount });
    return;
  }
  if (scanBusy) return;
  scanBusy = true;
  stopHints();
  handleScan(text, fmt);
  setStatus("cam_done");
  setTimeout(stop, 0);
}
/* ================= Guia visual + motor alternativo (BarcodeDetector) ================= */
let guideTimer = null, guideDet = null, guideBusy = false, guideEngine = "main", guidePrev = null, guideSeen = new Map(), guideSaid = {};
const guideFallback = C.makeFallback(4000, 3);
let guideHintKey = null;
const GUIDE_COLORS = { ok: "#22c55e", bad: "#ef4444", pending: "#ffffff", warn: "#fbbf24" };
function guideCtx(cv) { try { const g = cv.getContext && cv.getContext("2d"); return g && typeof g.clearRect === "function" ? g : null; } catch { return null; } }
function guideVideo() { return $("reader").querySelector("video"); }
function guideSize(cv) {
  const r = $("camWrap").getBoundingClientRect(), d = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(r.width * d)), h = Math.max(1, Math.round(r.height * d));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  return d;
}
function guideClear() { const cv = $("guide"), g = guideCtx(cv); if (g) g.clearRect(0, 0, cv.width, cv.height); }
function guideSay(key, ms) {
  const now = Date.now();
  if (isCont() || now - (guideSaid[key] || 0) < (ms || 7000)) return;
  guideSaid[key] = now; say(t("say_guide_" + key), { queue: true });
}
// Desenha o contorno, os 4 cantos como bolinhas e um rótulo em texto (a cor nunca é o único sinal)
function guideDraw(items, v) {
  const cv = $("guide"), g = guideCtx(cv);
  if (!g) return;
  const d = guideSize(cv);
  g.clearRect(0, 0, cv.width, cv.height);
  const wrap = $("camWrap").getBoundingClientRect(), vr = v.getBoundingClientRect();
  const sx = vr.width / (v.videoWidth || 1), sy = vr.height / (v.videoHeight || 1), ox = vr.left - wrap.left, oy = vr.top - wrap.top;
  g.lineJoin = "round"; g.textBaseline = "top"; g.font = "600 " + 13 * d + "px system-ui, sans-serif";
  items.forEach(it => {
    const pts = it.points.map(p => ({ x: (ox + p.x * sx) * d, y: (oy + p.y * sy) * d }));
    const col = GUIDE_COLORS[it.level] || GUIDE_COLORS.pending;
    g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.closePath();
    g.lineWidth = 5 * d; g.strokeStyle = "rgba(0,0,0,.55)"; g.stroke();
    g.lineWidth = 2.5 * d; g.strokeStyle = col; g.stroke();
    pts.forEach(p => { g.beginPath(); g.arc(p.x, p.y, 6.5 * d, 0, Math.PI * 2); g.fillStyle = col; g.fill(); g.lineWidth = 2 * d; g.strokeStyle = "rgba(0,0,0,.7)"; g.stroke(); });
    if (it.label) {
      const tw = g.measureText(it.label).width, x = Math.max(4 * d, Math.min(pts[0].x, cv.width - tw - 14 * d)), y = Math.max(4 * d, Math.min(...pts.map(p => p.y)) - 24 * d);
      g.fillStyle = "rgba(0,0,0,.72)"; g.fillRect(x, y, tw + 10 * d, 20 * d);
      g.fillStyle = col; g.fillText(it.label, x + 5 * d, y + 3 * d);
    }
  });
}
// Mira fixa quando o aparelho não tem detector nativo (sem posição real do código)
function guideReticle() {
  const cv = $("guide"), g = guideCtx(cv);
  if (!g) return;
  const d = guideSize(cv), w = cv.width, h = cv.height, bar = settings.mode === "barcode", s = Math.min(w, h) * .55;
  const bw = bar ? Math.min(w * .8, s * 1.9) : s, bh = bar ? s * .6 : s;
  const x = (w - bw) / 2, y = (h - bh) / 2, L = Math.min(bw, bh) * .22;
  g.clearRect(0, 0, w, h); g.lineWidth = 3.5 * d; g.lineCap = "round"; g.strokeStyle = "rgba(255,255,255,.85)";
  [[x, y, 1, 1], [x + bw, y, -1, 1], [x, y + bh, 1, -1], [x + bw, y + bh, -1, -1]].forEach(([cx, cy, dx, dy]) => {
    g.beginPath(); g.moveTo(cx + dx * L, cy); g.lineTo(cx, cy); g.lineTo(cx, cy + dy * L); g.stroke();
  });
}
const DIR_EMOJI = { left: "👈", right: "👉", up: "👆", down: "👇" };
let dirTimer = null, dirLast = 0;
function showDirHint(dir) {
  const e = $("dirHint");
  if (!dir) return;
  const now = Date.now();
  if (now - dirLast < 3500) return;      // pisca por ~1,5 s, no máximo a cada 3,5 s
  dirLast = now;
  e.className = "dir-hint " + dir; e.textContent = DIR_EMOJI[dir];
  void e.offsetWidth; e.classList.add("show");
  clearTimeout(dirTimer); dirTimer = setTimeout(() => { e.classList.remove("show"); }, 1600);
}
const guideLabelFor = level => level === "ok" ? t("guide_read") : level === "bad" ? t("guide_unknown") : "";
function statusLocked() { return statusState && /^(cam_done|cam_batch|cam_session|cam_denied|cam_fail)/.test(statusState.key); }
async function guideTick() {
  if (guideBusy || !running || !guideDet) return;
  const v = guideVideo();
  if (!v || v.readyState < 2 || !v.videoWidth) return;
  guideBusy = true;
  try {
    const codes = await guideDet.detect(v);
    if (!running) return;
    const now = Date.now(), items = [];
    codes.forEach(cd => {
      const text = String(cd.rawValue || ""), pts = cd.cornerPoints && cd.cornerPoints.length ? cd.cornerPoints : null;
      if (!pts) return;
      const fmt = String(cd.format || "").toUpperCase();
      let inB = false, unexp = false;
      if (settings.batchMode && text) {
        inB = !!batch.items[C.batchKey(text, fmt)];
        if (expectedMap.size && C.INV_KINDS.includes(C.classify(text, fmt).kind)) unexp = !expectedMap.has(C.invKey(text));
      }
      items.push({ text, points: pts, format: fmt, level: C.guideLevel(inB, unexp), box: C.guideBox(pts, v.videoWidth, v.videoHeight) });
    });
    // orientação em texto (aproximar / segurar firme) a partir do maior código à vista
    const main = items.slice().sort((a, b) => (b.box ? b.box.area : 0) - (a.box ? a.box.area : 0))[0];
    let hint = main ? C.guideHint(main.box, guidePrev) : "none";
    const dir = main && hint !== "hold" ? C.guideDirection(main.box) : "";
    if (dir) hint = dir;
    guidePrev = main ? main.box : null;
    items.forEach(it => { it.label = guideLabelFor(it.level) || (it === main && hint !== "ok" && hint !== "none" ? t("guide_" + hint) : ""); });
    if (settings.guide) guideDraw(items, v); else guideClear();
    if (hint !== guideHintKey && !statusLocked()) { guideHintKey = hint; setStatus(hint === "none" ? "cam_active" : hint === "ok" ? "guide_ok" : "guide_" + hint); }
    if (hint === "closer" || hint === "hold" || dir) guideSay(hint);
    showDirHint(dir);

    if (!items.length) { guideFallback.lost(); return; }
    if (guideEngine === "main") {
      // código à vista mas o leitor principal não decodifica: após 3 janelas, o nativo assume
      if (guideFallback.seen(now)) {
        guideEngine = "native"; setStatus("guide_switch"); say(t("say_guide_switch"), { queue: true }); toast(t("guide_switch"));
      }
      return;
    }
    // motor alternativo: o próprio detector nativo decodifica (uma leitura por aparição)
    const live = new Set();
    items.forEach(it => {
      if (!it.text) return;
      live.add(it.text);
      const prevAt = guideSeen.get(it.text);
      guideSeen.set(it.text, now);
      if (prevAt && now - prevAt < 900) return;
      onDecoded(it.text, { result: { format: { formatName: it.format } } });
    });
    for (const [k, at] of guideSeen) if (!live.has(k) && now - at > 2500) guideSeen.delete(k);
  } catch { /* quadro sem imagem: tenta de novo */ }
  finally { guideBusy = false; }
}
async function startGuide() {
  stopGuide();
  guideFallback.reset(); guideEngine = "main"; guidePrev = null; guideSeen = new Map(); guideSaid = {}; guideHintKey = null;
  if ("BarcodeDetector" in window) {
    try {
      const sup = await window.BarcodeDetector.getSupportedFormats();
      const want = settings.mode === "qr" ? ["qr_code"] : settings.mode === "barcode" ? C.F1D.map(f => f.toLowerCase()) : null;
      const fmts = want ? want.filter(f => sup.includes(f)) : null;
      guideDet = fmts && fmts.length ? new window.BarcodeDetector({ formats: fmts }) : new window.BarcodeDetector();
      guideTimer = setInterval(guideTick, 120);
      return;
    } catch { guideDet = null; }
  }
  if (settings.guide) guideReticle();
}
function stopGuide() { clearTimeout(dirTimer); try { $("dirHint").classList.remove("show"); } catch {} clearInterval(guideTimer); guideTimer = null; guideDet = null; guideBusy = false; try { guideClear(); } catch {} }
async function startCamera(forceId) {
  if (running) return;
  if (!window.Html5Qrcode) { setStatus("cam_noLib"); return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { setStatus("cam_noApi"); return; }
  scanBusy = false; sessionCount = 0; lastCode = "";
  setCamUi(true); setStatus("cam_asking");

  const fm = formatsFor(settings.mode);
  const base = native => ({ verbose: false, useBarCodeDetectorIfSupported: native, experimentalFeatures: { useBarCodeDetectorIfSupported: native } });
  const withF = native => Object.assign(base(native), fm.length ? { formatsToSupport: fm } : {});
  const savedId = forceId || rawGet("peppe-cam");
  const attempts = [];
  if (savedId) attempts.push({ name: "id", cam: savedId, opts: withF(true) });
  attempts.push(
    { name: "env-native", cam: { facingMode: "environment" }, opts: withF(true) },
    { name: "env-zxing", cam: { facingMode: "environment" }, opts: withF(false) },
    { name: "env-all", cam: { facingMode: "environment" }, opts: base(false) },
    { name: "user", cam: { facingMode: "user" }, opts: base(false) },
    { name: "list", cam: null, opts: base(false) }
  );
  const scanCfg = { fps: 10, qrbox: qrboxFor };
  let lastErr = null;

  for (const at of attempts) {
    try {
      await stop(); setCamUi(true);
      scanner = new Html5Qrcode("reader", at.opts);
      let cam = at.cam;
      if (!cam) {
        const list = await Html5Qrcode.getCameras();
        if (!list.length) throw Error("NotFound");
        const back = list.find(c => /back|rear|traseira|environment/i.test(c.label)) || list[list.length - 1];
        cam = back.id;
      }
      await scanner.start(cam, scanCfg, onDecoded, () => {});
      running = true;
      setCamUi(true); $("stopBtn").disabled = false;
      setStatus("cam_active");
      say(t("say_start"));
      startHints(); startGuide().catch(() => {});
      try { await scanner.applyVideoConstraints({ advanced: [{ focusMode: "continuous" }] }); } catch {}
      setupCamExtras();
      return;
    } catch (e) {
      lastErr = e;
      console.warn("Falha ao iniciar câmera (" + at.name + ")", e);
      if (/NotAllowed|Permission/i.test(String(e && e.name) + String(e))) break;
    }
  }
  await stop();
  const m = String((lastErr && lastErr.name) || "") + " " + String(lastErr || "");
  setStatus(/NotAllowed|Permission/i.test(m) ? "cam_denied" : /NotFound|Nenhuma/i.test(m) ? "cam_notFound" : /NotReadable|TrackStart/i.test(m) ? "cam_busy" : "cam_fail");
  toast(t("cam_failToast"));
}
PeppeGuard.step("camera#2", () => {

$("startBtn").onclick = () => { primeVoice(); startCamera(); };
$("stopBtn").onclick = stop;
$("switchBtn").onclick = async () => {
  if (cameraList.length < 2) return;
  camIdx = (camIdx + 1) % cameraList.length;
  const id = cameraList[camIdx].id;
  rawSet("peppe-cam", id);
  await stop(); startCamera(id);
};
$("scanMode").onchange = async e => {
  settings.mode = e.target.value; saveSettings();
  if (running) { await stop(); startCamera(); }
};
$("continuousToggle").onchange = e => { settings.continuous = e.target.checked; saveSettings(); if (running) startHints(); };
$("voiceBtn").onclick = () => {
  settings.voice = !settings.voice; saveSettings(); $("setVoice").checked = settings.voice; updateVoiceBtn();
  if (settings.voice) { primeVoice(); say(t("say_voice_on")); } else if (synth) synth.cancel();
};
document.addEventListener("visibilitychange", () => { if (document.hidden && running) stop(); });

$("cameraTab").onclick = () => {
  $("cameraTab").setAttribute("aria-selected", "true"); $("imageTab").setAttribute("aria-selected", "false");
  $("cameraMode").classList.remove("hidden"); $("imageMode").classList.add("hidden");
};
$("imageTab").onclick = async () => {
  await stop();
  $("imageTab").setAttribute("aria-selected", "true"); $("cameraTab").setAttribute("aria-selected", "false");
  $("cameraMode").classList.add("hidden"); $("imageMode").classList.remove("hidden");
};
});

/* ================= Leitura por imagem ================= */
function otsu(hist, total) {
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sB = 0, wB = 0, max = 0, th = 127;
  for (let i = 0; i < 256; i++) {
    wB += hist[i]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sB += i * hist[i];
    const mB = sB / wB, mF = (sum - sB) / wF, between = wB * wF * (mB - mF) * (mB - mF);
    if (between > max) { max = between; th = i; }
  }
  return th;
}
const VARIANTS = [
  { max: 2000 }, { max: 2000, enh: 1 }, { max: 2000, enh: 1, bin: 1 },
  { max: 2000, half: 1 }, { max: 2000, half: 1, enh: 1 },
  { max: 1000 }, { max: 1600, up: 1, enh: 1 }, { max: 1400, up: 1, enh: 1, bin: 1 }
];
async function nativeDetect(file) {
  if (!("BarcodeDetector" in window)) return null;
  try {
    const bmp = await createImageBitmap(file), det = new window.BarcodeDetector(), r = await det.detect(bmp);
    if (bmp.close) bmp.close();
    const list = (r || []).filter(x => x && x.rawValue).map(x => ({ text: x.rawValue, fmt: String(x.format || "").toUpperCase() }));
    if (list.length) return list;
  } catch {}
  return null;
}
async function scanVariant(file, v) {
  const img = await createImageBitmap(file);
  const big = Math.max(img.width, img.height);
  const scale = (v.up ? Math.min(2, v.max / big) : Math.min(1, v.max / big)) * (v.half ? 0.5 : 1);
  const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d");
  canvas.width = Math.max(1, Math.round(img.width * scale)); canvas.height = Math.max(1, Math.round(img.height * scale));
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  if (img.close) img.close();
  if (v.enh || v.bin) {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height), d = data.data;
    const hist = new Array(256).fill(0);
    for (let i = 0; i < d.length; i += 4) { const g = Math.round(.299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2]); d[i] = d[i + 1] = d[i + 2] = g; hist[g]++; }
    const th = v.bin ? otsu(hist, d.length / 4) : 0;
    for (let i = 0; i < d.length; i += 4) {
      let g = d[i];
      g = v.bin ? (g > th ? 255 : 0) : Math.max(0, Math.min(255, (g - 128) * 1.45 + 128));
      d[i] = d[i + 1] = d[i + 2] = g;
    }
    ctx.putImageData(data, 0, 0);
  }
  const blob = await new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(Error("blob")), "image/png"));
  const source = new File([blob], "imagem.png", { type: "image/png" });
  const host = new Html5Qrcode("imgHost", { verbose: false, formatsToSupport: formatsFor("all") });
  try {
    if (host.scanFileV2) { const r = await host.scanFileV2(source, false); return { text: r.decodedText, fmt: (r.result && r.result.format && r.result.format.formatName) || "" }; }
    return { text: await host.scanFile(source, false), fmt: "" };
  } finally { try { host.clear(); } catch {} }
}
let fileIdle = true;
async function tryImage(file) {
  if (!file) return;
  fileIdle = false;
  if (!window.Html5Qrcode) { $("fileStatus").textContent = t("cam_noLib"); return; }
  $("fileStatus").textContent = t("img_analyzing");
  const nat = await nativeDetect(file);
  if (nat) {
    if (settings.batchMode) {
      nat.forEach(x => batchRead(x.text, x.fmt, true));
      feedback(); say(t("say_batch_multi", { n: nat.length }));
      $("fileStatus").textContent = t("img_multi", { n: nat.length });
    } else {
      handleScan(nat[0].text, nat[0].fmt);
      $("fileStatus").textContent = nat.length > 1 ? t("img_multi_hint", { n: nat.length }) : t("img_found");
    }
    return;
  }
  for (const v of VARIANTS) {
    try {
      const r = await scanVariant(file, v);
      if (r && r.text) { handleScan(r.text, r.fmt); $("fileStatus").textContent = t("img_found"); return; }
    } catch {}
  }
  $("fileStatus").textContent = t("img_notfound");
}
async function acceptImage(file) {
  if (!file || !file.type || !file.type.startsWith("image/")) { toast(t("img_pickfile")); return; }
  primeVoice(); await tryImage(file);
}
PeppeGuard.step("camera#3", () => {
$("imageInput").onchange = async e => { const f = e.target.files[0]; e.target.value = ""; await acceptImage(f); };
$("pasteBtn").onclick = async () => {
  try {
    if (!navigator.clipboard || !navigator.clipboard.read) throw Error();
    const items = await navigator.clipboard.read();
    for (const item of items) { const ty = item.types.find(x => x.startsWith("image/")); if (ty) { await acceptImage(await item.getType(ty)); return; } }
    throw Error();
  } catch { $("fileStatus").textContent = t("img_paste_unavail"); }
};
$("dropZone").addEventListener("dragover", e => { e.preventDefault(); $("dropZone").style.borderColor = "var(--accent)"; });
$("dropZone").addEventListener("dragleave", () => { $("dropZone").style.borderColor = ""; });
$("dropZone").addEventListener("drop", e => { e.preventDefault(); $("dropZone").style.borderColor = ""; acceptImage(e.dataTransfer.files[0]); });
document.addEventListener("paste", e => {
  const item = [...((e.clipboardData && e.clipboardData.items) || [])].find(x => x.type.startsWith("image/"));
  if (item && !$("imageMode").classList.contains("hidden")) acceptImage(item.getAsFile());
});
});
