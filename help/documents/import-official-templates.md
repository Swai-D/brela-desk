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

Importing again is safe: it updates the templates it already has.

## If it fails

- "Templates_Package is not part of this deployment (templates/manifest.json is missing)": the package folder was not deployed with the app. Ask whoever deploys the app to include `Templates_Package`.
- A wizard still says "The official Word templates are not imported yet" until the import succeeds.

See also: [Templates](help:documents/templates).
