const fs = require("fs");
const path = require("path");

function carregarBancoFisica() {
  const ficheiro = path.join(
    __dirname,
    "BIOIA_Fisica_200_Normalizado.json"
  );

  const dados = JSON.parse(
    fs.readFileSync(ficheiro, "utf8")
  );

  if (!Array.isArray(dados) || dados.length !== 200) {
    throw new Error(
      "O banco de Física deve conter exactamente 200 perguntas."
    );
  }

  const ids = new Set();

  const banco = dados.map((p) => {
    if (!p.id || !p.question || !p.options || !p.correct_answer) {
      throw new Error(
        "Pergunta incompleta no banco de Física: " + (p.id || "sem ID")
      );
    }

    if (ids.has(p.id)) {
      throw new Error("ID duplicado no banco de Física: " + p.id);
    }

    ids.add(p.id);

    const opcoes = ["A", "B", "C", "D"];

    for (const letra of opcoes) {
      if (!p.options[letra]) {
        throw new Error(
          "Falta a opção " + letra + " na pergunta " + p.id
        );
      }
    }

    const correta = String(p.correct_answer).toLowerCase();

    if (!opcoes.map((x) => x.toLowerCase()).includes(correta)) {
      throw new Error(
        "Resposta correcta inválida na pergunta " + p.id
      );
    }

    return {
      id: p.id,
      tema: p.topic || "Geral",
      dificuldade: p.difficulty || "Média",
      pergunta: p.question,
      opcoes: opcoes.map((letra) => ({
        id: letra.toLowerCase(),
        texto: p.options[letra]
      })),
      correta,
      explicacao: p.explanation || ""
    };
  });

  console.log("Banco de Física carregado:", banco.length, "perguntas");

  return banco;
}

module.exports = { carregarBancoFisica };
