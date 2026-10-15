const express = require("express");
const app = express();

const { carregarBancoBiologia } = require("./bioia_biologia_loader");
const { carregarBancoPortugues } = require("./bioia_portugues_loader");
const { carregarBancoFisica } = require("./bioia_fisica_loader");
const { carregarBancoQuimica } = require("./bioia_quimica_loader");
const { carregarBancoVarianteF } = require("./bioia_variante_f_loader");
const { carregarBancoVarianteA } = require("./bioia_variante_a_loader");
const { carregarBancoVarianteD } = require("./bioia_variante_d_loader");

app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

const API_VERSION = "v26.0";
const sessoes = {};
const filasMensagens = {};

// Processa as mensagens de cada utilizador pela ordem em que chegam.
function processarEmFila(numero, texto) {
  const anterior = filasMensagens[numero] || Promise.resolve();
  const atual = anterior
    .catch(() => {})
    .then(() => processar(numero, texto))
    .catch(erro => console.error("Erro ao processar mensagem:", erro));

  filasMensagens[numero] = atual;
  return atual.finally(() => {
    if (filasMensagens[numero] === atual) delete filasMensagens[numero];
  });
}

// Divide mensagens longas para respeitar os limites de envio do WhatsApp.
async function enviarEmPartes(numero, texto, limite = 3000) {
  const blocos = String(texto).split("\n\n");
  let parte = "";

  for (const bloco of blocos) {
    if (bloco.length > limite) {
      if (parte) { await enviar(numero, parte); parte = ""; }
      for (let i = 0; i < bloco.length; i += limite) {
        await enviar(numero, bloco.slice(i, i + limite));
      }
      continue;
    }
    const candidato = parte ? `${parte}\n\n${bloco}` : bloco;
    if (candidato.length > limite) {
      if (parte) await enviar(numero, parte);
      parte = bloco;
    } else {
      parte = candidato;
    }
  }
  if (parte) await enviar(numero, parte);
}

function resumoDesempenho(s) {
  const respondidas = Number(s.indice || 0);
  const pontos = Number(s.pontos || 0);
  const total = Number(s.total || 0);
  const erros = Array.isArray(s.erros) ? s.erros : [];
  const percentagem = respondidas ? Math.round((pontos / respondidas) * 100) : 0;
  const nota20 = respondidas ? (pontos / respondidas * 20).toFixed(1).replace(".", ",") : "0,0";
  const porTema = {};
  for (const erro of erros) {
    const tema = erro.tema || "Tema não identificado";
    porTema[tema] = (porTema[tema] || 0) + 1;
  }
  const temas = Object.entries(porTema).sort((a, b) => b[1] - a[1]).slice(0, 5);

  let mensagem =
    `📊 *Relatório de desempenho*\n` +
    `Perguntas respondidas: ${respondidas}${total ? `/${total}` : ""}\n` +
    `✅ Acertos: ${pontos}\n` +
    `❌ Erros: ${erros.length}\n` +
    `🎯 Aproveitamento: ${percentagem}%\n` +
    `🏆 Nota estimada: ${nota20}/20`;
  if (temas.length) {
    mensagem += "\n\n📚 *Temas a rever (por número de erros):*\n" +
      temas.map(([tema, quantidade]) => `• ${tema}: ${quantidade} erro(s)`).join("\n");
  } else if (respondidas) {
    mensagem += "\n\nExcelente: não há erros registados nesta sessão.";
  }
  return mensagem;
}

const bancos = {
  portugues: carregarBancoPortugues(),
  fisica: carregarBancoFisica(),
  quimica: carregarBancoQuimica(),
  biologia: carregarBancoBiologia()
};

