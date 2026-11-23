---
title: AI settings
summary: Choose the provider and model, save the key, set limits, privacy and who may use the AI.
keywords: ai settings, kimi, moonshot, deepseek, provider, api key, model, openai compatible, endpoint url, max tokens, temperature, timeout, requests per day, requests per hour, privacy, system prompt, business plan prompt, who can use the ai, usage, remove key
order: 5
role: MANAGER
---
**Settings → AI assistant**. The AI is used for Smart fill, drafting and teaching templates, not for the wizards ([What the AI does](help:documents/ai-assistant)).

## Set it up

1. **Provider:** pick one: Anthropic (Claude), OpenAI, Google (Gemini), xAI (Grok), Mistral AI, Moonshot (Kimi) or DeepSeek. For other services pick the OpenAI-compatible option and fill the **Endpoint URL**.
2. **API key:** paste it. It is saved encrypted; afterwards you see only the last 4 characters. **Remove the saved key** deletes it.
3. **Model:** type the **Model ID**, or press the refresh button to load the live list from the provider (it saves your changes first). Model names change often.
4. **Language of documents:** the language the AI writes in.
5. Press **Save and test the connection**.

## Controls

| Setting | Meaning |
|---|---|
| **Max tokens**, **Temperature**, **Timeout (s)** | Length, creativity and wait time. Keep defaults unless told otherwise. |
| **Requests per day (everyone)**, **Requests per hour (each person)** | Cost protection |
| **Who can use the AI** | Tick the roles allowed. Others see "Your role is not allowed to use the AI." |
| **Privacy: Standard (recommended)** vs **Off: send everything** | Standard never sends ID numbers, phones, emails or dates of birth |
| **System prompt** and **Reset to the recommended prompt** | Instructions to the AI. Edit with care. |
| **Business plan prompt** and **Reset to the recommended prompt** | The instructions and examples the AI follows when it drafts the wording of an industrial business plan ([Industrial business plan](help:documents/wizard-industrial-business-plan)). Edit with care; the AI still writes words only, never figures. |

## Usage

The page lists **Requests** and **Tokens in / out**, or "No AI requests yet".

See also: [Template from a document](help:documents/template-from-document).
