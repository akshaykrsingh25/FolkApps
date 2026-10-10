# Centre directory seed

`incuspaze-centre-directory.csv` is a prepared import file for the centre list supplied in the conversation on 10 October 2026. The source image contains 64 rows. Four centre codes repeat for distinct floors, so the file represents those as one centre plus floor children: 60 centres and 8 floors across 15 cities and 11 states.

Two source rows do not include a centre code. Their codes are left blank instead of invented. The CSV importer accepts blank centre codes, while still requiring a name, city, and state. Floor rows have a blank code and name their parent with `Parent Center Code`.

The source sheet's city column appears misaligned for the two rows named Akaya One and Unitech Cyber Park. Incuspaze's own pages identify Akaya One in Sector 32, Gurugram and describe Unitech Cyber Park as a Gurugram location, so both are grouped under Gurgaon in the directory. The public site also refers to Experio in Lucknow and Aspinwall House in Trivandrum; those sources are recorded below. Other centre labels and codes follow the supplied image.

## Import

Only a Head Office member can import this directory. First send the CSV text to `POST /api/v1/locations/import/preview` in the JSON field `csv`. Review every row. Then send the same CSV to `POST /api/v1/locations/import`. The importer creates the states, centres, and floor children together in one transaction, and records each creation in the audit log. It never adds coordinates from a city name.

Centre map pins remain unconfirmed until a person with location authority checks an exact address and confirms the coordinates. This prevents a city-centre estimate from looking like a verified building location. An optional `Physical Address` CSV column is accepted, but imported addresses remain unverified. Centre Heads may confirm an address and pin for their centre; State Heads and Head Office can verify it. Address edits and clearing an address are audited together with coordinate changes. The supplied directory contains no verified street addresses or exact pins, so those values must be confirmed by centre teams before map pins are shown.

## Public references consulted

- [Incuspaze home page](https://www.incuspaze.com/) — current public portfolio overview; it describes 80+ locations across 18+ cities, which is a broader marketing portfolio than this supplied asset-register list.
- [Incuspaze Akaya One](https://www.incuspaze.com/gurugram/space-details/incuspaze-akaya-one) — Prem Puri, Sector 32, Gurugram.
- [Incuspaze Gurugram coworking locations](https://www.incuspaze.com/gurugram/coworking-office-spaces) — lists Akaya One in Sector 32, Gurugram.
- [Incuspaze Experio, Lucknow](https://www.incuspaze.com/lucknow/space-details/incuspaze-experio) — Experio in Vibhuti Khand, Gomti Nagar, Lucknow.
- [Incuspaze Aspinwall House, Trivandrum](https://www.incuspaze.com/trivandrum/space-details/incuspaze-aspinwall-house) — Aspinwall House on Kowdiar–Kuravankonam Road, Trivandrum.

The public portfolio is used only to validate public place names and city context. The attached centre list remains the source for which records are included here. Confirm current operating status and exact coordinates with centre managers before production rollout.
