/* Leitor QR - Peppe · js/library.js
 * Ações do resultado, histórico, biblioteca e estatísticas.
 * Depende de: base.js, result.js
 * Script clássico: compartilha o escopo global com os demais módulos (carregados em ordem pelo index.html).
 * As instruções soltas (ligação de eventos e renders iniciais) rodam em PeppeGuard.step(): se uma falhar,
 * o erro é registrado em Ajustes > Diagnóstico e o resto do módulo continua.
 */
"use strict";
PeppeGuard.mod("library");

/* ================= Ações do resultado ================= */
async function copyText(s, okMsg) { try { await navigator.clipboard.writeText(s); toast(okMsg || t("copied")); } catch { toast(t("copyFail")); } }
PeppeGuard.step("library#1", () => {
$("copyBtn").onclick = () => copyText(current);
$("openBtn").onclick = () => doOpen(current);
$("searchBtn").onclick = () => window.open("https://www.google.com/search?q=" + encodeURIComponent(current), "_blank", "noopener,noreferrer");
$("shareBtn").onclick = async () => { if (navigator.share) { try { await navigator.share({ title: "Leitor QR - Peppe", text: current }); } catch {} } else copyText(current); };
$("editBtn").onclick = () => { if (!current) return; $("editText").value = current; $("editBox").classList.remove("hidden"); $("editText").focus(); };
$("editCancel").onclick = () => $("editBox").classList.add("hidden");
$("editApply").onclick = () => {
  const v = $("editText").value.replace(/\s+$/, "");
  if (!v) return;
  const old = current;
  historyItems.forEach(x => { if (x.value === old) x.value = v; });
  saveHistory();
  showResult(v, false, currentFmt); renderHistory(); updateStats(); toast(t("edited_toast"));
};
$("toGenBtn").onclick = () => { $("qrText").value = current; $("genType").value = "qr"; updateGenUi(); go("generate"); };
$("lookupBtn").onclick = () => lookup(current, currentInfo && currentInfo.kind, false);
$("saveCodeBtn").onclick = () => {
  if (!current) return;
  if (isSaved(current)) { toast(t("toast_already")); return; }
  libraryItems.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), value: current, format: currentFmt, note: "", savedAt: new Date().toISOString() });
  saveLibrary(); renderLibrary();
  $("saveCodeBtn").textContent = t("saved"); toast(t("toast_saved"));
};
});

