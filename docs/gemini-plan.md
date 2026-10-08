[Português](gemini-plan.md) | [English](gemini-plan.en.md)

# Plano de Integração: Provider Google Gemini Web (Electron Desktop)
*Versão preliminar — sem implementação, apenas planejamento*

---

## 1. Contexto e Escopo
Este plano define a integração do **Google Gemini Web (interface web oficial, gemini.google.com)** como provider interno do agente Electron, seguindo o contrato `Provider` existente.

> ⚠️ **Distinção explícita (decisão posterior):** Esta integração se refere *exclusivamente à interface web do Gemini acessada por conta de usuário*, não à API paga do Gemini. A escolha entre usar a camada web ou a API oficial será avaliada em etapa futura, fora do escopo deste plano.

## 2. Fase 1: Descoberta de DOM e Rede (Conta Autenticada)
Objetivo: mapear comportamento real do Gemini web sem inventar seletores ou endpoints fictícios.

| Tarefa | Descrição | Critério de Conclusão |
|--------|-----------|------------------------|
| 1.1 Autenticação base | Validar login persistente no perfil Electron do Gemini, sem bloqueios de bot | Sessão se mantém após 3 reinícios do agente |
| 1.2 Mapeamento de DOM | Capturar seletores reais de: caixa de entrada, botão de envio, botão de parar geração, entrada de upload de anexos, lista de conversas na barra lateral, elemento de dados do usuário | Todos os elementos mapeados em sessão autenticada, com nome de classe/atributo real (sem seletores inventados) |
| 1.3 Mapeamento de endpoints de rede | Capturar requisições de streaming SSE/HTTP do Gemini, identificando: endpoint de envio de prompt, endpoint de upload de anexos, estrutura de chunks de resposta, cabeçalhos de autenticação, parâmetros de sessão | Lista documentada de endpoints e payloads reais, sem suposições |
| 1.4 Detecção de rate limit | Registrar códigos de status, mensagens de erro e comportamento de UI quando o limite de requisições é atingido (incluindo limites de plano gratuito vs Advanced) | Padrão de erro e tempo de espera documentado |
| 1.5 Suporte a localidade | Validar comportamento da interface nas localizações `pt-BR` e `en-US` (alterações de seletores, texto de botões, estrutura de DOM) | Nenhum seletor depende de texto traduzido, ou mapeamento de ambas as localidades está documentado |

## 3. Fase 2: Mapeamento de Funcionalidades do Contrato Provider
Objetivo: alinhar cada campo do contrato `Provider` com o comportamento descoberto do Gemini.

| Campo do Contrato | Plano de Definição |
|-------------------|---------------------|
| `id`, `name`, `homeUrl`, `sessionUrlBase` | Valores fixos conhecidos: `id='gemini-web'`, `homeUrl='https://gemini.google.com'` |
| `homeUrlPattern`, `matchesUrl`, `extractSessionId` | Baseados na estrutura real de URLs de conversa do Gemini, validados na descoberta |
| `inputSelectors`, `sendButtonSelectors`, `userInfoSelector`, `inputKeywords` | Preenchidos com os seletores reais mapeados na Fase 1, ordenados por prioridade |
| `getSessionListFn()` | Implementação customizada apenas se a lista de conversas do Gemini não usar tags `<a href>` (a confirmar na descoberta); se for SPA com eventos de clique em `div`, função serializada autossuficiente para extrair título, href e estado ativo |
| `getStopFn()` | Função de localização do botão de parar geração, com fallback para heurística interna caso o seletor falhe |
| `getAttachProbeSource()` | Implementação customizada se o botão de upload for apenas ícone (sem classe com palavras-chave `attach/upload/file`), com coordenadas de viewport para clique por CDP |
| `useIntercept`, `getHookSource()` | **Modo de interceptação de streaming:** fonte do hook serializado para interceptar chunks de resposta da rede, garantindo recebimento completo da geração (preferencial ao modo de captura por DOM, para evitar perda de texto em streaming) |
| `getPromptTemplate()` | Modelo vazio (usa template global) a menos que o Gemini tenha requisitos específicos de formatação (a validar) |
| `transformToolResult()` | Ajuste de formato de retorno de ferramentas para evitar acionamento de controle de risco do Gemini (remoção de emoji excessivo, formatação de saída de terminal, estrutura de tags) a validar com testes de envio de resultado de ferramenta |

## 4. Fase 3: Funcionalidades Críticas
### 4.1 Conclusão de Streaming por Interceptação
- Usar modo `useIntercept: true` para capturar chunks de resposta diretamente da rede, evitando falhas de parse de DOM durante a geração.
- Mapear sinais de fim de streaming (último chunk, código de status, fechamento de conexão) para marcar a resposta como concluída, com timeout de fallback.

### 4.2 Upload de Anexos
- Usar canal de upload por CDP: clicar no botão de upload detectado, interceptar a caixa de seleção de arquivo, injetar o caminho do arquivo.
- Validar suporte a tipos de arquivo aceitos pelo Gemini (imagens, documentos, áudio) na descoberta.

### 4.3 Protocolo de Ferramentas (Cuckoo)
- Validar que o Gemini web aceita e interpreta corretamente o formato de chamada de ferramenta do protocolo Cuckoo.
- Ajustar `transformToolResult()` se houver incompatibilidade de formatação que cause erros de interpretação ou bloqueio de segurança.

### 4.4 Tratamento de Rate Limit e Retentativa
- Detectar rate limit por duas vias: interceptação de resposta de rede (código/ mensagem de erro) e detecção de UI de aviso de limite.
- Implementar lógica de retentativa com backoff exponencial, com tempo baseado no informado na interface do Gemini, com máximo de 3 tentativas.
- Exibir aviso explícito ao usuário quando o limite for atingido, sem retentativa automática para limites de plano que exigem espera maior.

## 5. Fase 4: Registro no Provider Registry
- Adicionar o provider `gemini-web` na lista de providers internos em `loadBuiltinProviders()`, ao lado de DeepSeek, Claude e ChatGPT.
- Garantir que `validateProvider()` seja executado no carregamento, conforme regra D14 (validação em tempo de execução, já que tipos TypeScript são apagados).
- Garantir que `getProviderByUrl()` reconheça URLs do Gemini corretamente.

## 6. Fase 5: Testes e Validação Manual
| Tipo de Teste | Casos de Uso Obrigatórios |
|---------------|----------------------------|
| Validação de contrato | Executar `validateProvider()` e confirmar ausência de erros |
| Testes de DOM | Localizar caixa de entrada, botão de envio, botão de parar, anexo em 5 sessões diferentes, nas localidades pt-BR e en-US |
| Testes de streaming | Validar recebimento completo de respostas curtas, médias (mais de 1000 palavras) e longas (mais de 5000 palavras), sem truncamento |
| Testes de anexos | Upload de imagem, PDF e arquivo de texto, validar que o Gemini recebe e processa o arquivo |
| Testes de sessão | Extrair lista de conversas, identificar sessão ativa, abrir sessão antiga por URL |
| Testes de ferramentas | Enviar 10 resultados de ferramenta com formatos diferentes (saída de terminal, XML, texto com emoji) e validar que não há bloqueio ou interpretação errada |
| Testes de rate limit | Simular cenário de limite de requisições e validar detecção e lógica de retentativa |
| Testes de localidade | Repetir todos os testes acima nas versões pt-BR e en-US da interface do Gemini |
| Validação manual | Teste de uso por 3 dias consecutivos com conta real, para detectar comportamento não previsto (mudanças de DOM, bloqueios, alterações de rede) |

---

---

