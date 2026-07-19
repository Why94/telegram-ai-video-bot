const express = require("express");
const xendit = require("./xendit");
const store = require("./store");

/**
 * Create the Express app that receives Xendit webhooks.
 * @param {object} botApi - grammY bot.api for sending notifications
 */
function createServer(botApi) {
  const app = express();

  // Raw body for signature verification
  app.use(express.json({
    verify: (req, res, buf) => { req.rawBody = buf.toString("utf8"); },
  }));

  app.get("/", (req, res) => {
    res.json({ ok: true, payment: xendit.isConfigured() ? "xendit" : "not-configured" });
  });

  // Xendit invoice webhook
  app.post("/webhook/xendit", async (req, res) => {
    try {
      const raw = req.rawBody || JSON.stringify(req.body);
      if (!xendit.verifyWebhook(req.headers, raw)) {
        console.error("[payment] webhook verification failed");
        return res.status(401).send("invalid token");
      }

      const evt = xendit.parseCallback(req.body);
      console.log("[payment] event:", evt.event, evt.status, evt.externalId);

      if (evt.paid) {
        const result = store.markPaid(evt.externalId);
        if (result && botApi) {
          try {
            await botApi.sendMessage(
              result.userId,
              `✅ *Pembayaran Berhasil!*\n\n` +
              `💰 Top up: *${result.creditAmount} kredit*\n` +
              `💳 Saldo baru: *${result.balance} kredit*\n\n` +
              `Sekarang bisa beli akun di menu 🔑 Beli Akun.`,
              { parse_mode: "Markdown" }
            );
          } catch (e) {
            console.error("[payment] notify user failed:", e.message);
          }
        }
      } else if (evt.status === "EXPIRED") {
        store.markFailed(evt.externalId);
      }

      res.status(200).send("ok");
    } catch (e) {
      console.error("[payment] webhook error:", e);
      res.status(500).send("error");
    }
  });

  return app;
}

module.exports = { createServer };
