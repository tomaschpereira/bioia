const fs = require("fs");
const path = require("path");

function carregarBancoPortugues() {
  const ficheiros = [
    "BIOIA_Portugues_200_Normalizado.json",
    "BIOIA_Portugues_Etapa1_100.json",
    "BIOIA_Portugues_Etapa2_100.json",
    "BIOIA_Portugues_Tema1_TextoEscrito_60.json"
  ];

  const letras = ["A", "B", "C", "D"];
  const dados = ficheiros.flatMap(nome => {
    const caminho = path.join(__dirname, nome);

    if (!fs.existsSync(caminho)) {
      throw new Error("Não foi encontrado o banco de Português: " + caminho);
    }

    const conteudo = JSON.parse(fs.readFileSync(caminho, "utf8"));

    if (!Array.isArray(conteudo)) {
      throw new Error("O banco " + nome + " deve ser uma lista de perguntas.");
    }

    return conteudo;
  });

  const perguntas = dados.map((q, indice) => {
    const opcoesFonte = q.options || {};

    for (const letra of letras) {
      if (
        typeof opcoesFonte[letra] !== "string" ||
        !opcoesFonte[letra].trim()
      ) {
        throw new Error(
          "Pergunta " + (q.id || indice + 1) +
          ": falta a opção " + letra
        );
      }
    }

    const resposta = String(q.correct_answer || "").trim().toUpperCase();

    if (!letras.includes(resposta)) {
      throw new Error("Resposta inválida na pergunta " + q.id);
    }

    if (!q.id || !q.question || !q.explanation) {
      throw new Error("Falta o identificador, a pergunta ou a explicação: " + (q.id || indice + 1));
    }

    return {
      id: q.id,
      tema: q.topic || "Língua Portuguesa",
      dificuldade: q.difficulty || "Médio",
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
    throw new Error("Existem identificadores repetidos nos bancos de Português.");
  }

  console.log(
    "BIOIA: " + perguntas.length +
    " perguntas de Português carregadas (" +
    ficheiros.length + " ficheiros)."
  );

  return perguntas;
}

module.exports = { carregarBancoPortugues };
