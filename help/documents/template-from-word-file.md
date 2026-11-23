---
title: Make a template from your own Word file
summary: Upload a Word file with yellow [LABELS]; it keeps your exact layout and gets its own wizard.
keywords: own word file, my word file, custom template, upload word, yellow labels, square brackets, highlight, exact layout, letter, engagement letter, new template word, from my word file, optional, if any, include leave out, wizard questions, fill word file
order: 12
role: SENIOR
---
Use this when you have your own document (a letter, a contract, a form) and want it filled automatically **inside the same Word file**, so the result looks exactly like your original. No AI is used.

## Prepare the Word file once

1. Type each detail that changes in **capitals inside square brackets**, for example `[CLIENT NAME]`, `[ENGAGEMENT FEE]`, `[LETTER DATE]`.
2. Select the bracketed label and apply the **yellow highlight**. Highlight only the label, not the words around it.
3. For a detail that may not exist add **, IF ANY** inside the brackets: `[SITE CONTACT, IF ANY]`. When nobody has it, it is left blank (not yellow).
4. For wording that should be included only sometimes, highlight it yellow **without brackets**, for example "within 14 days". The wizard asks **Include it** or **Leave it out**.
5. Save as **.docx** (not .doc, not PDF). A PDF cannot keep a fillable layout: save from Word as .docx instead, and the app makes the PDF copy for you.

## Upload it

1. **Templates → Add from a file → From my Word file**.
2. Enter the **Template name** and optional **Match words** (they suggest the template on a checklist item).
3. Choose the **Word file (.docx)** and press **Create template**.
4. The result lists every label and how it is filled:

| You see | Meaning |
|---|---|
| **Filled from the Company** | The app already holds it: for example `[COMPANY NAME]`, `[REGISTERED OFFICE]`, `[INCORPORATION NO]`, `[TODAY]`, `[DIRECTOR 1 NAME]`, `[SECRETARY NAME]`, the share capital |
| **Asked in the wizard** | A question is added. Labels with DATE become a date question, FEE, AMOUNT or PRICE a money question (written as 1,200,000), NUMBER OF a number question |
| **Asked in the wizard (optional)** | The `, IF ANY` labels |
| **Include / Leave out question** | Your yellow wording without brackets |

A wizard with your template's name is created automatically. A Manager can change its questions under **Settings → Document wizards** ([Document wizards](help:settings/document-wizards)).

## Use it

On a case open **Prepare documents**, choose your wizard, answer the questions, press **Check** and then **Generate**. You get the Word file and a PDF copy. The robot icon on a checklist item opens the same wizard, so the result is the same wherever you start ([Prepare documents](help:documents/prepare-documents)).

## Change the file later

Open the template, go to the **Word / PDF** tab, press **Download Word**, edit it in Word and use **Upload edited Word**. New labels in the edited file get new wizard questions automatically.

Deleting the template also removes the wizard made for it.

## Messages

| Message | Fix |
|---|---|
| "No yellow [LABELS] were found…" | Type the details in capitals inside square brackets and highlight them yellow, then upload again |
| "Use a .docx file" | Save the file as .docx in Word |
| "This Word file could not be read…" | Re-save it in Word and upload again |
| "A template with this name already exists…" | Choose another **Template name** |
| "Answer the required questions of … first" | Open **Prepare documents**, answer the red-star questions and press **Generate** |

Changing the file later: [Replacing the Word file safely](help:documents/template-versions-and-approval).

See also: [Templates](help:documents/templates), [From an accepted document](help:documents/template-from-document) (text template made by the AI, layout not kept).
