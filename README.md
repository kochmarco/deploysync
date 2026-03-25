# ⬡ DeploySync

Deploy assistant para qualquer projeto — detecta arquivos alterados automaticamente e faz upload via SFTP com um clique.

## Features

- **File Watcher** — monitora o diretório do projeto e detecta criações, edições e exclusões automaticamente
- **Upload SFTP** — envia os arquivos selecionados para o servidor remoto com mapeamento automático de caminhos
- **MCP Server** — servidor local que recebe notificações de assistentes de IA (Claude Code, Cursor, Windsurf, VS Code, Antigravity)
- **Configuração automática de editores** — instala o MCP server e regras do agente nos editores com um clique
- **Source attribution** — veja quais alterações vieram do watcher vs. quais foram reportadas por um agente de IA
- **Ignorar arquivos/pastas** — exclua diretórios do monitoramento via Settings ou diretamente na lista de arquivos (botão ✕)
- **Histórico de deploys** — registro de tudo que foi enviado
- **Diff viewer** — compare o arquivo local com o remoto antes de enviar
- **Multi-projeto** — gerencie múltiplos projetos com configurações independentes

## Requisitos

- Node.js 18+
- npm ou yarn

## Instalação

```bash
cd deploysync
npm install
```

## Executando em modo desenvolvimento

```bash
npm run dev
```

Ou simplesmente:

```bash
npm start
```

## Como usar

### 1. Configure o projeto

Ao abrir o app, vá em **Configurações → Projeto** e preencha:

- **Nome**: identificador do projeto (ex: `meu-saas`)
- **Caminho Local**: pasta raiz do projeto no seu Mac (ex: `/Users/voce/projetos/meu-saas`)
- **Caminho Remoto**: pasta raiz no servidor (ex: `/var/www/meu-saas`)

### 2. Configure o SFTP

Em **Configurações → SFTP**:

- **Host**: IP ou domínio do servidor
- **Porta**: 22 (padrão SSH)
- **Usuário**: usuário de deploy
- **Autenticação**: Chave SSH (com botão **Procurar** para selecionar o arquivo) ou senha

Use **Testar Conexão** para verificar.

### 3. Comece a trabalhar

O watcher inicia automaticamente. Qualquer arquivo editado aparece na lista de **Alterações**. Selecione os que deseja enviar e clique em **Deploy**.

Para ignorar um arquivo ou pasta, clique no botão **✕** na linha do arquivo e escolha "Ignorar arquivo" ou "Ignorar pasta". O padrão é adicionado automaticamente e o watcher reinicia.

### 4. Integre com assistentes de IA (opcional)

O app roda um servidor MCP na porta `3500`. Vá em **Configurações → MCP** para configurar.

#### Configuração automática (recomendado)

Na aba **MCP**, cada editor suportado tem dois botões:

1. **Configurar** — instala o MCP server no editor (escreve no arquivo de config do editor)
2. **Instalar regras** — adiciona regras no projeto que instruem o agente a notificar automaticamente cada arquivo criado/editado

Editores suportados:

| Editor | Config MCP | Regras do agente |
|---|---|---|
| Cursor | `~/.cursor/mcp.json` | `.cursor/rules/deploysync.mdc` |
| Claude Code | `~/.claude.json` | `CLAUDE.md` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | `.windsurfrules` |
| VS Code | `~/.vscode/mcp.json` | `.github/copilot-instructions.md` |
| Antigravity | `~/.gemini/antigravity/mcp_config.json` | `GEMINI.md` |

#### Configuração manual

Via curl:

```bash
curl -X POST http://localhost:3500/api/notify \
  -H "Content-Type: application/json" \
  -d '{
    "filePath": "src/controllers/UserController.js",
    "changeType": "modified",
    "agent": "cursor",
    "description": "Adicionou validação ao método store"
  }'
```

## Estrutura do Projeto

```
laravelsync/
├── package.json
├── README.md
├── vite.config.js
├── src/
│   ├── main/
│   │   ├── main.js                # Processo principal Electron + IPC handlers
│   │   ├── preload.js             # Bridge seguro (context isolation)
│   │   ├── watcher.js             # File watcher com chokidar
│   │   ├── sftp.js                # Gerenciador SFTP
│   │   ├── config.js              # Configuração persistente (electron-store)
│   │   ├── mcp-server.js          # Servidor MCP HTTP + WebSocket
│   │   └── mcp-stdio-adapter.js   # Adapter stdio JSON-RPC para editores
│   └── renderer/
│       ├── index.html
│       ├── main.jsx               # Entry point React
│       ├── App.jsx                # Componente principal
│       ├── styles.css             # Estilos (dark theme)
│       ├── stores/
│       │   └── useStore.js        # Zustand store (estado global)
│       ├── hooks/
│       │   └── useElectronEvents.js  # Listeners de eventos IPC
│       └── components/
│           ├── TitleBar.jsx
│           ├── Sidebar.jsx
│           ├── FileList.jsx
│           ├── DeployBar.jsx
│           ├── SettingsPanel.jsx
│           ├── ProjectManager.jsx
│           ├── HistoryPanel.jsx
│           ├── DiffViewer.jsx
│           ├── Onboarding.jsx
│           └── Toast.jsx
```

## Build para distribuição

```bash
npm run build:mac
```

## MCP API

| Endpoint | Método | Descrição |
|---|---|---|
| `/health` | GET | Status do servidor e agentes conectados |
| `/api/notify` | POST | Notificar alteração em um arquivo |
| `/mcp/execute` | POST | Executar uma tool MCP (notify_file_change, notify_batch_changes, etc.) |
| `/mcp/tools` | GET | Tool discovery para agentes MCP |
