/* Leitor QR - Peppe · js/diag.js
 * Ajustes > Diagnóstico: mostra quais módulos carregaram e os erros registrados pelo PeppeGuard.
 * Depende de: guard.js, base.js
 */
"use strict";
PeppeGuard.mod("diag");

function renderDiag() {
  const g = PeppeGuard;
  $("diagText").textContent = (g.errors.length ? t("diag_err_n", { n: g.errors.length }) + "\n" + g.errors.map(e => "• " + e.where + ": " + e.msg).join("\n")
    : t("diag_ok", { n: g.mods.length })) + "\n\n" + t("diag_mods") + " " + g.mods.join(", ");
}
PeppeGuard.step("diag#1", () => {
  PeppeGuard.onLog = renderDiag;
  $("diagCopy").onclick = () => copyText(PeppeGuard.report(), t("diag_copied"));
  renderDiag();
});
