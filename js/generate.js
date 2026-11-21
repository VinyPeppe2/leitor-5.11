/* Leitor QR - Peppe · js/generate.js
 * Gerador de QR Code e códigos de barras.
 * Depende de: base.js
 * Script clássico: compartilha o escopo global com os demais módulos (carregados em ordem pelo index.html).
 * As instruções soltas (ligação de eventos e renders iniciais) rodam em PeppeGuard.step(): se uma falhar,
 * o erro é registrado em Ajustes > Diagnóstico e o resto do módulo continua.
 */
"use strict";
PeppeGuard.mod("generate");

/* ================= Gerador (QR e códigos de barras) ================= */
let logoData = null, pixPayload = "";
function makeQr(text, target, size, level, dark, light) {
  if (!window.QRCode) throw Error("QRCode lib");
  target.replaceChildren();
  const holder = document.createElement("div");
  target.append(holder);
  new QRCode(holder, { text, width: size, height: size, colorDark: dark, colorLight: light, correctLevel: QRCode.CorrectLevel[level] });
  return holder;
}
const canvasOf = target => target.querySelector("canvas");
async function withLogo(canvas) {
  if (!logoData) return canvas;
  const out = document.createElement("canvas");
  out.width = canvas.width; out.height = canvas.height;
  const ctx = out.getContext("2d");
  ctx.drawImage(canvas, 0, 0);
  const img = await createImageBitmap(logoData);
  const w = out.width * .2, h = w * img.height / img.width, x = (out.width - w) / 2, y = (out.height - h) / 2;
  ctx.fillStyle = "#fff"; ctx.fillRect(x - 5, y - 5, w + 10, h + 10);
  ctx.drawImage(img, x, y, w, h);
  return out;
}
const BC_HINT = { EAN13: "bc_hint_EAN13", EAN8: "bc_hint_EAN8", UPC: "bc_hint_UPC", ITF: "bc_hint_ITF", CODE128: "bc_hint_CODE128", CODE39: "bc_hint_CODE39" };
function updateGenUi() {
  const ty = $("genType").value, isQr = ty === "qr";
  $("qrOpts").classList.toggle("hidden", !isQr); $("logoField").classList.toggle("hidden", !isQr);
  $("bcOpts").classList.toggle("hidden", isQr); $("bcTextWrap").classList.toggle("hidden", isQr);
  $("bcHint").classList.toggle("hidden", isQr);
  if (!isQr) $("bcHint").textContent = t(BC_HINT[ty]);
}
PeppeGuard.step("generate#1", () => {
$("genType").onchange = updateGenUi;
$("logoInput").onchange = e => { logoData = e.target.files[0] || null; $("logoName").textContent = logoData ? logoData.name : t("logo_none"); };
$("makeQr").onclick = async () => {
  const s = $("qrText").value.trim();
  if (!s) { toast(t("toast_need_text")); return; }
  const ty = $("genType").value;
  try {
    if (ty === "qr") {
      let level = $("qrLevel").value;
      if (logoData && (level === "L" || level === "M")) { level = "H"; $("qrLevel").value = "H"; toast(t("toast_ecc_logo")); }
      makeQr(s, $("qrOutput"), Number($("qrSize").value), level, $("qrDark").value, $("qrLight").value);
      const c = canvasOf($("qrOutput"));
      if (c && logoData) $("qrOutput").replaceChildren(await withLogo(c));
    } else {
      if (!window.JsBarcode) throw Error("JsBarcode lib");
      const canvas = document.createElement("canvas");
      JsBarcode(canvas, s, { format: ty, width: Number($("bcWidth").value), height: Number($("bcHeight").value), displayValue: $("bcText").checked, margin: 14, lineColor: $("qrDark").value, background: $("qrLight").value, fontSize: 16 });
      $("qrOutput").replaceChildren(canvas);
    }
    $("downloadQr").disabled = false; $("copyQr").disabled = false;
    toast(t("toast_created"));
  } catch (e) {
    toast(ty === "qr" ? t("err_toolong") : t("err_barcode"));
  }
};
});

function downloadTarget(target, name) {
  const c = canvasOf(target);
  if (!c) return;
  const a = document.createElement("a");
  a.href = c.toDataURL("image/png"); a.download = name; a.click();
}
PeppeGuard.step("generate#2", () => {
$("downloadQr").onclick = () => downloadTarget($("qrOutput"), "leitor-qr-peppe.png");
$("copyQr").onclick = async () => {
  try {
    const c = canvasOf($("qrOutput")), blob = await new Promise(r => c.toBlob(r));
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    toast(t("toast_img_copied"));
  } catch { toast(t("toast_img_unsupported")); }
};
});
