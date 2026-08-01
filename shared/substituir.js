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

export function montarLetra(partes, template, nome, genero) {
  const letraPrincipal = substituirIntel(template.letra || template.texto, nome, genero);
  const { spokenTexto: spokenTemplate, resto: restoTemplate } = extrairSpokenBlocks(letraPrincipal);

  const versos = [];
  const spokenPartes = [];
  let numeroVerso = 1;

  partes.forEach(parte => {
    if (parte && parte.texto && parte.texto.trim()) {
      const textoSubst = substituirIntel(parte.texto, nome, genero).trim();
      const { spokenTexto: s, resto: r } = extrairSpokenBlocks(textoSubst);
      if (s) spokenPartes.push(s);
      if (r) versos.push(`[Verse ${numeroVerso}]\n${r}`);
      numeroVerso++;
    }
  });

  if (restoTemplate) {
    versos.push(restoTemplate);
  }

  const letraFinal = [];
  if (spokenTemplate) letraFinal.push(spokenTemplate);
  if (spokenPartes.length) letraFinal.push(...spokenPartes);
  letraFinal.push(...versos);

  return letraFinal.filter(Boolean).join('\n\n');
}
