# Keep Android Open

Modern campaign website with a **secure PayPal donation gateway**.

- Static, responsive glassmorphism front-end (`public/`)
- In-page i18n (English / Bahasa Indonesia), QRIS for Indonesian
- Node.js + Express backend that talks to the PayPal REST API
- The PayPal **Client Secret never reaches the browser** — it lives only in a
  server environment variable.

## How the donation gateway works

```
Browser  --POST /api/orders-->            Node server --> PayPal (uses SECRET)
Browser  <-- order id --------            Node server
PayPal popup (approve)
Browser  --POST /api/orders/:id/capture--> Node server --> PayPal
```

The browser only ever receives the **public Client ID**. If the backend or
credentials are missing, the button falls back to a simple PayPal link.

## Run locally

```bash
npm install
cp .env.example .env      # then edit .env with your PayPal credentials
npm start                 # http://localhost:8080
```

Without credentials the site still runs; the donate button shows a link fallback.

## Environment variables

| Variable               | Required | Description                                   |
|------------------------|----------|-----------------------------------------------|
| `PAYPAL_CLIENT_ID`     | yes      | PayPal REST app Client ID (public)            |
| `PAYPAL_CLIENT_SECRET` | yes      | PayPal REST app Secret (**server-side only**) |
| `PAYPAL_ENV`           | no       | `sandbox` (default) or `live`                 |
| `DONATION_CURRENCY`    | no       | ISO currency, default `USD`                   |
| `PORT`                 | no       | default `8080`                                |

> **Never commit `.env`.** Set these as secrets/variables in your host's dashboard.

## Deploy

### Railway / Render
- Start command: `npm start`
- Add the environment variables above in the project settings.
- Render: use a "Web Service", build `npm install`, start `npm start`.

### Docker (VPS / AWS / Google Cloud / Fly.io)
```bash
docker build -t keepandroidopen .
docker run -p 8080:8080 \
  -e PAYPAL_CLIENT_ID=xxx \
  -e PAYPAL_CLIENT_SECRET=xxx \
  -e PAYPAL_ENV=live \
  -e DONATION_CURRENCY=USD \
  keepandroidopen
```

## Editing donation content

- Amounts/logic: `public/js/donate.js` (`presets` come from `/api/config`).
- QRIS image (Indonesian): `public/images/qris-donation.jpeg`.
- Copy/text: `data-i18n` strings inside `public/index.html`.

## Security notes

- Rotate your PayPal Secret if it was ever shared in plain text.
- Start in `PAYPAL_ENV=sandbox`, switch to `live` only after testing.