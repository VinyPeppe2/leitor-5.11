/* Leitor QR - Peppe · js/pix.js
 * Pix: dados salvos, máscaras, cobranças e WhatsApp.
 * Depende de: base.js, result.js
 * Script clássico: compartilha o escopo global com os demais módulos (carregados em ordem pelo index.html).
 * As instruções soltas (ligação de eventos e renders iniciais) rodam em PeppeGuard.step(): se uma falhar,
 * o erro é registrado em Ajustes > Diagnóstico e o resto do módulo continua.
 */
"use strict";
PeppeGuard.mod("pix");

/* ================= Pix ================= */
let pixProfile = jget("peppe-pixprofile", null);
PeppeGuard.step("pix#1", () => {
if (!pixProfile || typeof pixProfile.key !== "string" || !pixProfile.key) pixProfile = null;
});

let charges = jget("peppe-charges", []);
PeppeGuard.step("pix#2", () => {
if (!Array.isArray(charges)) charges = [];
charges = charges.filter(c => c && typeof c.id === "string" && Number.isFinite(c.amount)).slice(0, C.CHARGE_CAP);
});

const saveCharges = () => jset("peppe-charges", charges);
let pixShowKey = false, pixEditing = false, pixCharge = null;
const pixUsingProfile = () => !!pixProfile && !pixEditing;
const pixData = () => pixUsingProfile() ? pixProfile : { key: C.normalizePixKey($("pixKey").value), name: $("pixName").value, city: $("pixCity").value };
function renderPixProfile() {
  const has = pixUsingProfile();
  $("pixProfile").classList.toggle("hidden", !has);
  $("pixFields").classList.toggle("hidden", has);
  if (!has) return;
  $("ppName").textContent = pixProfile.name + " · " + pixProfile.city;
  $("ppKind").textContent = t("pk_" + (C.pixKeyKind(pixProfile.key) || "unknown"));
  $("ppKey").textContent = pixShowKey ? pixProfile.key : C.maskPixKey(pixProfile.key);
  $("ppEye").textContent = t(pixShowKey ? "pp_hide" : "pp_show"); $("ppEye").setAttribute("aria-pressed", String(pixShowKey));
}
PeppeGuard.step("pix#3", () => {
$("ppEye").onclick = () => { pixShowKey = !pixShowKey; renderPixProfile(); };
$("ppEdit").onclick = () => {
  const kind = C.pixKeyKind(pixProfile.key);
  pixEditing = true; $("pixKeyType").value = { email: "email", phone: "phone", cnpj: "cnpj", evp: "evp", cpf_phone: "cpf" }[kind] || "auto";
  $("pixKey").value = pixProfile.key; $("pixName").value = pixProfile.name; $("pixCity").value = pixProfile.city; $("pixSave").checked = true;
  applyKeyType(); renderPixProfile();
};
$("ppDelete").onclick = () => {
  if (!confirm(t("pp_delete_confirm"))) return;
  pixProfile = null; pixEditing = false; pixShowKey = false;
  try { localStorage.removeItem("peppe-pixprofile"); } catch {}
  ["pixKey", "pixName", "pixCity"].forEach(i => { $(i).value = ""; }); $("pixKeyType").value = "auto"; applyKeyType();
  renderPixProfile(); toast(t("pp_deleted"));
};
});

