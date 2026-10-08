# Bem-te-vi

**Português (Brasil)** | [English](README.en.md) | [中文](README.zh-CN.md) | [中文](README.zh-CN.md) | [中文](README.zh-CN.md) | [中文](README.zh-CN.md)

Baseado em [Cuckoo Code](https://github.com/wangyongpeng90/cuckoo-code), de seus contribuidores originais. Licenciado sob GPL-3.0-only.

**Bem-te-vi** é um assistente de IA para desktop que usa as interfaces web dos provedores, sem exigir uma chave de API. Os limites e eventuais custos da conta de cada provedor continuam valendo.

Ele usa o Electron para incorporar as versões web de assistentes de IA (DeepSeek, Claude, etc.) em uma janela local e injeta uma barra lateral sobreposta. A IA é guiada pelo prompt do sistema para gerar chamadas de ferramenta (blocos de código JavaScript). Após a confirmação do usuário, essas chamadas são executadas em um sandbox local e os resultados são enviados de volta à IA. Todo o fluxo não requer chave de API e não incorre em taxas de uso de API — você usa sua conta web em vez de uma API de pagamento por token.

---

## Funcionalidades Principais

### Custo Zero de Tokens

Nenhuma API de plataforma de IA é chamada, e nenhum token de API é usado. Ele reutiliza diretamente as capacidades de chat das versões web, transformando uma IA baseada em web em um agente que pode executar operações locais.

### Estrutura de Provedores Multiplataforma

- Plataformas **DeepSeek**, **Claude** e **ChatGPT** integradas
- Cada plataforma encapsula independentemente diferenças como localização da caixa de entrada, detecção do botão de envio, detecção de conclusão de resposta e análise de mensagens
- Você pode escolher uma plataforma ao criar uma nova janela, ou **importar um Provedor personalizado** (declarações de tipo e modelos são fornecidos para reduzir a barreira de extensão)

### Um Verdadeiro Agente de IA

Não é apenas chat. A IA pode ler/escrever arquivos, pesquisar código, executar comandos, consultar bancos de dados, chamar ferramentas MCP e continuar com base nos resultados da execução, formando um ciclo de agente "pensar → agir → observar → agir novamente".

---

## Principais Recursos

- **Gerenciamento de múltiplas janelas**: cada janela tem um contexto de perfil independente; marque "Padrão" para abrir automaticamente na inicialização
- **Barra de endereço**: barra superior para visualizar/copiar a URL, navegar para trás/frente/recarregar, acesso rápido; uma barra de status abaixo mostra o uso de tokens e **velocidade de saída (TPS)**
- **Envio para Feishu**: respostas da IA podem ser enviadas para o Feishu (renderizadas como cartões interativos com Markdown, incluindo tabelas)
- **Inicialização de projeto**: após selecionar um diretório de projeto, a IA recebe a árvore de diretórios e o prompt do sistema
- **Modo Harness (chat puro)**: uma interface de chat pura semelhante ao Codex — oculta instruções de baixo nível, mostrando apenas mensagens do usuário / respostas do modelo / cartões de ferramenta; suporta streaming, Markdown, matemática KaTeX, pensamento recolhível, painel Objetivo/Plano (alternar com Ctrl+Shift+H)
- **Barra lateral de espaço de trabalho**: lista todas as conversas agrupadas por projeto; renomear / arquivar / novo; expanda uma conversa para ver seus **subagentes** e **histórico de compactação** (linhagem de sessão)
- **Árvore de arquivos do projeto**: árvore no estilo VSCode com ícones/cores de tipo, pesquisa de nome de arquivo e referência de caminho `@` com um clique
- **Pré-visualização de arquivos (Monaco)**: clique em um arquivo para pré-visualizar seu conteúdo à direita da árvore (editor do VSCode: números de linha + destaque de sintaxe), sem cobrir a IA; arraste a barra esquerda para redimensionar a árvore, a barra direita para redimensionar a barra lateral
- **Mercado de plugins**: descobre automaticamente plugins via tópico `topic:cuckoo-plugin` do GitHub; instale / desinstale / alterne com um clique (um plugin pode agrupar habilidades / agentes / regras / MCP / provedores personalizados / **scripts web**); **suporte a fonte Gitee**
- **Nomeação automática de conversas**: a IA nomeia cada conversa no início; a lista de espaço de trabalho é atualizada em tempo real
- **Suporte a habilidades**: habilidades alinhadas com Claude Code (`.cuckoo/skills/` do projeto + `~/.cuckoo/skills/` do usuário), divulgação progressiva — ensine fluxos de trabalho/regras/scripts específicos de domínio à IA. **→ [Configuração e uso](docs/skills.md)**
- **Suporte a agentes**: subagentes alinhados com Claude Code (`.cuckoo/agents/` do projeto + `~/.cuckoo/agents/` do usuário); a conversa principal pode delegar tarefas a um subagente de contexto isolado que retorna apenas um resumo — isolando o contexto e permitindo especialização. **→ [Configuração e uso](docs/agents.md)**
- **Sistema de chamadas de ferramenta**: a IA pode ler/escrever arquivos, pesquisar código, executar comandos, consultar bancos de dados e muito mais
- **Máscara de execução de ferramenta**: uma máscara sobre a página da IA durante a execução, com um botão "Parar" para cancelar o envio de resultados de volta
- **Suporte a MCP**: formato de configuração compatível com Claude Desktop, tipos de servidor stdio / http. **→ [Configuração e uso](docs/mcp.md)**
- **Painel sobreposto**: mostra pré-visualizações de comandos, resultados de execução e histórico; alterne com Ctrl+Shift+C ou Esc
- **Compactação de contexto**: sessões longas são compactadas automaticamente (limpar IDB + atualizar + compartilhar link) para evitar atingir o limite de contexto
- **Repetição automática**: dois mecanismos — (1) repetir com recuo quando uma resposta é truncada/falha; (2) o watchdog solicita "continuar" quando o fluxo SSE fica em silêncio
- **Persistência de sessão**: estado de login e configurações são salvos em %APPDATA%/bem-te-vi
- **Mecanismos de segurança**: tempo limite de comando de 30 segundos, tempo limite de sandbox de 60 segundos, buffer de saída de 1MB, confirmação de comandos perigosos (incluindo comandos compostos); o webFetch pode opcionalmente **rejeitar endereços internos** (proteção SSRF, ativada em Configurações)

---

## Idiomas

Português (Brasil) é o padrão. Selecione Inglês ou Chinês (简体中文) em Configurações → Idioma / Language, depois reinicie o aplicativo. Os chats existentes são preservados. Para uma inicialização única, defina `BEM_TE_VI_LANGUAGE=en` ou `BEM_TE_VI_LANGUAGE=zh-CN`. O site do provedor incorporado segue suas próprias configurações de idioma. Documentação chinesa histórica é mantida para referência.

## Instalação e Execução

### Requisitos

- Node.js >= 22.0.0 (corresponde a `engines` em `package.json`; 18+ recomendado)
- npm

### Passos

```bash
# Clone o repositório
git clone https://github.com/vinidias/bem-te-vi.git
cd bem-te-vi

# Instale as dependências
npm ci

# Se o npm bloquear os scripts postinstall do electron/esbuild (allowScripts), aprove primeiro:
#   npm install-scripts ls             # listar pacotes bloqueados
#   npm install-scripts approve --all  # ou aprove electron esbuild individualmente
#   npm install                        # reinstale para garantir que os binários sejam baixados
# Caso contrário, o binário do electron não será baixado e a inicialização falhará.

# Inicie o aplicativo
npm start
```

---

## Guia de Uso

1. Inicie o aplicativo e escolha uma plataforma (DeepSeek / Claude / Provedor personalizado)
2. Faça login na plataforma web correspondente normalmente
3. Clique em "Inicializar Projeto" e selecione um diretório de projeto; a IA receberá a árvore de diretórios e o prompt do sistema
4. Converse com a IA e peça que ela modifique arquivos, execute comandos, inspecione código, etc.
5. Chamadas de ferramenta nas respostas da IA são detectadas e executadas automaticamente
6. Os resultados da execução são enviados automaticamente de volta à IA, que continua até que a tarefa seja concluída

### Exemplo de Chamada de Ferramenta

Quando uma resposta da IA contém um bloco de código `cuckoo` no seguinte formato, o sistema o executa no sandbox e envia o resultado de volta à IA:

````markdown
```cuckoo
const content = await read("src/infra/paths.ts");
await write("src/infra/paths.ts", content.replace("resolveAsset", "resolveResource"));
```
````

---

## Sistema de Ferramentas

Ferramentas suportadas (chamadas por meio de blocos de código `cuckoo`):

| Função JS | Descrição |
|----------|----------|
| `read(path, options?)` | Ler um arquivo de texto (janela com números de linha) |
| `readLines(path, options?)` | Ler um arquivo como um array de linhas estruturado |
| `write(path, content)` | Criar ou sobrescrever um arquivo |
| `edit(path, old, new, replaceAll?, dryRun?)` | Substituir precisamente o conteúdo do arquivo |
| `glob(pattern, searchPath?)` | Encontrar arquivos por padrão glob |
| `grep(pattern, options?)` | Pesquisa de regex no conteúdo dos arquivos |
| `bash(command, options?)` | Executar um comando shell (cmd) |
| `pwsh(command, options?)` | Executar um comando PowerShell |
| `todoWrite(todos)` | Gerenciar uma lista de tarefas estruturada |
| `deleteFile(path)` | Excluir um arquivo (irreversível) |
| `webFetch(url)` | Buscar conteúdo de URL HTTP(S) (HTML para Markdown) |
| `mysql(options)` | Executar SQL do MySQL |
| `openBrowserWindow(url, options?)` | Abrir uma janela de navegador do Electron |
| `injectJS(windowId, code)` | Injetar JS em uma janela especificada |
| `attachFile(path)` | Enviar um arquivo local como anexo para a caixa de entrada |
| `mcpListServers()` | Listar servidores MCP configurados |
| `mcpGetTools(serverName)` | Listar ferramentas de um servidor MCP |
| `mcpCall(server, tool, args)` | Chamar uma ferramenta MCP |
| `log(...args)` | Saída de resultados intermediários para o log de execução |

Todas as operações de arquivo são relativas ao diretório do projeto atualmente vinculado por segurança.

---

## Configuração MCP

A configuração MCP usa o **formato compatível com Claude Desktop** (pode ser compartilhado/importado diretamente):

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "C:/meu-projeto"]
    }
  }
}
```

Ambos os tipos stdio (comando + args) e http (url + cabeçalhos) são suportados. O estado de ativação/desativação é armazenado separadamente e não polui a configuração principal. Abra o painel de gerenciamento por meio do botão "MCP" na sobreposição. **→ [Configuração e uso](docs/mcp.md)**

---

## Configuração de Habilidades

Habilidades ensinam à IA **fluxos de trabalho, regras e scripts** específicos de domínio, alinhados com o mecanismo de Habilidades de Agente do Claude Code.

Uma habilidade é um `SKILL.md` com frontmatter, colocado em um diretório convencional:

- **Nível de projeto**: `<projeto>/.cuckoo/skills/<nome>/SKILL.md` (acompanha o repositório, compartilhado pela equipe)
- **Nível de usuário**: `~/.cuckoo/skills/<nome>/SKILL.md` (disponível em todos os projetos)

Na inicialização do projeto, as habilidades são **verificadas automaticamente**, e o **nome + descrição + caminho** de cada habilidade é injetado no prompt do sistema (**divulgação progressiva**, sem texto completo). Quando uma tarefa é relevante, a IA `lê` o SKILL.md completo sob demanda e segue suas instruções; se uma habilidade acompanhar scripts, a IA os executa via `bash`/`pwsh`.

```markdown
---
name: minha-habilidade
description: Uma linha descrevendo o que essa habilidade faz e quando usá-la.
when_to_use: quando o usuário quiser xxx
allowed-tools: read, edit, bash
---

