---
title: Wizard documents, placeholders and formats
summary: Choose which templates a wizard produces, with conditions and one-document-per-person, and fill placeholders from answers.
keywords: wizard documents, template, document name, condition, per person, one per person, placeholder, fills placeholder, format, date, ordinal, capitals, money, words, names, template placeholders, keys
order: 10
role: MANAGER
---
## Documents tab

Press **Add a document** for each file the wizard should produce. If you see "No Word templates are imported yet. Import the Word package on the Templates page first." import them ([Import](help:documents/import-official-templates)).

| Field | Meaning |
|---|---|
| **Word template** | Any imported Word template ("Choose the official Word templates this wizard fills") |
| **Name of the file** | The generated file's name (for example "Notice of change of registered office") |
| **Make it** | **Always**, or only when a chosen question is answered |
| **How many** | **One document**, or **One for each person in** a person question; one file per person, named with them |

Errors: "One of the chosen templates no longer exists", "A document depends on X, which is not a question", "A 'one document per person' setting …".

## Which placeholders does a template have?

In **Fill this Word placeholder** (on a question) and in **Formulas** the editor shows the placeholder names found in the chosen template. Placeholder names are lowercase in the editor (`company_name`); the official forms use the same names in capitals.

## Fills placeholder and format

On a question open **More**, choose **Fill this Word placeholder** (the template's field) and **Written in the document as** (the format):

| Format | Result for `2026-09-29` or `12500` |
|---|---|
| As typed | unchanged |
| Date | 29 September 2026 |
| Ordinal date | 29th September 2026 |
| Date in CAPITALS | 29 SEPTEMBER 2026 |
| CAPITALS | the text in capitals |
| Title Case | The Text In Title Case |
| Number with commas | 12,500 |
| Number in words | twelve thousand, five hundred |
| Names | A, B and C |

If a placeholder has no value it stays as a gap in the document, so always test with **Check** and **Generate** on a real case.

See also: [Formulas](help:settings/wizard-formulas), [Template fields](help:documents/template-fields-syntax).
