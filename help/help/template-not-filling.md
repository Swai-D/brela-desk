---
title: A template or wizard document is not filling correctly
summary: Blanks, gaps, wrong values or an error when making a document.
keywords: word file will not open, damaged file, corrupt word, unreadable content, not filling, gap, blank, empty, [[gap]], could not fill this word template, this word file could not be read, template error, missing, wrong value, placeholder
order: 6
---
| You see | Cause | Fix |
|---|---|---|
| A **[[gap]]** in the text | The detail is not saved | Add it on the client's **Company** tab or in **Details for documents**, then generate again |
| A blank line or empty field | The value is empty | Fill the company or person field |
| "Could not fill this Word template: …" | The Word file is damaged or has a broken placeholder | Re-import the Word package, or ask a Senior to check the template |
| "This template has no official Word form to replace" / "This template has no original Word file" | Only text templates have no Word file | Use a Word template |
| "The template text is empty" / "The template is too long" | The template editor needs fixing | Open the template and correct it |
| A wrong name or address | The company or person data is wrong | Edit it at the source ([Wrong company data](help:help/wrong-company-data)) |
| Wizard says templates are not imported | Not loaded | Senior: **Templates → Import Word package** |
| Word says the file is damaged or will not open | A file made before this was fixed had a doubled XML header | Press **Generate** again: the new file opens normally |
| There is a **Word** button but no **PDF** button | The server cannot make PDF copies (the PDF converter is not installed) | Use the Word file, or ask whoever runs the server to install LibreOffice |

## Why something is still yellow

When a person's detail is missing the message names the person (for example "**Juma Kileo**: nationality") under **Missing on the Company tab**. Open the client, **Company**, edit that person, save, and generate again. Only details the app cannot know are left highlighted: dates, times, amounts, the people a wizard is about, and a director's occupation or nationality that is not on the **Company** tab. Fill them on the Company tab or in the wizard and generate again. Unused numbered slots (for example "Director 3" for a company with two directors) and optional "if any" details are removed or left blank, never yellow.

## Steps to find the cause

1. In the wizard press **Check**: it lists missing people details and warnings.
2. Open the client's **Company** tab and compare with the BRELA page.
3. Generate again: the file is replaced.

See also: [How document filling works](help:documents/how-document-filling-works), [Template fields](help:documents/template-fields-syntax).
