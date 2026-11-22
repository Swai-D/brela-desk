---
title: Prepare documents (the wizards): how to use them
summary: On a case, answer a few questions and every form and resolution is filled; Check, Generate, open, regenerate.
keywords: pdf, pdf copy, upload to brela, prepare documents, wizard, generate, check, resolution, form 213a, 213b, 131, 57a, 57b, one click, fill, scenario, suggested, answers saved, warnings, missing details, regenerate
order: 1
---
**Prepare documents** is a card on every case. It uses the company's saved details and the official Word templates. **No AI is involved**: the same answers always give the same documents, so the team's work is to **cross-check and sign**.

## Steps

1. Open the case and find the **Prepare documents** card. If the official templates are not imported you see a yellow notice; a Senior or Manager must import them first ([Import the official templates](help:documents/import-official-templates)).
2. Choose a wizard. The one that fits the case is marked **Suggested**; a wizard you used before shows **Answers saved**.
3. Answer the questions. A red **\*** means required. Dates left empty use the default shown in the field's hint.
4. For a person question pick a saved person, or press **Add a new person** to create one without leaving the page ([People](help:clients/people)).
5. Press **Check**. You see the list of documents that will be made, **warnings**, and the people whose details are missing ("not saved yet" or the list of missing fields).
6. Fix what the warnings say, then press **Generate**. Each document gets a **Word** button and, when the server can make it, a **PDF** button.

## The one way to make documents

The wizards are the only way to make the official forms, resolutions and notices. If you press the robot icon on a checklist item and choose an official template, the same wizard opens, so the result is identical wherever you start. Optional wording (for example "at nominal value") is decided by a question or by your answers, so the files come out without yellow marks. Yellow remains only for a detail that is truly missing, such as a person's nationality, and the **Check** step names it.

Your own Word templates ([Make a template from your own Word file](help:documents/template-from-word-file)) appear here too, each with a wizard that was made for it.

Starting from a checklist item? The robot icon takes you to the right wizard, or shows a dialog with a button that opens it ([Fill a template on a case](help:documents/fill-a-template-on-a-case)).

## What you get

- One Word file per document, named with the form and, for per-person forms, the person's name.
- A **PDF copy** of each Word file, with the same name and the same layout. Use the PDF when a portal asks for a PDF upload and the Word file when you still need to edit. The PDF is made from the file as it was generated, so if you edit the Word file afterwards, save a new PDF from Word or press **Generate** again (it replaces both copies).
- The files are attached to the case. If the checklist has an item with the form number in its name (for example "Form 213a") the file is linked to it ([Checklist and files](help:cases/checklist-and-files)).
- A history entry on the case.

## The wizards

| Wizard | Guide |
|---|---|
| **Change of directors** | [Change of directors](help:documents/wizard-change-of-directors) |
| **Change of company secretary** | [Change of company secretary](help:documents/wizard-change-of-secretary) |
| **Call on shares, forfeiture and re-allotment** | [Shares: call, forfeiture, re-allotment](help:documents/wizard-shares-calls-forfeiture) |
| **Change of registered office** | [Registered office (resolution and Form 114)](help:documents/wizard-registered-office) |
| **Change of company name** | [Company name (special resolution and Form 33a)](help:documents/wizard-company-name) |
| **Change of company objects** | [Change of objects (Form 09)](help:documents/wizard-change-of-objects) |
| **Increase of share capital** | [Increase of capital (Form 68)](help:documents/wizard-share-capital-increase) |
| **Appointment of auditor** | [Appointment of auditor (Form 173a)](help:documents/wizard-appointment-of-auditor) |
| **Mortgage or charge** | [Mortgage or charge (Form 99)](help:documents/wizard-mortgage-or-charge) |
| **Transfer of shares** | [Share transfer](help:documents/wizard-share-transfer) |
| **Annual return** | [Annual return](help:documents/wizard-annual-return) |
| Wizards your Manager added | [Custom wizards](help:settings/document-wizards) |

## Good to know

- Your answers are saved on the case. Reopen the wizard any time and change one answer.
- **Generate again replaces** the files with the same name; it does not pile up copies. To keep an old version, rename or download it first.
- Anything you edit in a generated file by hand is lost when you generate again. Prefer correcting the answer or the company data.
- The Articles of Association details (quorum, notice) are asked once and **remembered on the client**; they are used in later cases.
- Warnings are advice, not locks. They explain legal checks (for example at least 2 directors). When there are warnings, **Generate** first shows them in a dialog called **Please check first**. Press **Generate anyway** only if you are sure, or **Cancel** to fix the cause.

## A colleague checks every generated document

A generated document is never ticked off on its own. Next to each file you see **Needs check**. A second person opens it, reads it and presses **Mark as checked**, then confirms with **Yes, it is correct**. The file then shows **Checked by** and the person's name, the PDF copy is checked together with the Word file, and the checklist item is ticked.

- The person who generated the document cannot check it. Ask a colleague. A Manager may check their own document.
- If details are still highlighted in yellow, the check asks you to confirm that they were filled in or handled by hand.
- If you **generate again**, the new files need a new check, and the item is un-ticked until then.
- A case cannot move to **Ready to Submit** while an item is not ticked, so this check cannot be skipped by accident.

## Always check before signing

Read each document: names, dates, numbers in words, shares, addresses. A missing company detail leaves a blank or a **[[gap]]** in the file.

See also: [How document filling works](help:documents/how-document-filling-works), [Wizard problems](help:help/prepare-documents-problems).
