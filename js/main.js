/* Leitor QR - Peppe · js/main.js
 * Navegação, recursos ligáveis, backup e início do app.
 * Depende de: todos os anteriores
 * Script clássico: compartilha o escopo global com os demais módulos (carregados em ordem pelo index.html).
 * As instruções soltas (ligação de eventos e renders iniciais) rodam em PeppeGuard.step(): se uma falhar,
 * o erro é registrado em Ajustes > Diagnóstico e o resto do módulo continua.
 */
"use strict";
PeppeGuard.mod("main");

/* ================= Navegação, tema, idioma, PWA ================= */
const PAGES = ["read", "generate", "pix", "stats", "batch", "library", "settings"];
async function go(page) {
  if (!PAGES.includes(page)) return;
  if (!C.pageEnabled(page, settings.features)) page = "read";
  // Cada módulo é chamado de forma isolada: se um estiver ausente ou quebrado, a navegação continua.
  try { await stop(); } catch (e) { PeppeGuard.log("go:camera", e); }
  PeppeGuard.step("go:voz", () => { cancelAuto(); if (synth) synth.cancel(); });
  document.querySelectorAll(".tab[data-page]").forEach(x => x.setAttribute("aria-selected", String(x.dataset.page === page)));
  document.querySelectorAll(".page").forEach(p => p.classList.add("hidden"));
  $("page-" + page).classList.remove("hidden");
  PeppeGuard.step("go:estatisticas", () => updateStats());
  if (page === "batch") PeppeGuard.step("go:lote", () => renderBatch());
}
PeppeGuard.step("main#1", () => {
document.querySelectorAll(".tab[data-page]").forEach(b => b.onclick = () => go(b.dataset.page));
});

/* ---- recursos ligáveis, perfis e dica de descoberta ---- */
function applyFeatures() {
  const F = settings.features;
  document.querySelectorAll(".tab[data-page]").forEach(tb => tb.classList.toggle("hidden", !C.pageEnabled(tb.dataset.page, F)));
  $("batchToggleWrap").classList.toggle("hidden", !F.batch);
  if (!F.batch && settings.batchMode) { settings.batchMode = false; saveSettings(); }
  $("batchToggle").checked = !!settings.batchMode && F.batch;
  $("toGenBtn").classList.toggle("hidden", !F.gen);
  $("onboard").classList.toggle("hidden", settings.onboarded);
  $("moreHint").classList.toggle("hidden", !settings.onboarded || C.FEATURES.every(f => F[f]));
  C.FEATURES.forEach(f => { $("setF_" + f).checked = !!F[f]; });
  try { renderBatchBar(); } catch {}
}
function setFeatures(next, msg) {
  settings.features = C.cleanFeatures(next, {}); settings.onboarded = true; saveSettings(); applyFeatures();
  if (!C.pageEnabled(currentPage(), settings.features)) go("read");
  if (msg) toast(msg);
}
const currentPage = () => (PAGES.find(p => !$("page-" + p).classList.contains("hidden")) || "read");
PeppeGuard.step("main#2", () => {
document.querySelectorAll(".ob-btn").forEach(b => b.onclick = () => setFeatures(C.featuresFromProfile(b.dataset.profile), t("ob_done")));
$("obSkip").onclick = () => { settings.onboarded = true; saveSettings(); applyFeatures(); };
$("moreBtn").onclick = () => go("settings");
C.FEATURES.forEach(f => { $("setF_" + f).onchange = e => setFeatures(Object.assign({}, settings.features, { [f]: e.target.checked })); });
$("featAll").onclick = () => setFeatures(C.featuresFromProfile("all"));
$("featMin").onclick = () => setFeatures(C.featuresFromProfile("read"));
});

/* ---- backup dos dados locais ---- */
const reloadApp = () => { if (window.__peppeNoReload) return; try { location.reload(); } catch {} };
PeppeGuard.step("main#3", () => {
$("bkExport").onclick = () => {
  const entries = {};
  try { Object.keys(localStorage).forEach(k => { entries[k] = localStorage.getItem(k); }); } catch {}
  const b = C.backupBuild(entries, APP_VERSION);
  if (!Object.keys(b.data).length) { toast(t("bk_empty")); return; }
  downloadBlob(new Blob([JSON.stringify(b)], { type: "application/json" }), "peppe-backup-" + new Date().toISOString().slice(0, 10) + ".json");
  toast(t("bk_done", { n: Object.keys(b.data).length }));
};
$("bkImport").onclick = () => $("bkFile").click();
$("bkFile").onchange = async e => {
  const f = e.target.files && e.target.files[0]; e.target.value = "";
  if (!f) return;
  if (f.size > C.BACKUP_MAX) { toast(t("bk_too_big")); return; }
  let text = ""; try { text = f.text ? await f.text() : await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsText(f); }); } catch { toast(t("bk_invalid")); return; }
  const r = C.backupParse(text);
  if (!r.ok) { toast(r.error === "size" ? t("bk_too_big") : t("bk_invalid")); return; }
  if (!confirm(t("bk_confirm", { n: r.count }))) return;
  try {
    Object.keys(localStorage).filter(k => k.startsWith("peppe-") && k !== "peppe-cam").forEach(k => localStorage.removeItem(k));
    Object.keys(r.data).forEach(k => localStorage.setItem(k, r.data[k]));
  } catch { toast(t("toast_storage_full")); return; }
  toast(t("bk_imported")); setTimeout(reloadApp, 900);
};
});

