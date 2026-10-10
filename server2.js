const express = require("express");
const app = express();
const { carregarBancoBiologia } = require("./bioia_biologia_loader");
const { carregarBancoPortugues } = require("./bioia_portugues_loader");
const { carregarBancoFisica } = require("./bioia_fisica_loader");
const { carregarBancoQuimica } = require("./bioia_quimica_loader");

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
    "🤖 *BIOIA — Tutor de Exames*",
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
    "",
    "Envia o número da opção."
  ].join("\n");
}

async function mostrarPergunta(numero, s) {
  if (s.indice >= s.fila.length) {
    s.modo = "menu";
    s.atual = null;

    await enviar(
      numero,
      `🏁 *Fim da atividade!*\nResultado: ${s.pontos}/${s.total}\nErros: ${s.erros.length}\n\n${menu()}`
    );
    return;
  }

  const original = s.fila[s.indice];
  const opcoes = baralhar(original.opcoes);

  s.atual = {
    ...original,
    opcoes
  };

  const texto = [
    `📚 *${s.atual.tema}*`,
    "",
    `${s.indice + 1}/${s.fila.length}. ${s.atual.pergunta}`,
    "",
    ...opcoes.map(o => `${o.id.toUpperCase()}) ${o.texto}`),
    "",
    "Responde com A, B, C ou D."
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
    await enviar(numero, menu());
    return;
  }

  if (s.modo === "quiz" && s.atual) {
    const resposta = texto.replace(/[).]/g, "");

    if (!["a", "b", "c", "d"].includes(resposta)) {
      await enviar(numero, "Responde apenas com A, B, C ou D. Para voltar ao menu, escreve MENU.");
      return;
    }

    const correta = s.atual.correta;
    const opcaoCorreta = s.atual.opcoes.find(o => o.id === correta);

    if (resposta === correta) {
      s.pontos++;
      await enviar(
        numero,
        `✅ *Resposta correta!*\n${s.atual.explicacao}`
      );
    } else {
      s.erros.push({
        tema: s.atual.tema,
        pergunta: s.atual.pergunta,
        tuaResposta: s.atual.opcoes.find(o => o.id === resposta)?.texto || resposta,
        correta: opcaoCorreta.texto,
        explicacao: s.atual.explicacao
      });

      await enviar(
        numero,
        `❌ *Resposta incorreta.*\nResposta certa: ${correta.toUpperCase()}) ${opcaoCorreta.texto}\n\n${s.atual.explicacao}`
      );
    }

    s.indice++;
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
