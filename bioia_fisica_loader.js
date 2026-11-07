const fs = require("fs");
const path = require("path");

function carregarBancoFisica() {
  const ficheiros = [
    "BIOIA_Fisica_200_Normalizado.json",
    "BIOIA_Fisica_Introducao_100.json",
    "BIOIA_Fisica_Trabalho_Energia_100.json",
    "BIOIA_Fisica_Ondas_Luz_100.json",
    "BIOIA_Fisica_Dinamica_100.json",
    "BIOIA_Fisica_Mecanica_Fluidos_100.json",
    "BIOIA_Fisica_Gases_100.json",
    "BIOIA_Fisica_Eletromagnetismo_100.json",
    "BIOIA_Fisica_Optica_100.json"
  ];

  const dados = [];
  for (const nome of ficheiros) {
    const ficheiro = path.join(__dirname, nome);
    if (!fs.existsSync(ficheiro)) {
      if (nome === "BIOIA_Fisica_200_Normalizado.json") {
        throw new Error("Ficheiro principal de Física não encontrado: " + nome);
      }
      continue;
    }
    const parte = JSON.parse(fs.readFileSync(ficheiro, "utf8"));
    if (!Array.isArray(parte)) {
      throw new Error("O banco de Física deve ser uma lista: " + nome);
    }
    if (nome !== "BIOIA_Fisica_200_Normalizado.json" && parte.length !== 100) {
      throw new Error(nome + " deve conter exactamente 100 perguntas.");
    }
    dados.push(...parte);
  }

  const ids = new Set();
  const banco = dados.map((p) => {
    if (!p.id || !p.question || !p.options || !p.correct_answer) {
      throw new Error("Pergunta incompleta no banco de Física: " + (p.id || "sem ID"));
    }
    if (ids.has(p.id)) {
      throw new Error("ID duplicado no banco de Física: " + p.id);
    }
    ids.add(p.id);

    const letras = ["A", "B", "C", "D"];
    for (const letra of letras) {
      if (!p.options[letra]) {
        throw new Error("Falta a opção " + letra + " na pergunta " + p.id);
      }
    }
    if (new Set(letras.map((letra) => p.options[letra])).size !== 4) {
      throw new Error("Existem opções repetidas na pergunta " + p.id);
    }

    const correta = String(p.correct_answer).toLowerCase();
    if (!letras.map((x) => x.toLowerCase()).includes(correta)) {
      throw new Error("Resposta correcta inválida na pergunta " + p.id);
    }

    return {
      id: p.id,
      tema: p.topic || "Geral",
      dificuldade: p.difficulty || "Média",
      pergunta: p.question,
      opcoes: letras.map((letra) => ({
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
