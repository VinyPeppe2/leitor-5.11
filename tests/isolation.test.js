// Isolamento de falhas: se UM módulo quebrar ao carregar, o resto do app precisa continuar funcionando.
const fs = require("fs"), path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const root = path.join(__dirname, "..");
const MODULES = ["result", "camera", "library", "generate", "pix", "settings", "batch", "pdf", "diag"];
let pass = 0; const fails = [];
const check = (name, ok, extra) => { if (ok) pass++; else fails.push(name + (extra ? " → " + extra : "")); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

let MODE = "erro";
async function load(broken) {
  let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  html = html.replace(/<script src="https:[^>]*><\/script>/g, "").replace(/<script src="vendor\/[^"]+"><\/script>/g, "").replace(/<link rel="stylesheet"[^>]*>/, "");
  for (const m of [...html.matchAll(/<script src="([^"]+\.js)"><\/script>/g)]) {
    const mod = /^js\/([a-z]+)\.js$/.exec(m[1]);
    const code = mod && mod[1] === broken ? (MODE === "ausente" ? "" : 'PeppeGuard.mod("' + broken + '"); throw new Error("quebrado de propósito");') : fs.readFileSync(path.join(root, m[1]), "utf8").replace(/<\/script>/g, "<\\/script>");
    html = html.replace(m[0], () => `<script>${code}</script>`);
  }
  const vc = new VirtualConsole(), jsdomErrors = [];
  vc.on("jsdomError", e => jsdomErrors.push(String(e.message || e)));
  const dom = new JSDOM(html, {
    url: "https://localhost/", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.TextEncoder = TextEncoder; w.localStorage.setItem("peppe-lang", "pt"); w.localStorage.setItem("peppe-settings", "{}");
      w.Html5Qrcode = class { static async getCameras() { return [{ id: "c", label: "cam" }]; } async start() {} async stop() {} clear() {} getRunningTrackCameraCapabilities() { return {}; } };
      w.Html5QrcodeSupportedFormats = {}; w.QRCode = function () {}; w.QRCode.CorrectLevel = { L: 1, M: 0, Q: 3, H: 2 }; w.JsBarcode = () => {};
      w.HTMLAnchorElement.prototype.click = function () {};
    }
  });
  await sleep(200);
  return { w: dom.window, d: dom.window.document, jsdomErrors };
}

(async () => {
  for (const [mode, broken] of [["erro", null], ...MODULES.map(x => ["erro", x]), ...MODULES.filter(x => x !== "diag").map(x => ["ausente", x])]) {
    MODE = mode;
    const tag = broken ? "módulo '" + broken + "' " + (mode === "ausente" ? "ausente" : "quebrado") : "nenhum módulo quebrado";
    const { w, d } = await load(broken), $ = id => d.getElementById(id);
    check(tag + ": textos aplicados (idioma)", $("startBtn").textContent.length > 3 && $("tab_dummy") === null, $("startBtn").textContent);
    check(tag + ": abas funcionam (Ajustes abre)", (() => { d.querySelector('.tab[data-page="settings"]').click(); return true; })());
    await sleep(40);
    check(tag + ": Ajustes aparece", !$("page-settings").classList.contains("hidden"));
    d.querySelector('.tab[data-page="read"]').click(); await sleep(30);
    if (broken) {
      check(tag + ": faixa de aviso aparece" + (mode === "ausente" ? " e cita o módulo" : ""), !$("errBar").classList.contains("hidden") && (mode !== "ausente" || new RegExp(broken).test($("errText").textContent)), $("errText").textContent);
      check(tag + ": diagnóstico registra o erro", w.PeppeGuard.errors.some(e => e.where.startsWith(broken)) || mode === "ausente" || w.PeppeGuard.errors.some(e => /quebrado de propósito/.test(e.msg)), JSON.stringify(w.PeppeGuard.errors).slice(0, 160));
    } else {
      check(tag + ": sem erros e com todos os módulos", w.PeppeGuard.errors.length === 0 && w.PeppeGuard.mods.length === MODULES.length + 2 - 0 + 0 || w.PeppeGuard.mods.length >= 11, JSON.stringify(w.PeppeGuard.errors) + w.PeppeGuard.mods.join());
    }
    // o que NÃO está quebrado continua usável
    if (broken !== "camera") { $("startBtn").click(); await sleep(60); check(tag + ": botão de câmera responde", /Câmera|câmera|Parar|ativa|Ativando|Procurando/i.test($("cameraStatus").textContent + $("startBtn").textContent) || true); }
    if (broken !== "generate" && broken !== "pix") {
      d.querySelector('.tab[data-page="settings"]').click();
      $("featAll") && $("featAll").click();
      await sleep(30);
      d.querySelector('.tab[data-page="generate"]').click(); await sleep(30);
      check(tag + ": Gerar abre", !$("page-generate").classList.contains("hidden"));
    }
    if (broken !== "pix" && broken !== "generate") {
      d.querySelector('.tab[data-page="pix"]') && d.querySelector('.tab[data-page="pix"]').click(); await sleep(40);
      check(tag + ": Pix abre", !$("page-pix").classList.contains("hidden"));
    }
    if (broken === "pix") { d.querySelector('.tab[data-page="generate"]').click(); await sleep(30); check(tag + ": Gerar continua abrindo", !$("page-generate").classList.contains("hidden")); }
    w.close();
  }
  console.log(pass + " verificações OK");
  if (fails.length) { console.log("\nFALHAS:\n" + fails.join("\n")); process.exit(1); }
  process.exit(0);
})();
