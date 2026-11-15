# BRELA Desk

Internal case tracker for the BRELA consulting team: cases move through stages, documents are uploaded per case and per client, client account logins live in an encrypted vault, and every action is logged.

**Stack:** Node.js + Express, PostgreSQL (`pg`), the Dason (Bootstrap 5) template in `public/`. No build step.

## Deploy on Railway (Ndio njia ya haraka)

1. Create a **private** GitHub repo and push this folder (`.env` and `node_modules` are git-ignored).
2. Railway → **New Project → Deploy from GitHub repo** → pick the repo.
3. In the same project: **+ New → Database → Add PostgreSQL**.
4. Open the app service → **Variables** and add:
   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference the Postgres service) |
   | `JWT_SECRET` | any long random string |
   | `ENCRYPTION_KEY` | 64 hex chars: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
   | `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` | your first Manager login |
   | `NODE_ENV` | `production` |
   | `PIXABAY_API_KEY` / `API_NINJAS_API_KEY` | optional keys for the lock-screen daily photo and quotes |
5. App service → **Settings → Networking → Generate Domain**. Open it and sign in.
6. **Settings** (Manager only): add your team and tweak case types / document checklists.

The tables and the 5 starter case types are created automatically on first start.

> **Keep `ENCRYPTION_KEY` safe (password manager).** If it is lost or changed, saved client passwords cannot be decrypted.

## Roles and access levels
A **role** is a job in your team (Manager, Senior, Junior, Secretary, Associate, or any you create). Each role has an **access level** that decides what its people can do:

| Access level | Can do |
|---|---|
| **Manager** | everything: Settings (team, roles, case types, WhatsApp), monthly Reports, the audit log, editing the Playbook, and the deletions listed below |
| **Senior** | everything a Staff can, plus review and submit to BRELA, record BRELA's answer, edit a case's assignee and due date, manage vault logins, rename clients and checklist items, rename or delete any file |
| **Staff** | create cases and clients, upload and preview documents, comment, work the cases assigned to them; open a client's vault only while an open case of that client is assigned to them |

