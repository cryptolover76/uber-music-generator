import assert from 'node:assert/strict';
import test from 'node:test';
import { montarLetra } from '../shared/substituir.js';

test('montarLetra substitui nome e artigos para os gêneros M, F e N', () => {
  const template = {
    letra: '{NOME} é {ARTIGO} passageir{O_A} {PREP} carro, viajando {NO_NA} cidade.',
  };

  assert.equal(montarLetra([], template, 'Carlos', 'M'), 'Carlos é o passageiro do carro, viajando no cidade.');
  assert.equal(montarLetra([], template, 'Juliana', 'F'), 'Juliana é a passageira da carro, viajando na cidade.');
  assert.equal(montarLetra([], template, 'Alex', 'N'), 'Alex é  passageir de carro, viajando em cidade.');
});

test('montarLetra mantém a ordem período, clima, dia e template', () => {
  const template = { letra: '[Chorus]\n{NOME}, aproveite a viagem!' };
  const periodo = { texto: 'Bom dia, {NOME}!' };
  const clima = { texto: 'O sol acompanha {NOME}.' };
  const dia = { texto: 'Hoje é sexta, {NOME}.' };

  assert.equal(
    montarLetra([periodo, clima, dia], template, 'Juliana', 'F'),
    '[Verse 1]\nBom dia, Juliana!\n\n[Verse 2]\nO sol acompanha Juliana.\n\n[Verse 3]\nHoje é sexta, Juliana.\n\n[Chorus]\nJuliana, aproveite a viagem!'
  );
});

test('montarLetra coloca blocos Spoken antes dos versos e preserva a numeração atual', () => {
  const template = { letra: '[Spoken: calm]\nBem-vinda, {NOME}.\n[Verse]\nA viagem é especial.' };
  const periodo = { texto: 'Boa noite, {NOME}.' };
  const clima = { texto: '[Intro Falada]\nChove lá fora, {NOME}.' };
  const dia = { texto: 'Sexta-feira chegou, {NOME}.' };

  assert.equal(
    montarLetra([periodo, clima, dia], template, 'Juliana', 'F'),
    '[Spoken: calm]\nBem-vinda, Juliana.\n\n[Intro Falada]\nChove lá fora, Juliana.\n\n[Verse 1]\nBoa noite, Juliana.\n\n[Verse 3]\nSexta-feira chegou, Juliana.\n\n[Verse]\nA viagem é especial.'
  );
});
