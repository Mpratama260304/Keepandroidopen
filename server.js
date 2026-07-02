/**
 * Keep Android Open — server + PayPal donation gateway
 * -----------------------------------------------------
 * Serves the static campaign site from ./public and exposes a small,
 * secure PayPal REST integration. The PayPal Client SECRET is read from
 * an environment variable and is NEVER sent to the browser.
 *
 * Required environment variables (see .env.example):
 *   PAYPAL_CLIENT_ID       - PayPal REST app Client ID (public, sent to browser)
 *   PAYPAL_CLIENT_SECRET   - PayPal REST app Secret (server-side only!)
 *   PAYPAL_ENV             - "live" or "sandbox" (default: "sandbox")
 *   DONATION_CURRENCY      - ISO currency, e.g. "USD" (default: "USD")
 *   PORT                   - port to listen on (default: 8080)
 */

import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const {
  PAYPAL_CLIENT_ID = "",
  PAYPAL_CLIENT_SECRET = "",
  PAYPAL_ENV = "sandbox",
  DONATION_CURRENCY = "USD",
  PORT = 8080,
} = process.env;

const PAYPAL_BASE =
  PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

const CURRENCY = DONATION_CURRENCY.toUpperCase();
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 10000;

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));

// Basic security headers (no external deps).
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

/* ---------------- PayPal helpers ---------------- */

async function getAccessToken() {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error("PayPal credentials are not configured");
  }
  const auth = Buffer.from(
    `${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal auth failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.access_token;
}

function sanitizeAmount(input) {
  const value = Number.parseFloat(input);
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value * 100) / 100;
  if (rounded < MIN_AMOUNT || rounded > MAX_AMOUNT) return null;
  return rounded.toFixed(2);
}

/* ---------------- API routes ---------------- */

// Public front-end config (safe to expose). Client ID is meant to be public.
app.get("/api/config", (req, res) => {
  res.json({
    clientId: PAYPAL_CLIENT_ID,
    currency: CURRENCY,
    env: PAYPAL_ENV === "live" ? "live" : "sandbox",
    configured: Boolean(PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET),
    presets: [5, 10, 25, 50],
    min: MIN_AMOUNT,
    max: MAX_AMOUNT,
  });
});

// Create an order for the given donation amount.
app.post("/api/orders", async (req, res) => {
  try {
    const amount = sanitizeAmount(req.body?.amount);
    if (!amount) {
      return res.status(400).json({
        error: `Amount must be a number between ${MIN_AMOUNT} and ${MAX_AMOUNT} ${CURRENCY}.`,
      });
    }

    const accessToken = await getAccessToken();
    const response = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            description: "Keep Android Open — donation",
            amount: { currency_code: CURRENCY, value: amount },
          },
        ],
        application_context: {
          brand_name: "Keep Android Open",
          shipping_preference: "NO_SHIPPING",
          user_action: "PAY_NOW",
        },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("Create order error:", data);
      return res.status(502).json({ error: "Could not create PayPal order." });
    }
    res.status(201).json({ id: data.id, status: data.status });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Donation service unavailable." });
  }
});

// Capture an approved order.
app.post("/api/orders/:orderID/capture", async (req, res) => {
  try {
    const orderID = String(req.params.orderID || "").replace(/[^A-Za-z0-9-]/g, "");
    if (!orderID) return res.status(400).json({ error: "Invalid order id." });

    const accessToken = await getAccessToken();
    const response = await fetch(
      `${PAYPAL_BASE}/v2/checkout/orders/${orderID}/capture`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await response.json();
    if (!response.ok) {
      console.error("Capture error:", data);
      return res.status(502).json({ error: "Could not capture payment." });
    }
    res.json({ status: data.status, id: data.id });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Donation service unavailable." });
  }
});

/* ---------------- Static site ---------------- */

app.use(
  express.static(path.join(__dirname, "public"), {
    extensions: ["html"],
    maxAge: "1h",
  })
);

// Unknown routes -> 404 page (real 404 status).
app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Not found." });
  }
  res.status(404).sendFile(path.join(__dirname, "public", "404.html"));
});

app.listen(PORT, () => {
  console.log(`Keep Android Open running on http://localhost:${PORT}`);
  console.log(`PayPal env: ${PAYPAL_ENV} | currency: ${CURRENCY}`);
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    console.warn(
      "⚠  PayPal credentials missing — donation buttons will fall back to a link. " +
        "Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET."
    );
  }
});
