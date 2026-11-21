/* Leitor QR - Peppe · js/pdf.js
 * Relatório em PDF do lote.
 * Depende de: base.js, batch.js, report.js
 * Script clássico: compartilha o escopo global com os demais módulos (carregados em ordem pelo index.html).
 * As instruções soltas (ligação de eventos e renders iniciais) rodam em PeppeGuard.step(): se uma falhar,
 * o erro é registrado em Ajustes > Diagnóstico e o resto do módulo continua.
 */
"use strict";
PeppeGuard.mod("pdf");

/* ================= Relatório em PDF ================= */
const JSPDF_URL = "vendor/jspdf.umd.min.js";
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.onload = res; s.onerror = () => rej(Error("load"));
    setTimeout(() => rej(Error("timeout")), 15000);
    document.head.append(s);
  });
}
async function getJsPdf() {
  if (!(window.jspdf && window.jspdf.jsPDF)) await loadScript(JSPDF_URL);
  if (!(window.jspdf && window.jspdf.jsPDF)) throw Error("jspdf");
  return window.jspdf.jsPDF;
}
function buildReportSpec() {
  const now = new Date(), s = C.batchSummary(batch, now), rows = C.batchRows(batch, now);
  const num = new Map(rows.map((r, i) => [r.key, i + 1]));
  const lv = a => t("lvl_" + a.level), lvKey = a => (a.level === "info" ? undefined : a.level);
  const blocks = [
    { type: "title", title: t("pdf_title"), subtitle: t("pdf_batch", { n: batch.name || t("pdf_unnamed") }), meta: t("pdf_generated", { d: now.toLocaleString(LANGTAG[lang]) }) },
    { type: "heading", text: t("pdf_sec_summary") },
    { type: "kv", items: [
      { label: t("bs_items"), value: String(s.distinct) }, { label: t("bs_reads"), value: String(s.reads) },
      { label: t("bs_pay", { n: s.payCount }), value: fmtMoney(s.payTotal) }, { label: t("bs_units"), value: String(s.units) },
      { label: t("bs_alerts"), value: String(s.alerts) }, { label: t("bs_due"), value: s.nextDue ? fmtDate(s.nextDue) : t("bs_none") }] }
  ];
  if (s.dups) blocks.push({ type: "callout", level: "warn", text: t("batch_warn_dups", { n: s.dups }) });
  if (s.overdue) blocks.push({ type: "callout", level: "warn", text: t("batch_warn_overdue", { n: s.overdue }) });
  if (s.bad) blocks.push({ type: "callout", level: "bad", text: t("batch_warn_bad", { n: s.bad }) });

  const alerts = rows.filter(r => r.a.level === "warn" || r.a.level === "bad");
  if (alerts.length) blocks.push({ type: "heading", text: t("pdf_sec_alerts") + " (" + alerts.length + ")" },
    { type: "table", empty: t("pdf_empty"), cols: [{ title: t("col_num"), w: .07 }, { title: t("col_type"), w: .2 }, { title: t("col_status"), w: .16, level: true }, { title: t("col_reason"), w: .57, maxLines: 5 }],
      rows: alerts.map(r => ({ cells: [String(num.get(r.key)), kindLabel(r.info.kind), lv(r.a), r.a.reasons.filter(x => x.level !== "ok").map(x => t(x.key, x.params)).join(" ")], level: lvKey(r.a), sub: r.item.value })) });

  const pay = rows.filter(C.isPay);
  if (pay.length) blocks.push({ type: "heading", text: t("pdf_sec_pay") + " (" + pay.length + ")" },
    { type: "table", empty: t("pdf_empty"), cols: [{ title: t("col_num"), w: .06 }, { title: t("col_type"), w: .17 }, { title: t("col_party"), w: .26 }, { title: t("col_amount"), w: .14, align: "right" }, { title: t("col_due"), w: .13 }, { title: t("col_status"), w: .15, level: true }, { title: t("col_qty"), w: .09, align: "right" }],
      rows: pay.map(r => {
        const d = r.info.data, k = r.info.kind;
        const party = k === "boleto" ? (d.bank + " " + (d.bankName || "")).trim() : k === "pix" ? [d.name, d.city].filter(Boolean).join(" - ") : "-";
        const amount = k === "boleto" ? fmtMoney(d.amount) : k === "pix" && d.amount ? fmtMoney(Number(d.amount)) : "-";
        return { cells: [String(num.get(r.key)), kindLabel(k), party || "-", amount, k === "boleto" && d.due ? fmtDate(d.due) : "-", lv(r.a), String(r.item.count)], level: lvKey(r.a), sub: r.item.value };
      }) });

  const prod = rows.filter(C.isProduct);
  if (prod.length) blocks.push({ type: "heading", text: t("pdf_sec_products") + " (" + prod.length + ")" },
    { type: "table", empty: t("pdf_empty"), cols: [{ title: t("col_num"), w: .07 }, { title: t("col_code"), w: .36, mono: true, maxLines: 2 }, { title: t("col_type"), w: .18 }, { title: t("col_format"), w: .17 }, { title: t("col_status"), w: .13, level: true }, { title: t("col_qty"), w: .09, align: "right" }],
      rows: prod.map(r => ({ cells: [String(num.get(r.key)), r.item.value, kindLabel(r.info.kind), r.item.format ? C.formatLabel(r.item.format) : "-", lv(r.a), String(r.item.count)], level: lvKey(r.a) })) });

  const other = rows.filter(r => !C.isPay(r) && !C.isProduct(r));
  if (other.length) blocks.push({ type: "heading", text: t("pdf_sec_other") + " (" + other.length + ")" },
    { type: "table", empty: t("pdf_empty"), cols: [{ title: t("col_num"), w: .07 }, { title: t("col_type"), w: .3 }, { title: t("col_status"), w: .2, level: true }, { title: t("col_qty"), w: .1, align: "right" }, { title: t("col_format"), w: .33 }],
      rows: other.map(r => ({ cells: [String(num.get(r.key)), kindLabel(r.info.kind), lv(r.a), String(r.item.count), r.item.format ? C.formatLabel(r.item.format) : "-"], level: lvKey(r.a), sub: r.item.value })) });

  if (expected.items.length) {
    const rep = C.inventoryReport(batch, expected, now), T = rep.totals;
    blocks.push({ type: "heading", text: t("pdf_sec_inv") },
      { type: "kv", items: [{ label: t("is_expected"), value: String(T.expectedItems) }, { label: t("is_ok"), value: String(T.ok) }, { label: t("is_div"), value: String(T.divergences) },
        { label: t("bs_units"), value: T.countedUnits + " / " + T.expectedUnits }, { label: t("is_extra"), value: String(T.extra) }, { label: t("bs_reads"), value: String(T.countedUnits + T.extraUnits) }] },
      { type: "table", empty: t("pdf_empty"), cols: [{ title: t("col_code"), w: .27, mono: true, maxLines: 2 }, { title: t("col_desc"), w: .29 }, { title: t("col_expected"), w: .13, align: "right" }, { title: t("col_counted"), w: .13, align: "right" }, { title: t("col_status"), w: .18, level: true }],
        rows: rep.rows.map(r => ({ cells: [r.code, r.desc || "-", String(r.expected), String(r.counted), stLabel(r.status) + (r.diff ? " (" + signed(r.diff) + ")" : "")], level: stLevel(r.status) })) });
  }
  return { meta: { title: t("pdf_title") + " - " + (batch.name || t("pdf_unnamed")), subject: "Leitor QR - Peppe" },
    footer: { left: "Leitor QR - Peppe v" + APP_VERSION, disclaimer: t("pdf_disclaimer"), page: t("pdf_page", { p: "{p}", n: "{n}" }) }, blocks };
}
async function makePdfBlob() {
  const JsPDF = await getJsPdf();
  return window.PeppeReport.build(JsPDF, buildReportSpec()).output("blob");
}
const pdfName = () => "relatorio-lote-" + (C.stripAccents(batch.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "lote") + "-" + stamp() + ".pdf";
async function runPdf(share) {
  if (!batchCount()) { toast(t("batch_empty")); return; }
  const btn = $(share ? "batchPdfShare" : "batchPdf");
  btn.disabled = true; toast(t("pdf_working"));
  try {
    const blob = await makePdfBlob();
    if (share) {
      const file = new File([blob], pdfName(), { type: "application/pdf" });
      try { await navigator.share({ files: [file], title: t("pdf_title") + " - " + (batch.name || "") }); } catch {}
    } else { downloadBlob(blob, pdfName()); toast(t("pdf_done")); }
  } catch (e) { console.warn("PDF", e); toast(t("pdf_fail")); }
  finally { btn.disabled = false; }
}
PeppeGuard.step("pdf#1", () => {
$("batchPdf").onclick = () => runPdf(false);
$("batchPdfShare").onclick = () => runPdf(true);
try { if (navigator.canShare && navigator.canShare({ files: [new File(["x"], "a.pdf", { type: "application/pdf" })] })) $("batchPdfShare").classList.remove("hidden"); } catch {}
});
