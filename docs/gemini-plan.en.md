[Português](gemini-plan.md) | [English](gemini-plan.en.md)

# Integration Plan: Google Gemini Web Provider (Electron Desktop)
*Preliminary version — planning only, no implementation*

---

## 1. Context and Scope
This plan defines the integration of **Google Gemini Web (official web interface, gemini.google.com)** as a built-in provider for the Electron agent, following the existing `Provider` contract.

> ⚠️ **Explicit distinction (later decision):** This integration refers *exclusively to the Gemini web interface accessed via user account*, not the paid Gemini API. The choice between using the web layer or the official API will be evaluated in a future phase, outside the scope of this plan.

## 2. Phase 1: Authenticated DOM & Network Discovery
Goal: map real Gemini web behavior without inventing selectors or endpoints.

| Task | Description | Completion Criterion |
|------|-------------|----------------------|
| 1.1 Base authentication | Validate persistent login in the Electron Gemini profile, without bot blocks | Session persists across 3 agent restarts |
| 1.2 DOM mapping | Capture real selectors for: input box, send button, stop generation button, attachment upload input, sidebar conversation list, user data element | All elements mapped in an authenticated session, with real class names/attributes (no invented selectors) |
| 1.3 Network endpoint mapping | Capture Gemini SSE/HTTP streaming requests, identifying: prompt send endpoint, attachment upload endpoint, response chunk structure, auth headers, session parameters | Documented list of real endpoints and payloads, no assumptions |
| 1.4 Rate limit detection | Record status codes, error messages, and UI behavior when the request limit is hit (including free vs Advanced plan limits) | Error pattern and wait time documented |
| 1.5 Locale support | Validate interface behavior in `pt-BR` and `en-US` localizations (selector changes, button text, DOM structure) | No selector depends on translated text, or both locale mappings are documented |

## 3. Phase 2: Provider Contract Feature Mapping
Goal: align each `Provider` contract field with discovered Gemini behavior.

| Contract Field | Definition Plan |
|----------------|-----------------|
| `id`, `name`, `homeUrl`, `sessionUrlBase` | Known fixed values: `id='gemini-web'`, `homeUrl='https://gemini.google.com'` |
| `homeUrlPattern`, `matchesUrl`, `extractSessionId` | Based on the real Gemini conversation URL structure, validated during discovery |
| `inputSelectors`, `sendButtonSelectors`, `userInfoSelector`, `inputKeywords` | Filled with real selectors mapped in Phase 1, ordered by priority |
| `getSessionListFn()` | Custom implementation only if the Gemini conversation list does not use `<a href>` tags (to be confirmed in discovery); if it is a SPA with click events on `div` elements, a self-contained serialized function to extract title, href and active state |
| `getStopFn()` | Stop generation button location function, with fallback to internal heuristics if the selector fails |
| `getAttachProbeSource()` | Custom implementation if the upload button is icon-only (no class with `attach/upload/file` keywords), with viewport coordinates for CDP click |
| `useIntercept`, `getHookSource()` | **Streaming interception mode:** serialized hook source to intercept response chunks directly from the network, ensuring full generation reception (preferred over DOM capture mode, to avoid text loss during streaming) |
| `getPromptTemplate()` | Empty template (uses global template) unless Gemini has specific formatting requirements (to be validated) |
| `transformToolResult()` | Adjust tool result return format to avoid triggering Gemini risk controls (excessive emoji removal, terminal output formatting, tag structure) to be validated with tool result send tests |

## 4. Phase 3: Critical Features
### 4.1 Interception-Based Streaming Completion
- Use `useIntercept: true` mode to capture response chunks directly from the network, avoiding DOM parsing failures during generation.
- Map streaming end signals (last chunk, status code, connection close) to mark the response as complete, with a fallback timeout.

### 4.2 Attachment Upload
- Use CDP upload channel: click the detected upload button, intercept the file picker, inject the file path.
- Validate support for file types accepted by Gemini (images, documents, audio) during discovery.

### 4.3 Tool Protocol (Cuckoo)
- Validate that Gemini web correctly accepts and interprets the Cuckoo protocol tool call format.
- Adjust `transformToolResult()` if there is a formatting incompatibility that causes interpretation errors or security blocks.

### 4.4 Rate Limit Handling and Retry
- Detect rate limit via two paths: network response interception (error code/message) and limit warning UI detection.
- Implement retry logic with exponential backoff, with wait time based on the value shown in the Gemini interface, maximum 3 attempts.
- Show explicit user warning when the limit is hit, no automatic retry for plan limits that require longer wait times.

## 5. Phase 4: Provider Registry Registration
- Add the `gemini-web` provider to the built-in provider list in `loadBuiltinProviders()`, alongside DeepSeek, Claude and ChatGPT.
- Ensure `validateProvider()` runs on load, per D14 rule (runtime validation, since TypeScript types are erased).
- Ensure `getProviderByUrl()` correctly recognizes Gemini URLs.

## 6. Phase 5: Tests and Manual Validation
| Test Type | Mandatory Use Cases |
|-----------|---------------------|
| Contract validation | Run `validateProvider()` and confirm no errors |
| DOM tests | Locate input box, send button, stop button, attachment input across 5 different sessions, in pt-BR and en-US locales |
| Streaming tests | Validate complete receipt of short, medium (1000+ words) and long (5000+ words) responses, no truncation |
| Attachment tests | Upload image, PDF and text file, validate that Gemini receives and processes the file |
| Session tests | Extract conversation list, identify active session, open old session by URL |
| Tool tests | Send 10 tool results with different formats (terminal output, XML, text with emoji) and validate no blocks or misinterpretation |
| Rate limit tests | Simulate request limit scenario and validate detection and retry logic |
| Locale tests | Repeat all above tests in pt-BR and en-US versions of the Gemini interface |
| Manual validation | 3-day consecutive usage test with a real account, to detect unforeseen behavior (DOM changes, blocks, network changes) |