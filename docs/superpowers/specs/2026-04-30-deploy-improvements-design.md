# Deploy Improvements — Design Spec

**Data:** 2026-04-30
**Escopo:** 4 features para melhorar o fluxo de deploy do DeploySync

---

## Feature 1: Verificacao de conexao antes do upload

### Problema

A conexao SFTP pode cair silenciosamente (timeout TCP, rede instavel). O flag `sftp.connected` fica `true` mas a conexao real esta morta. O usuario so descobre apos processar toda a fila de upload, gerando frustacao.

### Solucao

Verificacao ativa via operacao leve (ping) no inicio do handler de upload, antes de processar qualquer arquivo. Se falhar, retorno imediato com erro especifico. O usuario decide se quer reconectar.

### Mudancas

**`src/main/sftp.js`**
- Novo metodo `async ping()`: executa `this.client.cwd()`. Se falhar, seta `this.connected = false` e lanca erro. Retorna `true` se viva.

**`src/main/main.js`**
- Handler `sftp:upload` (linha 361): chamar `await sftp.ping()` antes de processar arquivos. Se falhar, retornar `{ success: false, error: "Conexao SFTP perdida. Reconecte antes de fazer deploy.", disconnected: true }`.
- Novo handler `sftp:ping`: expoe o ping como IPC. Retorna `{ connected: true }` ou `{ connected: false, error: msg }`.

**`src/main/preload.js`**
- Expor `sftpPing: () => ipcRenderer.invoke("sftp:ping")`.

**`src/renderer/stores/useStore.js`**
- No metodo `deploy()`: detectar `result.disconnected === true`, setar `sftpConnected: false`.

**`src/renderer/components/DeployBar.jsx`**
- Quando `disconnected: true`, exibir toast: "Conexao SFTP perdida. Reconecte nas configuracoes."

---

## Feature 2: Cancelamento gracioso do deploy

### Problema

Uma vez iniciado o deploy, nao ha como parar. Se o usuario selecionou muitos arquivos por engano ou precisa interromper, deve esperar toda a fila terminar.

### Solucao

Flag de cancelamento no main process. Uploads em andamento terminam normalmente, mas nenhum novo arquivo da fila e iniciado. Arquivos concluidos com sucesso sao removidos da lista; os cancelados permanecem.

### Mudancas

**`src/main/main.js`**
- Nova variavel `let deployCancelled = false` no escopo do modulo.
- Novo handler `sftp:cancel-deploy`: seta `deployCancelled = true`, retorna `{ success: true }`.
- Handler `sftp:upload`: resetar `deployCancelled = false` no inicio. Em cada task de `uploadTasks`, antes de iniciar backup+upload, checar `if (deployCancelled)` — se true, retornar `{ file: relativePath, status: 'cancelled' }`. Mesma checagem no loop de `deletedFiles`.
- Na notificacao nativa, incluir contagem de cancelados.
- Enviar `sftp:upload-progress` com `status: 'cancelled'` para arquivos cancelados.

**`src/main/preload.js`**
- Expor `sftpCancelDeploy: () => ipcRenderer.invoke("sftp:cancel-deploy")`.

**`src/renderer/stores/useStore.js`**
- Novo metodo `cancelDeploy()`: chama `api.sftpCancelDeploy()`.
- No `deploy()`, logica de `removeChangedFiles` ja funciona pois so remove `status: 'success'`.

**`src/renderer/components/DeployBar.jsx`**
- Quando `deploying === true`: mostrar botao "Cancelar" que chama `cancelDeploy()`.
- Apos clicar cancelar, texto muda para "Cancelando..." e botao fica desabilitado ate o deploy terminar.
- Toast de resultado inclui contagem de cancelados.

---

## Feature 3: Scan manual de alteracoes

### Problema

Quando o file watcher e/ou o servidor MCP estao offline, alteracoes em arquivos nao sao detectadas. O usuario precisa de uma forma manual de descobrir o que mudou.

### Solucao

Dois modos de scan acionados por botao na UI:

1. **Scan local**: percorre o diretorio do projeto e lista arquivos com `mtime` mais recente que um timestamp de referencia (ultimo deploy ou ultimo scan). Funciona sem SFTP.
2. **Scan remoto**: compara arquivos locais com os remotos via SFTP (comparacao por tamanho). Requer conexao SFTP.

### Mudancas

**`src/main/main.js`**

Novo handler `watcher:scan`:
- Recebe opcionalmente `{ since: timestamp }`. Default: timestamp do ultimo deploy no historico, ou 24h atras.
- Percorre recursivamente `localPath` com `fs.readdirSync({ recursive: true })`.
- Filtra por `mtime > since`.
- Aplica ignore patterns do projeto + `DEFAULT_IGNORE` usando `picomatch` (dependencia transitiva do chokidar).
- Para cada arquivo encontrado, envia `file:changed` com `source: 'scan'`.
- Retorna `{ success: true, count: N }`.