const KEYPH = { cpf: "000.000.000-00", cnpj: "00.000.000/0000-00", phone: "(11) 99999-0000", email: "nome@email.com", evp: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" };
const KEYMODE = { cpf: "numeric", cnpj: "numeric", phone: "tel", email: "email", evp: "text", auto: "text" };
function pixKeyHint() {
  const ty = $("pixKeyType").value, v = $("pixKey").value, d = v.replace(/\D/g, "");
  if (ty === "cpf" && d.length === 11) return t(C.cpfValid(d) ? "kv_cpf_ok" : "kv_cpf_bad");
  if (ty === "cnpj" && d.length === 14) return t(C.cnpjValid(d) ? "kv_cnpj_ok" : "kv_cnpj_bad");
  const kind = C.pixKeyKind(C.normalizePixKey(v));
  return ty === "auto" && kind ? t("pixkey_" + kind) : "";
}
function applyKeyType() {
  const ty = $("pixKeyType").value;
  $("pixKey").placeholder = KEYPH[ty] || t("pix_key_ph");
  $("pixKey").inputMode = KEYMODE[ty] || "text";
  $("pixKey").value = C.keyMask(ty, $("pixKey").value);
  $("pixKeyHint").textContent = pixKeyHint();
}
PeppeGuard.step("pix#4", () => {
$("pixKeyType").onchange = applyKeyType;
$("pixKey").oninput = () => {
  const ty = $("pixKeyType").value;
  if (ty !== "auto") { const m = C.keyMask(ty, $("pixKey").value); if (m !== $("pixKey").value) $("pixKey").value = m; }
  $("pixKeyHint").textContent = pixKeyHint();
};
$("pixAmount").oninput = () => { const m = C.moneyMask($("pixAmount").value); if (m !== $("pixAmount").value) $("pixAmount").value = m; };
$("pixPhone").oninput = () => { const m = C.phoneMask($("pixPhone").value); if (m !== $("pixPhone").value) $("pixPhone").value = m; };
});

const fmtDateTime = iso => new Date(iso).toLocaleString(LANGTAG[lang], { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const fmtHM = m => { const h = Math.floor(m / 60), mm = m % 60; return h ? h + " h" + (mm ? " " + String(mm).padStart(2, "0") + " min" : "") : mm + " min"; };
// Identificador automático (txid do Pix): PEP + AAMMDD + nº do dia. Mantém a contagem neste aparelho.
function nextRef() {
  const now = new Date(), day = C.chargeRef(now, 1).slice(0, 9), s = jget("peppe-chargeseq", {});
  const n = (s && s.d === day ? Number(s.n) || 0 : 0) + 1;
  jset("peppe-chargeseq", { d: day, n });
  return C.chargeRef(now, n);
}
function waText(c) {
  return t("wa_msg", {
    amount: fmtMoney(c.amount), desc: c.desc ? t("wa_desc", { x: c.desc }) : "", code: c.payload, name: c.name || "", key: c.key || "",
    ref: c.ref ? t("wa_ref", { r: c.ref }) : "", due: c.due ? t("wa_due", { d: fmtDate(c.due, true) }) : "",
    valid: c.expiresAt ? t("wa_valid", { d: fmtDateTime(c.expiresAt) }) : ""
  });
}
function sendWa(c) {
  const url = C.waLink(c.phone, waText(c));
  const w = window.open(url, "_blank");   // com "noopener" o retorno é sempre nulo; por isso zeramos o opener depois
  try { if (w) w.opener = null; } catch {}
}
PeppeGuard.step("pix#5", () => {

$("makePix").onclick = () => {
  const { key, name, city } = pixData();
  const rawAmt = $("pixAmount").value.trim(), amount = C.moneyParse(rawAmt), typedTxid = $("pixTxid").value.trim();
  if (!key || !C.sanitizePixText(name, 25) || !C.sanitizePixText(city, 15)) { toast(t("pix_fill")); return; }
  const kty = $("pixKeyType").value;
  if (!pixUsingProfile() && ((kty === "cpf" && !C.cpfValid(key)) || (kty === "cnpj" && !C.cnpjValid(key)))) { toast(t(kty === "cpf" ? "kv_cpf_bad" : "kv_cnpj_bad")); return; }
  if (rawAmt && !amount) { toast(t("pix_amount_invalid")); return; }
  if (typedTxid && typedTxid !== "***" && !/^[A-Za-z0-9]{1,25}$/.test(typedTxid)) { toast(t("pix_txid_invalid")); return; }
  const txid = typedTxid || nextRef();
  try {
    pixPayload = C.buildPix(key, name, city, amount, txid);
    const check = C.parsePix(pixPayload);
    if (!check || !check.crcOk) throw Error("pix self-check");
    makeQr(pixPayload, $("pixOutput"), 256, "M", "#000000", "#ffffff");
    $("pixPayload").textContent = pixPayload; $("pixPayload").classList.remove("hidden");
    $("copyPix").disabled = false; $("downloadPix").disabled = false; $("pixWa").disabled = false;
    if (!pixUsingProfile() && $("pixSave").checked) {
      pixProfile = { key, name: C.sanitizePixText(name, 25), city: C.sanitizePixText(city, 15) };
      jset("peppe-pixprofile", pixProfile); pixEditing = false; pixShowKey = false; renderPixProfile(); toast(t("pp_saved"));
    } else toast(t("pix_created"));
    // registra a cobrança na lista (precisa de valor); o QR e o botão do WhatsApp sempre funcionam
    pixCharge = C.newCharge({ amount, desc: $("pixDesc").value, due: $("pixDue").value, phone: $("pixPhone").value, payload: pixPayload, validityHours: $("pixValid").value, ref: txid });
    pixCharge.name = C.sanitizePixText(name, 25); pixCharge.key = key;
    if (pixCharge.amount > 0) { charges.unshift(pixCharge); charges = charges.slice(0, C.CHARGE_CAP); saveCharges(); renderCharges(); }
    else toast(t("pix_need_amount"));
  } catch (e) { toast(String(e.message || e)); }
};
$("copyPix").onclick = () => copyText(pixPayload, t("pix_copied"));
$("downloadPix").onclick = () => downloadTarget($("pixOutput"), "pix-leitor-qr-peppe.png");
$("pixWa").onclick = () => { if (pixCharge) sendWa(pixCharge); };
});

function chargeStatus(c) {
  const s = C.chargeState(c);
  const text = s.state === "received" ? t("ch_st_received") : s.state === "overdue" ? t("ch_st_overdue", { n: -s.days }) : s.state === "today" ? t("ch_st_today")
    : s.state === "valid" ? t("ch_st_valid", { t: fmtHM(s.minutes), u: fmtDateTime(c.expiresAt) }) : s.state === "expired" ? t("ch_st_expired", { t: fmtHM(s.minutes) })
    : s.state === "scheduled" ? t("ch_st_scheduled", { d: fmtDate(c.due), n: s.days }) : t("ch_st_pending");
  return pill(s.state === "received" ? "ok" : s.state === "overdue" || s.state === "expired" ? "bad" : "warn", text);
}
function renderCharges() {
  const f = $("chFilter").value, list = charges.filter(c => f === "all" || (f === "received") === !!c.received);
  const s = C.chargesSummary(charges);
  $("chSummary").textContent = t("ch_sum", { p: fmtMoney(s.pending), np: s.nPending, r: fmtMoney(s.received), nr: s.nReceived, over: s.nOverdue ? t("ch_sum_over", { n: s.nOverdue }) : "" });
  $("chList").replaceChildren();
  if (!list.length) { $("chList").append(el("p", { class: "hint", text: t("ch_empty") })); return; }
  list.forEach(c => {
    const act = (txt, fn) => el("button", { class: "small", type: "button", text: txt, onclick: fn });
    $("chList").append(el("div", { class: "batch-item charge" },
      el("div", { class: "charge-top" }, el("b", { text: c.desc || t("ch_noname") }), el("b", { text: fmtMoney(c.amount) })),
      el("div", null, chargeStatus(c), " ", el("span", { class: "hint", text: t("ch_created", { d: new Date(c.ts).toLocaleDateString(LANGTAG[lang]) }) + (c.ref ? " · " + t("ch_ref", { r: c.ref }) : "") })),
      el("div", { class: "actions" },
        act(t(c.received ? "ch_unmark" : "ch_mark"), () => { c.received = !c.received; c.receivedAt = c.received ? new Date().toISOString() : ""; saveCharges(); renderCharges(); }),
        c.payload ? act(t("ch_wa"), () => sendWa(c)) : null,
        c.payload ? act(t("ch_copy"), () => copyText(c.payload, t("pix_copied"))) : null,
        act(t("ch_del"), () => { if (!confirm(t("ch_del_confirm"))) return; charges = charges.filter(x => x !== c); saveCharges(); renderCharges(); }))));
  });
}
PeppeGuard.step("pix#6", () => {
$("chFilter").onchange = renderCharges;
renderPixProfile(); renderCharges();
});
