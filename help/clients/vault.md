---
title: The vault (client logins)
summary: Store, reveal, edit and delete a client's BRELA login safely; who can open it and how reveals are recorded.
keywords: vault, password, login, brela account, encrypted, reveal, credentials, username, copy, add login, key, hides in 15s, audit
order: 7
---
The **Vault** tab keeps the client's online logins (for example **BRELA ORS account**). Passwords are encrypted before they are saved.

## Add a login (Senior or Manager)

1. Open the client and the **Vault** tab.
2. Press **Add login**.
3. Fill **Label**, **Username / email** and **Password**, then **Save (encrypted)**. Label and password are required.

## Reveal a login

Press the open-lock button. The username and password appear with copy buttons and **hide again after 15 seconds**. Every reveal is recorded; the login's row shows **who opened it last and when**.

The same button is on the case page in the **Client vault** card, so you can copy the login when you submit.

## Who can open it

| Person | Access |
|---|---|
| Senior, Manager | Always |
| Staff | Only while **an open case of that client is assigned to them**. Otherwise: "You can open this only while an open case of this client is assigned to you." |

## Edit or delete (Senior or Manager)

- **Edit login:** change label or username; type a **New password** only if it changed, otherwise leave it empty to keep the current one.
- **Delete:** asks for confirmation; it cannot be undone.

> Never type client passwords in comments or file names. Use the vault only.

> The server's `ENCRYPTION_KEY` must never be lost or changed; saved passwords cannot be read without it.
