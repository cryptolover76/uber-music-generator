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

test('montarLetra coloca Spoken antes e renumera todos os versos em sequência', () => {
  const template = { letra: '[Spoken: calm]\nBem-vinda, {NOME}.\n[Verse]\nA viagem é especial.' };
  const periodo = { texto: 'Boa noite, {NOME}.' };
  const clima = { texto: '[Intro Falada]\nChove lá fora, {NOME}.' };
  const dia = { texto: 'Sexta-feira chegou, {NOME}.' };

  assert.equal(
    montarLetra([periodo, clima, dia], template, 'Juliana', 'F'),
    '[Spoken: calm]\nBem-vinda, Juliana.\n\n[Intro Falada]\nChove lá fora, Juliana.\n\n[Verse 1]\nBoa noite, Juliana.\n\n[Verse 2]\nSexta-feira chegou, Juliana.\n\n[Verse 3]\nA viagem é especial.'
  );
});


test('montarLetra continua a numeração nos versos já numerados do template', () => {
  const template = {
    letra: '[Verse 1]\nParte fixa um.\n[Verse 2]\nParte fixa dois.\n[Chorus]\nRefrão.',
  };

  const periodo = { texto: 'Período.' };
  const clima = { texto: 'Clima.' };
  const dia = { texto: 'Dia.' };

  assert.equal(
    montarLetra([periodo, clima, dia], template, 'Ana', 'F'),
    '[Verse 1]\nPeríodo.\n\n[Verse 2]\nClima.\n\n[Verse 3]\nDia.\n\n[Verse 4]\nParte fixa um.\n[Verse 5]\nParte fixa dois.\n[Chorus]\nRefrão.'
  );
});

test('preserva Intro e Spoken do template antes dos blocos contextuais', () => {
  const template = {
    letra: `[Intro - Sung: gentle but uplifting]
Começa cantando primeiro.

[Short Instrumental Breath]

[Spoken: gentle curiosity]
Ronei...
quem está aí?

{NOME}?

[Spoken: deeply welcoming]
Agora esse momento tem nome.

[Verse]
Parte fixa da música.

[Chorus]
Esse momento é seu, {NOME}.

[Outro - Spoken: intimate gratitude]
Obrigado pela viagem, {NOME}.`,
  };

  const periodo = {
    texto: `[Verse]
Fim de tarde para {NOME}.`,
  };

  const clima = {
    texto: `[Verse]
A chuva acompanha a viagem.`,
  };

  const dia = {
    texto: `[Verse]
Sexta chegou com outra energia.`,
  };

  const resultado = montarLetra(
    [periodo, clima, dia],
    template,
    'Lucas',
    'M',
  );

  assert.equal(
    resultado,
    `[Intro - Sung: gentle but uplifting]
Começa cantando primeiro.

[Short Instrumental Breath]

[Spoken: gentle curiosity]
Ronei...
quem está aí?

Lucas?

[Spoken: deeply welcoming]
Agora esse momento tem nome.

[Verse 1]
Fim de tarde para Lucas.

[Verse 2]
A chuva acompanha a viagem.

[Verse 3]
Sexta chegou com outra energia.

[Verse 4]
Parte fixa da música.

[Chorus]
Esse momento é seu, Lucas.

[Outro - Spoken: intimate gratitude]
Obrigado pela viagem, Lucas.`
  );
});
