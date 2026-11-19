---
title: WhatsApp setup (Manager)
summary: What is needed to receive client files and send alerts: Meta credentials, webhook, templates.
keywords: whatsapp setup, meta, cloud api, token, phone number id, webhook, verify token, app secret, templates, not configured, connect whatsapp, environment variables
order: 2
role: MANAGER
---
WhatsApp uses Meta's WhatsApp Cloud API. The app is told its credentials through server settings (environment variables), then you finish in Meta's panel. Whoever deploys the app sets these:

| Variable | Purpose |
|---|---|
| `WHATSAPP_TOKEN` | Access token |
| `WHATSAPP_PHONE_NUMBER_ID` | The number the office uses |
| `WHATSAPP_VERIFY_TOKEN` | A word you choose, repeated in Meta when you add the webhook |
| `WHATSAPP_APP_SECRET` | Verifies messages are really from Meta |
| `DEFAULT_COUNTRY_CODE` | Default `255` (for numbers written starting with 0) |

## Steps

1. Set the variables and restart the app.
2. In **Settings → WhatsApp** the status should change from not configured to connected.
3. In Meta's panel add the **Webhook URL** shown on that page, with your verify token, and subscribe to messages.
4. Create the six **message templates** listed on the page (category Utility, language English) with exactly the same text and variables.
5. Press **Send test to my phone** (your phone must be saved in your profile).

## Checks

- Webhook not accepted: the verify token differs.
- No incoming files: webhook not subscribed or app secret wrong.
- No alerts: templates not approved yet by Meta.

See also: [Alerts and digest](help:whatsapp/alerts-and-digest).
