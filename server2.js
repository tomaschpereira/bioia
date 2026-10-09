
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

app.post("/webhook", (req, res) => {
  res.sendStatus(200);

  processWebhook(req.body).catch((error) => {
    console.error("Erro ao processar mensagem:", error.message);
  });
});

async function processWebhook(body) {
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const messages = change.value?.messages || [];

      for (const message of messages) {
        if (message.type !== "text" || !message.text?.body) {
          continue;
        }

        const sender = message.from;

        const reply =
          "Olá! 👋 Sou a BIOIA, a tua assistente de Biologia. 🧬\n\n" +
          "Vou ajudar-te a preparar o ingresso em Medicina.\n\n" +
          "Escreve BIOLOGIA para começarmos!";

        await sendWhatsAppMessage(sender, reply);
      }
    }
  }
}

async function sendWhatsAppMessage(to, text) {
  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    throw new Error("Faltam variáveis de ambiente no Render.");
  }

  const response = await fetch(
    `https://graph.facebook.com/v26.0/${PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { body: text }
      })
    }
  );

  const result = await response.json();

  if (!response.ok) {
    console.error("Erro da API do WhatsApp:", result);
    throw new Error("Não foi possível enviar a resposta.");
  }

  console.log("Resposta enviada com sucesso.");
}

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`BIOIA online na porta ${PORT}`);
});
