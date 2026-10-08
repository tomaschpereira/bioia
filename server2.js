const express = require("express");

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.send("BIOIA está online 🤖");
});

app.get("/webhook", (req, res) => {
  console.log("Verificação recebida:", req.query);

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    console.log("Webhook verificado com sucesso!");
    return res.status(200).send(challenge);
  }

  console.log("Falha na verificação do webhook.");
  return res.sendStatus(403);
});

app.post("/webhook", (req, res) => {
  console.log("Mensagem recebida:", JSON.stringify(req.body));
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`BIOIA online na porta ${PORT}`);
});
