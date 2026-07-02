/**
 * Keep Android Open — PayPal donations (client side)
 * - PayPal button (popup checkout)
 * - Advanced Hosted Card Fields, wrapped in our own dark-themed boxes
 * Loads public config from /api/config, creates/captures orders via our backend
 * (the PayPal secret stays server-side). Falls back to a link if unavailable.
 */
(function () {
  "use strict";

  var STR = {
    en: {
      custom: "Other",
      orCard: "or pay by card",
      payCard: "Pay by card",
      thanks: "Thank you for your support! 💙",
      failed: "Payment could not be completed. Please try again.",
      error: "Something went wrong. Please try again.",
      processing: "Processing your donation…",
    },
    id: {
      custom: "Lainnya",
      orCard: "atau bayar pakai kartu",
      payCard: "Bayar pakai kartu",
      thanks: "Terima kasih atas dukunganmu! 💙",
      failed: "Pembayaran tidak dapat diselesaikan. Silakan coba lagi.",
      error: "Terjadi kesalahan. Silakan coba lagi.",
      processing: "Memproses donasimu…",
    },
  };
  function t(key) {
    var lang = (document.documentElement.getAttribute("lang") || "en").slice(0, 2);
    return (STR[lang] || STR.en)[key] || STR.en[key];
  }

  var CURRENCY_SYMBOLS = { USD: "$", EUR: "€", GBP: "£", AUD: "A$", CAD: "C$", IDR: "Rp" };

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function showFallback() {
    ["donateAmounts", "paypal-buttons", "cardFields"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.hidden = true;
    });
    var fb = document.getElementById("paypalFallback");
    if (fb) fb.hidden = false;
  }

  async function init() {
    var mount = document.getElementById("paypal-buttons");
    if (!mount || !window.fetch) return showFallback();

    var cfg;
    try {
      var r = await fetch("/api/config", { headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error("no config");
      cfg = await r.json();
    } catch (e) {
      return showFallback();
    }
    if (!cfg || !cfg.configured || !cfg.clientId) return showFallback();

    var currency = cfg.currency || "USD";
    var sym = CURRENCY_SYMBOLS[currency] || currency + " ";
    var presets = Array.isArray(cfg.presets) && cfg.presets.length ? cfg.presets : [5, 10, 25, 50];
    var selected = presets[1] || presets[0];

    /* ---- amount chooser ---- */
    var wrap = document.getElementById("donateAmounts");
    wrap.hidden = false;
    wrap.innerHTML = "";
    var chips = [];
    presets.forEach(function (v) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "amount-chip";
      b.textContent = sym + v;
      b.addEventListener("click", function () {
        selected = v;
        custom.value = "";
        chips.forEach(function (c) { c.classList.remove("active"); c.setAttribute("aria-pressed", "false"); });
        b.classList.add("active");
        b.setAttribute("aria-pressed", "true");
      });
      chips.push(b);
      wrap.appendChild(b);
    });
    var custom = document.createElement("input");
    custom.type = "number";
    custom.min = String(cfg.min || 1);
    custom.max = String(cfg.max || 10000);
    custom.step = "1";
    custom.className = "amount-custom";
    custom.setAttribute("aria-label", t("custom"));
    custom.placeholder = t("custom") + " " + sym.trim();
    custom.addEventListener("input", function () {
      var v = parseFloat(custom.value);
      if (Number.isFinite(v) && v > 0) {
        selected = v;
        chips.forEach(function (c) { c.classList.remove("active"); c.setAttribute("aria-pressed", "false"); });
      }
    });
    wrap.appendChild(custom);
    var def = chips[presets.indexOf(selected)] || chips[0];
    if (def) { def.classList.add("active"); def.setAttribute("aria-pressed", "true"); }

    var statusEl = document.getElementById("donateStatus");
    function setStatus(msg, ok) {
      if (!statusEl) return;
      statusEl.textContent = msg;
      statusEl.style.color = ok === false ? "var(--red)" : "var(--green)";
    }

    /* ---- shared order handlers ---- */
    async function createOrder() {
      setStatus("");
      var res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: selected }),
      });
      var data = await res.json();
      if (!res.ok || !data.id) throw new Error(data.error || "create failed");
      return data.id;
    }
    async function onApprove(data) {
      setStatus(t("processing"));
      var res = await fetch("/api/orders/" + encodeURIComponent(data.orderID) + "/capture", { method: "POST" });
      var d = await res.json();
      if (res.ok && d.status === "COMPLETED") setStatus(t("thanks"), true);
      else setStatus(t("failed"), false);
    }

    /* ---- load SDK (buttons + card fields) ---- */
    try {
      await loadScript(
        "https://www.paypal.com/sdk/js?client-id=" +
          encodeURIComponent(cfg.clientId) +
          "&currency=" + encodeURIComponent(currency) +
          "&intent=capture&components=buttons,card-fields&disable-funding=paylater,card"
      );
    } catch (e) {
      return showFallback();
    }
    if (!window.paypal) return showFallback();

    /* ---- PayPal button (popup) ---- */
    window.paypal
      .Buttons({
        style: { shape: "pill", color: "gold", layout: "vertical", label: "paypal", height: 48 },
        createOrder: createOrder,
        onApprove: onApprove,
        onError: function () { setStatus(t("error"), false); },
      })
      .render("#paypal-buttons")
      .catch(function () {});

    /* ---- Advanced hosted card fields (styled by us) ---- */
    try {
      if (window.paypal.CardFields) {
        var cf = window.paypal.CardFields({
          createOrder: createOrder,
          onApprove: onApprove,
          onError: function () { setStatus(t("error"), false); },
          style: {
            input: { "font-size": "16px", "font-family": "inherit", color: "#0d1226" },
            ".invalid": { color: "#ef4444" },
          },
        });

        if (cf.isEligible()) {
          var box = document.getElementById("cardFields");
          box.hidden = false;
          var sepEl = document.querySelector("#cardFields .cf-sep span");
          if (sepEl) sepEl.textContent = t("orCard");
          cf.NumberField().render("#card-number");
          cf.ExpiryField().render("#card-expiry");
          cf.CVVField().render("#card-cvv");
          var submit = document.getElementById("cardSubmit");
          submit.textContent = t("payCard");
          submit.addEventListener("click", function () {
            setStatus(t("processing"));
            cf.submit().catch(function () { setStatus(t("failed"), false); });
          });
        }
      }
    } catch (e) {
      /* card fields not enabled for this account — PayPal button still works */
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
