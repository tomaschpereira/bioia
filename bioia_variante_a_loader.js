const fs = require("fs");
const path = require("path");

function carregarBancoVarianteA() {
  const caminho = path.join(__dirname, "BIOIA_Variante_A.json");
  const dados = JSON.parse(fs.readFileSync(caminho, "utf8"));

  if (!Array.isArray(dados)) {
    throw new Error("O banco da Variante A deve ser uma lista.");
  }

  return dados.map((q) => ({
    id: q.id,
    tema: q.topic || q.subject,
    dificuldade: q.difficulty,
    pergunta: q.question,
    opcoes: Object.entries(q.options || {}).map(([id, texto]) => ({
      id: id.toLowerCase(),
      texto
    })),
    correta: (q.correct_answer || "").toLowerCase(),
    explicacao: q.explanation || "Sem explicação disponível.",
    reviewRequired: q.review_required === true
  }));
}

module.exports = { carregarBancoVarianteA };
