/* Leitor QR - Peppe · js/base.js
 * Base: armazenamento local, idioma, utilidades de interface e voz.
 * Depende de: (nenhum; usa core.js e i18n.js)
 * Script clássico: compartilha o escopo global com os demais módulos (carregados em ordem pelo index.html).
 * As instruções soltas (ligação de eventos e renders iniciais) rodam em PeppeGuard.step(): se uma falhar,
 * o erro é registrado em Ajustes > Diagnóstico e o resto do módulo continua.
 */
"use strict";
PeppeGuard.mod("base");

"use strict";
const C = window.PeppeCore, I = window.PeppeI18n;
const $ = id => document.getElementById(id);
const LANGTAG = { pt: "pt-BR", en: "en-US", es: "es-ES" };
/* ================= Armazenamento ================= */
const rawGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const rawSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } };
const jget = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const jset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const DEFAULTS = { bank: "", batchMode: false, voice: true, rate: 1, beep: true, vibrate: true, autoOpen: false, autoLookup: false, guide: true, speakLevel: "short", bankOpen: "copy", mode: "all", continuous: false, voices: {} };
let settings = Object.assign({}, DEFAULTS, jget("peppe-settings", {}));
PeppeGuard.step("base#1", () => {
if (!settings.voices || typeof settings.voices !== "object") settings.voices = {};
// Recursos ligáveis: quem já tem dados guardados continua com tudo; quem chega agora começa só com "Ler".
{
  const had = ["peppe-settings", "peppe-history", "peppe-library", "peppe-charges", "peppe-batch", "peppe-pixprofile"].some(k => { try { return localStorage.getItem(k) !== null; } catch { return false; } });
  const hasF = settings.features && typeof settings.features === "object";
  settings.features = C.cleanFeatures(settings.features, C.featureDefaults(had && !hasF));
  if (typeof settings.onboarded !== "boolean") settings.onboarded = had;
}
});

const saveSettings = () => jset("peppe-settings", settings);
let historyItems = jget("peppe-history", []);
let libraryItems = jget("peppe-library", []);
PeppeGuard.step("base#2", () => {
if (!Array.isArray(historyItems)) historyItems = [];
if (!Array.isArray(libraryItems)) libraryItems = [];
});

function loadBatch() {
  const b = jget("peppe-batch", null), out = C.newBatch();
  if (!b || typeof b !== "object" || !b.items || typeof b.items !== "object") return out;
  out.name = String(b.name || "").slice(0, 60); out.seq = Number(b.seq) || 0;
  Object.keys(b.items).slice(0, C.BATCH_CAP).forEach(k => {
    const x = b.items[k];
    if (x && typeof x.value === "string" && x.value) out.items[String(k)] = { value: x.value, format: String(x.format || ""), count: Math.max(1, Math.floor(Number(x.count)) || 1), seq: Number(x.seq) || 0, first: String(x.first || ""), last: String(x.last || "") };
  });
  return out;
}
let batch = loadBatch();
const isCont = () => settings.continuous || settings.batchMode;
const APP_VERSION = "5.11";
function loadExpected() {
  const e = jget("peppe-expected", null), out = { items: [] };
  if (e && Array.isArray(e.items)) e.items.slice(0, C.INV_CAP).forEach(x => {
    if (x && typeof x.code === "string" && x.code && Number.isFinite(x.qty) && x.qty >= 0) out.items.push({ code: x.code.slice(0, 64), qty: Math.floor(x.qty), desc: String(x.desc || "").slice(0, 80) });
  });
  return out;
}
let expected = loadExpected(), expectedMap = new Map(), invNote = "";
const buildExpectedMap = () => { expectedMap = new Map(expected.items.map(i => [C.invKey(i.code), i])); };
PeppeGuard.step("base#3", () => {
buildExpectedMap();
});

/* ================= Idioma ================= */
let lang = rawGet("peppe-lang");
PeppeGuard.step("base#4", () => {
if (!I[lang]) { const b = (navigator.language || "pt").slice(0, 2); lang = I[b] ? b : "pt"; }
});

