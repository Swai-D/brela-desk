---
title: Ask about this case (case chat)
summary: Ask the AI questions about one case and get answers from its documents, checklist, history and comments, with the sources shown.
keywords: chat, ask, case chat, assistant, ai, question, rag, brela returned, correction, sources, documents, summary, privacy
order: 8
---
**Ask about this case** is a chat for one case. It is most useful when BRELA returns a case: ask what to correct and where.

## Open it

On the case page press **Ask about this case** (next to **Doc Studio**). A panel opens on the right. You need the permission **Use the AI assistant**, and a Manager must have set up the AI in [AI settings](help:settings/ai-settings). The assistant uses the provider and model chosen there.

## What it knows

Only this case:

- **Case details**: code, type, stage, due date, assignee, BRELA track number.
- **Document checklist**: which items are ready, their files, details still highlighted in yellow, and documents not yet checked by a second person.
- **History**, including exactly what BRELA asked to correct, and the **comments**.
- **Company details** saved on the client, and the people.
- **The Companies Act and guides** from the [Reference library](help:settings/reference-library). They are part of every case, so the assistant can check documents against the Act and name the section, for example "Section 5". What BRELA last asked to correct is used to find the right sections.
- **The text of the documents** uploaded to the case (.docx, .pdf, .txt and scans). For each question the app picks the passages that match your words.

**Scanned PDFs and pictures** (.png, .jpg, .tif) are read with text recognition (OCR) on the server, so they are not sent anywhere to be read. Scans can contain misread characters, so the panel names them and you should check names and numbers in the original. OCR reads English; a very faint or handwritten scan may give little or nothing. Files that still cannot be read are listed with the reason: paste the text into a comment if it matters. The first question about a case reads its files once, so it can take a little longer; later questions are quick.

## Ask

1. Type a question and press Enter (Shift+Enter for a new line), or press one of the suggestions, such as **What did BRELA ask us to correct?**
2. Every statement ends with source marks like C3 or D1. Under the answer, chips name the sources. A chip with a file name opens that file.
3. Follow-up questions work: the last turns are sent along.

If the case does not contain the answer, the assistant says so instead of guessing. Always check the answer before you change a document.

## Good to know

- The conversation belongs to the case: colleagues see it too, with the name of who asked.
- **Privacy** (Settings → AI assistant): when on, long numbers such as ID, TIN and phone numbers are hidden from the AI, so it will say "hidden" if you ask for one.
- Each question counts toward the AI limits and appears in the AI usage report as **chat**.
- A role with **Change a case's assignee and due date** can press the bin to clear the conversation.

See also: [The case page](help:cases/case-page), [AI settings](help:settings/ai-settings), [Submit and track](help:cases/submit-and-track).
