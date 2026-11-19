---
title: Wizards: built-in versus custom, basics and match words
summary: What is locked, what you can change, how to reset, and how a wizard gets suggested on a case.
keywords: built in, custom, core question, lock, reset, original, turn off, match words, suggested, icon, name, description, basics
order: 8
role: MANAGER
---
## Basics tab

| Field | Meaning |
|---|---|
| **Name** | Required: "The wizard needs a name" |
| **Icon** | A Boxicons name such as `bx-file` or `bx-buildings`. Wrong names fall back to `bx-file`. |
| **Description** | One line under the name on the case card |
| **Suggest it on cases that mention** (match words) | Words separated by commas. If the case's type or its chosen changes contain one of them, the wizard is marked **Suggested** on the case. Example: `registered office, address change`. |

## Built-in wizards

- Their **core questions** show a lock: **"Built in: needed by the wizard"**. You can reword them, add a hint, help text and a placeholder mapping, but cannot remove them or change their type.
- You can add questions, documents, formulas and checks to them.
- **Reset to the original** (the red circular button) deletes your changes and restores the standard wizard.

## Custom wizards

Everything is yours: questions, documents, formulas, checks. A custom wizard has no hidden logic; what you define is what runs.

## Turning off

The eye icon sets **Off**: the wizard disappears from cases but stays in the list so you can turn it on again.

See also: [Overview](help:settings/document-wizards).
