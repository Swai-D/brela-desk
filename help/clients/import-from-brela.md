---
title: Import the company from BRELA
summary: Paste the BRELA Company Details page and the app fills the company, its people and activities, with a preview first.
keywords: import, registry, paste, company details, brela page, shareholders, directors, activities, address, surveyed, unsurveyed, fill company, copy paste, warnings, apply, re-import, update
order: 5
---
Instead of typing the company by hand, paste the page you see on the BRELA registry. No AI is used: the app reads the page with fixed rules, so the same page always gives the same result.

## Steps

1. On the BRELA registry open the company and select the whole **Company Details** page (Ctrl+A, then Ctrl+C).
2. In BRELA Desk open the client, the **Company** tab, and press **Import from BRELA**.
3. Paste into the box and press the button to read it. If the box is empty: "Paste the BRELA Company Details page first."
4. A **preview** shows what was found: company details, people (directors, shareholders, secretary, beneficial owners), business activities, and a list of **warnings**.
5. Check it. Press **Apply** to save. Nothing is saved before you press Apply.

## What is read

| Part | Details |
|---|---|
| Company | name, **incorporation number**, type, registration date, registered office, contacts, tracking numbers |
| Activities | every business activity with its code; the one marked **Main** is used as the main activity |
| Share capital | authorised capital, nominal value, issued shares |
| People | names, gender, nationality, date of birth, occupation, ID, address, roles, shares and share class, ownership, previous names, other directorships |
| Addresses | **surveyed** addresses (house, plot, block, street, road, ward) and **unsurveyed** areas with landmark; P.O. box and postcode |

## Warnings you may see

- **The incorporation number was not found in the pasted page**: the page had no Incorporation Number (or Registration / Company Number). Copy the whole page again, or type it in under **Edit company details**.
- **No activity is marked as Main**: the page had activities but none flagged Main. Choose it yourself after applying.
- Warnings about fields the page did not contain or that look odd. Read each one; they do not block Apply.

## Importing again

Importing again **updates** the company and **matches people by name** instead of creating copies. BRELA's values win for the fields it provides (for example the address). Fields you typed that BRELA does not provide are kept.

## If the import is wrong

- Check you copied the whole page, not just a part.
- Look at the preview before pressing Apply; if a person is wrong, fix it afterwards with **Edit** on their card.
- See [Import problems](help:help/import-fails).

See also: [The Company tab](help:clients/company-tab), [People](help:clients/people).
