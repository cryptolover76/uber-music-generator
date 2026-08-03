import assert from 'node:assert/strict';
import test from 'node:test';
import { CatalogSelectionError, selectCatalogItem } from '../../backend/music-preparation/catalog-selector.js';

const items = [
  { id: '00000000-0000-4000-8000-000000000003', active: true, name: 'C', prompt: 'C' },
  { id: '00000000-0000-4000-8000-000000000001', active: true, name: 'A', prompt: 'A' },
  { id: '00000000-0000-4000-8000-000000000002', active: true, name: 'B', prompt: 'B' },
];

test('seleção é determinística e independente da ordem do repositório', () => {
  const options = { telegramUpdateId: '123456789012345678', catalogType: 'style' };
  const first = selectCatalogItem({ ...options, items });
  const second = selectCatalogItem({ ...options, items: [...items].reverse() });
  assert.equal(first.id, second.id);
});

test('considera apenas ativos, categoria e conteúdo obrigatório', () => {
  const selected = selectCatalogItem({
    telegramUpdateId: '1', catalogType: 'period', category: 'Manhã',
    items: [
      { id: '00000000-0000-4000-8000-000000000001', active: false, categoria: 'Manhã', texto: 'inativo' },
      { id: '00000000-0000-4000-8000-000000000002', active: false, categoria: 'Manhã', texto: ' ' },
      { id: '00000000-0000-4000-8000-000000000003', active: true, categoria: 'Noite', texto: 'noite' },
      { id: '00000000-0000-4000-8000-000000000004', active: true, categoria: 'Manhã', texto: 'bom dia' },
    ],
  });
  assert.equal(selected.id, '00000000-0000-4000-8000-000000000004');
});

test('informa ausência de catálogo aplicável com erro de domínio', () => {
  assert.throws(
    () => selectCatalogItem({ items: [], telegramUpdateId: '1', catalogType: 'template' }),
    (error) => error instanceof CatalogSelectionError && error.code === 'CATALOG_NOT_FOUND'
  );
});

test('rejeita UUID inválido, conteúdo obrigatório vazio e IDs duplicados após normalização', () => {
  const base = { active: true, name: 'Estilo', prompt: 'prompt' };
  assert.throws(
    () => selectCatalogItem({ items: [{ ...base, id: 'inválido' }], telegramUpdateId: '1', catalogType: 'style' }),
    (error) => error.code === 'INVALID_CATALOG'
  );
  for (const field of ['name', 'prompt']) {
    assert.throws(
      () => selectCatalogItem({ items: [{ ...base, id: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA', [field]: ' ' }], telegramUpdateId: '1', catalogType: 'style' }),
      (error) => error.code === 'INVALID_CATALOG'
    );
  }
  assert.throws(
    () => selectCatalogItem({
      items: [
        { ...base, id: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA' },
        { ...base, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      ],
      telegramUpdateId: '1', catalogType: 'style',
    }),
    (error) => error.code === 'INVALID_CATALOG' && error.details.reason.includes('duplicate')
  );
});

test('ordena UUID canônico por comparação de código sem localeCompare', () => {
  const original = String.prototype.localeCompare;
  String.prototype.localeCompare = () => { throw new Error('localeCompare não deve ser chamado'); };
  try {
    const selected = selectCatalogItem({ items, telegramUpdateId: '99', catalogType: 'style' });
    assert.ok(items.some((item) => item.id === selected.id));
  } finally {
    String.prototype.localeCompare = original;
  }
});