# Corpo da habilidade
Escreva o fluxo de trabalho, regras e exemplos aqui.
```

**Guia completo (convenções de diretório, campos, exemplos) → [Configuração e uso de habilidades](docs/skills.md)**

---

## Configuração de Agentes

Agentes permitem que a conversa principal **delegue** tarefas a uma sub-conversa de **contexto isolado** que retorna apenas um resumo, alinhado com o mecanismo de subagentes do Claude Code.

Um agente é um arquivo `.md` com frontmatter:

- **Nível de projeto**: `<projeto>/.cuckoo/agents/<nome>.md` (acompanha o repositório, compartilhado pela equipe)
- **Nível de usuário**: `~/.cuckoo/agents/<nome>.md` (disponível em todos os projetos)

Na inicialização do projeto, os agentes são **verificados automaticamente**, e o **nome + descrição** de cada agente é injetado no prompt do sistema. Quando uma tarefa é adequada para delegação, a conversa principal chama `runAgent(nome, tarefa)` — o subagente trabalha em um contexto isolado e **retorna apenas um resumo**.

**Duplo valor**: (1) isolamento de contexto (alivia o atraso de conversas longas); (2) especialização + restrição de ferramentas.

```markdown
---
name: revisor-codigo
description: Revisar a qualidade do código. Use após escrever código.
tools: read, grep, glob
maxTurns: 20
---

