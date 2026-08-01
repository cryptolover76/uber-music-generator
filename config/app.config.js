// config/app.config.js
// Configurações de API e integrações externas.
// Os catálogos (estilos, climas, periodos, dias, templates) vivem no Supabase.
// A comunicação com o Suno é gerenciada por config/suno.js (fonte única de verdade).
export const config = {
  port: process.env.PORT || 3002,

  suno: {
    cookie: process.env.SUNO_COOKIE || '',
    baseUrl: (process.env.SUNO_API_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  },
};
