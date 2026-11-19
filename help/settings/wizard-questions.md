---
title: Wizard questions: types, names, show-only-when, people
summary: Every question type and option in the editor and the rules for field names and conditions.
keywords: question, field, label, type, text, long text, number, money, date, time, yes no, choice, person, people, show only when, field name, hint, help, required, section, up down, from directors
order: 9
role: MANAGER
---
Open **Edit → Questions**. Press **Add a question**. Each row has the question text, the answer type, a **Required** tick, **Move up / Move down** arrows, a bin (or a lock for built-in questions) and **More**.

## Types

| Type | Shown as |
|---|---|
| Short text, Long text | One line or a paragraph |
| Number | Digits |
| Amount of money | An amount (commas are fine) |
| Date, Time | A date picker, a time box |
| Yes / No tick box | The answer is `yes` or empty |
| Choose one option | A menu. Write the choices one per line as `value | label`. At least one is required. |
| One person | A menu of the company's saved people, plus **Add a new person** on the case |
| Several people | Up to the number you set (1 to 10) |

For people questions set **Choose from**: Anyone saved, Directors, Shareholders or Secretaries. For several people set **At most how many people** (1 to 10).

## More

| Option | Meaning |
|---|---|
| **Field name** | The question's name for formulas and checks: lowercase letters, numbers and `_`, starting with a letter, up to 41 characters. Error: "the field name must use lowercase letters, numbers and _ and start with a letter". Two questions cannot share a name ("Two questions use the name …"). |
| **Section title** | Groups questions under a heading |
| **Hint inside the box** and **Help text under the question** | The grey text in the field and the small text below it |
| **Ask this only when… / …is answered with** | The question appears only when another question is answered (for a tick box: empty or `yes`). Default: **Always**. |
| **Fill this Word placeholder** and **Written in the document as** | Puts the answer straight into a template placeholder, in the chosen format ([Documents and placeholders](help:settings/wizard-documents-and-placeholders)) |

Once a wizard is saved, a question's **Field name** can no longer be changed (formulas rely on it).

## Order

Use **Move up** and **Move down** to reorder. Core questions of a built-in wizard are locked and cannot be removed.

## Tips

- Name fields clearly (`new_address`, `effective_date`) because formulas use them.
- Ask only what you cannot get from the company data.
- Mark essentials **Required**; the case page shows a red star.

See also: [Formulas](help:settings/wizard-formulas).
