---
title: Edit the document wizards
summary: Add or change the questions, documents, formulas and warnings of Prepare documents, without a developer.
keywords: wizard, builder, question, placeholder, formula, check, new wizard, custom, template, document, reset, scalable
order: 3
role: MANAGER
---
**Settings → Document wizards** lists every wizard that appears on a case. Change them any time.

## Change a built-in wizard

Press **Edit**. You can reword questions, add new ones, add documents, formulas and warnings. The original questions are marked with a lock because the official forms depend on them: you can reword them but not remove them. The reset button returns the wizard to the original.

## Create a new wizard

1. Press **New wizard** and give it a name and an icon.
2. **Basics:** in "match words" write words (separated by commas) that suggest the wizard on a case, for example `company name, name change`.
3. **Questions:** add each question and choose its type (text, number, money, date, yes/no, choice, one person, several people). Under **More** you can set the field name, a hint, when to show it, and **Fills placeholder**: the name of a field in a Word template, with an optional format (date, ordinal date, capitals, money, in words).
4. **Documents:** add each template to produce. Give the file a name, an optional condition (only if a yes/no question is ticked), or **one per person**.
5. **Formulas and checks:** a formula works out a value from the answers and the company's details and puts it into a placeholder, for example `upper(concat(new_name, " LIMITED"))`. A check is a warning shown on the case when its formula is true.
6. **Save**. The wizard is on every case straight away.

> The "Names and functions you can use" list at the bottom of the Formulas tab shows what you can write. Formulas cannot run code. A wrong formula is rejected when you save.

## Turn off or delete

The eye icon hides a wizard from cases without losing it. Custom wizards can be deleted; built-in ones can only be reset.

Only Managers see this page, and each change is written to the audit log.
