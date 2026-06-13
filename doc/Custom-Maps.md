# Sammys-Settlers - Custom Maps (User-Defined Board Layouts)

Server-side support for user-defined board layouts, loaded from JSON files at
server startup and offered to players as custom scenarios. **Standard rules only
(v1):** custom maps change the board layout (land hexes, dice numbers, ports,
land areas, robber/pirate start), but not the game rules. They run on the sea
board (the same large board used by built-in scenarios) and use the standard
win condition.

Clients need no changes: the server sends a custom map's layout to clients with
the same `SOCBoardLayout2` message used by every other scenario, so any current
client can play a custom map.


## Contents

- Quick start
- Enabling custom maps on the server
- File format
  - Top-level fields
  - Land hexes
  - Land areas
  - Ports
  - Robber and pirate start
  - Coordinates
- The sample map, field by field
- Scenario keys (how custom maps are named)
- What is validated
- What is NOT validated
- Troubleshooting


## Quick start

1. Create a directory for your maps, e.g. `custommaps/`.
2. Copy `src/main/bin/custommaps/sample-island.map.json` into it, or write your own.
3. Start the server with `-Djsettlers.custommaps.dir=custommaps`
   (and make sure `gson.jar` is on the classpath — see below).
4. The server logs each loaded map at startup, e.g.
   `Custom map loaded: sample-island.map.json -> scenario SC_XSAMP ("Sample Two Islands")`.
5. Players choosing a new game will see the custom map in the scenario list.


## Enabling custom maps on the server

Set the server property `jsettlers.custommaps.dir` to the directory to scan.
The server scans it once at startup for files ending in `.map.json`.

```
java -jar Sammys-SettlersServer-<ver>.jar -Djsettlers.custommaps.dir=/path/to/custommaps
```

or in `jsserver.properties`:

```
jsettlers.custommaps.dir=custommaps
```

Custom maps use **GSON** for JSON parsing, exactly like the savegame feature.
If `gson.jar` isn't on the classpath, the server still starts normally and just
logs a warning that custom maps are disabled. (The shipped JARs declare
`gson.jar` on their `Class-Path`.)

Each valid map is registered as a scenario. Invalid maps are logged with an
actionable warning and skipped; a bad map file never crashes the server.


## File format

A custom map is a UTF-8 JSON file whose name ends in `.map.json`. The base
filename is also used to derive the scenario key (see "Scenario keys" below), so
choose a short, descriptive filename.

### Top-level fields

