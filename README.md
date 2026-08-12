# PSI Shopify Intake App

This starter builds the Purseonal Shopper Inc. consignment / buyout intake flow:

- Shopify Liquid intake page.
- Secure app-proxy form submission.
- 9-photo upload to Shopify staged uploads.
- Shopify customer creation / lookup.
- Shopify draft product creation with PSI metafields.
- Staff notification.
- Offer calculation from resale range.
- Client offer email with consignment / buyout accept links.

## 1. Shopify Admin Setup

Create a Shopify app for the store and give it these Admin API scopes:

- `read_customers`
- `write_customers`
- `read_products`
- `write_products`
- `read_files`
- `write_files`
- `write_app_proxy`

Configure the app proxy:

- Proxy prefix: `apps`
- Proxy subpath: `psi-intake`
- Proxy URL: `https://YOUR-APP-DOMAIN.com/proxy`

The storefront URL will be:

```text
https://YOUR-SHOP.com/apps/psi-intake
```

The Liquid form submits to:

```text
/apps/psi-intake/submit
```

Shopify forwards that to:

```text
https://YOUR-APP-DOMAIN.com/proxy/submit
```

## 2. Theme Setup

Copy this file into your Shopify theme:

```text
theme/sections/psi-consignment-intake.liquid
```

Then:

1. Shopify Admin > Online Store > Themes.
2. Open the theme editor.
3. Create or open a page template for `Sell / Consign`.
4. Add the `PSI intake form` section.
5. Set app proxy path to `/apps/psi-intake`.
6. Assign the template to a page like `/pages/sell-or-consign`.

## 3. App Setup

Install dependencies:

```bash
npm install
```

Create your local environment:

```bash
cp .env.example .env
```

Fill in:

- `SHOPIFY_SHOP_DOMAIN`
- `SHOPIFY_ADMIN_ACCESS_TOKEN`
- `SHOPIFY_APP_SHARED_SECRET`
- `APP_BASE_URL`
- email settings
- `PSI_ADMIN_API_KEY`

Add this line to `.env`:

```text
PSI_ADMIN_API_KEY=choose-a-long-random-password
```

Run locally:

```bash
npm run dev
```

For local app-proxy testing, expose the app using a tunnel such as ngrok or Cloudflare Tunnel, then set `APP_BASE_URL` and the Shopify app proxy URL to that tunnel URL.

## 4. Submit Intake

The client submits the Liquid form. The app:

1. Verifies the Shopify app proxy signature.
2. Validates the required fields and 9 photos.
3. Creates or finds the Shopify customer.
4. Uploads the 9 images to Shopify.
5. Creates a draft product.
6. Stores PSI metafields.
7. Sends PSI staff a notification email.

## 5. Send Offer

After PSI reviews the bag and determines estimated resale value, send the offer from your admin tool, Postman, or another automation:

```bash
curl -X POST https://YOUR-APP-DOMAIN.com/admin/intakes/PSI-REQUEST-ID/offer \
  -H "Content-Type: application/json" \
  -H "x-psi-admin-key: YOUR_ADMIN_API_KEY" \
  -d '{"resale_low":6000,"resale_high":7000}'
```

The app calculates:

- CPRO = `0.80 x resale`
- Buyout = `0.60 x resale`

Example:

- Resale: `$6,000-$7,000`
- CPRO: `$4,800-$5,600`
- Buyout: `$3,600-$4,200`

The client receives an email with accept links for consignment and buyout.

## 6. Agreement Step

For the MVP, accepted offers redirect to:

- `CONSIGNMENT_AGREEMENT_URL`
- `BUYOUT_AGREEMENT_URL`

Replace these with DocuSign / Dropbox Sign template URLs or wire their APIs into `src/email.js` / `src/server.js`.

## 7. Email Delivery

The starter logs email messages by default:

```text
EMAIL_DELIVERY=log
```

When ready, create a Resend API key and set:

```text
EMAIL_DELIVERY=resend
RESEND_API_KEY=re_xxxxxxxxx
FROM_EMAIL=Purseonal Shopper Inc. <admin@purseonalshopper.com>
```

You can swap `src/email.js` for Klaviyo, Shopify Email, SendGrid, Postmark, or another provider later.

## 8. Production Notes

Before production:

- Replace `src/store.js` JSON storage with Postgres, MySQL, or a managed database.
- Add a staff admin screen for entering resale ranges instead of using cURL.
- Add rate limiting and spam protection.
- Add webhook handling for product updates / order sale events.
- Add e-signature API integration.
- Add shipping label integration.
- Confirm privacy and legal language with counsel.

## Useful Shopify Docs

- App proxies: https://shopify.dev/docs/apps/build/online-store/app-proxies
- App proxy authentication: https://shopify.dev/docs/apps/build/online-store/app-proxies/authenticate-app-proxies
- Customer create: https://shopify.dev/docs/api/admin-graphql/latest/mutations/customerCreate
- Product create: https://shopify.dev/docs/api/admin-graphql/latest/mutations/productcreate
- Staged uploads: https://shopify.dev/docs/api/admin-graphql/latest/mutations/stagedUploadsCreate
- Custom data: https://help.shopify.com/en/manual/custom-data/overview
