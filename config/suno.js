// config/suno.js
// Fonte unica de verdade para toda comunicacao com a API self-hosted do Suno (gcui-art/suno-api).
// Autenticacao via cookie (SUNO_COOKIE), nao via RapidAPI key.
// Para trocar a URL ou o cookie, basta editar o .env — nada aqui precisa mudar.
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const SUNO_BASE = (process.env.SUNO_API_URL || 'http://localhost:3000').replace(/\/+$/, '');
const SUNO_COOKIE = process.env.SUNO_COOKIE || '';

// Endpoints da API self-hosted (gcui-art/suno-api):
// POST /api/custom_generate  - Gerar com letra, tags e titulo customizados
// GET  /api/get?ids=xxx,yyy  - Recuperar info de audio por ID(s)
const ENDPOINTS = {
  generate: '/api/custom_generate',
  status: '/api/get',
};

function getHeaders() {
  return {
    'Cookie': SUNO_COOKIE,
    'Content-Type': 'application/json',
  };
}

export function hasSunoConfigured() {
  return Boolean(SUNO_COOKIE && SUNO_COOKIE.length > 20);
}

export function getGenerateEndpoint() {
  return ENDPOINTS.generate;
}

// Envia a letra + tags para o Suno e retorna o array de clips recebido.
export async function gerarMusica({ letraFinal, tags, passageiroNome }) {
  const body = {
    prompt: letraFinal,
    tags: tags,
    title: `Para ${passageiroNome}`,
    wait_audio: false,
  };

  const endpoint = `${SUNO_BASE}${ENDPOINTS.generate}`;
  console.log(`🎵 Enviando para: ${endpoint}`);

  const response = await axios.post(endpoint, body, { headers: getHeaders() });
  return response.data;
}

// Consulta o status dos clips pelo(s) ID(s). Retorna o array de clips.
export async function verificarStatus(taskId) {
  const endpoint = `${SUNO_BASE}${ENDPOINTS.status}?ids=${encodeURIComponent(taskId)}`;
  console.log(`🔍 Verificando status: ${endpoint}`);

  const response = await axios.get(endpoint, { headers: getHeaders() });
  return response.data;
}

export { SUNO_BASE, SUNO_COOKIE };
export default { hasSunoConfigured, getGenerateEndpoint, gerarMusica, verificarStatus, SUNO_BASE, SUNO_COOKIE };
