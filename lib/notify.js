/**
 * Unified alert layer for internal (founder/team) notifications.
 *
 * Currently sends to Telegram. Built so more channels (SMS, Slack, phone call)
 * can be added later without touching call sites — just extend sendAlert().
 *
 * Setup (Telegram):
 *   1. In Telegram, message @BotFather → /newbot → follow prompts → copy the token.
 *   2. Message your new bot once (say "hi") so it can DM you.
 *   3. Open https://api.telegram.org/bot<TOKEN>/getUpdates and copy the
 *      "chat":{"id":...} number.
 *   4. Set env vars: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.
 *
 * All failures are non-fatal — an alert never blocks the order flow.
 */

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn("Telegram alert skipped: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set");
    return;
  }
  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.error("Telegram alert failed:", resp.status, body);
    }
  } catch (err) {
    console.error("Telegram alert error:", err);
  }
}

/**
 * sendAlert({ title, lines })
 *   title: short headline
 *   lines: array of strings, one per row
 */
export async function sendAlert({ title, lines = [] }) {
  const text = [title, "", ...lines].filter((l) => l !== undefined).join("\n");
  // Fan out to every configured channel (currently just Telegram).
  await sendTelegram(text);
}
