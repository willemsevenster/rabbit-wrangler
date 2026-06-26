# Administration

Right-click a connected broker and choose **Administration** to open its admin tab —
the identity and access surface for the whole cluster. The tab has sections for
**Users**, **Virtual hosts**, and **Permissions**.

::: warning Requires the administrator tag
Administration needs a broker user with the **administrator** tag. If you're connected
as a non-admin user, the tab shows a banner telling you so (and skips the admin calls)
rather than a wall of permission errors. The tab header shows **who you're connected
as** and your tags.
:::

## Users

The **Users** section lists every broker user (users are cluster-wide, not per virtual
host) with their **tags** and whether a **password** is set.

- **Add User** / **Edit** open a dialog where you set the **name**, an optional
  **password**, and the **tags** (toggle chips): `administrator`, `monitoring`,
  `policymaker`, `management`, `impersonator`. No tags = a regular user that can connect
  and use messaging but has no management access.
- **Passwords**: on **create**, leaving the password blank makes a **passwordless** user
  (for x509/SASL auth). On **edit**, leaving it blank **keeps the existing password** —
  type a new one only to change it. (The stored password hash never leaves the broker
  machine.)
- **Delete** removes a user and any permissions granted to it.

::: warning Don't lock yourself out
The user **this connection authenticates as** is marked **you**. Deleting it, or
removing your own `administrator` tag, will revoke your access — Rabbit Wrangler warns
you before letting either happen.
:::