| Field          | Type        | Required | Description |
|----------------|-------------|----------|-------------|
| `name`         | string      | yes      | Display name shown in the scenario list. Must not contain `|`, `,`, or control/newline characters. |
| `description`  | string      | no       | Longer description shown to players. Must not contain `|` or control/newline characters. |
| `playerCounts` | int array   | yes      | Supported max-player counts; each must be one of `2`, `3`, `4`, `6`. Example: `[3, 4]`. |
| `shuffle`      | boolean     | no       | If `true`, the server shuffles hex types and dice numbers (and ensures 6s/8s aren't adjacent) each game. If `false` or absent, the hex types and dice numbers are placed exactly as listed. (Port **types** are always shuffled among the fixed port **edges**; see "What is NOT validated".) |
| `boardHeight`  | int         | no       | Board frame height in large-board coordinate units. If absent, defaults to `22` (the legacy 6-player fallback board). Valid range: `8`-`22`. |
| `boardWidth`   | int         | no       | Board frame width in large-board coordinate units. If absent, defaults to `23` (the legacy 6-player fallback board). Valid range: `9`-`23`. |
| `landHexes`    | hex array   | yes      | The land (and any water) hexes; see below. At least one. |
| `landAreas`    | area array  | no       | Splits `landHexes` into land areas. If absent, all hexes are land area 1. |
| `ports`        | port array  | no       | Trade ports; see below. |
| `robberHex`    | coord string| no       | Starting robber hex; must be one of the declared land hexes. |
| `pirateHex`    | coord string| no       | Starting pirate hex; must be one of the declared land hexes. |

### Land hexes

Each entry in `landHexes` is an object:

| Field      | Type        | Required | Description |
|------------|-------------|----------|-------------|
| `type`     | string      | yes      | One of `clay`, `ore`, `sheep`, `wheat`, `wood`, `desert`, `gold`, `water` (case-insensitive). |
| `coord`    | coord string| yes      | Hex coordinate `0xRRCC`; must be on an odd row and within board range. |
| `diceNum`  | int         | no       | Dice number `2`-`12` excluding `7`. Omit (or `0`) for no number. **Deserts and water must have no dice number.** |
| `landArea` | int         | no       | Informational only. The authoritative land-area assignment comes from `landAreas` (or defaults to area 1). This field documents intent and is not cross-checked. |

The order of `landHexes` matters when `landAreas` is given: the areas consume
hexes in file order (see below).

### Land areas

If `landAreas` is present, it splits `landHexes` into contiguous ranges **in file
order**. Each entry:

| Field   | Type | Description |
|---------|------|-------------|
| `area`  | int  | Land area number, `>= 1`, unique within the map. Area `1` must be present (it's the players' starting area). |
| `count` | int  | How many consecutive `landHexes` (in file order) belong to this area. |

The sum of all `count` values must equal the number of `landHexes`. Land areas
group islands so players can earn Special Victory Points (SVP) for building out
to new areas, the same as built-in sea-board scenarios. If `landAreas` is
omitted, all hexes form land area 1.

### Ports

Each entry in `ports` is an object:

| Field    | Type        | Required | Description |
|----------|-------------|----------|-------------|
| `type`   | string      | yes      | One of `misc` (3:1, also accepts `3:1`), `clay`, `ore`, `sheep`, `wheat`, `wood`. |
| `edge`   | coord string| yes      | Edge coordinate `0xRRCC` where the port sits. |
| `facing` | string      | yes      | Direction from the port edge toward its land hex: `NE`, `E`, `SE`, `SW`, `W`, or `NW`. |

The facing must be geometrically valid for the edge type and must point at a
declared land hex. (Edge geometry: a vertical `|` edge faces `E`/`W`; a `/` edge
faces `NW`/`SE`; a `\` edge faces `NE`/`SW`.)

### Robber and pirate start

`robberHex` and `pirateHex` are optional. If given, each must be the coordinate
of one of the declared land hexes. If `robberHex` is omitted, the robber starts
off the board (or on a desert, if the placement logic finds one). If `pirateHex`
is omitted, the pirate starts off the board.

### Coordinates

All coordinates use the **large sea-board** coordinate system: a hex/edge address
is `0xRRCC` where `RR` is the row and `CC` is the column (both hexadecimal).
Land hexes are on **odd** rows. See `doc/hexcoord-sea.png` and the coordinate-system
section of `SOCBoardLarge`'s class javadoc for the geometry. Coordinate strings
accept an optional `0x` prefix and are always read as hexadecimal (e.g.
`"0x0504"` or `"0504"`).

By default, custom maps use the largest (6-player) fallback board size, so
coordinates may range over rows `1`-`21` and columns `1`-`22` regardless of the
game's actual player count. If `boardHeight` / `boardWidth` are set, coordinates
must stay strictly inside that frame: land hex rows `1` through
`boardHeight - 1`, land hex columns `1` through `boardWidth - 1`, and port edge
rows/columns `0` through the same maxima.


## The sample map, field by field

`src/main/bin/custommaps/sample-island.map.json` is a small, playable two-island
variant for 3 or 4 players, built from coordinates verified against the
built-in "Four Islands" layout. It demonstrates every feature:

- `name` / `description`: shown in the scenario chooser.
- `playerCounts: [3, 4]`: playable with 3 or 4 players.
- `shuffle: false`: the layout below is placed exactly as written.
- `landHexes`: 12 hexes. The first 8 form the **main island** (a clay/ore/sheep/
  wheat/wood spread with dice numbers); the last 4 form a smaller **second
  island**. Each has a `type`, a `coord`, and a `diceNum`.
- `landAreas`: `[{area:1,count:8},{area:2,count:4}]` — the first 8 `landHexes`
  are land area 1 (the starting island), the next 4 are land area 2 (reached by
  building out, for SVP).
- `ports`: 4 ports. Two `misc` (3:1) and two resource ports (`wood`, `ore`),
  each on a coastal edge `facing` its island.
- `robberHex` / `pirateHex`: the robber starts on a main-island hex; the pirate
  starts near the second island.

To experiment, copy the sample, change dice numbers or hex types, set
`shuffle: true` to randomize the layout, or add a third island as another land
area.


## Scenario keys (how custom maps are named)

Built-in scenario keys (`SC_4ISL`, `SC_FOG`, etc.) and custom-map keys share an
8-character maximum and the same namespace. To guarantee a custom map can never
shadow a built-in scenario, every custom map is registered under the reserved
prefix **`SC_X`** followed by up to 4 uppercase ASCII alphanumeric characters
derived from the base filename:

- `sample-island.map.json` → `SC_XSAMP`
- `isle.map.json` → `SC_XISLE`
- `a-b_1_2_3.map.json` → `SC_XAB12` (non-alphanumerics skipped)

No built-in scenario key starts with `SC_X`, so collisions with built-ins are
impossible. If two custom files derive the **same** key (e.g. `island1` and
`island2` both → `SC_XISLA`), the second one is logged and skipped. Rename one
of the files so their first 4 alphanumerics differ.

All custom scenarios have a minimum version of `2000` (Sammys-Settlers 2.0), the floor
for all scenarios.


## What is validated

At startup, each map is checked for:

- `name` present; `description` (if any) free of `|`/control characters.
- At least one supported player count, each in {2, 3, 4, 6}.
- At least one land hex; every hex has a recognized `type` and a `coord` that is
  within board range and on a valid (odd) hex row.
- No duplicate hex coordinates.
- Dice numbers in `2`-`12` excluding `7`; deserts and water carry no dice number.
- Land-area `count`s sum to the number of land hexes; area numbers are positive
  and unique; area `1` is present.
- Ports have a recognized `type` and `facing`, an `edge` within board range, a
  `facing` that is geometrically valid for the edge, and that faces a declared
  land hex (a cheap coastal-adjacency check).
- `robberHex` / `pirateHex` (if given) name a declared land hex.

A map that fails any check is logged with a specific message naming the offending
field/index, and is skipped.


## What is NOT validated

For v1, the following are **not** checked. A map can be syntactically valid yet
unbalanced or unusual; authoring a fair, fun map is up to you.

- **Playability / fairness:** resource balance, dice-number distribution, whether
  every player has a viable starting position, total VP reachability.
- **Connectivity:** that land hexes actually form connected islands, or that a
  land area's hexes are spatially contiguous.
- **6/8 adjacency:** when `shuffle` is `false`, adjacent 6s and 8s are placed as
  written and not rearranged. (When `shuffle` is `true`, the generator avoids
  adjacent 6s/8s, as for built-in scenarios.)
- **Hex count vs. player count:** whether the map has enough hexes/space for the
  declared player counts.
- **Port edge being on the true coastline** beyond the cheap "facing points at a
  declared land hex" check. A deeper geometric port-consistency check
  (`makeNewBoard_checkPortLocationsConsistent`) runs when the *game starts*; if a
  port edge overlaps land or faces water there, board generation throws and that
  game can't be created. Test your map by starting a game with it.
- **Port types respecting the `shuffle` flag:** port **edge locations** are always
  fixed as given, but port **types** are always shuffled among those edges (the
  same as built-in scenarios), regardless of `shuffle`.

Custom maps are standard-rules only: they cannot define scenario-specific game
options, special edges, villages, fortresses, wonders, or fog.


## Troubleshooting

- **"custommaps.dir not found as a directory":** the path doesn't exist or isn't
  a directory. Check `jsettlers.custommaps.dir`.
- **"custom maps disabled: Can't find Gson class":** add `gson.jar` to the
  classpath (it's on the shipped JARs' `Class-Path`).
- **"Skipping custom map X: ...":** the message names the problem (e.g. a bad
  coordinate or out-of-range dice number). Fix that field and restart.
- **"derived scenario key SC_Xnnnn collides ...":** two files derive the same key;
  rename one so their first 4 alphanumeric characters differ.
- **A game won't start with a custom map:** likely a port-consistency failure that
  isn't caught at load time (see "What is NOT validated"). Check the server log
  for an `Inconsistent layout` message and adjust the port edge/facing.
