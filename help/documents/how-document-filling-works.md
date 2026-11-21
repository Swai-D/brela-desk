---
title: How document filling works
summary: Where the values in a generated document come from, and the rules for blanks, capitals, dates and totals.
keywords: filling, occupation, nationality, director occupation, secretary occupation, tanzanian, loop, repeat, slots, directors list, how many directors, yellow, unused slot, optional blank, if any, company first, placeholder, gap, blank, capitals, uppercase, return date, shares issued, aggregate nominal value, member name address, word template, docx, derive, missing, how it works, no ai
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
| **Gaps** | If a required value is unknown (a date, an amount, a person's missing detail), the placeholder stays highlighted in yellow so someone fills it by hand and nothing wrong is signed. |
| **Optional details** | A detail marked "if any" (previous names, other directorships, an attendee's role) is simply left blank when nobody has it. It is never left yellow. |
| **People lists follow the company** | The official forms have a fixed number of numbered slots (for example three directors on Form 131, seven members on a resolution). The app counts the people on the **Company** tab, removes the empty slots and copies the last slot for every extra person, so a company with one director gets one director block and a company with five gets five. See below. |
| **Business occupation** | The occupation saved for the person. If none is saved: **Director** for a director, **Secretary** for a secretary. |
| **Nationality** | The nationality saved for the person; a country or code such as "TZ" or "Tanzania" is written as "Tanzanian". The same person saved twice is treated as one. |
| **Standard wording** | The Articles provisions (notice, quorum, Table A, number of directors) come from the Company; where the Company holds nothing, the standard Tanzanian wording is used. |
| **Company name** | The full company name is written in a single row on the forms (Forms 131, 213a, 213b and 57a), never split over two lines. |
| **Signing date on Form 131** | The date next to the signature is the same as the date the return is made up to. |
| **Empty people slots** | A slot nobody fills (for example a third allottee on Form 57a) is removed from the document and is not listed as missing. |
| **Names inside resolutions** | Names read in one style, for example "Salma Juma Mrema", even when the registry saved them in capitals. The official forms keep capitals. |
| **Optional wording** | Wording the official forms offer as an option (for example "at nominal value", "or into a bank account designated by the Company", "with effect from the time of receipt of that consent") is decided by the wizard: some by a question, some by your answers ("at nominal value" stays when the price per share equals the nominal value). Nothing is left yellow. |
| **One way to generate** | Official forms are always made by their wizard, from the Company plus your answers, whether you start from **Prepare documents** or from the robot icon on a checklist item. |
| **Capitals** | Official forms use capitals for names, dates and addresses. The app writes them that way. |
| **Dates** | Written like `29 September 2026`; in some forms as ordinals (`1st September 2026`). |
| **Numbers in words** | British style: "two million and five hundred thousand". |
| **People** | Several people are joined as "A, B and C". |

## How the lists repeat

These lists repeat once for each person on the **Company** tab, in the order shown there:

| List | Repeats for |
|---|---|
| **Directors** on Form 131 (name, occupation, previous names, nationality, address, date of birth, other directorships) | Every director |
| **Members** list on Form 131 and the **members present** lines on a members' resolution | Every shareholder |
| **Attendance** lines of a directors' resolution | Every director |
| **Allottees**, **resigning directors** and **new directors** | Every person you pick in the wizard |

If the Company has nobody for a list, the first slot stays so you can see what is needed. Add the people on the **Company** tab ([People](help:clients/people)) and generate again.

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
