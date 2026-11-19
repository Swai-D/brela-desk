---
title: Details for documents and Smart fill
summary: Case-specific facts used by templates, and how Smart fill reads a pasted client message.
keywords: details for documents, case data, smart fill, ai extract, paste message, capital, proposed names, kv, remember on client, apply
order: 5
---
The **Details for documents** card holds facts that belong to **this** case only: the proposed company names, a capital figure, a date. Templates also read the client's company details, and these case details win when both have the same field.

## Edit

1. Press the pencil on the card.
2. Add a name and a value, change a value, or remove one.
3. Save. Your changes show in the card straight away.

The line at the bottom shows how many company details and people come from the client, with a link to manage them.

## Smart fill (needs the AI)

Smart fill reads a message a client sent (WhatsApp, email, notes) and proposes details and people.

1. Press the paste icon on the card.
2. Paste the message and press **Read it**. If the AI is not set up: "The AI is not set up yet. A Manager can add an API key in Settings → AI assistant."
3. In **Review what was found**, untick anything wrong and fix values in place.
4. Tick **Also remember these on the client's company details** to reuse them in future cases.
5. Press **Apply**. Nothing is saved before this.

People found are added to the client unless a person with the same name already exists.

> The pasted text goes to your AI provider. Paste only what is needed.

## When to use which

| You have | Use |
|---|---|
| The BRELA registry page | [Import from BRELA](help:clients/import-from-brela) (no AI) |
| A client's message with details | Smart fill |
| One fact to correct | Edit the field |

See also: [AI assistant](help:documents/ai-assistant).
