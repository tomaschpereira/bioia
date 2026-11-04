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

const { Pool } = require("pg");
const crypto = require("crypto");
const { promisify } = require("util");
const scryptAsync = promisify(crypto.scrypt);

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("render.com")
        ? { rejectUnauthorized: false }
        : (process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined)
    })
  : null;

const ADMIN_WHATSAPP_NUMBER = String(process.env.ADMIN_WHATSAPP_NUMBER || "")
  .replace(/\\D/g, "");

const authDbReady = pool
  ? pool.query(`
      CREATE TABLE IF NOT EXISTS bioia_estudantes (
        telefone VARCHAR(32) PRIMARY KEY,
        nome TEXT,
        curso TEXT,
        universidade TEXT,
        estado VARCHAR(24) NOT NULL DEFAULT 'cadastro_nome',
        codigo_hash TEXT,
        tentativas INTEGER NOT NULL DEFAULT 0,
        bloqueado_ate TIMESTAMPTZ,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        aprovado_em TIMESTAMPTZ
      )
    `).then(() => true).catch(erro => {
      console.error("Não foi possível preparar a base de autenticação:", erro.message);
      return false;
    })
  : Promise.resolve(false);

function normalizarNumero(numero) {
  return String(numero || "").replace(/\\D/g, "");
}

async function criarHashCodigo(codigo) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await scryptAsync(codigo, salt, 64);
  return salt + ":" + hash.toString("hex");
}

async function verificarHashCodigo(codigo, armazenado) {
  if (!armazenado || !armazenado.includes(":")) return false;
  const [salt, hashHex] = armazenado.split(":");
  const esperado = Buffer.from(hashHex, "hex");
  const obtido = await scryptAsync(codigo, salt, 64);
  return esperado.length === obtido.length && crypto.timingSafeEqual(esperado, obtido);
}

async function gerirComandosAdministrador(numero, texto) {
  if (!ADMIN_WHATSAPP_NUMBER || normalizarNumero(numero) !== ADMIN_WHATSAPP_NUMBER) return false;
  const partes = String(texto).trim().split(/\\s+/);
  const comando = (partes[0] || "").toUpperCase();

  if (comando === "PENDENTES") {
    if (!(await authDbReady)) {
      await enviar(numero, "⚠️ Base de dados não configurada. Adiciona DATABASE_URL no Render.");
      return true;
    }
    const r = await pool.query(
      "SELECT telefone,nome,curso,universidade,criado_em FROM bioia_estudantes WHERE estado='pendente' ORDER BY criado_em ASC LIMIT 20"
    );
    if (!r.rows.length) {
      await enviar(numero, "Não há pedidos de acesso pendentes.");
      return true;
    }
    const lista = r.rows.map((u, i) =>
      `${i + 1}. ${u.nome || "Sem nome"} | ${u.telefone}\nCurso: ${u.curso || "—"}\nUniversidade: ${u.universidade || "—"}\nAPROVAR ${u.telefone} ou RECUSAR ${u.telefone}`
    ).join("\\n\\n");
    await enviarEmPartes(numero, "📋 *PEDIDOS DE ACESSO PENDENTES*\\n\\n" + lista);
    return true;
  }

  if (["APROVAR", "RECUSAR", "BLOQUEAR", "DESBLOQUEAR"].includes(comando)) {
    const alvo = normalizarNumero(partes[1] || "");
    if (!alvo) {
      await enviar(numero, `Formato: ${comando} 244XXXXXXXXX`);
      return true;
    }
    if (!(await authDbReady)) {
      await enviar(numero, "⚠️ Base de dados não configurada. Adiciona DATABASE_URL no Render.");
      return true;
    }

    let estado;
    if (comando === "APROVAR") estado = "aprovado";
    if (comando === "RECUSAR") estado = "recusado";
    if (comando === "BLOQUEAR") estado = "bloqueado";
    if (comando === "DESBLOQUEAR") estado = "aprovado";

    const r = await pool.query(
      "UPDATE bioia_estudantes SET estado=$1, tentativas=0, bloqueado_ate=NULL, aprovado_em=CASE WHEN $1='aprovado' THEN NOW() ELSE aprovado_em END WHERE telefone=$2 RETURNING telefone,nome",
      [estado, alvo]
    );
    if (!r.rowCount) {
      await enviar(numero, "Não encontrei esse número registado na BIOIA.");
      return true;
    }
    await enviar(numero, `✅ Pedido de ${r.rows[0].nome || alvo}: estado atualizado para *${estado}*.`);
    if (comando === "APROVAR") {
      await enviar(alvo, "🎉 O teu pedido de acesso à BIOIA foi aprovado! Cria agora o teu código pessoal de segurança com pelo menos 6 algarismos.");
    } else if (comando === "RECUSAR") {
      await enviar(alvo, "O teu pedido de acesso à BIOIA não foi aprovado. Contacta o administrador se precisares de esclarecimentos.");
    } else if (comando === "BLOQUEAR") {
      await enviar(alvo, "🔒 O teu acesso à BIOIA foi bloqueado pelo administrador.");
    } else {
      await enviar(alvo, "🔓 O teu acesso à BIOIA foi reativado. Envia uma mensagem para continuar.");
    }
    return true;
  }

  if (comando === "AJUDA" || comando === "ADMIN") {
    await enviar(numero,
      "🛡️ *COMANDOS DO ADMINISTRADOR*\\n" +
      "PENDENTES — ver pedidos\\n" +
      "APROVAR 244XXXXXXXXX — autorizar estudante\\n" +
      "RECUSAR 244XXXXXXXXX — recusar pedido\\n" +
      "BLOQUEAR 244XXXXXXXXX — bloquear acesso\\n" +
      "DESBLOQUEAR 244XXXXXXXXX — reativar acesso"
    );
    return true;
  }
  return false;
}