Novo handler `watcher:scan-remote`:
- Requer SFTP conectado.
- Percorre arquivos locais (mesma logica de filtro).
- Compara com remoto via `sftp.stat()` (tamanho). Arquivo diferente ou inexistente no remoto = alterado.
- Usa `runWithConcurrency` com 5 workers.
- Envia `file:changed` com `source: 'scan-remote'`.
- Retorna `{ success: true, count: N }`.

**`src/main/preload.js`**
- `scanFiles: (opts) => ipcRenderer.invoke("watcher:scan", opts)`
- `scanRemoteFiles: () => ipcRenderer.invoke("watcher:scan-remote")`

**`src/renderer/stores/useStore.js`**
- Novo estado `scanning: false`.
- Metodo `scanFiles()`: seta `scanning: true`, chama `api.scanFiles()`, seta `scanning: false`.
- Metodo `scanRemoteFiles()`: mesmo padrao.

**`src/renderer/components/FileList.jsx`**
- Botao de scan no header da file list (ao lado de "Selecionar todos" / "Limpar").
- Click = scan local.
- Se SFTP conectado, botao adicional "Verificar com servidor" ao lado do botao de scan local.
- Durante scan, botao desabilitado com indicacao visual.
- Toast ao concluir com contagem.

### Dependencia

`picomatch` — ja presente como dependencia transitiva do chokidar. Importar diretamente para uso no scan. Se necessario, adicionar como dependencia explicita no `package.json`.

---

## Feature 4: Importar .gitignore

### Problema

O usuario precisa configurar manualmente os ignore patterns, mesmo quando ja tem um `.gitignore` bem configurado no projeto.

### Solucao

Botao "Importar do .gitignore" na aba Ignorados do Settings. Le o `.gitignore` do projeto, converte a sintaxe para glob compativel com chokidar, e mescla com os patterns existentes.

### Mudancas

**`src/main/main.js`**

Novo handler `project:import-gitignore`:
- Le `.gitignore` do `localPath` do projeto ativo.
- Se nao existir, retorna `{ success: false, error: "Nenhum .gitignore encontrado no projeto" }`.
- Parse do conteudo:
  - Remove linhas vazias e comentarios (`#`).
  - Converte sintaxe gitignore para glob chokidar (tabela abaixo).
  - Ignora negacoes (`!pattern`).
  - Remove duplicatas com `DEFAULT_IGNORE` e patterns existentes do projeto.
- Retorna `{ success: true, patterns: [...], skipped: [...] }`.

**Tabela de conversao gitignore -> glob:**

| Gitignore | Glob chokidar | Regra |
|-----------|---------------|-------|
| `dist` | `**/dist`, `**/dist/**` | Match arquivo + diretorio em qualquer profundidade |
| `dist/` | `**/dist/**` | Diretorio + conteudo |
| `/dist` | `dist/**` | Relativo a raiz |
| `/dist/` | `dist/**` | Relativo a raiz, diretorio |
| `*.log` | `**/*.log` | Match em qualquer profundidade |
| `!important.log` | *(ignorado)* | Negacao nao suportada |
| `doc/**/*.pdf` | `doc/**/*.pdf` | Ja e glob valido |

**`src/main/preload.js`**
- `importGitignore: () => ipcRenderer.invoke("project:import-gitignore")`

**`src/renderer/stores/useStore.js`**
- Novo metodo `importGitignore()`: chama `api.importGitignore()`. Se retornar patterns, mescla com `ignorePatterns` existentes, salva projeto, reinicia watcher.

**`src/renderer/components/SettingsPanel.jsx`**
- Na aba "Ignorados": botao "Importar do .gitignore" abaixo do textarea.
- Ao clicar, chama `importGitignore()`, atualiza o campo `ignorePatterns` do formulario.
- Toast de feedback com contagem de importados e ignorados.

---

## Arquivos impactados (resumo)

| Arquivo | F1 | F2 | F3 | F4 |
|---------|----|----|----|----|
| `src/main/sftp.js` | X | | | |
| `src/main/main.js` | X | X | X | X |
| `src/main/preload.js` | X | X | X | X |
| `src/renderer/stores/useStore.js` | X | X | X | X |
| `src/renderer/components/DeployBar.jsx` | X | X | | |
| `src/renderer/components/FileList.jsx` | | | X | |
| `src/renderer/components/SettingsPanel.jsx` | | | | X |

## Ordem de implementacao sugerida

1. **Feature 1** — Base para as demais (conexao confiavel)
2. **Feature 4** — Independente, simples, melhora UX imediata
3. **Feature 2** — Depende de entender bem o fluxo de deploy (que F1 ja tocou)
4. **Feature 3** — Mais complexa, pode ser feita por ultimo
