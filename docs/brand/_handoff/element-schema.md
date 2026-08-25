# Element schema (XPMS3)

Every produced element — signage, swag, print, equipment, credential — is catalogued against this schema. It is the join between the design system and production: a Claude Code export should treat these field names as the canonical column set for any elements table, procurement view, or budget rollup.

## Fields

| Field | Type | Notes |
| --- | --- | --- |
| `element_id` | string | Human key, prefix by family: `SIG-01`, `SWG-03`, `PRN-02` |
| `urid` | string | Dotted cost code `DDDD.CC.NNN` — department.category.item (e.g. `4000.01.101`) |
| `name` | string | Display name |
| `department` | enum | See below |
| `discipline` | string | e.g. Signage & Wayfinding, Scenic Fabrication, Guest Amenities & Merch |
| `category` | string | Free label within discipline (Entry & Dock Signage, Match Envelopes) |
| `kind` | enum | `equipment` · `uniform` · `consumable` · `credential` |
| `tier` | enum | `04 Physical` · `05 Experiential` |
| `phase` | enum | `Install` · `Operate` · `Strike` |
| `grain` | enum | `class` · `instance` |
| `element_state` | enum | `Active` · `Draft` · `Retired` |
| `specifications` | string | Full production spec: dimensions, material, finish |
| `uom` | string | Compound unit `unit·scope` — `item·event`, `item·unit`, `set·event`, `lot·event`, `item·sailing` |
| `qty` | number | Quantity at the stated UOM |
| `unit_cost_usd` | number | |
| `total_cost_usd` | number | `qty × unit_cost_usd` |
| `price_confidence` | enum | `QUOTED` (vendor quote in hand) · `PUBLISHED` (list price) · `BENCHMARKED` (estimated from comparables) |
| `sense` | string | Sensory channels engaged, slash-separated: `Sight`, `Touch`, `Sound`, `Taste`, `Smell` |
| `five_a` | enum | Five-A phase — see below |
| `client_visible` | 0/1 | Guest sees it |
| `critical_path` | 0/1 | Event cannot run without it |
| `weather` | enum | `waterproof_marine` · `indoor_only` · `all_weather` |

## Departments

`3000 Marketing` · `4000 Build` · `5000 Production` · `8000 Hospitality`

URID first segment matches the department number.

## Five-A framework

Every element and every experience moment maps to one phase of the guest arc. Use it to audit coverage — a phase with no elements is a gap.

| Phase | Covers | Example elements |
| --- | --- | --- |
| **Arrival** | Dock, check-in, boarding, first impression | Navy carpet runner, step-and-repeat, brass bell, Intent Wristbands, protocol card |
| **Atmosphere** | Ambient environment, styling, wardrobe | Signal flags, VIP daybed pillows, linen shirts, captain caps |
| **Appetite** | Food, drink, hydration | Bar service, canned cocktails, espresso martini station, electrolytes |
| **Activity** | Challenges, water sports, Confessional | Paddleboards, ring raft hub, Confessional Pod wrap, tumblers |
| **Afterglow** | Sunset ceremony, match reveal, Shore Leave, post-event media | Captain's Log envelope, silk kimono, confessional clips, shuttle |

## Weather attribute

Every physical element declares exposure tolerance. Marine is the default assumption on this product — an `indoor_only` element outside the Confessional Pod or Shore Leave venue is a design error.

- `waterproof_marine` — full salt, spray, and sun exposure
- `all_weather` — durable but not submersible; apparel and soft goods
- `indoor_only` — pod, lounge, or venue only

## Worked example

```
element_id       SIG-06
urid             4000.03.301
name             Confessional Pod Door & Interior Wrap
department       4000 Build
discipline       Scenic Fabrication
category         Media Enclosures
kind             equipment
tier             05 Experiential
phase            Install
grain            class
element_state    Active
specifications   Acoustic foam padding, printed marine vinyl wall wrap,
                 custom neon coral LED sign
uom              set·event
qty              1
unit_cost_usd    1200
total_cost_usd   1200
price_confidence QUOTED
sense            Sight / Touch
five_a           Activity
client_visible   1
critical_path    1
weather          indoor_only
```

## Design-system usage

- **Data Kit** renders rollups by `department`, `five_a`, and `price_confidence`.
- **Print / Signage / Wearables Kits** carry `specifications` verbatim onto artwork specs.
- **Show Kit** filters by `phase` and `critical_path` for the run-of-show board.
- Any element surfaced to a guest (`client_visible = 1`) must satisfy the brand's imagery and type canon; internal-only elements need only the spec.
