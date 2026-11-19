# Alma Odpisy – Weeding

[Česky](README.cs.md) | **English**

An Ex Libris Alma Cloud App for controlled physical item withdrawal in three phases. It supports multiple libraries with independent location and sequence configurations, fixed itemized sets, audit metadata, job monitoring, printing and CSV export.

## Workflow

1. **Weeding** – select library and original location; discover items with work order `WdrWO` and a non-empty Statistics Note 2; require an allowed reason, an empty weeding number and an empty weeding date. Create a fixed `ITEMIZED` set per reason; execute a controlled Alma batch job to assign the number/date.
2. **Mark as withdrawn** – convert the work order from `WdrWO` to `DlWO` via a batch job on the original set, using the configured department.
3. **Move** – use a separate batch job to change only the permanent location while retaining weeding number and date.
4. **History** – see job phases, errors and completed work, filter by library, original location, reason or weeding date, and generate printable weeding lists and CSV files.

Membership and relevant item data are verified before and after writes. The app **does not automatically repeat** uncertain job submissions. The job monitor uses red/green backgrounds for failed/successful outcomes.

## Permissions

Cloud App REST calls use the logged-in Alma user's privileges. A personal Alma API key is **not** embedded.

- **Configuration:** `General System Administrator` can access the app's configuration page.
- **Alma Change Physical Items Information job:** Alma lists `Repository Manager`, `Repository Administrator`, `Physical Inventory Operator` and `Physical Inventory Operator - Limited` with institution-level scope. This is **not a verified minimum for the entire app**; creating, reading and updating sets may impose additional permission requirements.
- **Optional acquisition-method enrichment:** PO Line lookups may require acquisition permissions, and are **disabled by default** to reduce API requests.

The minimum staff role combination is awaiting testing with a less-privileged account. The maintainer's existing roles do not need to be changed.

## Configuration and operation

Configure library-to-sequence, original-to-target-location mappings and work order departments. There is **no hard-coded library count**. In History the weeding date comes from set metadata; if not provided, the creation date of the set is the fallback. Filtering does not fetch all individual items.

After preparing the local Ex Libris Cloud App CLI environment:

```sh
eca init
eca start
eca build
```

The maintainer reported successful `eca build` and `eca start` of RC3. The final documentation and manifest have since changed; run `eca build` on this release content before publishing.

## Publishing and support

See [release instructions](RELEASE-1.0.0.md) and [Ex Libris listing text](APP-CENTER-DESCRIPTION.md). Previous test notes are in [`docs/development-history/`](docs/development-history/).

Support/issues (planned repository location): https://github.com/skopeant/odpisy/issues

MIT License.