Você é um revisor de código sênior. Revise o código fornecido e relate problemas reais.
```

**Guia completo (convenções de diretório, campos, exemplos, agentes integrados) → [Configuração e uso de agentes](docs/agents.md)**

---

## Provedor Personalizado

Quer integrar uma nova plataforma de IA? Copie `src/providers/custom/provider.template.js` e preencha de acordo com o modelo:

- Informações básicas como `id` / `name` / `homeUrl`
- Seletores para a caixa de entrada e botão de envio
- Métodos como `matchesUrl()` e `extractSessionId()`
- Métodos relacionados à análise automática (detecção de conclusão, localização de mensagens, etc.)

Consulte `src/providers/types.ts` para declarações de tipo. Importe o arquivo JS da página de seleção de plataforma no aplicativo para usá-lo.

---

## Estrutura do Projeto

```
cuckoo-code/
├── start.js                 # Script de inicialização multiplataforma (compila e depois inicia, logs em wyp/log/)
├── package.json             # "main" aponta para out/src/app/entry.js (sem entrada de shell fino)
├── src/
│   ├── app/                 # Shell do aplicativo (processo principal)
│   │   ├── entry.ts         # Entrada do aplicativo, criação de janelas, menu do aplicativo
│   │   ├── shell-preload.ts # Preload da página de shell da barra de endereço
│   │   ├── window.ts        # Gerenciamento de múltiplas janelas (arquitetura WebContentsView)
│   │   ├── profile.ts       # Gerenciamento de perfil de janela
│   │   ├── token-stats.ts   # Total de tokens do sistema (entre janelas, persistido)
│   │   └── ipc/             # Manipuladores IPC (projeto/sessão/comando/ferramenta/renderizador/shell)
│   ├── session/             # Contexto de sessão e projeto
│   │   ├── store.ts         # Persistência de mapeamento diretório-sessão
│   │   ├── project-context.ts # Inicialização de projeto
│   │   ├── prompt-builder.ts  # Montagem de prompt do sistema
│   │   └── compaction.ts      # Compactação de contexto
│   ├── bridge/              # Ponte para a página web da IA (preload)
│   │   ├── entry.ts         # Entrada preload
│   │   ├── api.ts           # Exposição da API contextBridge
│   │   ├── intercept/       # Manipulação de resposta de interceptação de rede
│   │   ├── parser/          # Análise de chamadas de ferramenta JS/JSON
│   │   └── loop/            # Executor, watchdog, motor de repetição
│   ├── overlay/             # Interface sobreposta
│   │   ├── panel.ts         # Noções básicas do painel (injeção, toasts, histórico)
│   │   ├── events.ts        # Ligação de eventos (orquestração)
│   │   ├── panels/          # Painéis (gerenciador de janelas / MCP / configurações)
│   │   ├── fab.ts           # Arrastar bola flutuante
│   │   └── template/        # Modelos HTML/CSS (gerados para TS no tempo de build)
│   ├── tools/               # Sistema de ferramentas
│   │   ├── api.d.ts         # Contrato de ferramenta de IA (gerado)
│   │   ├── core/            # Ferramenta / ToolRegistry / ToolResult
│   │   ├── runtime/         # Executor de sandbox JsRunner
│   │   └── impl/            # Implementações individuais de ferramentas
│   ├── providers/           # Provedores de plataforma
│   │   ├── types.ts         # Interface do provedor
│   │   ├── deepseek.ts / claude.ts / chatgpt.ts
│   │   ├── hooks/           # Fontes de interceptador de rede (compactados para uma string no tempo de build)
│   │   └── custom/          # Carregador e modelo de provedor personalizado
│   ├── skills/              # Mecanismo de habilidades (verificador / frontmatter / prompt)
│   ├── mcp/                 # Cliente e configuração MCP
│   ├── infra/               # Infraestrutura (caminhos / EOL / registro em log / comandos perigosos)
│   ├── prompt/              # Modelos de prompt de plataforma
│   └── ui/                  # Páginas de shell (shell.html / platform-select.html)
├── scripts/                 # Scripts de build (empacotamento de hooks, geração de API de ferramenta)
├── test/                    # Testes unitários
└── out/                     # Saída de build TypeScript
```

---

## Build e Lançamento

- Este repositório tem GitHub Actions configurado. Empurrar uma tag `v*` (por exemplo, `v0.7.1`) constrói automaticamente instaladores do Windows e macOS e os publica em Releases
- Builds manuais locais: `npm run build:win:local` ou `npm run build:mac:local`
- A saída do build vai para o diretório `dist/`

---

## Roadmap

Consulte [Roadmap.md](Roadmap.md) para o plano da próxima fase.

---

## Contribuindo

Issues e Pull Requests são bem-vindos.

- Relatar bugs ou sugerir novos recursos: Issues
- Enviar código: Pull Requests

---

## Licença

Este projeto é licenciado sob a GNU General Public License v3.0. Consulte o arquivo LICENSE para detalhes.

---

## Agradecimentos

- DeepSeek e Claude por fornecerem poderosas capacidades de IA
- Electron pela estrutura desktop multiplataforma
- [@27584](https://github.com/27584):
  - Melhorias de nível de estrutura: interface de extensão de envio do Provider, estabilidade de streaming de canal duplo, carregamento de renderizador de Provider personalizado, reconhecimento de ferramenta MCP (PR #9)
  - **Modo Harness (chat puro)**: uma interface de chat pura semelhante ao Codex — oculta instruções de baixo nível, mostrando apenas mensagens do usuário / respostas do modelo / cartões de ferramenta; com streaming, pensamento recolhível, painel Objetivo/Plano, menu de barra (PR #22)
  - **Melhorias no Harness + Mercado de plugins**: isolamento de múltiplas sessões, aba "Conversas" na barra lateral, renderização Markdown/LaTeX (KaTeX), direção automática Objetivo/Plano, mercado de plugins (descoberta automática e instalação por tópico do GitHub) (PR #23)
- [@jiangchengnay](https://github.com/jiangchengnay):
  - **Injeção de script web de plugin**: novo tipo de contribuição `scripts/` para plugins — injete scripts no mundo principal da página web por correspondência de URL, funciona em plataformas integradas (PR #26)
  - **Suporte a mercado de plugins Gitee**: o mercado de plugins ganha uma fonte Gitee (pesquisa / download / manifesto), paralela ao GitHub, para usuários com acesso instável ao GitHub (PR #28)
  - **Correção de envio de subagente**: corrige subagentes travados em "enviando prompt de tarefa" em plataformas contenteditable como Doubao (PR #29)
- [@8555uuy](https://github.com/8555uuy):
  - **Endurecimento da detecção de comandos perigosos**: corrige contorno de detecção por meio de comandos compostos (`&&` `||` `;` `|` `&`); unifica em uma única fonte de verdade e adiciona mais variantes perigosas (PR #30)
  - **glob exclui diretórios de artefatos**: exclui diretórios de dependências/artefatos como `node_modules` por padrão quando nenhum caminho é fornecido, evitando sobrepor os próprios arquivos do projeto (PR #31)
  - **Proteção SSRF do webFetch**: rejeita endereços internos/loopback/reservados (opcional via Configurações, desativado por padrão) (PR #32)
  - **Velocidade de saída da barra de status (TPS)**: mostra a velocidade de saída do modelo — contagem exata de tokens do lado do servidor no DeepSeek, estimada no ChatGPT/Claude (PR #33)
  - **Formato de resultado de ferramenta personalizável pelo Provider**: novo hook opcional `transformToolResult` permite que plugins personalizem o formato de texto antes que os resultados da ferramenta sejam enviados de volta (PR #34)
- [@ZiJiangel](https://github.com/ZiJiangel):
  - **Cartão Markdown do Feishu**: respostas da IA enviadas para o Feishu agora renderizam Markdown (incluindo tabelas) por meio de cartões interativos (PR #35)
- Todos os contribuidores e usuários

## Google Gemini

O suporte ao Gemini está planejado, não implementado. Consulte o [plano de integração](docs/gemini-plan.md).