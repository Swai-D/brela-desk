---
title: Wizard formulas: every function with examples
summary: Reference of all formula functions, the names you can use, quoting rules, limits and ready recipes.
keywords: formula, function, upper, lower, title, concat, if, eq, words, comma, date, add_days, names, join_and, person, holding, address_lines, expression, recipe, dsl, reference, quotes, limit
order: 11
role: MANAGER
---
A **formula** works out a value and puts it into a template placeholder. Write it in **Formulas and checks → Add a formula**: the placeholder (for example `call_amount`), the **Formula**, and **Remove line if empty** (deletes that line of the document when the result is empty).

## Rules

- Text goes in **double quotes**: `concat("TZS ", amount)`.
- Names (no quotes) are your question names, the company's details (for example `company_name`, `share_capital`), and the lists `directors`, `shareholders`, `secretaries`, `people`, plus `currency` and `nominal`.
- Formulas **cannot run code**. A wrong name or function is rejected when you save: "Formula X: …".
- Limits: 600 characters, 250 parts, 12 levels deep. A formula can use the results of formulas above it.
- Empty values are treated as empty text; numbers ignore commas and currency.

## Text

| Function | Example → result |
|---|---|
| `upper(text)` | `upper("ali")` → ALI |
| `lower(text)` | → ali |
| `title(text)` | `title("JOHN MUSHI")` → John Mushi |
| `concat(a, b, ...)` | `concat(first_name, " ", surname)` |
| `first(a, b, ...)` | `first(new_address, address)`: the first not empty |
| `contains(text, part)` | yes when text includes part |
| `plural(list, many, one)` | `plural(resign, "were", "was")` |

## Decisions

| Function | Meaning |
|---|---|
| `if(condition, then, else)` | `if(eq(payment,"cash"),"in cash","by other means")` |
| `eq`, `ne`, `not` | equal, different, opposite |
| `and(a,b,...)`, `any(a,b,...)` | all filled, at least one filled |
| `empty(x)` | yes when empty |
| `gt`, `gte`, `lt`, `lte` | more than, at least, less than, at most |

## Numbers

| Function | Example → result |
|---|---|
| `num(x)` | reads `12,500` as 12500 |
| `add`, `sub`, `mul`, `div`, `round`, `min`, `max` | `mul(shares, price)` |
| `comma(n)` | 12500 → 12,500 |
| `words(n)` | 12500 → twelve thousand, five hundred |

## Dates

| Function | Example → result |
|---|---|
| `date(day)` | 2026-09-29 → 29 September 2026 |
| `ordinal_date(day)` | → 29th September 2026 |
| `add_days(day, n)` | `add_days(call_date, 14)` |
| `days_between(from, to)` | number of days |
| `today()` | today's date |

## Names and people

| Function | Meaning |
|---|---|
| `names(list)` | "A, B and C" in Title Case |
| `names_caps(list)` | "A, B and C" in CAPITALS |
| `join_and(list)` | as typed |
| `count(list)`, `nth(list, n)` | how many; the n-th name |
| `remove(list, other)`, `append(list, other)` | subtract or join lists |
| `person(name, field)` | a saved detail: full_name, address, dob, nationality, occupation, gender, shares, share_class, id_number, phone, email, previous_names, other_directorships |
| `holding(name)` | shares a person holds |
| `possessive(name)`, `pronoun(name)` | his/her, He/She |
| `address_lines(name, n)` | line 1 to 3 of the address |

## Recipes

| Need | Formula |
|---|---|
| Company name in capitals | `upper(company_name)` |
| Amount in figures and words | `concat(currency, " ", comma(amount), " (", words(amount), ")")` |
| A date 14 days after the meeting | `date(add_days(meeting_date, 14))` |
| Directors who stay | `names(remove(directors, resign))` |
| Verb that agrees | `plural(resign, "have", "has")` |
| Total for several shares | `comma(mul(shares_number, price_per_share))` |

Test every formula: **Check** shows the documents; **Generate** shows the result in the file.

See also: [Checks](help:settings/wizard-checks), [Recipe](help:settings/wizard-recipe-new-wizard).