const bancoVarianteF = carregarBancoVarianteF();
const bancoVarianteA = carregarBancoVarianteA();
const bancoVarianteD = carregarBancoVarianteD();

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
    "1️⃣1️⃣ Variante D — Medicina (UKB)",
    "",
    "Envia o número da opção."
  ].join("\n");
}
async function terminarVarianteF(numero, s) {
  const percentagem = s.total
    ? Math.round((s.pontos / s.total) * 100)
    : 0;

  let mensagem =
    `🏁 *Fim da Variante F!*\n` +
    `Resultado: ${s.pontos}/${s.total} (${percentagem}%)\n`;

  if (s.tipoAtividade === "exame") {
    mensagem += "\n*Correcção:*\n" +
      s.respostasExame.map((r, i) =>
        `${i + 1}. ${r.resposta || "Sem resposta"} — ` +
        `correcta: ${r.corretaId.toUpperCase()}` +
        `${r.correta ? " ✅" : " ❌"}\n` +
        `${r.pergunta}\nExplicação: ${r.explicacao}`
      ).join("\n\n");
  }

  s.modo = "menu";
  s.atual = null;
  s.tipoAtividade = null;
  s.respostasExame = [];

  await enviar(numero, `${mensagem}\n\n${menu()}`);
}

async function terminarVarianteA(numero, s) {
  const percentagem = s.total
    ? Math.round((s.pontos / s.total) * 100)
    : 0;

  let mensagem =
    `🏁 *Fim da Variante A!*\n` +
    `Resultado: ${s.pontos}/${s.total} (${percentagem}%)\n`;

  if (s.tipoAtividade === "exame") {
    mensagem += "\n*Correcção:*\n" +
      s.respostasExame.map((r, i) =>
        `${i + 1}. ${r.resposta || "Sem resposta"} — ` +
        `correcta: ${r.corretaId.toUpperCase()}` +
        `${r.correta ? " ✅" : " ❌"}\n` +
        `${r.pergunta}\nExplicação: ${r.explicacao}`
      ).join("\n\n");
  }

  s.modo = "menu";
  s.atual = null;
  s.tipoAtividade = null;
  s.respostasExame = [];

  await enviar(numero, `${mensagem}\n\n${menu()}`);
}

async function terminarVarianteD(numero, s) {
  const percentagem = s.total ? Math.round((s.pontos / s.total) * 100) : 0;
  const nota20 = s.total ? (s.pontos / s.total * 20).toFixed(1).replace(".", ",") : "0,0";

  let mensagem =
    `🏁 *Fim da Variante D — Medicina (UKB)!*\n` +
    `Resultado: ${s.pontos}/${s.total} (${percentagem}%)\n` +
    `Nota estimada: ${nota20}/20\n` +
    `Acertos: ${s.pontos} | Erros: ${s.erros.length}`;

  const porTema = {};
  for (const erro of s.erros) {
    const tema = erro.tema || "Tema não identificado";
    porTema[tema] = (porTema[tema] || 0) + 1;
  }
  const temas = Object.entries(porTema).sort((a, b) => b[1] - a[1]).slice(0, 5);
  mensagem += temas.length
    ? "\n\n📚 *Temas que deves rever:*\n" +
      temas.map(([tema, quantidade]) => `• ${tema}: ${quantidade} erro(s)`).join("\n")
    : "\n\nExcelente! Não registaste erros.";

  if (s.tipoAtividade === "exame") mensagem += "\n\n📝 *Correção pergunta a pergunta:*";

  const correcoes = s.tipoAtividade === "exame"
    ? (s.respostasExame || []).map((r, i) =>
        `${i + 1}. ${r.pergunta}\n` +
        `A tua resposta: ${r.respostaTexto || r.resposta || "Sem resposta"}\n` +
        `Resposta correta: ${r.corretaTexto || r.corretaId?.toUpperCase() || "não identificada"} ` +
        `${r.correta ? "✅" : "❌"}\n` +
        `Explicação: ${r.explicacao || "Sem explicação disponível."}`
      )
    : [];

  s.modo = "menu";
  s.atual = null;
  s.tipoAtividade = null;
  s.respostasExame = [];

  await enviarEmPartes(numero, mensagem);
  if (correcoes.length) await enviarEmPartes(numero, correcoes.join("\n\n"));
  await enviarEmPartes(numero, menu());
}

