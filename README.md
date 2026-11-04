# BIOIA

Backend da BIOIA — Assistente Académico de preparação para exames.

## Segurança e acesso dos estudantes

A BIOIA utiliza PostgreSQL para guardar os registos de estudantes, pedidos de autorização e hashes dos códigos pessoais. A tabela `bioia_estudantes` é criada automaticamente quando o servidor inicia e consegue ligar-se à base de dados.

### Configuração no Render

1. No Render, cria uma base de dados em **New > PostgreSQL**.
2. Escolhe a mesma região do serviço web da BIOIA.
3. Na base de dados, copia a **Internal Database URL**.
4. Abre o serviço web da BIOIA, entra em **Environment** e adiciona:
   - `DATABASE_URL`: Internal Database URL da base PostgreSQL.
   - `ADMIN_WHATSAPP_NUMBER`: número do administrador apenas com algarismos e indicativo do país (ex.: `2449XXXXXXXX`).
   - `PGSSL`: `false` quando usares a Internal Database URL do Render.
5. Guarda e faz deploy do serviço.

Não publiques a URL da base de dados nem partilhes credenciais. Não coloques estes valores no GitHub.

### Fluxo de autorização

- O estudante apresenta-se com nome, curso e universidade.
- O pedido fica pendente até o administrador aprovar.
- Depois da aprovação, o estudante cria um código numérico pessoal de 6 a 12 algarismos.
- O código é armazenado com hash scrypt e salt aleatório; não é guardado em texto simples.
- Após cinco tentativas incorretas, o acesso fica temporariamente bloqueado por 15 minutos.
- A autenticação expira após 30 minutos de inatividade.

### Comandos do administrador no WhatsApp

- `PENDENTES` — listar pedidos por aprovar.
- `APROVAR 244XXXXXXXXX` — aprovar um estudante.
- `RECUSAR 244XXXXXXXXX` — recusar um pedido.
- `BLOQUEAR 244XXXXXXXXX` — bloquear um estudante.
- `DESBLOQUEAR 244XXXXXXXXX` — reativar o acesso.
- `ADMIN` — mostrar ajuda.

O número de administrador é definido apenas pela variável `ADMIN_WHATSAPP_NUMBER` no Render.

## Execução

```bash
npm install
npm start
```
