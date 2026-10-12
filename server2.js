const express = require("express");
const app = express();
const { carregarBancoBiologia } = require("./bioia_biologia_loader");
const { carregarBancoPortugues } = require("./bioia_portugues_loader");
const { carregarBancoFisica } = require("./bioia_fisica_loader");
const { carregarBancoQuimica } = require("./bioia_quimica_loader");
const { carregarBancoVarianteF } = require("./bioia_variante_f_loader");
const { carregarBancoVarianteA } = require("./bioia_variante_a_loader");

app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

const API_VERSION = "v26.0";
const sessoes = {};

  const bancos = {
  portugues: carregarBancoPortugues(),
  fisica: carregarBancoFisica(),
  quimica: carregarBancoQuimica(),
  biologia: carregarBancoBiologia()
};

const bancoVarianteF = carregarBancoVarianteF();
const bancoVarianteA = carregarBancoVarianteA();

const nomes = {
  portugues: "Língua Portuguesa",
  fisica: "Física",
  quimica: "Química",
  biologia: "Biologia"
};

function baralhar(lista) {
  const resultado = [...lista];

  for (let i = resultado.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [resultado[i], resultado[j]] = [resultado[j], resultado[i]];
  }

  return resultado;
}

async function enviar(numero, texto) {
  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    console.error("Faltam variáveis de ambiente do WhatsApp.");
    return;
  }

  const resposta = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: numero,
        type: "text",
        text: { body: texto }
      })
    }
  );

  if (!resposta.ok) {
    const erro = await resposta.text();
    console.error("Erro ao enviar mensagem:", erro);
  }
}

function menu() {
  return [
    "🎓 *BIOIA — Assistente Académico*",
    "",
    "Escolhe uma opção:",
    "",
    "1️⃣ Língua Portuguesa",
    "2️⃣ Física",
    "3️⃣ Química",
    "4️⃣ Biologia",
    "5️⃣ Simulado das quatro disciplinas",
    "6️⃣ Rever erros da sessão",
    "7️⃣ Ver resultados",
"8️⃣ Testes de exames passados",
"9️⃣ Variante A — Exames passados",
"🔟 Variante F — Exames passados",
    "",
    "Envia o número da opção."
  ].join("\n");
}

async function terminarVarianteF(numero, s) {
  const percentagem = s.total ? Math.round((s.pontos / s.total) * 100) : 0;
  let mensagem = `🏁 *Fim da Variante F!*\nResultado: ${s.pontos}/${s.total} (${percentagem}%)\n`;
  if (s.tipoAtividade === "exame") {
    mensagem += "\n*Correcção:*\n" + s.respostasExame.map((r, i) =>
      `${i + 1}. ${r.resposta || "Sem resposta"} — correcta: ${r.corretaId.toUpperCase()}${r.correta ? " ✅" : " ❌"}\n${r.pergunta}\nExplicação: ${r.explicacao}`
    ).join("\n\n");
  }
  s.modo = "menu";
  s.atual = null;
  s.tipoAtividade = null;
  s.respostasExame = [];
  await enviar(numero, `${mensagem}\n\n${menu()}`);
}

async function terminarVarianteA(numero, s) {
  const percentagem = s.total ? Math.round((s.pontos / s.total) * 100) : 0;

  let mensagem = `🏁 *Fim da Variante A!*\nResultado: ${s.pontos}/${s.total} (${percentagem}%)\n`;

  if (s.tipoAtividade === "exame") {
    mensagem += "\n*Correcção:*\n" + s.respostasExame.map((r, i) =>
      `${i + 1}. ${r.resposta || "Sem resposta"} — correcta: ${r.corretaId.toUpperCase()}${r.correta ? " ✅" : " ❌"}\n${r.pergunta}\nExplicação: ${r.explicacao}`
    ).join("\n\n");
  }

  s.modo = "menu";
  s.atual = null;
  s.tipoAtividade = null;
  s.respostasExame = [];

  await enviar(numero, `${mensagem}\n\n${menu()}`);
}
async function mostrarPergunta(numero, s) {
  if (s.indice >= s.fila.length) {
  if (s.disciplina === "variante_f") {
    return terminarVarianteF(numero, s);
  }

  if (s.disciplina === "variante_a") {
    return terminarVarianteA(numero, s);
  }

  s.modo = "menu";
  s.atual = null;
  await enviar(numero, `🏁 *Fim da atividade!*
Resultado: ${s.pontos}/${s.total}
Erros: ${s.erros.length}

${menu()}`);
  return;
}

  const original = s.fila[s.indice];
  const opcoes = baralhar(original.opcoes);
  s.atual = { ...original, opcoes };
   const letras = ["variante_f", "variante_a"].includes(s.disciplina)
  ? "A, B, C, D ou E"
  : "A, B, C ou D";
  const texto = [
    `📚 *${s.atual.tema}*`,
    "",
    `${s.indice + 1}/${s.fila.length}. ${s.atual.pergunta}`,
    "",
    ...opcoes.map(o => `${o.id.toUpperCase()}) ${o.texto}`),
    "",
    `Responde com ${letras}.`
  ].join("\n");
  await enviar(numero, texto);
}

