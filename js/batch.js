/* Leitor QR - Peppe · js/batch.js
 * Lote de leituras e conferência de inventário.
 * Depende de: base.js, result.js, camera.js
 * Script clássico: compartilha o escopo global com os demais módulos (carregados em ordem pelo index.html).
 * As instruções soltas (ligação de eventos e renders iniciais) rodam em PeppeGuard.step(): se uma falhar,
 * o erro é registrado em Ajustes > Diagnóstico e o resto do módulo continua.
 */
"use strict";
PeppeGuard.mod("batch");

/* ================= Lote (leitura em sequência) ================= */
let lastBatch = null;
const batchCount = () => Object.keys(batch.items).length;
const batchReads = () => Object.values(batch.items).reduce((n, x) => n + Math.max(x.count, x.reads || 1), 0);
function saveBatch() { if (!jset("peppe-batch", batch)) toast(t("toast_storage_full")); }
function updateBatchTab() {
  const n = batchCount(), tab = document.querySelector('.tab[data-page="batch"]');
  if (tab) tab.textContent = t("tab_batch") + (n ? " (" + n + ")" : "");
}
function renderBatchBar() {
  $("batchBar").classList.toggle("hidden", !settings.batchMode);
  if (!settings.batchMode) return;
  $("batchBarCount").textContent = t("batch_bar", { n: batchCount(), r: batchReads() });
  const l = lastBatch;
  $("batchBarLast").textContent = l ? t("batch_last") + " " + kindLabel(l.info.kind) + " · " + l.item.value + (l.item.count > 1 ? " (" + t("batch_dup", { n: l.item.count }) + ")" : "") : "";
}
function batchChanged() { saveBatch(); updateBatchTab(); renderBatchBar(); if (!$("page-batch").classList.contains("hidden")) renderBatch(); }
function batchRead(text, fmt, quiet) {
  const r = C.batchAdd(batch, text, fmt);
  if (r.status === "full") { toast(t("batch_full")); if (!quiet) say(t("batch_full")); return; }
  const info = C.classify(text, fmt), a = C.assess(info), alarm = a.level === "warn" || a.level === "bad";
  lastBatch = { info, a, item: r.item };
  batchChanged();
  if (quiet) return;
  let inv = null;
  if (expectedMap.size && C.INV_KINDS.includes(info.kind)) {
    const k = C.invKey(text), total = Object.values(batch.items).filter(x => C.invKey(x.value) === k).reduce((n, x) => n + x.count, 0);
    inv = C.inventoryLookup(expectedMap, total, text);
  }
  const invAlarm = !!inv && (inv.status === "over" || inv.status === "extra"), payDup = r.status === "dup" && !!r.pay, loud = alarm || invAlarm || payDup;
  if (payDup) toast(t("batch_dup_pay_toast"), 2500);
  if (settings.vibrate) { try { navigator.vibrate?.(loud ? [200, 80, 200, 80, 200] : r.status === "dup" ? [60, 40, 60] : [70]); } catch {} }
  beep(loud ? 330 : inv && inv.status === "ok" ? 1040 : r.status === "dup" ? 520 : 880);
  let phrase;
  if (payDup) phrase = t("say_batch_dup_pay");
  else if (alarm) phrase = t("say_batch_alarm", { kind: kindLabel(info.kind) });
  else if (inv) phrase = inv.status === "extra" ? t("say_inv_extra") : inv.status === "ok" ? t("say_inv_done", { e: inv.expected }) : inv.status === "over" ? t("say_inv_over", { c: inv.counted, e: inv.expected }) : t("say_inv_progress", { c: inv.counted, e: inv.expected });
  else phrase = r.status === "dup" ? t("say_batch_dup", { n: r.item.count }) : String(batchCount());
  say(phrase);
}
function batchRowEl(row) {
  const { key, item, info, a } = row, d = info.data;
  const head = el("div", { class: "head" }, el("span", { class: "dot " + a.level }), el("span", { class: "tag", text: kindLabel(info.kind) }),
    item.format ? el("span", { class: "tag", text: C.formatLabel(item.format) }) : null);
  const payDupRow = C.PAY_KINDS.includes(info.kind) && (item.reads || 1) > 1;
  if (payDupRow) head.append(pill("warn", t("batch_dup_pay", { n: item.reads })));
  if (C.PAY_KINDS.includes(info.kind) && item.count > 1) head.append(pill("warn", t("batch_dup", { n: item.count })));
  const parts = [];
  if (info.kind === "boleto") { parts.push(fmtMoney(d.amount)); if (d.due) parts.push(t("lbl_due") + " " + fmtDate(d.due)); if (d.bankName) parts.push(d.bankName); }
  else if (info.kind === "pix") { if (d.amount) parts.push(fmtMoney(Number(d.amount))); if (d.name) parts.push(d.name); }
  else if (info.kind === "gtin" || info.kind === "isbn") parts.push(d.type);
  else if (info.kind === "url") parts.push(d.host);
  else if (info.kind === "wifi") parts.push(d.ssid);
  const why = a.reasons.find(r => r.level !== "ok");
  const set = n => { item.count = Math.max(1, n); item.last = new Date().toISOString(); batchChanged(); };
  const ctrl = el("div", { class: "ctrl" },
    el("div", { class: "qty" },
      el("button", { text: "−", "aria-label": t("qty_dec"), disabled: item.count <= 1 ? "" : null, onclick: () => set(item.count - 1) }),
      el("b", { text: String(item.count) }),
      el("button", { text: "+", "aria-label": t("qty_inc"), onclick: () => set(item.count + 1) })),
    el("button", { class: "small", text: t("view"), onclick: () => { showResult(item.value, false, item.format); go("read"); } }),
    el("button", { class: "small", text: "🗑", "aria-label": t("batch_remove"), onclick: () => { delete batch.items[key]; if (lastBatch && lastBatch.item === item) lastBatch = null; batchChanged(); } }));
  const box = el("div", { class: "batch-item" + (a.level === "bad" ? " is-bad" : a.level === "warn" ? " is-warn" : "") }, head, el("div", { class: "val", text: item.value }));
  if (parts.length) box.append(el("div", { class: "sub", text: parts.join(" · ") }));
  if (payDupRow) box.append(el("div", { class: "hint", text: t("batch_dup_pay_hint") }));
  if (why) box.append(el("div", { class: "hint", text: t(why.key, why.params) }));
  box.append(ctrl);
  return box;
}
function renderBatch() {
  renderInventory();
  if (document.activeElement !== $("batchName")) $("batchName").value = batch.name || "";
  const now = new Date(), s = C.batchSummary(batch, now), rows = C.batchRows(batch, now);
  const tiles = [[s.distinct, t("bs_items")], [s.reads, t("bs_reads")], [fmtMoney(s.payTotal), t("bs_pay", { n: s.payCount })],
    [s.units, t("bs_units")], [s.alerts, t("bs_alerts")], [s.nextDue ? fmtDate(s.nextDue) : t("bs_none"), t("bs_due")]];
  $("batchStats").replaceChildren(...tiles.map(([b, l]) => el("div", { class: "stat" }, el("b", { text: String(b) }), el("span", { text: l }))));
  const warn = $("batchWarnings"); warn.replaceChildren();
  const box = (cls, msg) => warn.append(el("div", { class: "verdict " + cls }, el("b", { text: msg })));
  if (s.dups) box("warn", t("batch_warn_dups", { n: s.dups }));
  if (s.overdue) box("warn", t("batch_warn_overdue", { n: s.overdue }));
  if (s.bad) box("bad", t("batch_warn_bad", { n: s.bad }));
  const f = $("batchFilter").value, q = $("batchSearch").value.trim().toLowerCase();
  const shown = rows.filter(r => (f === "all" || (f === "alerts" && (r.a.level === "warn" || r.a.level === "bad")) || (f === "pay" && C.isPay(r)) || (f === "products" && C.isProduct(r)))
    && (!q || (r.item.value + " " + kindLabel(r.info.kind)).toLowerCase().includes(q)));
  const list = $("batchList"); list.replaceChildren();
  if (!shown.length) { list.append(el("p", { class: "hint", text: t("batch_empty") })); return; }
  shown.forEach(r => list.append(batchRowEl(r)));
}
const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, "0"); return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()); };
const batchText = () => C.batchRows(batch).map(r => r.item.count + "\t" + r.item.value).join("\n");
PeppeGuard.step("batch#1", () => {
$("batchToggle").onchange = e => { settings.batchMode = e.target.checked; saveSettings(); renderBatchBar(); if (running) startHints(); };
$("batchOpen").onclick = () => go("batch");
$("batchName").oninput = e => { batch.name = e.target.value.slice(0, 60); saveBatch(); };
$("batchFilter").onchange = renderBatch;
$("batchSearch").oninput = renderBatch;
$("batchContinue").onclick = async () => { primeVoice(); await go("read"); startCamera(); };
$("batchCsv").onclick = () => downloadBlob(new Blob(["\ufeff" + C.batchToCsv(batch)], { type: "text/csv;charset=utf-8" }), "lote-leitor-qr-peppe-" + stamp() + ".csv");
$("batchJson").onclick = () => {
  const payload = { app: "leitor-qr-peppe", version: 5, exportedAt: new Date().toISOString(), batch: { name: batch.name, items: C.batchRows(batch).map(r => Object.assign({}, r.item, { kind: r.info.kind, verdict: r.a.level })) } };
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), "lote-leitor-qr-peppe-" + stamp() + ".json");
};
$("batchCopy").onclick = () => copyText(batchText(), t("batch_copied"));
$("batchShare").onclick = async () => { const txt = batchText(); if (navigator.share) { try { await navigator.share({ title: batch.name || "Leitor QR - Peppe", text: txt }); } catch {} } else copyText(txt, t("batch_copied")); };
$("batchSave").onclick = () => {
  let n = 0;
  C.batchRows(batch).forEach(r => {
    if (isSaved(r.item.value)) return;
    libraryItems.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), value: r.item.value, format: r.item.format, note: (batch.name || "Lote").slice(0, 120), savedAt: new Date().toISOString() });
    n++;
  });
  saveLibrary(); renderLibrary(); toast(t("batch_saved", { n }));
};
$("batchClear").onclick = () => {
  if (!batchCount() || !confirm(t("batch_clear_confirm"))) return;
  batch = C.newBatch(); lastBatch = null; batchChanged(); toast(t("batch_cleared"));
};
});

