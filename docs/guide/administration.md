# Administration

Right-click a connected broker and choose **Administration** to open its admin tab —
the identity and access surface for the whole cluster, with **Users**, **Virtual hosts**
and **Permissions** sections.

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

## Virtual hosts

The **Virtual hosts** section lists every vhost with its **description**, **default queue
type**, and current **message** count.

- **Add Vhost** / **Edit** open a dialog for the **name**, an optional **description**,
  and an optional **default queue type** (`classic` / `quorum` / `stream`) applied to
  queues declared without an explicit type.
- **Delete** removes a vhost.

::: danger Deleting a vhost is destructive
Deleting a virtual host **permanently removes every queue, exchange, binding and message
in it** — it can't be undone. You're always asked to confirm, with an extra warning when
it's the vhost the current connection targets.
:::

## Permissions

The **Permissions** section controls what each user can do on each virtual host — the
join of Users × Virtual hosts.

### Standard permissions

Every (user, vhost) pair has three **regex** permissions: **configure** (declare/delete
queues & exchanges), **write** (publish / bind), and **read** (consume / get). `.*` means
**all**, blank means **none**.

- **Set Permission** / **Edit** open a dialog where you pick a **user** and **virtual
  host** (from the cluster's lists) and set the three patterns. The **Full** and **None**
  buttons fill all three at once.
- A user only sees a vhost once it has permissions there — this is how you grant a new
  user access.
- **Remove** revokes the user's permissions on that vhost.

### Topic permissions

For **topic exchanges**, you can additionally restrict publish/consume by routing-key
pattern. Each entry is a (user, vhost, **exchange**) with **write** and **read** regexes,
layered on top of the standard permissions.

- **Set Topic Permission** / **Edit** take a user, vhost, the topic exchange name, and the
  write/read patterns.
- **Remove** clears a user's topic permissions for a vhost (the management API clears all
  exchanges for that user+vhost at once).

::: warning Don't lock yourself out
Removing your own user's permissions on the vhost this connection targets can cut off your
access — you'll be warned before it happens.
:::
