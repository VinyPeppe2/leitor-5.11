/* Leitor QR - Peppe · js/settings.js
 * Ajustes: preferências, voz, banco e instalação.
 * Depende de: base.js, pix.js
 * Script clássico: compartilha o escopo global com os demais módulos (carregados em ordem pelo index.html).
 * As instruções soltas (ligação de eventos e renders iniciais) rodam em PeppeGuard.step(): se uma falhar,
 * o erro é registrado em Ajustes > Diagnóstico e o resto do módulo continua.
 */
"use strict";
PeppeGuard.mod("settings");

/* ================= Ajustes ================= */
function populateBank() {
  const sb = $("setBank");
  sb.replaceChildren(el("option", { value: "", text: t("set_bank_none") }));
  C.BANK_SITES.forEach(b => sb.append(el("option", { value: b.id, text: b.name })));
  sb.value = settings.bank || "";
}
PeppeGuard.step("settings#1", () => {
$("setBank").onchange = e => { settings.bank = e.target.value; saveSettings(); if (current) renderExtra(currentInfo); };
});

function bindSettings() {
  $("setVoice").checked = settings.voice;
  $("setBeep").checked = settings.beep; $("setVibrate").checked = settings.vibrate;
  $("setAutoOpen").checked = settings.autoOpen; $("setAutoLookup").checked = settings.autoLookup; $("setGuide").checked = settings.guide; $("setSpeak").value = settings.speakLevel === "full" ? "full" : "short"; $("setBankFirst").value = ["copy", "app", "site"].includes(settings.bankOpen) ? settings.bankOpen : "copy";
  $("setRate").value = settings.rate; $("rateVal").textContent = Number(settings.rate).toFixed(2).replace(/0$/, "") + "×";
  $("scanMode").value = settings.mode; $("continuousToggle").checked = settings.continuous; $("batchToggle").checked = settings.batchMode;
  const noSynth = !synth;
  $("setVoice").disabled = $("setVoicePick").disabled = $("setRate").disabled = $("testVoice").disabled = noSynth;
  $("voiceBtn").classList.toggle("hidden", noSynth);
}
PeppeGuard.step("settings#2", () => {
$("setVoice").onchange = e => { settings.voice = e.target.checked; saveSettings(); updateVoiceBtn(); if (settings.voice) { primeVoice(); say(t("say_voice_on")); } else if (synth) synth.cancel(); };
$("setBeep").onchange = e => { settings.beep = e.target.checked; saveSettings(); };
$("setVibrate").onchange = e => { settings.vibrate = e.target.checked; saveSettings(); };
$("setAutoOpen").onchange = e => { settings.autoOpen = e.target.checked; saveSettings(); };
$("setAutoLookup").onchange = e => { settings.autoLookup = e.target.checked; saveSettings(); };
$("setBankFirst").onchange = e => { settings.bankOpen = e.target.value; saveSettings(); };
$("setSpeak").onchange = e => { settings.speakLevel = e.target.value; saveSettings(); };
$("setGuide").onchange = e => { settings.guide = e.target.checked; saveSettings(); if (running) startGuide(); };
$("setRate").oninput = e => { settings.rate = Number(e.target.value); $("rateVal").textContent = settings.rate.toFixed(2).replace(/0$/, "") + "×"; saveSettings(); };
$("setVoicePick").onchange = e => { if (e.target.value) settings.voices[lang] = e.target.value; else delete settings.voices[lang]; saveSettings(); updateVoiceUsing(); say(t("set_test_phrase")); };
$("testVoice").onclick = () => { const was = settings.voice; settings.voice = true; primeVoice(); say(t("set_test_phrase")); settings.voice = was; };
$("clearAll").onclick = () => {
  if (!confirm(t("set_clear_confirm"))) return;
  try { Object.keys(localStorage).filter(k => k.startsWith("peppe-")).forEach(k => localStorage.removeItem(k)); } catch {}
  pixProfile = null; pixEditing = false; pixShowKey = false; charges = []; historyItems = []; libraryItems = []; batch = C.newBatch(); lastBatch = null; expected = { items: [] }; buildExpectedMap(); $("invText").value = ""; settings = Object.assign({}, DEFAULTS, { voices: {} }); lang = "pt";
  $("language").value = lang; settings.features = C.cleanFeatures({}, C.featureDefaults(false)); settings.onboarded = false; bindSettings(); applyI18n(); toast(t("set_cleared"));
};
});
