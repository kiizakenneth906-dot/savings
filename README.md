# Yeterse Family Savings – with mobile money prompts

Members enter the phone number to pay with, get a PIN prompt on that phone (MTN MoMo or Airtel Money),
and are marked Cleared automatically when they approve.

## 1. Get your accounts
- **MTN:** register at https://momodeveloper.mtn.com, subscribe to the *Collection* product, create an API user and API key (sandbox first). For live use, apply for production access with MTN Uganda.
- **Airtel:** register at https://developers.airtel.africa, create an app with the *Collection* API, and get the client ID and secret. For live use, apply for production access with Airtel Uganda.
- Money collected lands in the merchant wallet linked to those accounts. Register the group's number (0759461248) or a business account for this.

## 2. Run it
```
npm install
cp .env.example .env     # fill in the keys
npm start                # http://localhost:3000
```
For live use set `MTN_BASE`, `MTN_ENV`, `MTN_CURRENCY=UGX`, and `AIRTEL_BASE=https://openapi.airtel.africa` as given in each provider's go-live pack.
The sandbox only accepts test numbers and the EUR currency.

## 3. Host it
Deploy this folder to any Node 18+ host (Render, Railway, a VPS) with the `.env` values as environment variables. Use HTTPS.

## Known limits
- Provider endpoints were written from their public docs and have not been tested against live accounts. Test in sandbox and check each provider's current docs before going live.
- Member accounts, loans and meetings are still stored in each person's browser. Only confirmed payments are kept on the server, and every phone picks them up automatically. Moving accounts and records to a server-side database is the next step.
- The payment list is not login-protected on the server. It exposes only member name, month, amount and date, never phone numbers.