function t(k, p) {
  let s = (I[lang] && I[lang][k]) ?? I.pt[k] ?? k;
  if (p) for (const x in p) s = s.split("{" + x + "}").join(p[x]);
  return s;
}
const fmtMoney = n => { try { return new Intl.NumberFormat(LANGTAG[lang], { style: "currency", currency: "BRL" }).format(n); } catch { return "R$ " + n.toFixed(2); } };
const fmtDate = (iso, long) => { try { return new Date(iso + "T12:00:00").toLocaleDateString(LANGTAG[lang], long ? { day: "numeric", month: "long", year: "numeric" } : undefined); } catch { return iso; } };
/* ================= Utilidades de UI ================= */
function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    if (attrs[k] == null) continue;
    if (k === "class") e.className = attrs[k];
    else if (k === "text") e.textContent = attrs[k];
    else if (k.startsWith("on")) e[k] = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  kids.flat().forEach(c => { if (c != null) e.append(c); });
  return e;
}
let toastTimer = null;
function toast(m, ms) {
  const n = $("toast");
  n.textContent = m; n.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => n.classList.remove("show"), ms || 2400);
}
const hostOf = u => { try { return new URL(/^https?:/i.test(u) ? u : "https://" + u).hostname; } catch { return u; } };
const canOpen = s => (/^https?:\/\//i.test(s) && !!C.analyzeUrl(s)) || /^(mailto|tel|sms|smsto|geo):/i.test(s);
/* ================= Voz ================= */
const synth = ("speechSynthesis" in window) ? window.speechSynthesis : null;
let voices = [];
const norm = l => String(l || "").toLowerCase().replace("_", "-");
const langVoices = () => voices.filter(v => norm(v.lang).startsWith(LANGTAG[lang].slice(0, 2).toLowerCase()));
function voiceScore(v) {
  const n = v.name || "";
  let s = 0;
  if (lang === "pt") {
    if (/thalita/i.test(n)) s += 100;
    if (/francisca/i.test(n)) s += 60;
    if (/ant[oô]nio/i.test(n)) s += 30;
  }
  if (/natural|neural/i.test(n)) s += 40;
  if (/online/i.test(n)) s += 10;
  if (norm(v.lang) === norm(LANGTAG[lang])) s += 20;
  if (/google/i.test(n)) s += 5;
  if (v.localService) s += 2;
  return s;
}
function pickVoice() {
  const list = langVoices();
  if (!list.length) return null;
  const saved = settings.voices[lang];
  if (saved) { const v = list.find(x => x.voiceURI === saved); if (v) return v; }
  return list.slice().sort((a, b) => voiceScore(b) - voiceScore(a))[0];
}
function say(text, opts = {}) {
  if (!synth || !settings.voice || !text) return;
  try {
    if (!opts.queue) synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LANGTAG[lang];
    const v = pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = Number(settings.rate) || 1;
    setTimeout(() => { try { synth.speak(u); } catch {} }, opts.queue ? 0 : 60);
  } catch {}
}
function primeVoice() {   // iOS/Safari exigem um gesto do usuário para liberar a voz
  if (!synth || !settings.voice) return;
  try { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; synth.speak(u); } catch {}
}
function loadVoices() { if (!synth) return; voices = synth.getVoices() || []; populateVoiceSelect(); }
function populateVoiceSelect() {
  const sel = $("setVoicePick");
  sel.replaceChildren(el("option", { value: "", text: t("set_voice_auto") }));
  const list = langVoices();
  list.forEach(v => sel.append(el("option", { value: v.voiceURI, text: v.name + " (" + v.lang + ")" })));
  const saved = settings.voices[lang];
  sel.value = saved && list.some(v => v.voiceURI === saved) ? saved : "";
  updateVoiceUsing();
}
function updateVoiceUsing() {
  if (!synth) { $("voiceUsing").textContent = t("set_novoice"); return; }
  const v = pickVoice();
  $("voiceUsing").textContent = v ? t("set_voice_using", { name: v.name }) : "";
}
function updateVoiceBtn() {
  $("voiceBtn").textContent = t(settings.voice ? "voice_btn_on" : "voice_btn_off");
  $("voiceBtn").setAttribute("aria-pressed", String(settings.voice));
}