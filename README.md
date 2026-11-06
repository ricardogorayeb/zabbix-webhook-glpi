# Zabbix → GLPI: abertura e encerramento automático de chamados

Media type (Webhook) do Zabbix 7.x que **abre um chamado no GLPI** quando um problema é detectado e **solucionando-o automaticamente** quando o problema se resolve sozinho, adicionando uma solução à linha do tempo do chamado.

Um único script trata os dois casos, usando a macro `{EVENT.VALUE}`:

| `event_value` | Situação | Ação no GLPI |
|---|---|---|
| `1` | Problema | Cria o chamado (`POST /Ticket`) |
| `0` | Recuperação | Localiza o chamado pelo Event ID e cria a solução (`POST /ITILSolution`) |

---

## Requisitos

- Zabbix 7.0 ou superior
- GLPI com a **API REST** habilitada
- Um usuário dedicado do Zabbix no GLPI (ex.: `zabbix`)

### Versões testadas

| Software | Versão |
|---|---|
| Zabbix | 7.4 |
| GLPI | 10.x.x |

---

## 1. Configuração no GLPI

### 1.1 Habilitar a API
**Configurar → Geral → API**
- Habilitar API REST: **Sim**
- Habilitar login com token externo: **Sim**
- Em **Clientes da API**, crie/edite um cliente permitindo o IP do servidor Zabbix e gere o **App-Token**.

### 1.2 Token do usuário
No perfil do usuário do Zabbix, em **Configurações → Chaves de acesso remoto**, gere o **API token** (`user_token`).

### 1.3 Permissões do usuário (importante)
No perfil usado pelo usuário do Zabbix, aba **Assistência → Chamados**, habilite:

- Criar
- Atualizar
- **Resolver/Fechar** (necessário para criar a solução)
- **Atribuir a mim / Assumir**

> Sem o direito de solucionar, o encerramento falha com:
> `["ERROR_GLPI_ADD","Você não tem permissão para executar essa ação."]`

### 1.4 ID do solicitante
Anote o **ID numérico** do usuário do Zabbix no GLPI (visível na URL ao abrir o usuário: `...user.form.php?id=XXXX`). Ele será usado em `_users_id_requester`.

---

## 2. Configuração no Zabbix

### 2.1 Criar o Media type
**Alertas → Tipos de mídia → Criar tipo de mídia**
- **Type:** Webhook
- **Timeout:** 30s

### 2.2 Parâmetros

| Name | Value |
|---|---|
| `alert_message` | `{ALERT.MESSAGE}` |
| `alert_subject` | `{ALERT.SUBJECT}` |
| `app_token` | *App-Token gerado no GLPI* |
| `user_token` | *API token do usuário* |
| `url` | `https://SEU-GLPI/apirest.php` |
| `event_id` | `{EVENT.ID}` |
| `event_source` | `{EVENT.SOURCE}` |
| `event_value` | `{EVENT.VALUE}` |

> O parâmetro `event_value` é o que permite ao script distinguir problema de recuperação.

### 2.3 Script
Cole o conteúdo de [`glpi-webhook.js`](glpi-webhook.js) no campo **Script**.

### 2.4 Message templates
Na aba **Message templates**, mantenha templates para os dois tipos:

- **Problem** — corpo do chamado.
- **Problem recovery** — o Zabbix só dispara o webhook de recuperação se existir um template deste tipo.

### 2.5 Action
Em **Alertas → Ações → Ações de trigger**, na action desejada:
- **Operations:** envie para o usuário que tem este media type.
- **Recovery operations:** adicione a mesma operação (**Send message**) para que o script rode também na recuperação.

---

## 3. Como funciona

1. **Problema:** o chamado é criado com o título
   `<assunto> [Zabbix Event ID: <id>]`.
2. **Recuperação:** o script pesquisa no GLPI, pelo texto `Zabbix Event ID: <id>` no título, um chamado com status *Novo* e cria uma `ITILSolution` com a mensagem de resolução automática. O GLPI muda o status para *Solucionado* por conta própria.

O `{EVENT.ID}` é o mesmo no evento de problema e no de recuperação, o que permite relacionar os dois.

---

## 4. Personalização

| O que mudar | Onde |
|---|---|
| Urgência do chamado | `urgency` (1 a 5) |
| Tipo (incidente/requisição) | `type` (1 = Incidente, 2 = Requisição) |
| Solicitante | `_users_id_requester` |
| Técnico/grupo atribuído | adicionar `_users_id_assign` ou `_groups_id_assign` |
| Texto da solução | campo `content` do payload de `ITILSolution` |
| Entidade | adicionar `entities_id` |

### Status do GLPI

| Código | Status |
|---|---|
| 1 | Novo |
| 2 | Em atendimento (atribuído) |
| 3 | Em atendimento (planejado) |
| 4 | Pendente |
| 5 | Solucionado |
| 6 | Fechado |

---

## 5. Solução de problemas

| Sintoma | Causa provável |
|---|---|
| `Erro HTTP ao iniciar sessão: 401/400` | `app_token` ou `user_token` incorretos, ou IP do Zabbix não liberado no cliente da API |
| `Você não tem permissão para executar essa ação` | Perfil sem direito de solucionar/assumir chamados (ver 1.3) |
| Chamado muda para *Solucionado* mas sem texto | Usando `PUT` com campo `solution`: o GLPI ignora. Use `POST /ITILSolution` |
| Nenhum chamado encontrado na recuperação | Título sem `Zabbix Event ID`, chamado já fora do status *Novo*, ou ausência de Recovery operation na action |
| Webhook não dispara na recuperação | Falta o template *Problem recovery* ou a *Recovery operation* |

Para depurar, eleve o log do servidor (`DebugLevel=4`) e filtre por `[GLPI`:

```bash
grep "\[GLPI" /var/log/zabbix/zabbix_server.log
```

---

## 6. Segurança

- **Nunca** versione `app_token` e `user_token`. Eles ficam apenas nos parâmetros do Media type.
- Use um usuário exclusivo para o Zabbix, com o mínimo de permissões necessárias.
- Libere a API do GLPI apenas para o IP do servidor Zabbix.

---

## Licença

Distribuído sob a licença MIT. Use e adapte livremente.
