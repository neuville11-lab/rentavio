(function () {
  "use strict";

  var PROJECT_ID = "z8w7wjjg2q";
  var CONSENT_KEY = "rentavio-analytics-consent-v1";
  var bannerId = "rentavio-analytics-consent";
  var manageId = "rentavio-privacy-settings";

  function getConsent() {
    try { return window.localStorage.getItem(CONSENT_KEY); } catch (_) { return null; }
  }

  function setConsent(value) {
    try { window.localStorage.setItem(CONSENT_KEY, value); } catch (_) {}
  }

  function addStyles() {
    if (document.getElementById("rentavio-analytics-consent-styles")) return;
    var style = document.createElement("style");
    style.id = "rentavio-analytics-consent-styles";
    style.textContent =
      "#"+bannerId+"{position:fixed;z-index:2147483000;left:50%;bottom:16px;transform:translateX(-50%);width:min(760px,calc(100% - 28px));padding:18px 20px;background:#fff;border:1px solid #cfe0cb;border-radius:16px;box-shadow:0 14px 42px rgba(20,45,32,.2);color:#1a2b22;font:14px/1.5 Inter,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}" +
      "#"+bannerId+"[hidden]{display:none}" +
      "#"+bannerId+" .rv-consent-title{font-weight:800;font-size:15px;margin:0 0 5px}" +
      "#"+bannerId+" p{margin:0 0 10px;color:#53645a}" +
      "#"+bannerId+" a{color:#174d3a;font-weight:700;text-decoration:underline}" +
      "#"+bannerId+" .rv-consent-actions{display:flex;gap:10px;flex-wrap:wrap}" +
      "#"+bannerId+" button,#"+manageId+"{min-height:42px;border:1px solid #174d3a;border-radius:10px;padding:9px 15px;font:700 13px Inter,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;cursor:pointer}" +
      "#"+bannerId+" button{flex:1 1 180px}" +
      "#"+bannerId+" .rv-accept{background:#174d3a;color:#fff}" +
      "#"+bannerId+" .rv-reject{background:#fff;color:#174d3a}" +
      "#"+manageId+"{position:fixed;z-index:2147482999;left:14px;bottom:14px;min-height:36px;padding:7px 11px;background:#fff;color:#174d3a;box-shadow:0 3px 12px rgba(20,45,32,.14);font-size:11px}" +
      "#"+bannerId+" button:focus-visible,#"+manageId+":focus-visible{outline:3px solid #a5d782;outline-offset:2px}" +
      "@media(max-width:560px){#"+bannerId+"{bottom:10px;padding:15px;border-radius:14px}#"+bannerId+" .rv-consent-actions{flex-direction:column;gap:8px}#"+bannerId+" button{width:100%;flex-basis:auto}#"+manageId+"{left:10px;bottom:10px}}" +
      "@media(prefers-reduced-motion:reduce){#"+bannerId+" *,#"+manageId+"{scroll-behavior:auto;transition:none}}";
    document.head.appendChild(style);
  }

  function startClarity() {
    if (window.__rentavioClarityStarted) return;
    window.__rentavioClarityStarted = true;
    document.querySelectorAll("form").forEach(function (form) {
      form.setAttribute("data-clarity-mask", "true");
    });
    (function (c, l, a, r, i) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      c[a]("consentv2", { ad_Storage: "denied", analytics_Storage: "granted" });
      var t = l.createElement(r);
      t.async = true;
      t.src = "https://www.clarity.ms/tag/" + i;
      var y = l.getElementsByTagName(r)[0];
      y.parentNode.insertBefore(t, y);
    })(window, document, "clarity", "script", PROJECT_ID);
  }

  function ensureManager() {
    if (document.getElementById(manageId)) return;
    var button = document.createElement("button");
    button.id = manageId;
    button.type = "button";
    button.textContent = "Privacidad y analítica";
    button.setAttribute("aria-label", "Cambiar preferencias de privacidad y analítica");
    button.addEventListener("click", function () {
      var banner = document.getElementById(bannerId);
      if (banner) {
        banner.hidden = false;
        var reject = banner.querySelector(".rv-reject");
        if (reject) reject.focus();
      }
    });
    document.body.appendChild(button);
  }

  function ensurePrivacyLink() {
    var footer = document.querySelector("footer");
    if (!footer || footer.querySelector('a[href="privacidad.html"]')) return;
    var link = document.createElement("a");
    link.href = "privacidad.html";
    link.textContent = "Privacidad y cookies";
    link.style.cssText = "display:inline-block;margin-top:12px;color:#0e6b5c;font-size:12px;font-weight:700;text-decoration:underline";
    footer.appendChild(link);
  }

  function showBanner() {
    if (document.getElementById(bannerId)) {
      document.getElementById(bannerId).hidden = false;
      return;
    }
    var banner = document.createElement("section");
    banner.id = bannerId;
    banner.setAttribute("role", "region");
    banner.setAttribute("aria-label", "Preferencias de analítica");
    banner.innerHTML =
      '<p class="rv-consent-title">Analítica opcional</p>' +
      '<p>Microsoft Clarity puede registrar páginas visitadas, clics y desplazamientos para ayudarnos a mejorar Rentavio. Solo se activa si aceptas; los campos de entrada están enmascarados. Puedes cambiar tu decisión en cualquier momento desde “Privacidad y analítica”. <a href="privacidad.html">Lee la política de privacidad y cookies de Rentavio</a>. <a href="https://learn.microsoft.com/es-es/clarity/clarity-data" target="_blank" rel="noopener noreferrer">Qué datos recoge Clarity</a>.</p>' +
      '<div class="rv-consent-actions"><button class="rv-reject" type="button">Rechazar analítica</button><button class="rv-accept" type="button">Aceptar analítica</button></div>';
    document.body.appendChild(banner);
    banner.querySelector(".rv-accept").addEventListener("click", function () {
      setConsent("accepted");
      banner.hidden = true;
      startClarity();
      ensureManager();
    });
    banner.querySelector(".rv-reject").addEventListener("click", function () {
      var hadClarity = !!window.__rentavioClarityStarted;
      setConsent("rejected");
      banner.hidden = true;
      if (typeof window.clarity === "function") {
        window.clarity("consentv2", { ad_Storage: "denied", analytics_Storage: "denied" });
      }
      if (hadClarity) window.setTimeout(function () { window.location.reload(); }, 150);
      ensureManager();
    });
  }

  function init() {
    if (!document.body || !document.head) return;
    addStyles();
    ensureManager();
    ensurePrivacyLink();
    if (getConsent() === "accepted") startClarity();
    else showBanner();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();