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
5. App service → **Settings → Networking → Generate Domain**. Open it and sign in.
6. **Settings** (Manager only): add your team and tweak case types / document checklists.

The tables and the 5 starter case types are created automatically on first start.

> **Keep `ENCRYPTION_KEY` safe (password manager).** If it is lost or changed, saved client passwords cannot be decrypted.

## Roles
| Role | Can do |
|---|---|
| Manager | everything, plus Settings (team, case types, WhatsApp) and the monthly Reports |
| Senior | submit to BRELA, record BRELA outcome, add vault credentials, edit cases |
| Junior / Secretary / Associate | create cases, upload docs, comment, prepare cases; open a client's vault only while an open case of that client is assigned to them |

## Notes
- Uploaded files are stored inside PostgreSQL (max 15 MB each), so one Railway database backup covers everything. Enable backups on the Postgres service.
- Every vault reveal is recorded (who, when). Passwords are encrypted with AES-256-GCM before saving.
- Local run: copy `.env.example` to `.env`, then `npm install && npm run dev` (needs a local Postgres).

## Monthly report (Manager)
**Reports** in the menu: pick any month (counted in East Africa Time) to see cases received and completed (compared with the previous month), BRELA corrections and the reasons given, average turnaround, first-time approval rate, breakdowns by case type, team member and client, and the list of completed cases. **Print / Save PDF** gives a clean one-page-style printout, **Download CSV** opens in Excel. Completion and submission dates are recorded from now on (older cases are filled in from their history).

## WhatsApp (optional)

Uses the official **WhatsApp Business Cloud API** (Meta). Two things work out of the box once it is connected:

1. **Alerts to the team** (WhatsApp messages): new case assigned to you, BRELA returned a case (to the assignee and Managers), a case is ready for review (to Seniors/Managers), a client sent a document, plus a **daily digest at 07:00 East Africa Time** (not Sundays) listing each person's returned, overdue and due-soon cases. You never get an alert for your own action.
2. **Client documents into cases:** clients send PDFs or photos to the business number. They land in **WhatsApp Inbox**, matched to the client by phone number when it is known. Someone files each one under a client, case and checklist item in two clicks, which ticks the item and writes the history.

### Set up
1. [developers.facebook.com](https://developers.facebook.com) → create a **Business** app → add the **WhatsApp** product (Meta gives you a test number to try first).
2. For real use: verify your Meta Business account and register the business number (check Meta's current rules for numbers already used in the regular WhatsApp app).
3. Create a **System User** token with WhatsApp permissions → `WHATSAPP_TOKEN`. Copy the **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`. App settings → Basic → **App secret** → `WHATSAPP_APP_SECRET`. Invent any string for `WHATSAPP_VERIFY_TOKEN`. Put all four in Railway Variables.
4. Meta → WhatsApp → Configuration → **Webhook**: callback URL `https://YOUR-DOMAIN/webhooks/whatsapp`, your verify token, then subscribe to the **messages** field.
5. Create the **5 message templates** (category *Utility*, language *English*) exactly as listed in **Settings → WhatsApp** (copy the text). Alerts only work after Meta approves them.
6. Add phone numbers: team members in **Settings → Team → Phone**, clients on the client page (**edit** next to the WhatsApp number).
7. **Settings → WhatsApp → Send test to my phone** (uses Meta's built-in `hello_world` template).

### Good to know
- Messages the app starts must use approved templates (Meta rule). Replies inside 24 hours of a client's message are free-form (`WA_AUTOREPLY=true` enables a short "received" reply).
- Prices depend on country and template category: check Meta's current rate card before relying on high volumes.
- Only documents and images are captured (PDF, JPG, PNG...). Tell clients to send photos **as Document** to keep full quality. Voice notes and videos are ignored.
- Numbers like `0712 345 678` are read as Tanzanian (`DEFAULT_COUNTRY_CODE=255`).
- Every send is logged (Settings → WhatsApp → Recent sends), and Meta's duplicate deliveries are ignored.
