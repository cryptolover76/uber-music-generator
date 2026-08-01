// config/app.config.js
export const config = {
  port: process.env.PORT || 3002,

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
  },

  chromiumPath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
};