/* ================= Histórico, biblioteca e estatísticas ================= */
function saveHistory() { if (!jset("peppe-history", historyItems)) toast(t("toast_storage_full")); }
function saveLibrary() { if (!jset("peppe-library", libraryItems)) toast(t("toast_storage_full")); }
const itemKind = x => C.classify(x.value, x.format).kind;
function renderHistory() {
  const list = $("historyList");
  list.replaceChildren();
  if (!historyItems.length) { list.append(el("p", { class: "hint", text: t("history_empty") })); return; }
  historyItems.slice(0, 12).forEach(x => {
    list.append(el("div", { class: "history-item" },
      el("span", { class: "txt", text: x.value }),
      el("span", { class: "tag", text: kindLabel(itemKind(x)) }),
      el("button", { class: "small", text: t("view"), onclick: () => showResult(x.value, false, x.format) }),
      el("button", { class: "small", text: "×", "aria-label": t("remove"), onclick: () => { historyItems = historyItems.filter(y => y !== x); saveHistory(); renderHistory(); updateStats(); } })
    ));
  });
}
function renderLibrary() {
  const list = $("libraryList"), q = $("librarySearch").value.toLowerCase();
  list.replaceChildren();
  const items = libraryItems.filter(x => (x.value + " " + (x.note || "")).toLowerCase().includes(q));
  if (!items.length) { list.append(el("p", { class: "hint", text: t("lib_empty") })); return; }
  items.forEach(x => {
    list.append(el("div", { class: "history-item" },
      el("span", { class: "txt", text: (x.note ? x.note + " · " : "") + x.value }),
      el("button", { class: "small", text: t("lib_edit"), onclick: () => {
        const n = prompt(t("lib_note_prompt"), x.note || "");
        if (n !== null) { x.note = n.trim().slice(0, 120); saveLibrary(); renderLibrary(); }
      } }),
      el("button", { class: "small", text: t("view"), onclick: () => { showResult(x.value, false, x.format); go("read"); } }),
      el("button", { class: "small", text: t("remove"), onclick: () => { libraryItems = libraryItems.filter(y => y.id !== x.id); saveLibrary(); renderLibrary(); } })
    ));
  });
}
function updateStats() {
  const F1D = C.F1D;
  let qr = 0, bar = 0, links = 0;
  const groups = {};
  historyItems.forEach(x => {
    const k = itemKind(x), f = String(x.format || "").toUpperCase();
    if (f === "QR_CODE" || k === "pix") qr++;
    if (F1D.includes(f) || (!f && ["gtin", "isbn", "boleto", "utility", "nfe"].includes(k))) bar++;
    if (k === "url") links++;
    const g = f ? C.formatLabel(f) : kindLabel(k);
    groups[g] = (groups[g] || 0) + 1;
  });
  $("totalStat").textContent = historyItems.length; $("qrStat").textContent = qr; $("barStat").textContent = bar; $("linkStat").textContent = links;
  const bars = $("formatBars"); bars.replaceChildren();
  const entries = Object.entries(groups).sort((a, b) => b[1] - a[1]).slice(0, 8), max = entries.length ? entries[0][1] : 1;
  entries.forEach(([name, n]) => bars.append(el("div", { class: "bar-row" }, el("span", { text: name }), el("div", { class: "bar-track" }, el("div", { class: "bar-fill", style: "width:" + Math.round(n / max * 100) + "%" })), el("span", { text: String(n) }))));
  const recent = $("statsRecent"); recent.replaceChildren();
  historyItems.slice(0, 8).forEach(x => recent.append(el("p", { class: "hint", text: (x.format ? C.formatLabel(x.format) : kindLabel(itemKind(x))) + " — " + x.value.slice(0, 90) })));
}
PeppeGuard.step("library#2", () => {
$("librarySearch").oninput = renderLibrary;
$("clearHistory").onclick = () => { historyItems = []; saveHistory(); renderHistory(); updateStats(); toast(t("toast_history_cleared")); };
$("clearLibrary").onclick = () => { if (confirm(t("lib_confirm_clear"))) { libraryItems = []; saveLibrary(); renderLibrary(); } };
});

function downloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
PeppeGuard.step("library#3", () => {
$("exportCsv").onclick = () => {
  const rows = [["date", "format", "type", "content"], ...historyItems.map(x => [x.time || "", x.format || "", itemKind(x), x.value])];
  downloadBlob(new Blob(["\ufeff" + C.toCsv(rows)], { type: "text/csv;charset=utf-8" }), "historico-leitor-qr-peppe.csv");
};
$("libExport").onclick = () => {
  const payload = { app: "leitor-qr-peppe", version: 5, exportedAt: new Date().toISOString(), library: libraryItems, history: historyItems };
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), "biblioteca-leitor-qr-peppe.json");
};
$("libImport").onchange = async e => {
  const f = e.target.files[0]; e.target.value = "";
  if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    const src = Array.isArray(j) ? j : j.library;
    if (!Array.isArray(src)) throw Error();
    let n = 0;
    src.forEach(x => {
      if (x && typeof x.value === "string" && x.value && !isSaved(x.value)) {
        libraryItems.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), value: x.value.slice(0, 4000), format: String(x.format || ""), note: String(x.note || "").slice(0, 120), savedAt: x.savedAt || new Date().toISOString() });
        n++;
      }
    });
    saveLibrary(); renderLibrary(); toast(t("lib_import_ok", { n }));
  } catch { toast(t("lib_import_fail")); }
};
});