async function iniciar(numero, s, disciplina) {
  s.disciplina = disciplina;
  s.fila = baralhar(bancos[disciplina]);
  s.indice = 0;
  s.pontos = 0;
  s.total = s.fila.length;
  s.erros = [];
  s.modo = "quiz";

  await enviar(
    numero,
    `Vamos estudar ${nomes[disciplina]}! 📖\nTens ${s.total} perguntas nesta atividade.`
  );

  await mostrarPergunta(numero, s);
}

async function processar(numero, textoRecebido) {
  const texto = textoRecebido.trim().toLowerCase();
  const s = sessoes[numero] || {
    modo: "menu",
    erros: [],
    pontos: 0,
    total: 0
  };

  sessoes[numero] = s;

  if (["menu", "inicio", "olá", "ola", "bom dia", "boa tarde", "boa noite"].includes(texto)) {
    s.modo = "menu";
    s.atual = null;
    await enviar(numero, menu());
    return;
}

  
if (s.modo === "escolher_modo_variante_a") {
  if (texto !== "1" && texto !== "2") {
    await enviar(numero, "Escolhe 1 para Modo Estudo ou 2 para Modo Exame.");
    return;
  }

  s.disciplina = "variante_a";
  s.fila = baralhar(bancoVarianteA);
  s.indice = 0;
  s.pontos = 0;
  s.total = s.fila.length;
  s.erros = [];
  s.tipoAtividade = texto === "1" ? "estudo" : "exame";
  s.respostasExame = [];
  s.modo = texto === "1" ? "variante_a_estudo" : "variante_a_exame";

  await enviar(numero, texto === "1"
    ? `📖 *Variante A — Modo Estudo iniciado!*\n${s.total} perguntas. Receberás a correcção após cada resposta.`
    : `📝 *Variante A — Modo Exame iniciado!*\n${s.total} perguntas. A correcção será apresentada no final.`);

  await mostrarPergunta(numero, s);
  return;
}
  if (
  (
    s.modo === "quiz" ||
    s.modo === "variante_f_estudo" ||
    s.modo === "variante_f_exame" ||
    s.modo === "variante_a_estudo" ||
    s.modo === "variante_a_exame"
  ) && s.atual
) {
    const resposta = texto.replace(/[).]/g, "").toLowerCase();
    const letrasValidas = ["variante_f", "variante_a"].includes(s.disciplina)
  ? ["a", "b", "c", "d", "e"]
  : ["a", "b", "c", "d"];
    if (!letrasValidas.includes(resposta)) {
       await enviar(numero, `Responde apenas com ${["variante_f", "variante_a"].includes(s.disciplina) ? "A, B, C, D ou E" : "A, B, C ou D"}. Para voltar ao menu, escreve MENU.`);
      return;
    }

    const correta = s.atual.correta;
    const opcaoCorreta = s.atual.opcoes.find(o => o.id === correta);
    const acertou = resposta === correta;

    if (["variante_f", "variante_a"].includes(s.disciplina) && s.tipoAtividade === "exame") {
      if (acertou) s.pontos++;
      if (!acertou) s.erros.push({
        tema: s.atual.tema, pergunta: s.atual.pergunta,
        tuaResposta: s.atual.opcoes.find(o => o.id === resposta)?.texto || resposta,
        correta: opcaoCorreta?.texto || correta, explicacao: s.atual.explicacao
      });
      s.respostasExame.push({
        pergunta: s.atual.pergunta, resposta: resposta.toUpperCase(),
        correta: acertou, corretaId: correta, explicacao: s.atual.explicacao
      });
      await enviar(numero, `Resposta ${s.indice + 1}/${s.total} registada. A correcção será apresentada no fim.`);
    } else {
      if (acertou) {
        s.pontos++;
        await enviar(numero, `✅ *Resposta correcta!*\n${s.atual.explicacao}`);
      } else {
        s.erros.push({
          tema: s.atual.tema, pergunta: s.atual.pergunta,
          tuaResposta: s.atual.opcoes.find(o => o.id === resposta)?.texto || resposta,
          correta: opcaoCorreta?.texto || correta, explicacao: s.atual.explicacao
        });
        await enviar(numero, `❌ *Resposta incorrecta.*\nResposta certa: ${correta.toUpperCase()}) ${opcaoCorreta?.texto || ""}\n\n${s.atual.explicacao}`);
      }
    }
    s.indice++;
    await mostrarPergunta(numero, s);
    return;
  }
    
   if (s.modo === "escolher_variante") {
    if (["a", "variante a", "variante-a", "1"].includes(texto)) {
      s.disciplina = "variante_a";
      s.modo = "escolher_modo_variante_a";
      await enviar(numero,
        "📘 *Variante A seleccionada.*\n" +
        "Escolhe o modo:\n" +
        "1️⃣ Modo Estudo — correcção imediata\n" +
        "2️⃣ Modo Exame — correcção no fim"
      );
    } else if (["f", "variante f", "variante-f", "2"].includes(texto)) {
      s.disciplina = "variante_f";
      s.modo = "escolher_modo_variante_f";
      await enviar(numero,
        "📘 *Variante F seleccionada.*\n" +
        "Escolhe o modo:\n" +
        "1️⃣ Modo Estudo — correcção imediata\n" +
        "2️⃣ Modo Exame — correcção no fim"
      );
    } else {
      await enviar(numero,
        "Escolhe a variante:\nA — Variante A\nF — Variante F"
      );
    }
    return;
  }
  if (s.modo === "escolher_modo_variante_f") {
    if (texto !== "1" && texto !== "2") {
      await enviar(numero, "Escolhe 1 para Modo Estudo ou 2 para Modo Exame.");
      return;
    }
    s.disciplina = "variante_f";
    s.fila = baralhar(bancoVarianteF);
    s.indice = 0;
    s.pontos = 0;
    s.total = s.fila.length;
    s.erros = [];
    s.tipoAtividade = texto === "1" ? "estudo" : "exame";
    s.respostasExame = [];
    s.modo = texto === "1" ? "variante_f_estudo" : "variante_f_exame";
    await enviar(numero, texto === "1"
      ? `📖 *Modo Estudo iniciado!*\n${s.total} perguntas. Receberás a correcção após cada resposta.`
      : `📝 *Modo Exame iniciado!*\n${s.total} perguntas. A correcção será apresentada no final.`);
    await mostrarPergunta(numero, s);
    return;
  }

  if (texto === "1") return iniciar(numero, s, "portugues");
  if (texto === "2") return iniciar(numero, s, "fisica");
  if (texto === "3") return iniciar(numero, s, "quimica");
  if (texto === "4") return iniciar(numero, s, "biologia");

  if (texto === "5") {
    s.disciplina = "simulado";
    s.fila = baralhar([
      ...bancos.portugues,
      ...bancos.fisica,
      ...bancos.quimica,
      ...bancos.biologia
    ]);
    s.indice = 0;
    s.pontos = 0;
    s.total = s.fila.length;
    s.erros = [];
    s.modo = "quiz";

    await enviar(numero, "📝 *Simulado iniciado!*\nTerás perguntas das quatro disciplinas.");
    await mostrarPergunta(numero, s);
    return;
  }

  if (texto === "6") {
    if (!s.erros.length) {
      await enviar(numero, "Ainda não tens erros registados nesta sessão.");
      return;
    }

    const resumo = s.erros.map((e, i) =>
      `${i + 1}. ${e.tema}\nPergunta: ${e.pergunta}\nA tua resposta: ${e.tuaResposta}\nResposta correta: ${e.correta}\nExplicação: ${e.explicacao}`
    ).join("\n\n");

    await enviar(numero, `📘 *Revisão dos erros*\n\n${resumo}`);
    await enviar(numero, menu());
    s.modo = "menu";
    return;
  }

  if (texto === "7") {
    await enviar(
      numero,
      `📊 *Resultados da sessão*\nAcertos: ${s.pontos}\nPerguntas respondidas: ${s.indice}\nErros registados: ${s.erros.length}\n\n${menu()}`
    );
    s.modo = "menu";
    return;
  }
  if (texto === "9") {
    s.modo = "escolher_modo_variante_a";
    s.atual = null;

    await enviar(numero,
      "📘 *Variante A — Exames passados*\n" +
      "Escolhe o modo:\n" +
      "1️⃣ Modo Estudo — correcção imediata\n" +
      "2️⃣ Modo Exame — correcção no fim"
    );
    return;
  }
    if (texto === "10") {
    s.modo = "escolher_modo_variante_f";
    s.atual = null;

    await enviar(numero,
      "📘 *Variante F — Exames passados*\n" +
      "Escolhe o modo:\n" +
      "1️⃣ Modo Estudo — correcção imediata\n" +
      "2️⃣ Modo Exame — correcção no fim"
    );
    return;
  }
  if (texto === "8") {
    s.modo = "escolher_variante";
    s.atual = null;

    await enviar(numero,
      "📚 *Testes de exames passados*\n\n" +
      "Escolhe a variante:\n" +
      "A — Variante A\n" +
      "F — Variante F\n\n" +
      "Envia A ou F."
    );
    return;
  }

  await enviar(numero, `Não reconheci essa opção.\n\n${menu()}`);
}

app.get("/", (req, res) => {
  res.status(200).send("BIOIA está online 🤖");
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

app.post("/webhook", (req, res) => {
  res.sendStatus(200);

  const entradas = req.body?.entry || [];

  for (const entrada of entradas) {
    for (const mudanca of entrada.changes || []) {
      const mensagens = mudanca.value?.messages || [];

      for (const mensagem of mensagens) {
        if (mensagem.type !== "text") continue;

        const numero = mensagem.from;
        const texto = mensagem.text?.body || "";

        processar(numero, texto).catch(erro => {
          console.error("Erro ao processar mensagem:", erro);
        });
      }
    }
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`BIOIA online na porta ${PORT}`);
});
