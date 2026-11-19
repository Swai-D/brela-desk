---
title: Template fields and loops
summary: The syntax of fields, defaults, repeating blocks and Markdown in template text.
keywords: field, placeholder, syntax, {{company_name}}, default value, loop, repeat, directors, shareholders, secretaries, beneficial_owners, people, index, markdown, page break, gap
order: 10
role: SENIOR
---
## A field

`{{company_name}}` is replaced by that detail of the company. Unknown details stay as **[[gaps]]** for a person to fill.

## A default

`{{share_capital|TZS 0}}` uses the text after `|` when the detail is empty.

## Repeating blocks

`{{#directors}} … {{/directors}}` repeats the block for every director. The same works for **shareholders**, **secretaries**, **beneficial_owners** and **people**. Inside a block you can use:

`{{index}} {{name}} {{nationality}} {{id_number}} {{address}} {{shares}}`

## Common company and case fields

Company name, registration number, registered office, share capital, nominal value, activities, plus client and case fields such as client name, phone, email, case code, track number, today's date and the assignee. The **Insert a field** list in the editor shows the exact names.

## Formatting for the Word file

Markdown works: `# Heading`, `**bold**`, `- bullet`, `| table | rows |` and `---` for a page break.

## Tips

- Copy the field name exactly; names are lowercase with underscores.
- If a field shows as a gap after generating, the detail is empty on the client: fill it on the **Company** tab.

See also: [Template editor](help:documents/template-editor).
