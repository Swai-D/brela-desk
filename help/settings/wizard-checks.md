---
title: Wizard checks (warnings)
summary: Show a warning on the case when a formula is true, for example a missing answer or an illegal date.
keywords: check, warning, validation, when, message, condition, warn, rule, legal check
order: 12
role: MANAGER
---
A **check** is a warning shown when you press **Check** or **Generate** in the wizard. It never blocks; it tells the team to look again.

## Add one

1. **Formulas and checks → Add a check**.
2. **When…**: a formula that is true when something is wrong, for example `empty(new_address)` or `lt(days_between(notice_date, meeting_date), 14)`.
3. **Warning message**: what the user sees, in plain words ("The meeting must be at least 14 days after the notice").
4. Save. The formula is validated: "Check …: <problem>". "Every check needs a message."

## Good checks

| Warn about | When |
|---|---|
| A missing answer | `empty(effective_date)` |
| Too short a notice | `lt(days_between(notice_date, meeting_date), 14)` |
| A number too big | `gt(num(call_per_share), div(num(nominal), 4))` |
| A person not chosen | `empty(new_secretary)` |

Write messages that tell the person what to do next.

See also: [Formulas](help:settings/wizard-formulas).
