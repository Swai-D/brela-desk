---
title: Import the official templates
summary: Load the official BRELA Word forms and resolutions so the wizards can work.
keywords: import templates, import word package, official templates, not imported, templates package, manifest, install templates, wizard says templates not imported
order: 7
role: SENIOR
---
The wizards fill **official Word templates**. They must be loaded once.

## Steps (Senior or Manager)

1. Open **Templates**.
2. Press **Import Word package**.
3. Wait for the message. The forms and resolutions appear in the list marked **Word file** / **BRELA form**.

Importing again is safe: it adds the templates that are missing and leaves the ones you already have unchanged (so a new package brings in only its new forms). To change an existing template's Word file, use **Upload edited Word** on that template ([Replacing the Word file safely](help:documents/template-versions-and-approval)).

The package also holds forms that do not have a wizard yet (for example Forms 213c, 107, 15a, 15b, 15c and 15f). They are imported and shown in **Templates** (Forms 114, 33a, 09, 68, 173a and 99 come with a resolution, T10 to T15, made by their wizards), but nobody can generate them until a wizard exists for them, and the package marks them as pending the senior's review.

The package also holds **Memorandum and Articles of Association**, the senior's own Word template. Its wizard fills the company name, objects, share capital and subscribers; see [Memorandum and Articles](help:documents/wizard-memorandum-and-articles).

## If it fails

- "Templates_Package is not part of this deployment (templates/manifest.json is missing)": the package folder was not deployed with the app. Ask whoever deploys the app to include `Templates_Package`.
- A wizard still says "The official Word templates are not imported yet" until the import succeeds.

See also: [Templates](help:documents/templates).
