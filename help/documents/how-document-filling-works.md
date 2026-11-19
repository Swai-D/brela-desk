---
title: How document filling works
summary: Where the values in a generated document come from, and the rules for blanks, capitals, dates and totals.
keywords: filling, placeholder, gap, blank, capitals, uppercase, return date, shares issued, aggregate nominal value, member name address, word template, docx, derive, missing, how it works, no ai
order: 2
---
Understanding this helps you fix a wrong document at the source.

## The path from data to document

1. **Company details** (client's Company tab) and **people**.
2. **Case details** (Details for documents), which win when a field exists in both.
3. **Your answers** in the wizard, which win over both.
4. The app **derives** extra values from these (totals, dates, names in words).
5. Each value is put into the official **Word template** at its placeholder. Placeholders look like `{{company_name}}` in your own templates; the official forms use capital names such as `COMPANY_NAME`.

## Rules you will notice

| Rule | Meaning |
|---|---|
| **Gaps** | If a value is unknown, the placeholder stays visible as a gap so someone fills it by hand. |
| **Blank lines are removed** | An empty optional line (for example "Member 7") is deleted from the document, not left as an empty row. |
| **Capitals** | Official forms use capitals for names, dates and addresses. The app writes them that way. |
| **Dates** | Written like `29 September 2026`; in some forms as ordinals (`1st September 2026`). |
| **Numbers in words** | British style: "two million and five hundred thousand". |
| **People** | Several people are joined as "A, B and C". |

## What the app works out for you

- **Return date** (annual return): the latest anniversary of incorporation, unless you choose a date.
- **Shares issued** and the **aggregate nominal value**: totals from the shareholders.
- **Members list**: alphabetical, with name and address on one line each.
- **Subject person**: for forms made for one person, the first names, surname, date of birth, occupation, address lines and role.

## If something is wrong in a document

| You see | Fix |
|---|---|
| A blank or a gap | Fill the missing company detail or person field, generate again |
| A wrong figure | Correct the share capital, shares or nominal value on the **Company** tab |
| A wrong address | Edit the person or company address parts |
| A wrong date | Correct the wizard answer and generate again |

See also: [Wrong company data](help:help/wrong-company-data), [Prepare documents](help:documents/prepare-documents).
