const fs = require("fs");
const path = require("path");

function carregarBancoVarianteD() {
  const caminho = path.join(__dirname, "BIOIA_Variante_D.json");

  const conteudo = fs.readFileSync(caminho, "utf8");
  const perguntas = JSON.parse(conteudo);

  return perguntas.map((p) => ({
    id: p.id,
    tema: p.topic || p.subject || "Variante D",
    pergunta: p.question,
    opcoes: Object.entries(p.options).map(([id, texto]) => ({
      id: id.toLowerCase(),
      texto
    })),
    correta: p.correct_answer
      ? p.correct_answer.toLowerCase()
      : null,
    explicacao: p.explanation || "Consulta o manual para rever esta questão."
  }));
}

module.exports = { carregarBancoVarianteD };