function applyI18n() {
  document.documentElement.lang = LANGTAG[lang];
  document.querySelectorAll("[data-i18n]").forEach(e => { e.textContent = t(e.dataset.i18n); });
  document.querySelectorAll("[data-i18n-ph]").forEach(e => { e.placeholder = t(e.dataset.i18nPh); });
  document.querySelectorAll("[data-i18n-label]").forEach(e => { const v = t(e.dataset.i18nLabel); e.setAttribute("aria-label", v); e.title = v; });
  // Cada recurso se atualiza isolado: um módulo ausente ou quebrado não impede os demais nem os textos da tela.
  const S = (name, fn) => PeppeGuard.step("idioma:" + name, fn);
  S("voz", () => { updateVoiceBtn(); populateVoiceSelect(); });
  S("ajustes", () => populateBank());
  S("gerador", () => updateGenUi());
  S("lote", () => { updateBatchTab(); if (!$("page-batch").classList.contains("hidden")) renderBatch(); });
  S("recursos", () => applyFeatures());
  S("camera", () => {
    if (statusState) setStatus(statusState.key, statusState.params); else setStatus(running ? "cam_active" : "cam_idle");
    if (fileIdle) $("fileStatus").textContent = t("file_idle");
    if (running) $("torchBtn").textContent = t(torchOn ? "torch_off" : "torch");
  });
  S("gerador-logo", () => { if (!logoData) $("logoName").textContent = t("logo_none"); });
  S("biblioteca", () => { renderHistory(); renderLibrary(); updateStats(); });
  S("resultado", () => { if (current) showResult(current, false, currentFmt); });
  S("pix", () => { applyKeyType(); renderPixProfile(); renderCharges(); });
  S("instalar", () => renderShare());
}
PeppeGuard.step("main#4", () => {
$("language").value = lang;
$("language").onchange = e => { lang = e.target.value; rawSet("peppe-lang", lang); applyI18n(); };

$("themeBtn").onclick = () => {
  document.documentElement.classList.toggle("light");
  rawSet("peppe-theme", document.documentElement.classList.contains("light") ? "light" : "dark");
};
if (rawGet("peppe-theme") === "light") document.documentElement.classList.add("light");
});

let installPrompt = null;
let swError = "";
const doInstall = async () => {
  if (installPrompt) { installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; return; }
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const key = standalone ? "inst_done" : location.protocol === "file:" ? "inst_file" : ios ? "inst_ios" : "inst_manual";
  let sw = "";
  try { const r = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null; sw = r ? (r.active ? "ativo" : "registrado, ainda não ativo") : swError ? "erro: " + swError : "não registrado"; } catch { sw = "indisponível"; }
  const msg = t(key) + (key === "inst_manual" ? " " + t("inst_desktop") : "") + " [" + location.protocol + " · service worker: " + sw + "]";
  $("installHelp").textContent = msg;
  toast(t(key));
};
PeppeGuard.step("main#5", () => {
$("installBtn2").onclick = doInstall;
window.addEventListener("appinstalled", () => { installPrompt = null; toast(t("inst_done")); });
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installPrompt = e; });
});

// Instalar em outro celular: QR com o endereço publicado (só faz sentido em https)
const siteUrl = () => location.origin + location.pathname.replace(/index\.html$/, "");
function renderShare() {
  const ok = location.protocol === "https:";
  $("shareUrl").textContent = ok ? siteUrl() : t("inst_other_local");
  $("shareQr").classList.toggle("hidden", !ok); $("shareCopy").disabled = !ok;
  $("shareShare").classList.toggle("hidden", !(ok && navigator.share));
  if (ok) { try { makeQr(siteUrl(), $("shareQr"), 200, "M", "#000000", "#ffffff"); } catch {} }
}
PeppeGuard.step("main#6", () => {
$("shareCopy").onclick = () => copyText(siteUrl(), t("inst_link_copied"));
$("shareShare").onclick = () => { try { navigator.share({ title: "Leitor QR - Peppe", url: siteUrl() }).catch(() => {}); } catch {} };
renderShare();

$("updateBtn").onclick = () => location.reload();
if ("serviceWorker" in navigator) {
  // o service worker novo assume sozinho; se já havia um antes, a página ainda roda o código antigo: avisa para atualizar
  let hadController = !!navigator.serviceWorker.controller;   // na primeira visita o service worker assume sem aviso
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadController) $("updateBar").classList.remove("hidden"); hadController = true; });
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(e => { swError = String(e && e.message || e); }));
}

/* ================= Início ================= */
PeppeGuard.step("inicio:ajustes", () => bindSettings());
PeppeGuard.step("inicio:voz", () => {
  if (synth) {
    loadVoices();
    if (synth.addEventListener) synth.addEventListener("voiceschanged", loadVoices);
    setTimeout(() => { if (!voices.length) loadVoices(); }, 1000);
  }
});
applyI18n();
PeppeGuard.step("inicio:camera", () => setCamUi(false));
});

const startAction = new URLSearchParams(location.search).get("action");
PeppeGuard.step("main#7", () => {
if (startAction && PAGES.includes(startAction)) go(startAction);
});

// Detecta arquivos de módulo que não chegaram (404, upload incompleto no GitHub): avisa qual e segue com o resto.
PeppeGuard.step("main:modulos", () => {
  ["base", "result", "camera", "library", "generate", "pix", "settings", "batch", "pdf"].forEach(n => {
    if (!PeppeGuard.mods.includes(n)) PeppeGuard.log(n, "js/" + n + ".js não carregou");
  });
});
