/* Leitor QR - Peppe · js/result.js
 * Resultado da leitura: veredito, ações, avisos por voz, sinais e consulta de produto/livro.
 * Depende de: base.js
 * Script clássico: compartilha o escopo global com os demais módulos (carregados em ordem pelo index.html).
 * As instruções soltas (ligação de eventos e renders iniciais) rodam em PeppeGuard.step(): se uma falhar,
 * o erro é registrado em Ajustes > Diagnóstico e o resto do módulo continua.
 */
"use strict";
PeppeGuard.mod("result");

/* ================= Resultado ================= */
let current = "", currentFmt = "", currentInfo = null, autoTimer = null;
const isSaved = s => libraryItems.some(x => x.value === s);
const kindLabel = k => t("kind_" + k);
function badgeText(info, fmt) {
  const label = kindLabel(info.kind);
  return fmt ? C.formatLabel(fmt) + " · " + label : label;
}
function row(dl, label, val) {
  if (val == null || val === "") return;
  dl.append(el("dt", { text: label }), el("dd", null, val));
}
const pill = (cls, text) => el("span", { class: "pill " + cls, text });
function buildInfo(info) {
  const d = info.data, dl = el("dl"), extra = [];
  switch (info.kind) {
    case "pix":
      if (d.dynamic) { row(dl, t("lbl_charge"), t("pix_dynamic")); row(dl, t("lbl_host"), hostOf(d.url)); }
      else row(dl, t("lbl_key"), d.key);
      row(dl, t("lbl_receiver"), d.name);
      row(dl, t("lbl_city"), d.city);
      row(dl, t("lbl_amount"), d.amount ? fmtMoney(Number(d.amount)) : t("lbl_none"));
      if (!d.dynamic) row(dl, t("lbl_txid"), d.txid);
      row(dl, t("lbl_check"), pill(d.crcOk ? "ok" : "bad", t(d.crcOk ? "pix_crc_ok" : "pix_crc_bad")));
      break;
    case "url":
      row(dl, t("lbl_host"), el("b", { text: d.host }));
      break;
    case "wifi":
      row(dl, t("lbl_network"), d.ssid);
      row(dl, t("lbl_security"), d.auth && d.auth !== "nopass" ? d.auth : t("lbl_open_net"));
      row(dl, t("lbl_password"), d.password);
      if (d.hidden) row(dl, t("lbl_hidden"), t("lbl_yes"));
      break;
    case "vcard":
      row(dl, t("lbl_name"), d.name); row(dl, t("lbl_org"), d.org);
      row(dl, t("lbl_phone"), d.phones.join(", ")); row(dl, t("lbl_email"), d.emails.join(", ")); row(dl, t("lbl_site"), d.url);
      break;
    case "boleto":
      row(dl, t("lbl_bank"), (d.bank + " " + (d.bankName || "")).trim());
      row(dl, t("lbl_amount"), fmtMoney(d.amount));
      row(dl, t("lbl_due"), d.due ? fmtDate(d.due) : t("lbl_nodue"));
      row(dl, t("lbl_check"), pill(d.dvOk ? "ok" : "bad", t(d.dvOk ? "dv_ok" : "dv_bad")));
      break;
    case "gtin": case "isbn":
      row(dl, t("lbl_type"), d.type);
      row(dl, t("lbl_check"), pill(d.valid ? "ok" : "bad", t(d.valid ? "dv_ok" : "dv_bad")));
      if (d.brazil) row(dl, t("lbl_country"), t("lbl_br"));
      break;
    case "nfe":
      row(dl, t("lbl_check"), pill("ok", t("dv_ok")));
      break;
    default: return null;
  }
  const box = el("div", { class: "info-box" });
  if (dl.children.length) box.append(dl);
  extra.forEach(x => box.append(x));
  return box.children.length ? box : null;
}
function renderVerdict(info) {
  const box = $("verdict"), a = C.assess(info);
  box.replaceChildren();
  if (a.level === "info") { box.className = "verdict hidden"; return a; }
  box.className = "verdict " + a.level;
  box.append(el("b", { text: t("v_" + a.level) }), el("ul", null, a.reasons.map(r => el("li", { text: t(r.key, r.params) }))));
  return a;
}
function handoff(info, bank) {
  const text = info.kind === "boleto" ? C.barcodeToLinha(info.data.barcode) : current;
  let p;
  try { p = navigator.clipboard.writeText(text); } catch { p = Promise.reject(); }
  const mode = settings.bankOpen || "copy";
  const intent = bank && mode === "app" && /android/i.test(navigator.userAgent) ? C.bankAppIntent(bank) : "";
  if (intent) {
    // Android: tenta abrir o app instalado; se a página continuar à vista, o app não abriu e vai para o site oficial.
    let left = false; const onVis = () => { if (document.hidden) left = true; };
    document.addEventListener("visibilitychange", onVis);
    window.open(intent, "_blank");
    setTimeout(() => {
      document.removeEventListener("visibilitychange", onVis);
      if (!left && !document.hidden) { window.open(bank.url, "_blank", "noopener,noreferrer"); toast(t("bank_app_fail", { bank: bank.name })); }
    }, 1800);
    p.then(() => { toast(t("bank_app_try", { bank: bank.name }), 3500); say(t("say_bank_app", { bank: bank.name })); }).catch(() => toast(t("copyFail")));
    return;
  }
  const openSite = !!bank && (mode === "site" || mode === "app");   // só o site oficial, sem enviar dados
  if (openSite) window.open(bank.url, "_blank", "noopener,noreferrer");
  p.then(() => {
    if (bank && !openSite) { toast(t("bank_copy_only", { bank: bank.name }), 3500); say(t("say_bank_copy_only", { bank: bank.name })); return; }
    toast(t("bank_copied")); say(bank ? t("say_bank_open", { bank: bank.name }) : t("say_bank_copied"));
  }).catch(() => toast(t("copyFail")));
}
function renderExtra(info) {
  const wrap = $("extraActions");
  wrap.replaceChildren();
  if (info.kind === "wifi" && info.data.password) {
    wrap.append(el("button", {
      text: t("copy_pass"),
      onclick: async () => { try { await navigator.clipboard.writeText(info.data.password); toast(t("pass_copied")); } catch { toast(t("copyFail")); } }
    }));
  }
  if ((info.kind === "pix" || info.kind === "boleto") && C.assess(info).level !== "bad") {
    const bank = C.BANK_SITES.find(b => b.id === settings.bank);
    wrap.append(el("button", { class: "primary", text: bank ? t(settings.bankOpen === "app" || settings.bankOpen === "site" ? "bank_open" : "bank_copy_btn", { bank: bank.name }) : t("bank_copy"), onclick: () => handoff(info, bank) }));
  }
  if (info.kind === "vcard") {
    wrap.append(el("button", {
      text: t("download_vcard"),
      onclick: () => downloadBlob(new Blob([current], { type: "text/vcard" }), "contato.vcf")
    }));
  }
}
function showResult(s, add = true, fmt = "") {
  if (!s) return null;
  cancelAuto();
  current = s; currentFmt = fmt || "";
  const info = currentInfo = C.classify(s, fmt);
  $("empty").classList.add("hidden");
  $("result").classList.add("show");
  $("resultText").textContent = s;
  $("resultType").textContent = badgeText(info, fmt);
  $("saveCodeBtn").textContent = t(isSaved(s) ? "saved" : "save");
  const can = canOpen(s);
  $("openBtn").disabled = !can;
  $("openHint").textContent = t(can ? "open_hint_ok" : "open_hint_no");
  const lookable = info.kind === "gtin" || info.kind === "isbn";
  $("lookupBtn").classList.toggle("hidden", !lookable);
  $("lookupBtn").textContent = t(info.kind === "isbn" ? "lookup_book" : "lookup");
  $("productInfo").replaceChildren();
  $("infoBox").replaceChildren();
  renderVerdict(info);
  $("editBox").classList.add("hidden");
  const box = buildInfo(info);
  if (box) $("infoBox").append(box);
  renderExtra(info);
  if (add && !historyItems.some(x => x.value === s)) {
    historyItems.unshift({ value: s, format: fmt || "", time: new Date().toISOString() });
    historyItems = historyItems.slice(0, 100);
    saveHistory(); renderHistory(); updateStats();
  }
  return info;
}
/* ---- abrir link (manual e automático) ---- */
function doOpen(s) {
  if (/^https?:\/\//i.test(s)) window.open(s, "_blank", "noopener,noreferrer");
  else if (canOpen(s)) location.href = s;
}
function cancelAuto() {
  clearInterval(autoTimer); autoTimer = null;
  $("autoBar").classList.add("hidden");
}
function maybeAutoOpen(s, info) {
  cancelAuto();
  if (!settings.autoOpen || isCont()) return false;
  if (info.kind !== "url" || info.data.flags.length || info.data.protocol !== "https:") return false;
  let n = 3;
  $("autoBar").classList.remove("hidden");
  $("autoTxt").textContent = t("autoopen_in", { n });
  autoTimer = setInterval(() => {
    n--;
    if (n <= 0) { cancelAuto(); say(t("say_opening")); location.assign(s); }
    else $("autoTxt").textContent = t("autoopen_in", { n });
  }, 1000);
  return true;
}
PeppeGuard.step("result#1", () => {
$("autoCancel").onclick = cancelAuto;
});

/* ---- detalhes falados e mostrados em aviso (nome, chave, banco, vencimento) ---- */
const keyKindLabel = k => t("pk_" + (C.pixKeyKind(k) || "unknown"));
function dueText(iso) {
  const n = C.daysUntil(iso);
  if (n === null) return "";
  return n < 0 ? t("due_over", { n: -n }) : n === 0 ? t("due_today") : t("due_in", { n });
}
function duePhrase(iso) {
  const n = C.daysUntil(iso);
  return n === null ? "" : n < 0 ? t("say_due_over", { n: -n }) : n === 0 ? t("say_due_today") : t("say_due_in", { n });
}
function fullPix(d) {
  return t("say_full_pix", {
    name: d.name || "-", city: d.city || "-", key: d.key ? t("say_full_key", { kind: keyKindLabel(d.key) }) : "",
    amount: d.amount ? t("say_amount", { v: fmtMoney(Number(d.amount)) }) : ""
  });
}
function fullBoleto(d) {
  return t("say_full_boleto", {
    bank: d.bankName ? t("say_bank", { b: d.bankName }) : "", amount: t("say_amount", { v: fmtMoney(d.amount) }),
    due: d.due ? t("say_due", { d: fmtDate(d.due, true) }) + duePhrase(d.due) : ""
  });
}
function scanFacts(info) {
  const d = info.data, L = [];
  if (info.kind === "pix" && d.crcOk) {
    if (d.name) L.push([t("ft_receiver"), d.name + (d.city ? " · " + d.city : "")]);
    if (d.key) L.push([t("ft_key"), keyKindLabel(d.key) + " " + C.maskPixKey(d.key)]);
    else if (d.url) L.push([t("ft_psp"), hostOf(d.url)]);
    L.push([t("ft_amount"), d.amount ? fmtMoney(Number(d.amount)) : t("ft_open_amount")]);
    L.push([t("ft_due"), t("ft_nodue")]);
  } else if (info.kind === "boleto" && d.dvOk) {
    L.push([t("ft_bank"), d.bankName || d.bank]);
    L.push([t("ft_amount"), fmtMoney(d.amount)]);
    L.push([t("ft_due"), d.due ? fmtDate(d.due) + " (" + dueText(d.due) + ")" : t("ft_nodue_boleto")]);
  }
  return L;
}
function showScanToast(info) {
  if (isCont()) return;
  const L = scanFacts(info);
  if (L.length) toast(L.map(([k, v]) => k + ": " + v).join("\n"), 7000);
}
/* ---- avisos por voz após a leitura ---- */
function announce(info, auto) {
  const d = info.data;
  let m;
  switch (info.kind) {
    case "url":
      if (d.brand) { m = t("say_read_url_brand", { brand: d.brand }); break; }
      m = t(d.flags.length ? "say_read_url_warn" : "say_read_url", { host: d.host }); if (auto) m += " " + t("say_will_open"); break;
    case "file": case "script": case "applink": case "otp": case "crypto": m = t("say_read_odd", { kind: kindLabel(info.kind) }); break;
    case "pix": if (d.crcOk && settings.speakLevel === "full") { m = fullPix(d); break; }
      m = d.crcOk ? t("say_read_pix", { amount: d.amount ? t("say_amount", { v: fmtMoney(Number(d.amount)) }) : "" }) : t("say_read_pix_bad"); break;
    case "boleto": if (d.dvOk && settings.speakLevel === "full") { m = fullBoleto(d); break; }
      m = d.dvOk ? t("say_read_boleto", { amount: t("say_amount", { v: fmtMoney(d.amount) }), due: d.due ? t("say_due", { d: fmtDate(d.due, true) }) : "" }) : t("say_read_boleto_bad"); break;
    case "gtin": m = t("say_read_gtin"); break;
    case "isbn": m = t("say_read_isbn"); break;
    case "wifi": m = t("say_read_wifi", { ssid: d.ssid }); break;
    case "vcard": m = t("say_read_vcard"); break;
    case "nfe": m = t("say_read_nfe"); break;
    case "utility": m = t("say_read_utility"); break;
    default: m = t("say_read_text");
  }
  say(m);
}
/* ---- sinais sonoros e vibração ---- */
let audioCtx = null;
function beep(freq) {
  if (!settings.beep) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = audioCtx || new AC();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = freq || 880; g.gain.value = .05;
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + .09);
  } catch {}
}
function feedback() {
  if (settings.vibrate) { try { navigator.vibrate?.([90, 45, 90]); } catch {} }
  beep();
}
function handleScan(text, fmt) {
  if (settings.batchMode) { batchRead(text, fmt); return null; }
  const info = showResult(text, true, fmt);
  feedback();
  if (!isCont() && window.innerWidth <= 760) { try { $("resultPanel").scrollIntoView({ behavior: "smooth", block: "start" }); } catch {} }
  const auto = maybeAutoOpen(text, info);
  announce(info, auto); showScanToast(info);
  if (settings.autoLookup && (info.kind === "gtin" || info.kind === "isbn")) lookup(text, info.kind, true);
}
/* ================= Consulta de produto / livro ================= */
async function fetchJson(url) {
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 9000);
  try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw Error("http"); return await r.json(); }
  finally { clearTimeout(to); }
}
async function lookupOff(code) {
  const codes = [code]; if (code.length === 12) codes.push("0" + code);
  for (const c of codes) {
    try {
      const j = await fetchJson("https://world.openfoodfacts.org/api/v2/product/" + encodeURIComponent(c) + ".json?fields=product_name,brands,quantity,categories,image_front_small_url");
      if (j.status === 1 && j.product) {
        const p = j.product;
        return { title: p.product_name || "", sub: [p.brands, p.quantity, p.categories], img: p.image_front_small_url };
      }
    } catch {}
  }
  throw Error("none");
}
async function lookupIsbn(code) {
  const j = await fetchJson("https://openlibrary.org/api/books?bibkeys=ISBN:" + code + "&format=json&jscmd=data");
  const b = j["ISBN:" + code];
  if (!b) throw Error("none");
  return { title: b.title, sub: [(b.authors || []).map(a => a.name).join(", "), (b.publishers || []).map(p => p.name).join(", "), b.publish_date], img: b.cover && b.cover.small };
}
async function lookup(code, kind, speak) {
  const box = $("productInfo");
  box.textContent = t("looking");
  try {
    const r = kind === "isbn" ? await lookupIsbn(code) : await lookupOff(code);
    if (current !== code) return;
    const wrap = el("div", { class: "info-box product" });
    if (r.img) wrap.append(el("img", { src: r.img, alt: "" }));
    wrap.append(el("div", null, el("h3", { text: r.title || t("product_nameless") }), el("p", { text: r.sub.filter(Boolean).join(" · ") || t("no_details") })));
    box.replaceChildren(wrap);
    if (speak && r.title) say(t("say_product", { name: r.title }), { queue: true });
  } catch {
    if (current !== code) return;
    box.textContent = t("product_none");
    if (speak) say(t("say_not_found"), { queue: true });
  }
}