/* ================= Inventário (lista esperada x lote) ================= */
const stLabel = s => t("st_" + s);
const stLevel = s => (s === "ok" ? "ok" : "warn");
const signed = n => (n > 0 ? "+" : "") + n;
function saveExpected() { if (!jset("peppe-expected", expected)) toast(t("toast_storage_full")); }
function invRowEl(r) {
  const lvl = stLevel(r.status);
  const box = el("div", { class: "batch-item" + (lvl === "warn" ? " is-warn" : "") },
    el("div", { class: "head" }, el("span", { class: "dot " + lvl }), pill(lvl, stLabel(r.status))),
    el("div", { class: "val", text: r.code }));
  if (r.desc) box.append(el("div", { class: "sub", text: r.desc }));
  box.append(el("div", { class: "hint", text: t("inv_line", { e: r.expected, c: r.counted, d: signed(r.diff) }) }));
  return box;
}
function renderInventory() {
  const has = expected.items.length > 0;
  $("invStatus").textContent = has ? t("inv_status", { n: expected.items.length, u: expected.items.reduce((n, i) => n + i.qty, 0) }) + invNote : t("inv_status_none") + invNote;
  $("invCsv").disabled = !has; $("invClear").disabled = !has;
  const stats = $("invStats"), list = $("invList");
  stats.replaceChildren(); list.replaceChildren();
  if (!has) return;
  const rep = C.inventoryReport(batch, expected), T = rep.totals;
  [[T.expectedItems, t("is_expected")], [T.ok, t("is_ok")], [T.divergences, t("is_div")], [T.extra, t("is_extra")]]
    .forEach(([b, l]) => stats.append(el("div", { class: "stat" }, el("b", { text: String(b) }), el("span", { text: l }))));
  const rows = $("invShowOk").checked ? rep.rows : rep.rows.filter(r => r.status !== "ok");
  if (!rows.length) list.append(el("p", { class: "hint", text: t("inv_all_ok") }));
  rows.forEach(r => list.append(invRowEl(r)));
}
function applyExpectedText(txt) {
  const r = C.parseExpected(txt);
  invNote = "";
  if (r.errors.length) invNote += t("inv_errors", { e: r.errors.length, l: r.errors[0] });
  if (r.merged) invNote += t("inv_merged", { m: r.merged });
  if (r.truncated) invNote += t("inv_truncated");
  if (!r.items.length) { renderInventory(); toast(t("inv_invalid")); return; }
  expected = { items: r.items }; buildExpectedMap(); saveExpected(); renderInventory(); toast(t("inv_applied"));
}
PeppeGuard.step("batch#2", () => {
$("invText").value = expected.items.map(i => [i.code, i.qty, i.desc].join(";")).join("\n");
$("invApply").onclick = () => { const v = $("invText").value; if (!v.trim()) { toast(t("inv_empty_input")); return; } applyExpectedText(v); };
$("invFile").onchange = async e => {
  const f = e.target.files[0]; e.target.value = "";
  if (!f) return;
  if (f.size > 1000000) { toast(t("inv_file_big")); return; }
  const txt = await f.text();
  $("invText").value = txt; applyExpectedText(txt);
};
$("invTemplate").onclick = () => downloadBlob(new Blob(["\ufeffcodigo;quantidade;descricao\r\n7891000100103;10;Leite integral 1L\r\nSKU-778;2;Parafuso sextavado\r\n"], { type: "text/csv;charset=utf-8" }), "modelo-lista-esperada.csv");
$("invClear").onclick = () => {
  if (!expected.items.length || !confirm(t("inv_clear_confirm"))) return;
  expected = { items: [] }; buildExpectedMap(); invNote = ""; $("invText").value = "";
  try { localStorage.removeItem("peppe-expected"); } catch {}
  renderInventory(); toast(t("inv_cleared"));
};
$("invShowOk").onchange = renderInventory;
$("invCsv").onclick = () => downloadBlob(new Blob(["\ufeff" + C.inventoryCsv(C.inventoryReport(batch, expected), batch.name)], { type: "text/csv;charset=utf-8" }), "conferencia-inventario-" + stamp() + ".csv");
});
