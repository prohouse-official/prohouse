// ==================== لغات الموقع: عربي / English / বাংলা ====================
// الموقع مكتوب بالعربي. إذا الموظف اختار لغة تانية، هالملف بيترجم النصوص وهي عم تنعرض
// (من القاموس js/i18n-dict.js) وبيقلب اتجاه الصفحة لليسار. العربي ما بيتغيّر فيه شي.
const PH_LANGS = { ar: "العربية", en: "English", bn: "বাংলা" };
const PhLang = (() => {
  let l = "ar";
  try { l = localStorage.getItem("ph_lang") || "ar"; } catch (e) { /* بلا تخزين */ }
  return PH_LANGS[l] ? l : "ar";
})();

// لغة التواريخ والأوقات (الأرقام دايماً 0-9)
function phLocale() {
  if (PhLang === "en") return "en-GB";
  if (PhLang === "bn") return "bn-BD-u-nu-latn";
  return "ar-SA-u-ca-gregory";
}

function setPhLang(lang) {
  if (!PH_LANGS[lang] || lang === PhLang) return;
  try { localStorage.setItem("ph_lang", lang); } catch (e) { /* بلا تخزين */ }
  location.reload();
}

// أزرار اختيار اللغة (بتنحط بشاشة الدخول وبالقائمة)
function phLangSwitcherHtml() {
  return `<div class="ph-lang" role="group" aria-label="Language">${Object.entries(PH_LANGS).map(([k, v]) =>
    `<button type="button" class="${k === PhLang ? "active" : ""}" onclick="setPhLang('${k}')" lang="${k}">${v}</button>`).join("")}</div>`;
}

if (PhLang !== "ar") {
  document.documentElement.lang = PhLang;
  document.documentElement.dir = "ltr";
  // القاموس بينحمّل بس لما تكون اللغة مش عربي
  document.write('<script src="js/i18n-dict.js?v=5.29.0"><\/script>');
  if (PhLang === "bn") document.write('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;600;700;800&display=swap">');
}

(function () {
  if (PhLang === "ar") return;
  const AR = /[؀-ۿ]/;
  const LETTER = "\\u0621-\\u064A\\u0660-\\u0669";
  const idx = PhLang === "en" ? 0 : 1;
  let exact = null, phraseRe = null, phraseMap = null;

  function norm(s) { return s.replace(/\s+/g, " ").trim(); }
  function build() {
    if (exact || typeof PH_I18N_DICT === "undefined") return !!exact;
    exact = new Map(); phraseMap = new Map();
    const keys = [];
    for (const [ar, tr] of Object.entries(PH_I18N_DICT)) {
      const k = norm(ar), v = tr[idx];
      if (!v) continue;
      exact.set(k, v);
      phraseMap.set(k, v);
      keys.push(k);
    }
    keys.sort((a, b) => b.length - a.length);
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    phraseRe = new RegExp(`(^|[^${LETTER}])(${keys.map(esc).join("|")})(?=[^${LETTER}]|$)`, "g");
    return true;
  }

  // نص واحد: أول شي مطابقة كاملة، وإذا ما لقينا منبدّل الجمل المعروفة جوّاته
  function tr(text) {
    if (!text || !AR.test(text) || !build()) return text;
    const lead = text.match(/^\s*/)[0], trail = text.match(/\s*$/)[0];
    const core = norm(text);
    const edge = core.match(/^([\s|·—:-]*)(.*?)([\s|·—:-]*)$/);
    const hit = exact.get(core) || (edge && exact.get(edge[2]) && edge[1] + exact.get(edge[2]) + edge[3]);
    const out = hit ? lead + hit + trail : text.replace(phraseRe, (m, pre, key) => pre + (phraseMap.get(key) || key));
    return out.replace(/،\s*/g, ", ").replace(/؟/g, "?").replace(/؛/g, ";");
  }
  window.phTr = tr;

  function translateText(node) {
    const p = node.parentNode;
    if (!p || /^(SCRIPT|STYLE|TEXTAREA)$/.test(p.nodeName) || (p.closest && p.closest("[data-no-i18n]"))) return;
    const v = node.nodeValue, t = tr(v);
    if (t === v) return;
    // خيار بدون value: قيمته هي نصّه — منثبّت القيمة العربية قبل ما نترجم النص
    if (p.nodeName === "OPTION" && !p.hasAttribute("value")) p.setAttribute("value", p.textContent);
    node.nodeValue = t;
  }
  function translateAttrs(el) {
    for (const a of ["placeholder", "title", "aria-label"]) {
      const v = el.getAttribute && el.getAttribute(a);
      if (v && AR.test(v)) { const t = tr(v); if (t !== v) el.setAttribute(a, t); }
    }
  }
  function translateTree(root) {
    if (root.nodeType === 3) return translateText(root);
    if (root.nodeType !== 1 || /^(SCRIPT|STYLE)$/.test(root.nodeName)) return;
    translateAttrs(root);
    root.querySelectorAll("[placeholder],[title],[aria-label]").forEach(translateAttrs);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (w.nextNode()) nodes.push(w.currentNode);
    nodes.forEach(translateText);
  }

  function start() {
    document.body.classList.add("lang-" + PhLang);
    if (AR.test(document.title)) document.title = tr(document.title);
    translateTree(document.body);
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "characterData") translateText(m.target);
        else if (m.type === "attributes") translateAttrs(m.target);
        else m.addedNodes.forEach(translateTree);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["placeholder", "title", "aria-label"] });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
