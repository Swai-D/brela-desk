---
title: Wizard: Call on shares, forfeiture and re-allotment
summary: The full unpaid-shares process in steps: call, Reg. 29 notice, forfeiture, re-allotment, with Forms 57a and 57b.
keywords: call on shares, forfeiture, re-allotment, allotment, reg 29, regulation 29, notice of call, form 57a, 57b, unpaid shares, table a, nominal value, reg 95, allottee, non-cash, consideration
order: 5
---
This wizard handles an unpaid-shares process. **Tick the steps you need now**; later steps reuse the answers of earlier ones, so you can come back to the same case and tick the next step.

## Steps you can tick

| Step | Makes |
|---|---|
| **Make the call: resolution and notice of call** | Directors' resolution: call on shares; Notice of call |
| **Reg. 29 notice requiring payment (warns of forfeiture)** | Notice requiring payment (Reg. 29) |
| **Forfeit the shares** | Directors' resolution: forfeiture. Version depends on "After forfeiture" (re-allot, or go back to unissued capital). |
| **Re-allot the forfeited shares** | Directors' resolution: allotment (cash, or other than cash); Form 57a; Form 57b for each allottee when payment is not cash; Members' resolution relaxing Regulation 95 when ticked |

## The call

| Question | Notes |
|---|---|
| **Member who owes the call** (required) | From the shareholders |
| **Number of shares** | Default: all the member's shares |
| **Call per share** (required) | At most one quarter of the nominal value (Table A reg. 14) |
| **Date of the directors' resolution** (required) and **Time** | Also the notice date. Time 10:00. |
| **Payment due date** | Default: 30 days after the call; must be at least 14 clear days after the notice |
| **Chairman of the meetings** | Defaults to the first director |
| **The call may be paid** | **At the registered office or into the company bank account** (standard) or **At the registered office only**. Used in the call resolution and the notice of call. |

The notice shows the amount in figures and words, per share and in total.

## Reg. 29 notice, forfeiture, re-allotment

- **Reg. 29 notice date:** default the day after the due date; **A Reg. 29 notice was or will be served** is asked when you go straight to forfeiture.
- **Forfeiture:** date defaults to the day after the last payment deadline, time 10:00. Choose **After forfeiture**: shares will be re-allotted, or go back to unissued capital.
- **Re-allotment:** allotment date (default: the forfeiture date, 11:00), **Payment for the shares** (**Cash** or **Other than cash**), **Price per share** (default nominal value), up to **four allottees** each with shares, **Allottees must pay by** (default 14 days later) for cash, and **What is given instead of cash** for non-cash.
- **All directors are allottees: relax Regulation 95 first** adds the members' resolution and asks its date and time.

## Warnings

- "Tick at least one step." / "Choose the member who owes the call."
- "X holds N shares, fewer than N."
- "A call may not be more than one quarter of the nominal value (… per share)."
- "The payment date must be at least 14 clear days after the notice of call (Table A reg. 14)."
- "The Reg. 29 notice must be served after the call's payment date has passed."
- "Add at least one allottee with a number of shares."
- "The allottees receive N shares but only N were forfeited."
- "Say what is given instead of cash (it goes on Form 57b)."

## A worked example

A member holds 10,000 shares of TZS 1,000 nominal and owes a call of TZS 250 a share. Tick **Make the call**, choose the member, call per share 250, call date today. The due date defaults to 30 days later. Check, then Generate: the resolution and the notice show TZS 250 per share and TZS 2,500,000 in total. A month later reopen the wizard, tick **Reg. 29 notice** and generate; the call answers are reused.

> A plain new issue of shares (not from forfeiture) has no official template yet. Ask your Manager: a custom wizard can be added ([Document wizards](help:settings/document-wizards)).

See also: [Prepare documents](help:documents/prepare-documents), [Glossary](help:help/glossary).

"At nominal value" in the allotment resolution stays when the **Price per share** equals the nominal value; otherwise it is left out.
