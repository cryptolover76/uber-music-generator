// config/app.config.js
export const config = {
  port: process.env.PORT || 3002,

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
    pollingEnabled: process.env.TELEGRAM_POLLING_ENABLED === 'true',
    allowedUserId: process.env.TELEGRAM_ALLOWED_USER_ID || '',
    dailyMusicLimit: process.env.DAILY_MUSIC_LIMIT || '8',
    estimatedCreditCost: process.env.ESTIMATED_CREDIT_COST || '10',
  },

  chromiumPath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',

  musicPreparation: {
    timezone: 'America/Sao_Paulo',
    requestTtlHours: 12,
    periods: {
      morning: '05:00',
      afternoon: '12:00',
      lateAfternoon: '17:00',
      night: '19:00',
    },
  },
};
