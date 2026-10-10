const express = require("express");
const app = express();
const { carregarBancoBiologia } = require("./bioia_biologia_loader");

app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

const API_VERSION = "v26.0";
const sessoes = {};

const banco = {
  portugues: [
    {
      tema: "Semântica",
      pergunta: "Na frase «Embora estivesse cansado, continuou a estudar», «embora» exprime:",
      opcoes: [
        { id: "a", texto: "Causa" },
        { id: "b", texto: "Concessão" },
        { id: "c", texto: "Consequência" },
        { id: "d", texto: "Condição" }
      ],
      correta: "b",
      explicacao: "«Embora» introduz uma ideia de concessão: o cansaço não impediu que continuasse a estudar."
    },
    {
      tema: "Estrutura das palavras",
      pergunta: "Na palavra «infelizmente», qual é a função de «-mente»?",
      opcoes: [
        { id: "a", texto: "Sufixo que forma um advérbio" },
        { id: "b", texto: "Prefixo de negação" },
        { id: "c", texto: "Desinência verbal" },
        { id: "d", texto: "Radical da palavra" }
      ],
      correta: "a",
      explicacao: "O sufixo «-mente» forma frequentemente advérbios a partir de adjetivos."
    },
    {
      tema: "Fonética e fonologia",
      pergunta: "Qual par apresenta palavras que diferem apenas no fonema inicial?",
      opcoes: [
        { id: "a", texto: "Casa / casas" },
        { id: "b", texto: "Menino / rapaz" },
        { id: "c", texto: "Pato / gato" },
        { id: "d", texto: "Flor / flores" }
      ],
      correta: "c",
      explicacao: "«Pato» e «gato» diferem no fonema inicial, /p/ e /g/."
    }
  ],

  fisica: [
    {
      tema: "Trabalho e energia",
      pergunta: "Uma força de 20 N desloca um corpo 3 m na mesma direção. Qual é o trabalho realizado?",
      opcoes: [
        { id: "a", texto: "6 J" },
        { id: "b", texto: "23 J" },
        { id: "c", texto: "60 J" },
        { id: "d", texto: "0 J" }
      ],
      correta: "c",
      explicacao: "W = F × d. Logo, W = 20 × 3 = 60 J."
    },
    {
      tema: "Dinâmica",
      pergunta: "Uma força resultante de 12 N atua sobre uma massa de 3 kg. Qual é a aceleração?",
      opcoes: [
        { id: "a", texto: "36 m/s²" },
        { id: "b", texto: "4 m/s²" },
        { id: "c", texto: "9 m/s²" },
        { id: "d", texto: "0,25 m/s²" }
      ],
      correta: "b",
      explicacao: "Pela segunda lei de Newton, a = F/m = 12/3 = 4 m/s²."
    },
    {
      tema: "Ondas",
      pergunta: "Uma onda tem frequência de 50 Hz e comprimento de onda de 4 m. Qual é a velocidade?",
      opcoes: [
        { id: "a", texto: "12,5 m/s" },
        { id: "b", texto: "46 m/s" },
        { id: "c", texto: "200 m/s" },
        { id: "d", texto: "54 m/s" }
      ],
      correta: "c",
      explicacao: "v = f × λ = 50 × 4 = 200 m/s."
    }
  ],

  quimica: [
    {
      tema: "Estrutura atómica",
      pergunta: "Um átomo neutro tem número atómico 17 e número de massa 35. Quantos neutrões possui?",
      opcoes: [
        { id: "a", texto: "17" },
        { id: "b", texto: "35" },
        { id: "c", texto: "52" },
        { id: "d", texto: "18" }
      ],
      correta: "d",
      explicacao: "Neutrões = número de massa − número atómico = 35 − 17 = 18."
    },
    {
      tema: "Estequiometria",
      pergunta: "Na reação 2H₂ + O₂ → 2H₂O, quantos mols de água se formam com 4 mol de H₂ e O₂ em excesso?",
      opcoes: [
        { id: "a", texto: "2 mol" },
        { id: "b", texto: "4 mol" },
        { id: "c", texto: "6 mol" },
        { id: "d", texto: "8 mol" }
      ],
      correta: "b",
      explicacao: "A proporção entre H₂ e H₂O é 2:2, ou seja, 1:1. Formam-se 4 mol de água."
    },
    {
      tema: "Ácidos e bases",
      pergunta: "A 25 °C, uma solução tem pH = 3. Qual é a concentração aproximada de H₃O⁺?",
      opcoes: [
        { id: "a", texto: "10⁻³ mol/L" },
        { id: "b", texto: "10³ mol/L" },
        { id: "c", texto: "3 mol/L" },
        { id: "d", texto: "10⁻¹¹ mol/L" }
      ],
      correta: "a",
      explicacao: "Como pH = −log[H₃O⁺], a concentração é 10⁻³ mol/L."
    }
  ],
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
  s.fila = baralhar(banco[disciplina]);
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
      ...banco.portugues,
      ...banco.fisica,
      ...banco.quimica,
      ...banco.biologia
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