async function controlarAcesso(numero, textoRecebido, s) {
  const numeroLimpo = normalizarNumero(numero);
  const texto = String(textoRecebido || "").trim();
  const textoLower = texto.toLowerCase();

  if (ADMIN_WHATSAPP_NUMBER && numeroLimpo === ADMIN_WHATSAPP_NUMBER) {
    if (await gerirComandosAdministrador(numero, texto)) return true;
    s.autenticado = true;
    return false;
  }

  if (!(await authDbReady)) {
    await enviar(numero, "🔒 O sistema de segurança da BIOIA está temporariamente indisponível. Tenta novamente mais tarde.");
    return true;
  }

  let resultado = await pool.query(
    "SELECT * FROM bioia_estudantes WHERE telefone=$1",
    [numeroLimpo]
  );
  let estudante = resultado.rows[0];

  if (!estudante) {
    await pool.query(
      "INSERT INTO bioia_estudantes (telefone,estado) VALUES ($1,'cadastro_nome') ON CONFLICT (telefone) DO NOTHING",
      [numeroLimpo]
    );
    s.modoAcesso = "cadastro";
    await enviar(numero,
      "👋 Olá! Sou a *BIOIA — Assistente Académico*.\\n" +
      "Ajudo estudantes a preparar exames, estudar disciplinas e acompanhar o seu desempenho.\\n\\n" +
      "Antes de começar, quero conhecer-te. *Qual é o teu nome completo?*"
    );
    return true;
  }

  if (estudante.estado === "cadastro_nome") {
    if (texto.length < 3 || texto.length > 100) {
      await enviar(numero, "Escreve o teu nome completo (entre 3 e 100 caracteres).");
      return true;
    }
    await pool.query("UPDATE bioia_estudantes SET nome=$1,estado='cadastro_curso' WHERE telefone=$2", [texto, numeroLimpo]);
    await enviar(numero, "Obrigado! Qual é o teu *curso* ou área de candidatura?");
    return true;
  }

  if (estudante.estado === "cadastro_curso") {
    if (texto.length < 2 || texto.length > 100) {
      await enviar(numero, "Indica o teu curso ou área de candidatura.");
      return true;
    }
    await pool.query("UPDATE bioia_estudantes SET curso=$1,estado='cadastro_universidade' WHERE telefone=$2", [texto, numeroLimpo]);
    await enviar(numero, "Em que *universidade* pretendes estudar?");
    return true;
  }

  if (estudante.estado === "cadastro_universidade") {
    if (texto.length < 2 || texto.length > 120) {
      await enviar(numero, "Indica o nome da universidade.");
      return true;
    }
    await pool.query("UPDATE bioia_estudantes SET universidade=$1,estado='pendente' WHERE telefone=$2", [texto, numeroLimpo]);
    await enviar(numero, "✅ O teu pedido foi enviado ao administrador. Assim que for aprovado, receberás uma mensagem para criares o teu código de segurança.");
    if (ADMIN_WHATSAPP_NUMBER) {
      await enviar(ADMIN_WHATSAPP_NUMBER,
        "🔔 *NOVO PEDIDO DE ACESSO À BIOIA*\\n" +
        `Nome: ${estudante.nome || "A preencher"}\\nCurso: ${estudante.curso || "A preencher"}\\nUniversidade: ${texto}\\nNúmero: ${numeroLimpo}\\n\\n` +
        `Responde: APROVAR ${numeroLimpo} ou RECUSAR ${numeroLimpo}. Também podes escrever PENDENTES.`
      );
    }
    return true;
  }

  if (estudante.estado === "pendente") {
    await enviar(numero, "⏳ O teu pedido de acesso ainda aguarda aprovação do administrador. Avisar-te-ei quando houver uma decisão.");
    return true;
  }

  if (estudante.estado === "recusado") {
    await enviar(numero, "O teu pedido de acesso não foi aprovado. Contacta o administrador da BIOIA.");
    return true;
  }

  if (estudante.estado === "bloqueado") {
    await enviar(numero, "🔒 O teu acesso está bloqueado. Contacta o administrador.");
    return true;
  }

  if (estudante.estado !== "aprovado") {
    await enviar(numero, "Não foi possível validar o teu registo. Contacta o administrador.");
    return true;
  }

  if (!estudante.codigo_hash) {
    if (!/^\\d{6,12}$/.test(texto)) {
      await enviar(numero, "🔐 Cria o teu código pessoal com *6 a 12 algarismos*. Não uses datas de nascimento ou sequências fáceis.");
      return true;
    }
    const hash = await criarHashCodigo(texto);
    await pool.query("UPDATE bioia_estudantes SET codigo_hash=$1,tentativas=0 WHERE telefone=$2", [hash, numeroLimpo]);
    s.autenticado = true;
    s.modo = "menu";
    await enviar(numero, "✅ Código criado e protegido com sucesso!\\n\\n" + menu());
    return true;
  }

  if (s.autenticado) return false;

  if (estudante.bloqueado_ate && new Date(estudante.bloqueado_ate).getTime() > Date.now()) {
    await enviar(numero, "🔒 Muitas tentativas incorretas. Tenta novamente depois de 15 minutos.");
    return true;
  }

  if (!/^\\d{6,12}$/.test(texto)) {
    await enviar(numero, "🔐 Bem-vindo de volta à BIOIA. Introduz o teu código pessoal de segurança (6 a 12 algarismos).");
    return true;
  }

  if (await verificarHashCodigo(texto, estudante.codigo_hash)) {
    await pool.query("UPDATE bioia_estudantes SET tentativas=0,bloqueado_ate=NULL WHERE telefone=$1", [numeroLimpo]);
    s.autenticado = true;
    await enviar(numero, "✅ Acesso autorizado!\\n\\n" + menu());
    return true;
  }

  const tentativas = Number(estudante.tentativas || 0) + 1;
  const bloqueio = tentativas >= 5;
  await pool.query(
    "UPDATE bioia_estudantes SET tentativas=$1,bloqueado_ate=CASE WHEN $2 THEN NOW()+INTERVAL '15 minutes' ELSE NULL END WHERE telefone=$3",
    [bloqueio ? 0 : tentativas, bloqueio, numeroLimpo]
  );
  await enviar(numero, bloqueio
    ? "⛔ Código incorreto 5 vezes. O acesso foi temporariamente bloqueado durante 15 minutos."
    : `❌ Código incorreto. Tens ${5 - tentativas} tentativa(s) antes do bloqueio temporário.`
  );
  return true;
}


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
    "6️⃣ Meu Desempenho",
    "7️⃣ Testes de exames passados",
    "8️⃣ Variante A — Exames passados",
    "9️⃣ Variante F — Exames passados",
    "🔟 Variante D — Medicina (UKB)",
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
    total: 0,
    autenticado: false
  };

  sessoes[numero] = s;

  if (await controlarAcesso(numero, textoRecebido, s)) return;

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
  
  if (s.modo === "meu_desempenho") {
    if (texto === "0" || texto === "menu") {
      s.modo = "menu";
      await enviar(numero, menu());
      return;
    }

    if (texto === "1") {
      const erros = Array.isArray(s.erros) ? s.erros : [];
      if (!erros.length) {
        await enviar(numero, "✅ Ainda não há erros registados nesta atividade. Continua a estudar!");
        return;
      }

      const revisao = erros.map((erro, i) =>
        `${i + 1}. ${erro.pergunta}\n` +
        `A tua resposta: ${erro.tuaResposta || "Não registada"}\n` +
        `Resposta correcta: ${erro.correta || "Não identificada"}\n` +
        `Tema: ${erro.tema || "Não identificado"}\n` +
        `Explicação: ${erro.explicacao || "Sem explicação disponível."}`
      ).join("\n\n");

      await enviarEmPartes(
        numero,
        `📚 *ERROS DESTA ATIVIDADE*\nTotal de erros: ${erros.length}\n\n${revisao}`
      );
      return;
    }

    if (texto === "2") {
      await enviar(numero, resumoDesempenho(s));
      return;
    }

    await enviar(numero, "Escolhe 1 para rever erros, 2 para ver o relatório ou 0 para voltar ao menu.");
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

  // MEU DESEMPENHO — SUBMENU
  if (texto === "6" || texto === "desempenho" || texto === "meu desempenho") {
    s.modo = "meu_desempenho";
    await enviar(
      numero,
      "📊 *MEU DESEMPENHO*\n\n" +
      "1️⃣ Rever erros desta atividade\n" +
      "2️⃣ Ver relatório de desempenho\n" +
      "0️⃣ Voltar ao menu principal\n\n" +
      "Escolhe uma opção."
    );
    return;
  }


  // EXAMES PASSADOS — ESCOLHER VARIANTE
  if (texto === "7") {
    s.modo = "escolher_variante";

    await enviar(
      numero,
      "📘 *Escolhe a variante do exame:*\n\n" +
      "A — Variante A\n" +
      "F — Variante F\n" +
      "D — Variante D (Medicina — UKB)\n\n" +
      "Também podes escolher directamente no menu as opções 8, 9 ou 10."
    );
    return;
  }

  // ACESSO DIRECTO ÀS VARIANTES A, F E D
  const variantesMenu = {
    "8": { disciplina: "variante_a", modo: "escolher_modo_variante_a", nome: "Variante A" },
    "9": { disciplina: "variante_f", modo: "escolher_modo_variante_f", nome: "Variante F" },
    "10": { disciplina: "variante_d", modo: "escolher_modo_variante_d", nome: "Variante D — Medicina (UKB)" }
  };

  if (variantesMenu[texto]) {
    const variante = variantesMenu[texto];
    s.disciplina = variante.disciplina;
    s.modo = variante.modo;

    await enviar(
      numero,
      `📘 *${variante.nome} seleccionada.*\n` +
      "Escolhe o modo:\n" +
      "1️⃣ Modo Estudo — correcção imediata\n" +
      "2️⃣ Modo Exame — correcção no fim"
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