The Manager creates, renames, edits and deletes roles in **Settings, Roles & access** (name, access level, responsibilities for the Playbook, and whether the role sees the *team queue* in My Work). Safeguards: a role cannot be deleted while people have it, and there must always be at least one active Manager (the app refuses to remove, demote or deactivate the last one). Permissions are checked on every request, so changing a person's role or a role's access level, or deactivating someone, takes effect immediately, without signing out and in.
## Notes
- Uploaded files (max 15 MB each) are stored **inside PostgreSQL by default**, so one Railway database backup covers everything. Enable backups on the Postgres service.
- **Optional:** set `FILES_DIR` (e.g. `/data/uploads` with a Railway Volume mounted there) and new uploads are written to that folder instead, with only their path in the database — the database stays small. On the next start, any files still stored as database bytes are **migrated to the folder automatically**; downloads always work either way (disk first, database as fallback). Keep the volume attached: the folder must survive restarts just like the database.
- Every vault reveal is recorded (who, when). Passwords are encrypted with AES-256-GCM before saving. A person created in Settings (or whose password a Manager resets) signs in with that temporary password and **must set their own before the app opens**.
- Signed-in accounts lock after 15 minutes without user activity. Use **Lock screen** in the account menu to lock immediately; unlocking requires the same account's password. Idle sessions are also enforced by the server.
- The profile's weekly gauge shows cases marked done in the last 7 days divided by distinct cases assigned to the signed-in user in that period. Assignment events are tracked when cases are created or reassigned; for existing cases, the original creation date is used where older assignment history is unavailable.
- Optional lock-screen content uses the [Pixabay API](https://pixabay.com/api/docs/) and [API Ninjas Quotes API](https://api-ninjas.com/api/quotes). Add `PIXABAY_API_KEY` and `API_NINJAS_API_KEY` to `.env` (or Railway Variables); keep them server-side and out of client code. Each Tanzania-time day, the app saves three distinct quotes with matching themes for morning (05:00–11:59), afternoon (12:00–16:59), and evening (17:00–04:59), and downloads a matching photo in each period (three photos per day). It keeps only the active photo in PostgreSQL: at each period change, it replaces the previous photo rather than adding another cache entry. The server checks for period changes every minute, and the lock screen refreshes automatically. Old-day cache rows are deleted. The photo links back to Pixabay for attribution. Check API Ninjas' current plan/license for your intended use.
- Local run: copy `.env.example` to `.env`, then `npm install && npm run dev` (needs a local Postgres).

## Who can change what
| Item | Create | Edit | Delete |
|---|---|---|---|
| Roles | Manager | Manager: name, access level, text, team queue | Manager, only if nobody has the role (and not the last Manager-level role) |
| Team members | Manager | Self: name, phone, profile picture (max 3 MB), password; Manager: email, role, password reset, active | Manager, only if the person has no work history (otherwise deactivate) |
| Case types | Manager | Manager: name, checklist, notes, hide/show | Manager, only if no case uses it (otherwise hide) |
| Clients | everyone | rename: Senior/Manager; phone and email: everyone | Manager, only if the client has no cases |
| Cases | everyone | assignee and due date: Senior/Manager; client and case type: Manager | Manager, after typing the case code |
| Checklist items | everyone | rename: Senior/Manager | Senior/Manager |
| Files | everyone | the uploader, Senior or Manager | the uploader, Senior or Manager |
| Comments | everyone | the author | the author, or a Manager |
| Vault logins | Senior/Manager | Senior/Manager | Senior/Manager |
| Playbook texts | n/a | Manager | n/a |

Every deletion and sensitive change (role or password changes, client or type changes on a case, vault edits, deleted files and comments) is written to the **Audit log** (Settings, Manager only). Deletes are permanent, so the app refuses the risky ones (a person with history, a type or client still in use) and tells you what to do instead.

## Playbook: roles, responsibilities and guided workflow
The system tells people what to do, so a new team member can simply follow it:
- **Playbook** (menu, everyone): *My role* (your responsibilities, what you can and cannot do), *How a case flows* (the six stages: who is responsible, the steps, and when it is done) and *Everyone's responsibilities*. The Manager can edit every text there; the starter content is a sensible default for the BRELA process.
- **What to do now** (on every case): the current stage, who is responsible, the steps to follow, the "done when" rule and the next action. The steps are advisory: they can be ticked or skipped, they never block anyone. Hard rules (all documents ready before review, only a Senior or Manager submits, a reason when BRELA returns a case) stay enforced by the server.
- **Case type notes** (Settings → Case types): optional tips for a kind of case (for example BRELA portal steps), shown on every case of that type.
- **My Work** shows your own cases plus the **team queue for your role** (Manager, Senior and Secretary; completed cases show for 7 days).
- First sign-in shows a short welcome with your role's responsibilities.
- A case counts as finished when BRELA approves it; the Manager is alerted to send the report to the client.

## AI assistant and document templates
Goal: one person prepares many BRELA documents a day. Documents are made from **templates**; the **AI** prepares them while a template is still being perfected, and once a template is approved it fills **instantly, with no AI and no cost**.

**How it works**
1. **Templates** (menu, Senior and Manager manage, everyone can read): create one from a document BRELA already accepted (upload Word, a PDF with real text, or paste text; the AI turns the parts that change into fields), or write one by hand. Fields look like `{{company_name}}`; unknown details become `[[gaps]]`; `{{#directors}} ... {{/directors}}` repeats for each director (also shareholders, secretaries, beneficial_owners, people). Each template has *Notes for the AI* (BRELA's format rules) and a version history.
2. **Company details**: on the client page add the company's details (registered office, business activity, share capital...) and its directors, shareholders and others once. Each case has its own *Details for documents* (capital, proposed names...). **Smart fill** reads a pasted client message and suggests the details; nothing is saved until you press Apply.
3. **Prepare a document**: on a case, press the robot icon next to a checklist item (or *Prepare a document*). Pick a template. A **draft** template makes the AI prepare the document using it as the format guide; an **approved** template fills instantly. Fill the remaining gaps in the panel (they can be remembered on the case), edit the text, and **save as Word (.docx)**: the file is attached to the checklist item, which is ticked when no gaps remain.
4. **Teach**: after correcting a document, *Teach the template* turns your final version into an improved template (new version). When a template comes out clean (no manual edits, no gaps) three times in a row it is flagged *ready to approve*. Approve it and it fills instantly from then on. Editing an approved template sends it back to draft.

**Set up the AI (Manager): Settings, AI assistant**
- Choose the **provider** (Anthropic, OpenAI, Google Gemini, xAI, Mistral, or any OpenAI-compatible endpoint), paste the **API key**, pick the **model**. Model names change often: the refresh button loads the live list from the provider; you can also type any model ID. *Save and test the connection* checks it.
- Defaults are tuned for official documents: temperature 0.2, 4096 tokens, a BRELA-focused system prompt (editable, resettable). Built-in rules always apply: never invent facts, leave unknowns as `[[gaps]]`, output only the document.
- **Cost control:** requests per day (everyone) and per hour (each person), who may use the AI (Everyone / Senior and above / Manager only), and a usage report (requests and tokens per person, recent requests with errors). Instant fills and connection tests are not counted.
- **The key** is stored encrypted (same `ENCRYPTION_KEY` as the vault), never sent back to the browser (only its last 4 characters), and every settings change is in the audit log. Each provider keeps its own key and model.

**Privacy.** The AI is a third-party service. With the default *Standard* privacy, ID numbers, phone numbers, emails and dates of birth are never sent: the AI writes a placeholder and this server fills in the real value afterwards. Names, addresses and company details are sent. *Off* sends everything. Text pasted into Smart fill, and accepted documents used to create templates, are sent as they are: prefer examples without real personal details. Check your provider's data-retention terms before handling real client data. The AI can make mistakes: people read and approve every document.

**Limits (v1):** scanned PDFs and images cannot be read (paste the text); output is Word (.docx) with headings, bold, bullets and tables, not a pixel-exact copy of a BRELA form's layout.

**Official Word template package** (`Templates_Package/`). The senior-approved house set (members'/directors' resolutions, notices of call and forfeiture, Memorandum and Articles, and BRELA Forms 213a/213b, 57a/57b and 131) ships with the app. On the **Templates** page, a Senior or Manager presses **Import Word package**: each document becomes an editable draft template — the yellow `[LABELS]` become `{{fields}}` (e.g. `[COMPANY NAME]` → `{{company_name}}`), the house rules land in *Notes for the AI*, and the **exact original .docx is stored with the template**. Two ways to use them:
- Like any other template: the AI prepares from, or an approved one instantly fills, the text version.
- **Official Word form:** when preparing a document, templates marked *official Word form* are filled into the exact original file (layout, letterhead and form tables untouched) from the details on file. Details that are not on file stay as yellow labels; the app lists them so you can add them under *Details for documents* (lowercase, e.g. `members_meeting_date`) and press Prepare again. Clauses that need a Senior's confirmation remain highlighted yellow in the Word file.

## BRELA track number
Every case has a **BRELA track number** field under the client name (type it after submitting; Enter or the tick saves it). Every team member can set it, it is recorded in the case history, and the app warns if another case already uses the same number (ignoring spaces and capitals). Clients can also carry a track number (client page, *edit client*). The number shows on the board cards, My Work, the client page (next to each case), the monthly report and its CSV, and the **Clients search finds a client by any of their track numbers**, so when BRELA calls with a number you can find the case in seconds.

## Monthly report (Manager)
**Reports** in the menu: pick any month (counted in East Africa Time) to see cases received and completed (compared with the previous month), BRELA corrections and the reasons given, average turnaround, first-time approval rate, breakdowns by case type, team member and client, and the list of completed cases. **Print / Save PDF** gives a clean one-page-style printout, **Download CSV** opens in Excel. Completion and submission dates are recorded from now on (older cases are filled in from their history).

## WhatsApp (optional)

Uses the official **WhatsApp Business Cloud API** (Meta). Two things work out of the box once it is connected:

1. **Alerts to the team** (WhatsApp messages): new case assigned to you, BRELA returned a case (to the assignee and Managers), a case is ready for review (to Seniors/Managers), BRELA approved a case (to Managers: send the report to the client), a client sent a document, plus a **daily digest at 07:00 East Africa Time** (not Sundays) listing each person's returned, overdue and due-soon cases. You never get an alert for your own action.
2. **Client documents into cases:** clients send PDFs or photos to the business number. They land in **WhatsApp Inbox**, matched to the client by phone number when it is known. Someone files each one under a client, case and checklist item in two clicks, which ticks the item and writes the history.

### Set up
1. [developers.facebook.com](https://developers.facebook.com) → create a **Business** app → add the **WhatsApp** product (Meta gives you a test number to try first).
2. For real use: verify your Meta Business account and register the business number (check Meta's current rules for numbers already used in the regular WhatsApp app).
3. Create a **System User** token with WhatsApp permissions → `WHATSAPP_TOKEN`. Copy the **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`. App settings → Basic → **App secret** → `WHATSAPP_APP_SECRET`. Invent any string for `WHATSAPP_VERIFY_TOKEN`. Put all four in Railway Variables.
4. Meta → WhatsApp → Configuration → **Webhook**: callback URL `https://YOUR-DOMAIN/webhooks/whatsapp`, your verify token, then subscribe to the **messages** field.
5. Create the **6 message templates** (category *Utility*, language *English*) exactly as listed in **Settings → WhatsApp** (copy the text). Alerts only work after Meta approves them.
6. Add phone numbers: team members in **Settings → Team → Phone**, clients on the client page (**edit** next to the WhatsApp number).
7. **Settings → WhatsApp → Send test to my phone** (uses Meta's built-in `hello_world` template).

### Good to know
- Messages the app starts must use approved templates (Meta rule). Replies inside 24 hours of a client's message are free-form (`WA_AUTOREPLY=true` enables a short "received" reply).
- Prices depend on country and template category: check Meta's current rate card before relying on high volumes.
- Only documents and images are captured (PDF, JPG, PNG...). Tell clients to send photos **as Document** to keep full quality. Voice notes and videos are ignored.
- Numbers like `0712 345 678` are read as Tanzanian (`DEFAULT_COUNTRY_CODE=255`).
- Every send is logged (Settings → WhatsApp → Recent sends), and Meta's duplicate deliveries are ignored.

## Static files and Railway (why styles no longer break after a deploy)
- **Every page is served with the build id on its CSS and JS links** (`app.min.css?v=<commit>`). Railway sets `RAILWAY_GIT_COMMIT_SHA` on each deploy, so a new deploy always gets fresh files and a browser or CDN can never pair new HTML with old styles or scripts. `GET /version` shows which build is running.
- HTML is never cached; versioned CSS/JS is cached for a year (`immutable`); fonts and images for a week.
- The app runs behind Railway's proxy, so it trusts one proxy hop (`trust proxy`): client IPs are real (the login throttle counts each person separately instead of locking everyone out together) and `https` is detected correctly.
- Rules for new assets: put files under `public/assets/`, reference them with **relative** paths (`assets/css/x.css`, never `http://...`), and match the file name's capitals exactly (Linux, where Railway runs, is case-sensitive; Windows and macOS are not). `npm test` includes a **deploy check** that opens every page, loads every CSS, JS, font and image they reference (including `url(...)` inside CSS), and fails the pull request if one is missing, has the wrong type, uses plain `http`, or lacks the version.
- This replaces the Laravel/Vite asset helper approach (`ASSET_HELPER_GUIDE.md` in cici-store): there is no build step or hashed file names here, so the version is added when the page is served.

## Doc Studio (sign, edit, photos to PDF)

Sidebar section **Doc Studio** (`studio.html`). It works on files already in a client folder or case and saves the result back there.

- **Sign / edit a PDF**: place your signature, stamp, date, text, whiteout, highlight or image; drag, resize, undo/redo; "repeat on all pages". Handles rotated and cropped pages. Saved as a new file by default; "Replace the original" is allowed for the uploader, Senior or Manager. Optionally ticks the checklist item.
- **Images to PDF**: pick photos from the client folder, the WhatsApp inbox or your device; reorder, rotate, A4/Letter/fit, margins, clean-up / B&W, quality, with a live size estimate against the 15 MB limit.
- **Entry points**: PDF/image rows get a Doc Studio icon, the case page has a Doc Studio button and a "Photos to PDF" link per checklist item.
- **Signatures are private**: stored per user (`user_signatures`), PNG only, max 12, never visible to other users. A signature is a visual mark, not a cryptographic one. Whiteout covers content but does not remove it.
- **Audit**: `signature.create`, `signature.delete`, `signature.use`, `studio.pdf`; each save also writes the case history.
- **Endpoints**: `/api/me/signatures` (GET/POST/PATCH/DELETE, `/:id/image`), `POST /api/studio/save`, `GET /api/files/:id/info`.
- **Libraries** (vendored, no build step): pdf.js 3.11.174 and pdf-lib 1.17.1 in `public/assets/libs/`. Typed signatures load Google Fonts lazily.
- Merge, split and compress are a later phase.

## Tests & CI
`npm test` starts the real server against a fresh PostgreSQL database (set `DATABASE_URL`, e.g. a throwaway local database) with a fake WhatsApp API, then runs the API, WhatsApp and report suites. GitHub Actions runs the same on every pull request (`.github/workflows/ci.yml`). **Never point `DATABASE_URL` at a database with real data when running tests: it is wiped.**

Document preview: PDFs and images (PNG, JPG, WebP, GIF) open in a viewer from case pages, client folders and the WhatsApp Inbox; other file types download.
