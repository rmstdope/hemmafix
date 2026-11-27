# hf-msk

## `kalas.spec` can tap Jag while a tick-off is still being saved

**What happened.** PR #163, which touches only `scripts/verify-app.mjs`, its integration test and
the verify skill, went red in `e2e-shard (4)` on the head GitHub made by catching it up with main
(run 45932420810). `e2e/kalas.spec.ts`, *the page is a party sky…*, mobile, failed once at
`getByRole('button', { name: 'Framsteg' })` (element not found) and passed on retry, which
`failOnFlakyTests` turns red. The failure snapshot still showed the list *Inköp* after the tap on
**Jag**. It passed 40 times in a row locally, 50 times under CPU throttling, and in a local run of
the whole shard.
**Why.** The test taps `Mjölk: bocka av`, opens *Klart* and goes on to **Jag** without waiting for
the tick-off to be saved. Holding that page's POSTs for 8 s locally
(`page.route("**/listor/**", …)`) gave the same error; holding them for 1 s did not. That the
runner was slow in this way, and why the navigation waits for the save, are not established.
**Cost.** About 20 minutes and a second CI run.
**Prevent by.** In `e2e/kalas.spec.ts`, wait for the tick-off's server response before
`part(page, "Jag").click()`.
**Seen before.** none found for this test.
