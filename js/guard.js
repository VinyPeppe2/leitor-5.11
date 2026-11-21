/* Leitor QR - Peppe · js/guard.js
 * Isolamento de falhas. Carrega ANTES de tudo.
 * - PeppeGuard.mod(nome): registra que um módulo carregou.
 * - PeppeGuard.step(nome, fn): roda um trecho de inicialização; se falhar, registra e o resto continua.
 * - Qualquer erro não tratado (script ou promessa) também é registrado, com o módulo de origem.
 * - Mostra uma faixa discreta com o aviso e deixa o relatório em Ajustes > Diagnóstico.
 */
"use strict";
(() => {
  const mods = [], errors = [];
  const L = { pt: ["Um recurso do app falhou ao iniciar", "o restante continua funcionando", "Detalhes", "Fechar"],
    en: ["An app feature failed to start", "the rest keeps working", "Details", "Close"],
    es: ["Una función de la app falló al iniciar", "el resto sigue funcionando", "Detalles", "Cerrar"] };
  const fileMod = f => { const m = /\/(?:js\/)?([a-z0-9]+)\.js/i.exec(String(f || "")); return m ? m[1] : "inline"; };
  const lang = () => { const l = String(document.documentElement.lang || navigator.language || "pt").slice(0, 2); return L[l] ? l : "pt"; };

  function show() {
    const bar = document.getElementById("errBar"), txt = document.getElementById("errText");
    if (!bar || !txt) return;
    const s = L[lang()], where = Array.from(new Set(errors.map(e => e.where.split("#")[0].split(":")[0]))).join(", ");
    txt.textContent = s[0] + " (" + where + "): " + s[1] + ".";
    document.getElementById("errOpen").textContent = s[2]; document.getElementById("errClose").textContent = s[3];
    bar.classList.remove("hidden");
  }
  function log(where, err) {
    const msg = String(err && err.message || err || "erro");
    const same = errors.find(e => e.where === String(where) && e.msg === msg);
    if (same) { same.n = (same.n || 1) + 1; }       // o mesmo erro repetido só aumenta o contador
    else { errors.push({ where: String(where), msg, n: 1, at: new Date().toISOString() }); if (errors.length > 50) errors.shift(); }
    try { console.error("[Peppe] " + where + ": " + msg, err); } catch { /* sem console */ }
    try { show(); } catch { /* DOM ainda não existe */ }
    try { if (typeof PeppeGuard.onLog === "function") PeppeGuard.onLog(); } catch { /* diagnóstico indisponível */ }
  }
  window.PeppeGuard = {
    mods, errors, log, onLog: null,
    mod(name) { mods.push(name); },
    step(name, fn) { try { fn(); } catch (e) { log(name, e); } },
    report() {
      return "Leitor QR - Peppe " + (typeof APP_VERSION !== "undefined" ? APP_VERSION : "") + "\nmódulos: " + (mods.join(", ") || "nenhum") +
        "\nerros: " + (errors.length ? "\n" + errors.map(e => "- " + e.where + ": " + e.msg + (e.n > 1 ? " (x" + e.n + ")" : "")).join("\n") : "nenhum") + "\n" + String(navigator.userAgent || "");
    }
  };
  window.addEventListener("error", e => { if (e.filename || e.error) log(fileMod(e.filename) + (e.lineno ? ":" + e.lineno : ""), e.error || e.message); });
  window.addEventListener("unhandledrejection", e => log("promise", e.reason));
  window.addEventListener("DOMContentLoaded", () => {
    const close = document.getElementById("errClose"), open = document.getElementById("errOpen");
    if (close) close.onclick = () => document.getElementById("errBar").classList.add("hidden");
    if (open) open.onclick = () => { document.getElementById("errBar").classList.add("hidden"); if (typeof go === "function") go("settings"); };
    if (errors.length) show();
  });
})();
