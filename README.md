# Alma Odpisy – Weeding

[Česky](README.cs.md) | **English**

**Current release: 1.0.1 (24 November 2026).**

An Ex Libris Alma Cloud App for controlled physical item withdrawal in three phases. It supports multiple libraries with independent location and sequence configurations, fixed itemized sets, audit metadata, job monitoring, printing and CSV export.

## Workflow

1. **Weeding** – select library and original location; discover items with work order `WdrWO` and a non-empty Statistics Note 2; require an allowed reason, an empty weeding number and an empty weeding date. Create a fixed `ITEMIZED` set per reason; execute a controlled Alma batch job to assign the number/date.
2. **Mark as withdrawn** – convert the work order from `WdrWO` to `DlWO` via a batch job on the original set, using the configured department.
3. **Move** – use a separate batch job to change only the permanent location while retaining weeding number and date.
4. **History** – see job phases, errors and completed work, filter by library, original location, reason or weeding date, and generate printable weeding lists and CSV files.

Membership and relevant item data are verified before and after writes. The app **does not automatically repeat** uncertain job submissions. The job monitor uses red/green backgrounds for failed/successful outcomes.

## What's new in 1.0.1

- **Withdrawal list printout:** the weeding number appears in larger type on the left without a label; the accession/inventory number is smaller on the right with the Czech label “Přírůstkové číslo”.
- **Recovery from an uncertain job submission:** when a saved `post_maybe_sent` operation has no instance ID, the user may close that app-only state **only after independently verifying in Alma Monitor Jobs that the job was neither created nor running**, and entering the exact set name. A diagnostic record is retained. No job is retried, and no set or item is modified.
- **Limitation:** the underlying authorization error has not yet been explained. Release 1.0.1 addresses the resulting blocked workflow, not the cause of the rejected API request.

## Permissions

Cloud App REST calls use the logged-in Alma user's privileges. A personal Alma API key is **not** embedded.

- **Configuration:** `General System Administrator` can access the app's configuration page.
- **Alma Change Physical Items Information job:** Alma lists `Repository Manager`, `Repository Administrator`, `Physical Inventory Operator` and `Physical Inventory Operator - Limited` with institution-level scope. This is **not a verified minimum for the entire app**; creating, reading and updating sets may impose additional permission requirements.
- **Optional acquisition-method enrichment:** PO Line lookups may require acquisition permissions, and are **disabled by default** to reduce API requests.

The minimum staff-role combination is not conclusively established. Both successful and unsuccessful user tests have been observed in PSB.

## Configuration and operation

Configure library-to-sequence, original-to-target-location mappings and work order departments. There is **no hard-coded library count**. In History the weeding date comes from set metadata; if not provided, the creation date of the set is the fallback. Filtering does not fetch all individual items.

After preparing the local Ex Libris Cloud App CLI environment:

```sh
eca init
eca start
eca build
```

An earlier RC3 was successfully built and started by the maintainer. Version 1.0.1 requires its own build and functional verification in PSB.

## Publishing and support

See [1.0.1 release and test checklist](RELEASE-1.0.1.md) and [changelog](CHANGELOG.md).

Support/issues: https://github.com/skopeant/odpisy/issues

MIT License.
