/**
 * Keep Android Open — PayPal donation buttons (client side)
 * Loads public config from /api/config, renders PayPal Smart Buttons,
 * and creates/captures orders through our own backend (secret stays server-side).
 * If the backend/config is unavailable, it falls back to a simple PayPal link.
 */
(function () {
  "use strict";

  var STR = {
    en: {
      amount: "Choose an amount",
      custom: "Other",
      thanks: "Thank you for your support! 💙",
      failed: "Payment could not be completed. Please try again.",
      error: "Something went wrong. Please try again.",
      processing: "Processing your donation…",
    },
    id: {
      amount: "Pilih jumlah",
      custom: "Lainnya",
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
  function fmt(amount, currency) {
    var sym = CURRENCY_SYMBOLS[currency] || currency + " ";
    return sym + amount;
  }

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
    var fb = document.getElementById("paypalFallback");
    var amounts = document.getElementById("donateAmounts");
    var mount = document.getElementById("paypal-buttons");
    if (amounts) amounts.hidden = true;
    if (mount) mount.hidden = true;
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
      return showFallback(); // backend not present (e.g. static preview)
    }
    if (!cfg || !cfg.configured || !cfg.clientId) return showFallback();

    var currency = cfg.currency || "USD";
    var presets = Array.isArray(cfg.presets) && cfg.presets.length ? cfg.presets : [5, 10, 25, 50];
    var selected = presets[1] || presets[0];

    // Build amount chooser
    var wrap = document.getElementById("donateAmounts");
    wrap.hidden = false;
    wrap.innerHTML = "";
    var chips = [];
    presets.forEach(function (v) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "amount-chip";
      b.textContent = fmt(v, currency);
      b.setAttribute("data-amt", String(v));
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
    custom.placeholder = t("custom") + " " + (CURRENCY_SYMBOLS[currency] || currency);
    custom.addEventListener("input", function () {
      var v = parseFloat(custom.value);
      if (Number.isFinite(v) && v > 0) {
        selected = v;
        chips.forEach(function (c) { c.classList.remove("active"); c.setAttribute("aria-pressed", "false"); });
      }
    });
    wrap.appendChild(custom);
    // preselect the default chip
    var def = chips[presets.indexOf(selected)] || chips[0];
    if (def) { def.classList.add("active"); def.setAttribute("aria-pressed", "true"); }

    var statusEl = document.getElementById("donateStatus");
    function setStatus(msg) { if (statusEl) statusEl.textContent = msg; }

    try {
      await loadScript(
        "https://www.paypal.com/sdk/js?client-id=" +
          encodeURIComponent(cfg.clientId) +
          "&currency=" + encodeURIComponent(currency) +
          "&intent=capture&components=buttons&disable-funding=paylater"
      );
    } catch (e) {
      return showFallback();
    }
    if (!window.paypal) return showFallback();

    window.paypal
      .Buttons({
        style: { shape: "pill", color: "blue", layout: "vertical", label: "donate", height: 45 },
        createOrder: async function () {
          setStatus("");
          var res = await fetch("/api/orders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount: selected }),
          });
          var data = await res.json();
          if (!res.ok || !data.id) throw new Error(data.error || "create failed");
          return data.id;
        },
        onApprove: async function (data) {
          setStatus(t("processing"));
          var res = await fetch("/api/orders/" + encodeURIComponent(data.orderID) + "/capture", { method: "POST" });
          var d = await res.json();
          if (res.ok && d.status === "COMPLETED") setStatus(t("thanks"));
          else setStatus(t("failed"));
        },
        onError: function () { setStatus(t("error")); },
      })
      .render("#paypal-buttons")
      .catch(showFallback);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
