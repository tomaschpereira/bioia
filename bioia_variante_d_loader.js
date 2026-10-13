const fs = require("fs");
const path = require("path");

function carregarBancoVarianteD() {
  const caminho = path.join(__dirname, "BIOIA_Variante_D.json");

  if (!fs.existsSync(caminho)) {
    throw new Error(
      "Não foi encontrado o banco da Variante D: " + caminho
    );
  }

  const conteudo = fs.readFileSync(caminho, "utf8");
  const perguntas = JSON.parse(conteudo);

  if (!Array.isArray(perguntas)) {
    throw new Error(
      "O banco da Variante D deve ser uma lista de perguntas."
    );
  }

  const letras = ["A", "B", "C", "D", "E"];

  const ids = new Set();

  return perguntas.map((p, indice) => {
    if (!p.id || ids.has(p.id)) {
      throw new Error(
        "Identificador ausente ou repetido na pergunta " + (indice + 1)
      );
    }

    ids.add(p.id);

    if (!p.question || !p.options || typeof p.options !== "object") {
      throw new Error(
        "Pergunta ou opções inválidas na posição " + (indice + 1)
      );
    }

    for (const letra of letras) {
      if (
        typeof p.options[letra] !== "string" ||
        !p.options[letra].trim()
      ) {
        throw new Error(
          "Pergunta " + p.id + ": falta a opção " + letra
        );
      }
    }

    const resposta = p.correct_answer
      ? String(p.correct_answer).trim().toUpperCase()
      : null;

    if (resposta !== null && !letras.includes(resposta)) {
      throw new Error(
        "Resposta inválida na pergunta " + p.id
      );
    }

    return {
      id: p.id,
      tema: p.topic || p.subject || "Variante D",
      pergunta: p.question,
      opcoes: letras.map(letra => ({
        id: letra.toLowerCase(),
        texto: p.options[letra]
      })),
      correta: resposta ? resposta.toLowerCase() : null,
      explicacao: p.explanation ||
        "Consulta o manual para rever esta questão.",
      reviewStatus: p.review_status || null,
      reviewNote: p.review_note || null,
      disciplina: p.subject || null
    };
  });
}

module.exports = { carregarBancoVarianteD };
