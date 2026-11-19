---
title: Build a new wizard step by step (change of registered office)
summary: A complete worked example from a blank wizard to a generated document.
keywords: new wizard, recipe, example, registered office, build wizard, tutorial, step by step, change of address, notice, template placeholder
order: 13
role: MANAGER
---
Goal: a wizard **Change of registered office** that fills the notice template from three answers.

## Before you start

The official template must be imported (**Templates → Import Word package**) and you should know the placeholders in it (the editor lists them when you pick the template).

## Steps

1. **Settings → Document wizards → New wizard**.
2. **Basics:** Name `Change of registered office`; Icon `bx-buildings`; Description `New address, resolution date and the notice`; Suggest it on cases that mention `registered office, address`.
3. **Questions → Add a question** three times:
   - `Meeting date`: type Date, field name `meeting_date`, Required.
   - `New registered office`: type Long text, field name `new_address`, Required, **Fill this Word placeholder** the template's address field.
   - `Director who signs`: type One person, Choose from Directors, field name `signing_director`.
4. **Documents → Add a document:** choose the Word template for the notice, Name of the file `Notice of change of registered office`, Make it Always, How many One document.
5. **Formulas and checks:**
   - Formula: type the placeholder name for the date and the formula `ordinal_date(meeting_date)` (or set **Written in the document as** on the question).
   - Check: When `empty(new_address)`, Warning message `Type the new address.`
6. **Save**.

## Try it

1. Open a test case; **Prepare documents** now lists the wizard (**Suggested** if the case is a registered-office change).
2. Answer, press **Check**: read the warnings.
3. **Generate** and open the document. Fix the template mapping if a gap remains.
4. If it is not right, edit the wizard and generate again; the file is replaced.

## If a placeholder stays empty

- The question has no **Fill this Word placeholder** or the formula has a different placeholder name.
- The question was not answered, or the field name in the formula is misspelled.

See also: [Questions](help:settings/wizard-questions), [Formulas](help:settings/wizard-formulas).
