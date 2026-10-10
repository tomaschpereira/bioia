const fs = require('fs');
const path = require('path');

function carregarBancoBiologia() {
  const caminho = path.join(
    __dirname,
    'BIOIA_Biologia_200_Revisado.json'
  );

  if (!fs.existsSync(caminho)) {
    throw new Error(
      'Não foi encontrado o banco de Biologia: ' + caminho
    );
  }

  const dados = JSON.parse(
    fs.readFileSync(caminho, 'utf8')
  );

  if (!Array.isArray(dados)) {
    throw new Error(
      'O banco de Biologia deve ser uma lista de perguntas.'
    );
  }

  const letras = ['A', 'B', 'C', 'D'];

  const perguntas = dados.map((q, indice) => {
    const opcoesFonte = q.options || {};

    for (const letra of letras) {
      if (
        typeof opcoesFonte[letra] !== 'string' ||
        !opcoesFonte[letra].trim()
      ) {
        throw new Error(
          'Pergunta ' + (q.id || indice + 1) +
          ': falta a opção ' + letra
        );
      }
    }

    const resposta = String(
      q.correct_answer || ''
    ).trim().toUpperCase();

    if (!letras.includes(resposta)) {
      throw new Error(
        'Resposta inválida na pergunta ' + q.id
      );
    }

    if (!q.question || !q.explanation) {
      throw new Error(
        'Falta a pergunta ou explicação: ' + q.id
      );
    }

    return {
      id: q.id,
      tema: q.topic || 'Biologia',
      dificuldade: q.difficulty || 'Médio',
      pergunta: q.question,
      opcoes: letras.map(letra => ({
        id: letra.toLowerCase(),
        texto: opcoesFonte[letra]
      })),
      correta: resposta.toLowerCase(),
      explicacao: q.explanation
    };
  });

  const ids = perguntas.map(q => q.id);

  if (new Set(ids).size !== ids.length) {
    throw new Error(
      'Existem identificadores repetidos no banco.'
    );
  }

  console.log(
    'BIOIA: ' + perguntas.length +
    ' perguntas de Biologia carregadas.'
  );

  return perguntas;
}

module.exports = {
  carregarBancoBiologia
};