async function mostrarPergunta(numero, s) {
  if (s.indice >= s.fila.length) {
    if (s.disciplina === "variante_f") {
      return terminarVarianteF(numero, s);
    }

    if (s.disciplina === "variante_a") {
      return terminarVarianteA(numero, s);
    }

    if (s.disciplina === "variante_d") {
      return terminarVarianteD(numero, s);
    }

    s.modo = "menu";
    s.atual = null;

    await enviar(
      numero,
      `🏁 *Fim da atividade!*
Resultado: ${s.pontos}/${s.total}
Erros: ${s.erros.length}

${menu()}`
    );

    return;
  }

  const original = s.fila[s.indice];
  const opcoes = baralhar(original.opcoes);

  s.atual = { ...original, opcoes };

  const letras = [
    "variante_f",
    "variante_a",
    "variante_d"
  ].includes(s.disciplina)
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
    `Vamos estudar ${nomes[disciplina]}! 📖\n` +
    `Tens ${s.total} perguntas nesta atividade.`
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

  if (
    ["menu", "inicio", "olá", "ola", "bom dia",
      "boa tarde", "boa noite"].includes(texto)
  ) {
    s.modo = "menu";
    s.atual = null;

    await enviar(numero, menu());
    return;
  }

  // VARIANTE D — ESCOLHA DO MODO
  if (s.modo === "escolher_modo_variante_d") {
    if (texto !== "1" && texto !== "2") {
      await enviar(
        numero,
        "Escolhe 1 para Modo Estudo ou 2 para Modo Exame."
      );
      return;
    }

    s.disciplina = "variante_d";
    s.fila = baralhar(bancoVarianteD);
    s.indice = 0;
    s.pontos = 0;
    s.total = s.fila.length;
    s.erros = [];

    s.tipoAtividade = texto === "1" ? "estudo" : "exame";
    s.respostasExame = [];

    s.modo = texto === "1"
      ? "variante_d_estudo"
      : "variante_d_exame";

    await enviar(
      numero,
      texto === "1"
        ? `📖 *Variante D — Modo Estudo iniciado!*\n` +
          `${s.total} perguntas. Receberás a correção após cada resposta.`
        : `📝 *Variante D — Modo Exame iniciado!*\n` +
          `${s.total} perguntas. A correção será apresentada no final.`
    );

    await mostrarPergunta(numero, s);
    return;
  }

  // VARIANTE A — ESCOLHA DO MODO
  if (s.modo === "escolher_modo_variante_a") {
    if (texto !== "1" && texto !== "2") {
      await enviar(
        numero,
        "Escolhe 1 para Modo Estudo ou 2 para Modo Exame."
      );
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

    s.modo = texto === "1"
      ? "variante_a_estudo"
      : "variante_a_exame";

    await enviar(
      numero,
      texto === "1"
        ? `📖 *Variante A — Modo Estudo iniciado!*\n` +
          `${s.total} perguntas. Receberás a correcção após cada resposta.`
        : `📝 *Variante A — Modo Exame iniciado!*\n` +
          `${s.total} perguntas. A correcção será apresentada no final.`
    );

    await mostrarPergunta(numero, s);
    return;
  }

  // PROCESSAMENTO DAS RESPOSTAS
  if (
    (
      s.modo === "quiz" ||
      s.modo === "variante_f_estudo" ||
      s.modo === "variante_f_exame" ||
      s.modo === "variante_a_estudo" ||
      s.modo === "variante_a_exame" ||
      s.modo === "variante_d_estudo" ||
      s.modo === "variante_d_exame"
    ) && s.atual
  ) {
    const resposta = texto.replace(/[).]/g, "").toLowerCase();

    const letrasValidas = [
      "variante_f",
      "variante_a",
      "variante_d"
    ].includes(s.disciplina)
      ? ["a", "b", "c", "d", "e"]
      : ["a", "b", "c", "d"];

    if (!letrasValidas.includes(resposta)) {
      const alternativas = [
        "variante_f",
        "variante_a",
        "variante_d"
      ].includes(s.disciplina)
        ? "A, B, C, D ou E"
        : "A, B, C ou D";

      await enviar(
        numero,
        `Responde apenas com ${alternativas}. Para voltar ao menu, escreve MENU.`
      );

      return;
    }

    const correta = s.atual.correta;
    const opcaoCorreta = s.atual.opcoes.find(
      o => o.id === correta
    );

    const acertou = resposta === correta;

    // MODO EXAME: CORREÇÃO NO FINAL
    if (
      ["variante_f", "variante_a", "variante_d"].includes(s.disciplina) &&
      s.tipoAtividade === "exame"
    ) {
      if (acertou) {
        s.pontos++;
      }

      if (!acertou) {
        s.erros.push({
          tema: s.atual.tema,
          pergunta: s.atual.pergunta,
          tuaResposta:
            s.atual.opcoes.find(o => o.id === resposta)?.texto || resposta,
          correta: opcaoCorreta?.texto || correta,
          explicacao: s.atual.explicacao
        });
      }

      s.respostasExame.push({
        tema: s.atual.tema,
        pergunta: s.atual.pergunta,
        resposta: resposta.toUpperCase(),
        respostaTexto: s.atual.opcoes.find(o => o.id === resposta)?.texto || resposta.toUpperCase(),
        correta: acertou,
        corretaId: correta,
        corretaTexto: opcaoCorreta?.texto || correta.toUpperCase(),
                explicacao: s.atual.explicacao
      });

      await enviar(
        numero,
        `Resposta ${s.indice + 1}/${s.total} registada. ` +
        "A correção será apresentada no fim."
      );
    } else {
      // MODO ESTUDO: CORREÇÃO IMEDIATA
      if (acertou) {
        s.pontos++;

        await enviar(
          numero,
          `✅ *Resposta correcta!*\n${s.atual.explicacao}`
        );
      } else {
        s.erros.push({
          tema: s.atual.tema,
          pergunta: s.atual.pergunta,
          tuaResposta:
            s.atual.opcoes.find(o => o.id === resposta)?.texto || resposta,
          correta: opcaoCorreta?.texto || correta,
          explicacao: s.atual.explicacao
        });

        await enviar(
          numero,
          `❌ *Resposta incorrecta.*\n` +
          `Resposta certa: ${correta.toUpperCase()}) ` +
          `${opcaoCorreta?.texto || ""}\n\n` +
          `${s.atual.explicacao}`
        );
      }
    }

    s.indice++;

    await mostrarPergunta(numero, s);
    return;
  }

  // ESCOLHER VARIANTE NOS EXAMES PASSADOS
  if (s.modo === "escolher_variante") {
    if (
      ["a", "variante a", "variante-a", "1"].includes(texto)
    ) {
      s.disciplina = "variante_a";
      s.modo = "escolher_modo_variante_a";

      await enviar(
        numero,
        "📘 *Variante A seleccionada.*\n" +
        "Escolhe o modo:\n" +
        "1️⃣ Modo Estudo — correcção imediata\n" +
        "2️⃣ Modo Exame — correcção no fim"
      );
    } else if (
      ["f", "variante f", "variante-f", "2"].includes(texto)
    ) {
      s.disciplina = "variante_f";
      s.modo = "escolher_modo_variante_f";

      await enviar(
        numero,
        "📘 *Variante F seleccionada.*\n" +
        "Escolhe o modo:\n" +
        "1️⃣ Modo Estudo — correcção imediata\n" +
        "2️⃣ Modo Exame — correcção no fim"
      );
    } else if (
      ["d", "variante d", "variante-d", "3"].includes(texto)
    ) {
      s.disciplina = "variante_d";
      s.modo = "escolher_modo_variante_d";

      await enviar(
        numero,
        "📘 *Variante D — Medicina (UKB) seleccionada.*\n" +
        "Escolhe o modo:\n" +
        "1️⃣ Modo Estudo — correção imediata\n" +
        "2️⃣ Modo Exame — correção no fim"
      );
    } else {
      await enviar(
        numero,
        "Escolhe a variante:\n" +
        "A — Variante A\n" +
        "F — Variante F\n" +
        "D — Variante D"
      );
    }

    return;
  }

  // VARIANTE F — ESCOLHA DO MODO
  if (s.modo === "escolher_modo_variante_f") {
    if (texto !== "1" && texto !== "2") {
      await enviar(
        numero,
        "Escolhe 1 para Modo Estudo ou 2 para Modo Exame."
      );
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

    s.modo = texto === "1"
      ? "variante_f_estudo"
      : "variante_f_exame";

    await enviar(
      numero,
      texto === "1"
        ? `📖 *Modo Estudo iniciado!*\n` +
          `${s.total} perguntas. Receberás a correcção após cada resposta.`
        : `📝 *Modo Exame iniciado!*\n` +
          `${s.total} perguntas. A correcção será apresentada no final.`
    );

    await mostrarPergunta(numero, s);
    return;
  }
  
  // MENU PRINCIPAL
  if (texto === "1") {
    return iniciar(numero, s, "portugues");
  }

  if (texto === "2") {
    return iniciar(numero, s, "fisica");
  }

  if (texto === "3") {
    return iniciar(numero, s, "quimica");
  }

  if (texto === "4") {
    return iniciar(numero, s, "biologia");
  }

  // SIMULADO DAS QUATRO DISCIPLINAS
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

    await enviar(
      numero,
            `📚 *Simulado geral iniciado!*\n` +
      `Total de perguntas: ${s.total}\n` +
      `Disciplinas: Português, Física, Química e Biologia.`
    );

    await mostrarPergunta(numero, s);
    return;
  }

  // EXAMES PASSADOS
  if (texto === "6") {
    s.modo = "escolher_variante";

    await enviar(
      numero,
      "📘 *Escolhe a variante do exame:*\n\n" +
      "A — Variante A\n" +
      "F — Variante F\n" +
      "D — Variante D (Medicina — UKB)"
    );

    return;
  }

  // DESEMPENHO
  if (texto === "7") {
    await enviar(numero, resumoDesempenho(s));
    return;
  }

  // REINICIAR
  if (texto === "8") {
    sessoes[numero] = {
      modo: "menu",
      erros: [],
      pontos: 0,
      total: 0
    };

    await enviar(numero, menu());
    return;
  }

  // AJUDA
  if (texto === "9") {
    await enviar(
      numero,
      "ℹ️ *Ajuda BIOIA*\n\n" +
      "1 — Português\n" +
      "2 — Física\n" +
      "3 — Química\n" +
      "4 — Biologia\n" +
      "5 — Simulado geral\n" +
      "6 — Exames passados\n" +
      "7 — Ver desempenho\n" +
      "8 — Reiniciar\n" +
      "9 — Ajuda\n" +
      "10 — Sobre o BIOIA\n" +
      "11 — Sair\n\n" +
      "Durante um exercício, responde com a letra da opção correcta.\n" +
      "Escreve MENU para voltar ao menu principal."
    );

    return;
  }

  // SOBRE O BIOIA
  if (texto === "10") {
    await enviar(
      numero,
      "🤖 *BIOIA — Preparação para Exames*\n\n" +
      "O BIOIA ajuda-te a preparar os exames de admissão, " +
      "com perguntas de prática, simulados e acompanhamento do desempenho."
    );

    return;
  }

  // SAIR
  if (texto === "11") {
    s.modo = "menu";
    s.atual = null;

    await enviar(
      numero,
      "👋 Até breve! Quando quiseres estudar novamente, escreve MENU."
    );

    return;
  }

  await enviar(numero, menu());
}

// WEBHOOK WHATSAPP
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const entry = req.body.entry || [];

    for (const e of entry) {
      for (const change of e.changes || []) {
        const value = change.value || {};
        const messages = value.messages || [];

        for (const msg of messages) {
          if (msg.type !== "text") continue;

          const numero = msg.from;
          const texto = msg.text?.body || "";

          processarEmFila(numero, texto).catch(err => {
            console.error("Erro ao processar mensagem:", err);
          });
        }
      }
    }
  } catch (err) {
    console.error("Erro no webhook:", err);
  }
});

// VERIFICAÇÃO DO WEBHOOK
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// ROTA DE TESTE
app.get("/", (req, res) => {
  res.send("BIOIA está online!");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`BIOIA a correr na porta ${PORT}`);
});
