import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variáveis do Supabase não encontradas no .env');
  process.exit(1);
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export const TIPOS_VALIDOS = {
  templates_letras: { colunaConteudo: 'letra', categorias: [] },
  climas: { colunaConteudo: 'texto', categorias: ['Ensolarado', 'Chuvoso', 'Nublado'] },
  periodos: { colunaConteudo: 'texto', categorias: ['Manhã', 'Tarde', 'Fim de tarde', 'Noite'] },
  dias_semana: { colunaConteudo: 'texto', categorias: ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo', 'Feriado', 'Fim de semana'] },
  estilos: { colunaConteudo: 'prompt', categorias: ['Moda de viola', 'Rock 80', 'Rock 90', 'Pagode', 'Sertanejo universitário', 'Forró', 'Funk', 'Samba', 'Axé', 'Sertanejo', 'Pop', 'MPB'] },
};

export async function getAll(table) {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function getById(table, id) {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function insertItem(table, nome, conteudo, categoria) {
  const config = TIPOS_VALIDOS[table];
  if (!config) throw new Error(`Tipo inválido: ${table}`);

  const row = { name: nome, [config.colunaConteudo]: conteudo };
  if (categoria) row.categoria = categoria;

  const { data, error } = await supabase
    .from(table)
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateItem(table, id, nome, conteudo, categoria) {
  const config = TIPOS_VALIDOS[table];
  if (!config) throw new Error(`Tipo inválido: ${table}`);

  const row = { name: nome, [config.colunaConteudo]: conteudo };
  if (categoria !== undefined) row.categoria = categoria || null;

  const { data, error } = await supabase
    .from(table)
    .update(row)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteItem(table, id) {
  const { error } = await supabase
    .from(table)
    .update({ active: false })
    .eq('id', id);
  if (error) throw error;
}

export default supabase;
