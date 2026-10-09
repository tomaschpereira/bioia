const express = require("express");

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

app.get("/", (req, res) => {
  res.send("BIOIA está online 🤖");
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

const banco = {
  portugues: [
    {
      id: "pt1",
      tema: "Semântica",
      pergunta: "Na frase «Embora estivesse cansado, continuou a estudar», a palavra «embora» exprime uma relação de:",
      opcoes: [
        { id: "a", texto: "Causa" },
        { id: "b", texto: "Concessão" },
        { id: "c", texto: "Consequência" },
        { id: "d", texto: "Condição" }
      ],
      correta: "b",
      explicacao: "«Embora» introduz uma ideia que contrasta com a principal sem a impedir. É uma conjunção subordinativa concessiva."
    },
    {
      id: "pt2",
      tema: "Estrutura das palavras",
      pergunta: "Na palavra «infelizmente», qual é a função de «-mente»?",
      opcoes: [
        { id: "a", texto: "Sufixo que forma um advérbio" },
        { id: "b", texto: "Prefixo de negação" },
        { id: "c", texto: "Desinência verbal" },
        { id: "d", texto: "Radical da palavra" }
      ],
      correta: "a",
      explicacao: "O sufixo «-mente» forma frequentemente advérbios a partir de adjetivos: feliz → felizmente; infeliz → infelizmente."
    },
    {
      id: "pt3",
      tema: "Fonética e fonologia",
      pergunta: "Qual par apresenta palavras que se distinguem apenas por um fonema?",
      opcoes: [
        { id: "a", texto: "Casa / casas" },
        { id: "b", texto: "Menino / rapaz" },
        { id: "c", texto: "Pato / gato" },
        { id: "d", texto: "Flor / flores" }
      ],
      correta: "c",
      explicacao: "«Pato» e «gato» diferem no fonema inicial /p/ e /g/. A substituição de um fonema altera a palavra."
    }
  ],

  fisica: [
    {
      id: "fi1",
      tema: "Trabalho e energia",
      pergunta: "Uma força constante de 20 N desloca um corpo 3 m na mesma direção da força. Qual é o trabalho realizado?",
      opcoes: [
        { id: "a", texto: "6 J" },
        { id: "b", texto: "23 J" },
        { id: "c", texto: "60 J" },
        { id: "d", texto: "0 J" }
      ],
      correta: "c",
      explicacao: "W = F × d × cos(θ). Como a força e o deslocamento têm a mesma direção, θ = 0° e cos(0°) = 1. Logo, W = 20 × 3 = 60 J."
    },
    {
      id: "fi2",
      tema: "Dinâmica",
      pergunta: "Uma força resultante de 12 N atua sobre um corpo de massa 3 kg. Qual é a aceleração?",
      opcoes: [
        { id: "a", texto: "36 m/s²" },
        { id: "b", texto: "4 m/s²" },
        { id: "c", texto: "9 m/s²" },
        { id: "d", texto: "0,25 m/s²" }
      ],
      correta: "b",
      explicacao: "Pela segunda lei de Newton, F = ma. Portanto, a = F/m = 12/3 = 4 m/s²."
    },
    {
      id: "fi3",
      tema: "Ondas",
      pergunta: "Uma onda tem frequência de 50 Hz e comprimento de onda de 4 m. Qual é a sua velocidade de propagação?",
      opcoes: [
        { id: "a", texto: "12,5 m/s" },
        { id: "b", texto: "46 m/s" },
        { id: "c", texto: "200 m/s" },
        { id: "d", texto: "54 m/s" }
      ],
      correta: "c",
      explicacao: "A velocidade de uma onda é v = fλ. Assim, v = 50 × 4 = 200 m/s."
    }
  ],

  quimica: [
    {
      id: "qu1",
      tema: "Estrutura atómica",
      pergunta: "Um átomo neutro tem número atómico 17 e número de massa 35. Quantos neutrões possui?",
      opcoes: [
        { id: "a", texto: "17" },
        { id: "b", texto: "35" },
        { id: "c", texto: "52" },
        { id: "d", texto: "18" }
      ],
      correta: "d",
      explicacao: "Número de neutrões = número de massa − número atómico = 35 − 17 = 18. Sendo neutro, o átomo também tem 17 eletrões."
    },
    {
      id: "qu2",
      tema: "Estequiometria",
      pergunta: "Na reação 2H₂ + O₂ → 2H₂O, quantos mols de água se formam a partir de 4 mol de H₂, com O₂ em excesso?",
      opcoes: [
        { id: "a", texto: "2 mol" },
        { id: "b", texto: "4 mol" },
        { id: "c", texto: "6 mol" },
        { id: "d", texto: "8 mol" }
      ],
      correta: "b",
      explicacao: "A equação equilibrada mostra a proporção 2 mol de H₂ : 2 mol de H₂O, isto é, 1:1. Assim, 4 mol de H₂ produzem 4 mol de H₂O."
    },
    {
      id: "qu3",
      tema: "Ácidos e bases",
      pergunta: "A 25 °C, uma solução aquosa tem pH = 3. Qual é a concentração aproximada de H₃O⁺?",
      opcoes: [
        { id: "a", texto: "10⁻³ mol/L" },
        { id: "b", texto: "10³ mol/L" },
        { id: "c", texto: "3 mol/L" },
        { id: "d", texto: "10⁻¹¹ mol/L" }
      ],
      correta: "a",
      explicacao: "pH = −log₁₀[H₃O⁺]. Portanto, [H₃O⁺] = 10⁻³ mol/L. A solução é ácida."
    }
  ],

  biologia: [
    {
      id: "bi1",
      tema: "Biologia celular",
      pergunta: "Uma célula que produz grandes quantidades de proteínas para exportação tende a apresentar desenvolvimento acentuado de:",
      opcoes: [
        { id: "a", texto: "Lisossomas e centríolos" },
        { id: "b", texto: "Retículo endoplasmático rugoso e aparelho de Golgi" },
        { id: "c", texto: "Vacúolos digestivos apenas" },
        { id: "d", texto: "Parede celular e cápsula" }
      ],
      correta: "b",
      explicacao: "O retículo endoplasmático rugoso participa na síntese de proteínas destinadas à secreção. O aparelho de Golgi modifica, organiza e encaminha essas proteínas."
    },
    {
      id: "bi2",
      tema: "Genética mendeliana",
      pergunta: "Num cruzamento Aa × Aa, sendo A dominante sobre a, qual é a probabilidade de um descendente ter genótipo aa?",
      opcoes: [
        { id: "a", texto: "0%" },
        { id: "b", texto: "25%" },
        { id: "c", texto: "50%" },
        { id: "d", texto: "75%" }
      ],
      correta: "b",
      explicacao: "Cada progenitor pode transmitir A ou a. As combinações são AA, Aa, Aa e aa. Uma em quatro é aa, ou seja, 25%."
    },
    {
      id: "bi3",
      tema: "Ecologia",
      pergunta: "Numa cadeia alimentar, os produtores são fundamentais porque:",
      opcoes: [
        { id: "a", texto: "Transformam matéria orgânica em energia sem perdas" },
        { id: "b", texto: "Obtêm toda a energia diretamente dos consumidores" },
        { id: "c", texto: "Introduzem energia no sistema, geralmente através da fotossíntese" },
        { id: "d", texto: "Impedem a decomposição da matéria orgânica" }
      ],
      correta
