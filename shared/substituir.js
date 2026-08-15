export function substituirIntel(texto, nome, genero) {
  let artigo = 'o', prep = 'do', no_na = 'no', o_a = 'o';
  if (genero === 'F') {
    artigo = 'a'; prep = 'da'; no_na = 'na'; o_a = 'a';
  } else if (genero === 'N') {
    artigo = ''; prep = 'de'; no_na = 'em'; o_a = '';
  }

  return texto
    .replace(/{NOME}/g, nome)
    .replace(/{PASSAGEIRO}/g, nome)
    .replace(/{ARTIGO}/g, artigo)
    .replace(/{O_A}/g, o_a)
    .replace(/{PREP}/g, prep)
    .replace(/{NO_NA}/g, no_na);
}

const SPOKEN_REGEX = /\[(?:Spoken(?:\s+Intro)?(?:\s*:\s*[^\]]*)?|Intro\s+Falada(?:\s*:\s*[^\]]*)?|Falado(?:\s*:\s*[^\]]*)?|Spoken\s+Intro(?:\s*:\s*[^\]]*)?|Intro\s*-\s*Spoken(?:\s*:\s*[^\]]*)?)\][\s\S]*?(?=\[(?:Verse|Chorus|Bridge|Pre-Chorus|Outro|Spoken|Hook|Refrão|Verso|Intro|Intro Falada|Falado)|$)/gi;

function extrairSpokenBlocks(texto) {
  const blocos = texto.match(SPOKEN_REGEX) || [];
  const resto = texto.replace(SPOKEN_REGEX, '').trim();
  const spokenTexto = blocos.map(b => b.trim()).join('\n\n').trim();
  return { spokenTexto, resto };
}

function renumerarVersos(texto) {
  let numero = 0;

  return texto.replace(
    /\[Verse(?:\s+\d+)?\]/gi,
    () => `[Verse ${++numero}]`,
  );
}

export function montarLetra(partes, template, nome, genero) {
  const letraPrincipal = substituirIntel(
    template.letra || template.texto,
    nome,
    genero
  ).trim();

  /*
   * Preserva integralmente a abertura do Template.
   *
   * Tudo que estiver antes do primeiro [Verse] continua exatamente
   * na ordem criada no Admin:
   *
   * [Intro]
   * [Instrumental]
   * [Spoken]
   * pausas
   * etc.
   *
   * Período + Clima + Dia entram imediatamente antes do primeiro
   * Verse fixo do Template.
   */
  const primeiroVerse = letraPrincipal.search(
    /\[Verse(?:\s+\d+)?\]/i
  );

  const abertura =
    primeiroVerse >= 0
      ? letraPrincipal.slice(0, primeiroVerse).trim()
      : '';

  const corpoTemplate =
    primeiroVerse >= 0
      ? letraPrincipal.slice(primeiroVerse).trim()
      : letraPrincipal;

  const blocosContextuais = [];
  const falasContextuais = [];

  partes.forEach((parte) => {
    if (!parte?.texto?.trim()) return;

    let texto = substituirIntel(
      parte.texto,
      nome,
      genero
    ).trim();

    /*
     * Compatibilidade com blocos antigos:
     * se Período, Clima ou Dia possuir Spoken/Intro Falada,
     * essa fala continua independente e nunca fica dentro
     * de um [Verse].
     */
    const {
      spokenTexto,
      resto,
    } = extrairSpokenBlocks(texto);

    if (spokenTexto) {
      falasContextuais.push(spokenTexto);
    }

    texto = resto.trim();

    /*
     * Remove somente o marcador Verse inicial.
     * A numeração final será feita depois.
     */
    texto = texto.replace(
      /^\[Verse(?:\s+\d+)?\]\s*/i,
      ''
    ).trim();

    if (texto) {
      blocosContextuais.push(`[Verse]\n${texto}`);
    }
  });

  const letraFinal = [
    abertura,
    ...falasContextuais,
    ...blocosContextuais,
    corpoTemplate,
  ]
    .filter(Boolean)
    .join('\n\n');

  return renumerarVersos(letraFinal);
}

