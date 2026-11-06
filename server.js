require("dotenv").config();
const express = require("express"), crypto = require("crypto"), fs = require("fs"), path = require("path");
const E = process.env, DB = path.join(__dirname, "data", "payments.json");
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => {
  const f = [path.join(__dirname, "public", "index.html"), path.join(__dirname, "index.html")].find((x) => fs.existsSync(x));
  f ? res.sendFile(f) : res.status(404).send("index.html is missing from the project.");
});
fs.mkdirSync(path.dirname(DB), { recursive: true });
const load = () => { try { return JSON.parse(fs.readFileSync(DB, "utf8")); } catch { return []; } };
const save = (l) => fs.writeFileSync(DB, JSON.stringify(l, null, 1));
const http = async (url, opt) => {
  const r = await fetch(url, opt), t = await r.text();
  let body; try { body = JSON.parse(t); } catch { body = t; }
  return { ok: r.ok, status: r.status, body };
};
const network = (n) => /^0(77|78|76|39)/.test(n) ? "MTN" : /^0(70|75|74|20)/.test(n) ? "AIRTEL" : null;

// ---- MTN MoMo ----
async function mtnToken() {
  const r = await http(E.MTN_BASE + "/collection/token/", { method: "POST", headers: {
    Authorization: "Basic " + Buffer.from(E.MTN_API_USER + ":" + E.MTN_API_KEY).toString("base64"),
    "Ocp-Apim-Subscription-Key": E.MTN_SUB_KEY } });
  if (!r.ok) throw new Error("MTN login failed");
  return r.body.access_token;
}
async function mtnCharge(p) {
  const tk = await mtnToken();
  const r = await http(E.MTN_BASE + "/collection/v1_0/requesttopay", { method: "POST", headers: {
    Authorization: "Bearer " + tk, "X-Reference-Id": p.id, "X-Target-Environment": E.MTN_ENV || "sandbox",
    "Ocp-Apim-Subscription-Key": E.MTN_SUB_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ amount: String(p.amount), currency: E.MTN_CURRENCY || "UGX", externalId: p.id.slice(0, 8),
      payer: { partyIdType: "MSISDN", partyId: "256" + p.phone.slice(1) },
      payerMessage: "Monthly savings", payeeNote: p.member }) });
  if (r.status !== 202) throw new Error("MTN did not accept the request");
}
async function mtnStatus(p) {
  const tk = await mtnToken();
  const r = await http(E.MTN_BASE + "/collection/v1_0/requesttopay/" + p.id, { headers: {
    Authorization: "Bearer " + tk, "X-Target-Environment": E.MTN_ENV || "sandbox", "Ocp-Apim-Subscription-Key": E.MTN_SUB_KEY } });
  const s = r.body && r.body.status;
  return s === "SUCCESSFUL" ? "successful" : s === "FAILED" ? "failed" : "pending";
}

// ---- Airtel Money ----
async function airtelToken() {
  const r = await http(E.AIRTEL_BASE + "/auth/oauth2/token", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: E.AIRTEL_CLIENT_ID, client_secret: E.AIRTEL_CLIENT_SECRET, grant_type: "client_credentials" }) });
  if (!r.ok) throw new Error("Airtel login failed");
  return r.body.access_token;
}
const airtelHeaders = (tk) => ({ Authorization: "Bearer " + tk, "Content-Type": "application/json", "X-Country": "UG", "X-Currency": "UGX" });
async function airtelCharge(p) {
  const tk = await airtelToken();
  const r = await http(E.AIRTEL_BASE + "/merchant/v1/payments/", { method: "POST", headers: airtelHeaders(tk),
    body: JSON.stringify({ reference: "Monthly savings", subscriber: { country: "UG", currency: "UGX", msisdn: p.phone.slice(1) },
      transaction: { amount: p.amount, country: "UG", currency: "UGX", id: p.id } }) });
  if (!r.ok) throw new Error("Airtel did not accept the request");
}
async function airtelStatus(p) {
  const tk = await airtelToken();
  const r = await http(E.AIRTEL_BASE + "/standard/v1/payments/" + p.id, { headers: airtelHeaders(tk) });
  const s = r.body && r.body.data && r.body.data.transaction && r.body.data.transaction.status;
  return s === "TS" ? "successful" : s === "TF" ? "failed" : "pending";
}

// ---- API ----
app.post("/api/pay", async (req, res) => {
  const { phone, amount, member, month } = req.body || {};
  const net = network(String(phone || ""));
  if (!/^0\d{9}$/.test(phone || "") || !net) return res.status(400).json({ error: "Use an MTN or Airtel number like 0772123456." });
  if (!(amount >= 1000 && amount <= 5000000) || !member || !month) return res.status(400).json({ error: "Invalid amount or member." });
  const p = { id: crypto.randomUUID(), phone, amount: Math.round(amount), member: String(member).slice(0, 80), month: String(month), network: net, status: "pending", date: new Date().toISOString().slice(0, 10), created: Date.now() };
  try {
    await (net === "MTN" ? mtnCharge(p) : airtelCharge(p));
    const l = load(); l.push(p); save(l);
    res.json({ id: p.id, network: net });
  } catch (e) { console.error(e); res.status(502).json({ error: e.message }); }
});

app.get("/api/pay/:id", async (req, res) => {
  const l = load(), p = l.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "Not found" });
  if (p.status === "pending") {
    try { p.status = await (p.network === "MTN" ? mtnStatus(p) : airtelStatus(p)); } catch (e) { console.error(e); }
    if (p.status === "pending" && Date.now() - p.created > 5 * 60 * 1000) p.status = "failed";
    save(l);
  }
  res.json({ status: p.status });
});

app.get("/api/payments", (req, res) => {
  res.json(load().filter((p) => p.status === "successful").map(({ id, member, month, amount, date }) => ({ id, member, month, amount, date })));
});

app.listen(E.PORT || 3000, () => console.log("Yeterse savings running on port " + (E.PORT || 3000)));
