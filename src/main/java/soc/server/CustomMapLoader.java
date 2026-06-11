/**
 * Java Settlers - An online multiplayer version of the game Settlers of Catan
 * This file Copyright (C) 2026 Jeremy D Monin <jeremy@nand.net>
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 3
 * of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * The maintainer of this program can be reached at jsettlers@nand.net
 **/
package soc.server;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

import com.google.gson.Gson;
import com.google.gson.JsonParseException;

import soc.game.SOCScenario;

/**
 * Loads, validates, parses, and registers user-defined custom board maps at server startup (standard rules only, v1).
 *<P>
 * A custom map is a JSON file ending in {@code .map.json} placed in the directory named by server property
 * {@link SOCServer#PROP_JSETTLERS_CUSTOMMAPS_DIR jsettlers.custommaps.dir}.  See {@code doc/Custom-Maps.md}
 * for the full file format and field documentation.
 *<P>
 * Each valid map file is registered as a {@link SOCScenario} whose key uses the reserved prefix
 * {@link SOCScenario#CUSTOM_SCENARIO_KEY_PREFIX} so it can never shadow a built-in scenario.
 * The parsed layout arrays are cached here, keyed by scenario key, so
 * {@link SOCBoardAtServer#makeNewBoard(soc.game.SOCGameOptionSet)} can fetch and feed them through the
 * existing board-generation pipeline.
 *<P>
 * <B>GSON dependency:</B> like {@code soc.server.savegame}, this class imports GSON directly, so it must not be
 * referenced unless the caller has first verified GSON is on the classpath
 * (for example {@code Class.forName("com.google.gson.Gson")}).  {@link SOCServer} performs that check during
 * startup before calling {@link #loadAndRegisterAll(File)}, so a server without {@code gson.jar} still starts,
 * just without custom maps.
 *<P>
 * Invalid map files are logged with an actionable warning at startup and skipped; loading never throws to
 * the server's startup path, so a bad map can't crash the server.
 *
 * @since 2.7.00
 */
public class CustomMapLoader
{
    /**
     * Filename suffix/extension for custom map files: {@code ".map.json"}.
     */
    public static final String FILENAME_EXTENSION = ".map.json";

    /**
     * Minimum client/server version required by all custom-map scenarios: {@code 2000}
     * (same as {@link SOCScenario#VERSION_FOR_SCENARIOS}).
     */
    public static final int CUSTOM_MAP_MIN_VERSION = SOCScenario.VERSION_FOR_SCENARIOS;

    /**
     * Cache of successfully-loaded custom maps, keyed by their registered scenario key
     * (such as {@code "SC_XISLE"}).  Populated by {@link #loadAndRegisterAll(File)}.
     */
    private static final Map<String, ParsedCustomMap> loadedMaps = new HashMap<String, ParsedCustomMap>();

    /**
     * Get a previously-loaded and registered custom map's parsed layout, by its scenario key.
     * Used by {@link SOCBoardAtServer#makeNewBoard(soc.game.SOCGameOptionSet)}.
     *
     * @param scenarioKey  Scenario key, such as {@code "SC_XISLE"}, or {@code null}
     * @return the parsed custom map, or {@code null} if {@code scenarioKey} is null or isn't a loaded custom map
     */
    public static ParsedCustomMap getLoadedMap(final String scenarioKey)
    {
        if (scenarioKey == null)
            return null;  // <--- Early return: no key ---

        return loadedMaps.get(scenarioKey);
    }

    /**
     * Is the given scenario key a registered custom map?
     * @param scenarioKey  Scenario key, or {@code null}
     * @return true if {@code scenarioKey} names a loaded custom map
     */
    public static boolean isCustomMap(final String scenarioKey)
    {
        return (scenarioKey != null) && loadedMaps.containsKey(scenarioKey);
    }

    /**
     * Scan a directory for {@code *.map.json} files, parse and validate each, and register the valid ones as
     * custom scenarios via {@link SOCScenario#registerCustomScenario(SOCScenario)}.
     *<P>
     * Each invalid file is logged with an actionable warning to {@code System.err} and skipped; this method
     * never throws because of a bad map file.
     *
     * @param mapsDir  Directory to scan; if null, doesn't exist, or isn't a directory, logs a warning and returns 0
     * @return the number of custom maps successfully registered
     */
    public static int loadAndRegisterAll(final File mapsDir)
    {
        if ((mapsDir == null) || ! mapsDir.isDirectory())
        {
            System.err.println
                ("Warning: custommaps.dir not found as a directory: "
                 + ((mapsDir != null) ? mapsDir.getPath() : "(null)"));
            return 0;  // <--- Early return: no directory to scan ---
        }

        final File[] files = mapsDir.listFiles();
        if (files == null)
        {
            System.err.println("Warning: Can't list custommaps.dir: " + mapsDir.getPath());
            return 0;  // <--- Early return: can't list directory ---
        }

        int registered = 0;
        for (final File f : files)
        {
            final String fname = f.getName();
            if (! (f.isFile() && fname.toLowerCase(Locale.US).endsWith(FILENAME_EXTENSION)))
                continue;

            try
            {
                final ParsedCustomMap pmap = loadAndRegisterOne(f);
                if (pmap != null)
                {
                    ++registered;
                    System.err.println
                        ("Custom map loaded: " + fname + " -> scenario " + pmap.scenarioKey
                         + " (\"" + pmap.name + "\")");
                }
            }
            catch (CustomMapException e) {
                System.err.println("Warning: Skipping custom map " + fname + ": " + e.getMessage());
            }
            catch (Throwable th) {
                System.err.println("Warning: Skipping custom map " + fname + ": unexpected error: " + th);
            }
        }

        return registered;
    }

    /**
     * Parse, validate, and register a single custom map file.
     *
     * @param f  Map file to load; filename should end with {@link #FILENAME_EXTENSION}
     * @return the parsed and registered map
     * @throws CustomMapException if the file can't be parsed, fails validation, or its derived scenario key
     *     collides with an already-known scenario
     */
    public static ParsedCustomMap loadAndRegisterOne(final File f)
        throws CustomMapException
    {
        final CustomMapJson raw;
        try
            (final FileInputStream fis = new FileInputStream(f);
             final InputStreamReader reader = new InputStreamReader(fis, "UTF-8"); )
        {
            final Gson gson = new Gson();
            raw = gson.fromJson(reader, CustomMapJson.class);
        }
        catch (JsonParseException e) {
            throw new CustomMapException("JSON parse error: " + e.getMessage());
        }
        catch (IOException e) {
            throw new CustomMapException("I/O error: " + e.getMessage());
        }

        if (raw == null)
            throw new CustomMapException("File is empty or not valid JSON");

        final String scenKey = deriveScenarioKey(f.getName());
        final ParsedCustomMap pmap = CustomMapValidator.validateAndParse(raw, scenKey);

        if (SOCScenario.getScenario(scenKey) != null)
            throw new CustomMapException
                ("derived scenario key " + scenKey + " collides with an existing scenario; rename the map file");

        final SOCScenario scen;
        try
        {
            scen = new SOCScenario
                (scenKey, CUSTOM_MAP_MIN_VERSION, CUSTOM_MAP_MIN_VERSION,
                 pmap.name, pmap.description, "SBL=t,VP=t10");
                // Custom maps use the sea board (SBL) with standard win condition; no scenario-specific options.

            SOCScenario.registerCustomScenario(scen);
        }
        catch (IllegalArgumentException e) {
            // Could come from the SOCScenario constructor (e.g. name/description fails isSingleLineAndSafe)
            // or from registerCustomScenario (e.g. key collision).
            throw new CustomMapException(e.getMessage());
        }

        loadedMaps.put(scenKey, pmap);

        return pmap;
    }

    /**
     * Parse and validate a single custom map file WITHOUT registering its scenario or caching it.
     * Intended for unit tests of the parse/validation pipeline.
     *
     * @param f  Map file to load
     * @return the parsed and validated map
     * @throws CustomMapException if the file can't be parsed or fails validation
     * @since 2.7.00
     */
    public static ParsedCustomMap parseAndValidateForTests(final File f)
        throws CustomMapException
    {
        final CustomMapJson raw;
        try
            (final FileInputStream fis = new FileInputStream(f);
             final InputStreamReader reader = new InputStreamReader(fis, "UTF-8"); )
        {
            final Gson gson = new Gson();
            raw = gson.fromJson(reader, CustomMapJson.class);
        }
        catch (JsonParseException e) {
            throw new CustomMapException("JSON parse error: " + e.getMessage());
        }
        catch (IOException e) {
            throw new CustomMapException("I/O error: " + e.getMessage());
        }

        if (raw == null)
            throw new CustomMapException("File is empty or not valid JSON");

        return CustomMapValidator.validateAndParse(raw, deriveScenarioKey(f.getName()));
    }

    /**
     * Derive a custom scenario key from a map's filename, using reserved prefix
     * {@link SOCScenario#CUSTOM_SCENARIO_KEY_PREFIX}.
     *<P>
     * The base filename (minus the {@code .map.json} suffix and any directory) is uppercased; its first 4
     * ASCII alphanumeric characters are appended to the prefix, keeping the total key length within the
     * 8-character maximum.  Example: {@code sample-island.map.json} -&gt; {@code SC_XSAMP}.
     *
     * @param filename  Map filename, with or without directory; should end with {@link #FILENAME_EXTENSION}
     * @return the derived scenario key, such as {@code "SC_XSAMP"}
     * @throws CustomMapException if no usable alphanumeric character can be derived from the filename
     */
    public static String deriveScenarioKey(final String filename)
        throws CustomMapException
    {
        String base = new File(filename).getName();
        final int suffixAt = base.toLowerCase(Locale.US).indexOf(FILENAME_EXTENSION);
        if (suffixAt > 0)
            base = base.substring(0, suffixAt);

        final StringBuilder sb = new StringBuilder();
        final String up = base.toUpperCase(Locale.US);
        for (int i = 0; (i < up.length()) && (sb.length() < 4); ++i)
        {
            final char ch = up.charAt(i);
            if (((ch >= 'A') && (ch <= 'Z')) || ((ch >= '0') && (ch <= '9')))
                sb.append(ch);
        }

        if (sb.length() == 0)
            throw new CustomMapException
                ("can't derive scenario key: filename has no ASCII letters or digits");

        // Key must start with a letter (SOCScenario requires alphanumeric starting with a letter);
        // the SC_X prefix guarantees that.
        return SOCScenario.CUSTOM_SCENARIO_KEY_PREFIX + sb.toString();
    }

    /**
     * For unit tests: clear all loaded custom maps and unregister their scenarios.
     * @since 2.7.00
     */
    public static void clearLoadedMapsForTests()
    {
        for (final String key : loadedMaps.keySet())
            SOCScenario.removeUnknownScenario(key);
        loadedMaps.clear();
    }

    /**
     * Raw JSON form of a custom map file, deserialized by GSON.  Field names match the JSON keys.
     * All numeric coordinates are parsed by {@link CustomMapValidator} from their string hex form
     * (such as {@code "0x0504"}) into integers; see {@code doc/Custom-Maps.md}.
     * @since 2.7.00
     */
    static class CustomMapJson
    {
        /** Display name of this map (required). */
        String name;

        /** Brief description shown in the scenario chooser (optional). */
        String description;

        /** Supported player counts, such as {@code [3, 4]} (required, non-empty). */
        int[] playerCounts;

        /** If true, shuffle hex types and dice numbers; if false/absent, use the fixed layout as given. */
        boolean shuffle;

        /** Land hexes (required, non-empty). */
        HexJson[] landHexes;

        /** Trade ports (optional). */
        PortJson[] ports;

        /** Land-area definitions (optional; if absent, all land hexes are land area 1). */
        LandAreaJson[] landAreas;

        /** Optional robber starting hex, as a hex coordinate string such as {@code "0x0504"}. */
        String robberHex;

        /** Optional pirate starting hex, as a hex coordinate string such as {@code "0x0908"}. */
        String pirateHex;
    }

    /**
     * Raw JSON form of one land hex within a custom map.
     * @since 2.7.00
     */
    static class HexJson
    {
        /** Hex resource type: one of {@code clay ore sheep wheat wood desert gold water} (required). */
        String type;

        /** Hex coordinate as a hex string, such as {@code "0x0504"} (required). */
        String coord;

        /** Dice number 2..12 (excluding 7), or 0/absent for none (deserts/water must have none). */
        int diceNum;

        /** Land area number this hex belongs to; 0 if none (overridden by {@code landAreas} ranges). */
        int landArea;
    }

    /**
     * Raw JSON form of one trade port within a custom map.
     * @since 2.7.00
     */
    static class PortJson
    {
        /** Port type: one of {@code misc clay ore sheep wheat wood} (required). */
        String type;

        /** Port edge coordinate as a hex string, such as {@code "0x0602"} (required). */
        String edge;

        /** Facing direction toward land: one of {@code NE E SE SW W NW} (required). */
        String facing;
    }

    /**
     * Raw JSON form of one land-area definition: a contiguous range of {@code landHexes} indices.
     * @since 2.7.00
     */
    static class LandAreaJson
    {
        /** Land area number (must be &gt;= 1, unique within the map). */
        int area;

        /** Count of consecutive {@code landHexes} entries (in file order) belonging to this area. */
        int count;
    }

    /**
     * Fully-parsed and validated custom map, with integer arrays ready to feed into the board pipeline.
     *<P>
     * The arrays {@link #landHexType}, {@link #landHexCoord} are parallel and in file order.
     * {@link #landHexNumber} is the compacted dice-number array (only non-desert/water hexes, in file order),
     * matching the contract of {@link SOCBoardAtServer}'s {@code makeNewBoard_placeHexes} {@code number[]} parameter.
     * @since 2.7.00
     */
    public static class ParsedCustomMap
    {
        /** Registered scenario key, such as {@code "SC_XISLE"}. */
        public final String scenarioKey;

        /** Display name. */
        public final String name;

        /** Description, or {@code null}. */
        public final String description;

        /** Supported player counts. */
        public final int[] playerCounts;

        /** If true, shuffle hex types and dice numbers when generating the board. */
        public final boolean shuffle;

        /** Land hex resource types (parallel to {@link #landHexCoord}), values like {@link soc.game.SOCBoard#CLAY_HEX}. */
        public final int[] landHexType;

        /** Land hex coordinates (parallel to {@link #landHexType}), each 0xRRCC. */
        public final int[] landHexCoord;

        /**
         * Compacted dice numbers for non-desert/non-water hexes, in file order; same contract as
         * {@code SOCBoardAtServer.makeNewBoard_placeHexes}'s {@code number[]}.
         */
        public final int[] landHexNumber;

        /**
         * Land-area path ranges (landArea, count, landArea, count, ...) covering all of {@link #landHexCoord},
         * as required by {@code makeNewBoard_placeHexes}'s {@code landAreaPathRanges[]}.
         */
        public final int[] landAreaPathRanges;

        /** Highest land area number used (for sizing {@code landAreasLegalNodes}). */
        public final int maxLandAreaNumber;

        /** Port types (parallel to {@link #portEdgeFacing} pairs), or {@code null} if none. */
        public final int[] portType;

        /** Port edge+facing pairs (edge, facing, edge, facing, ...), or {@code null} if none. */
        public final int[] portEdgeFacing;

        /** Robber starting hex coordinate, or 0 for none. */
        public final int robberHex;

        /** Pirate starting hex coordinate, or 0 for none. */
        public final int pirateHex;

        /**
         * Create a parsed custom map.  Called only by {@link CustomMapValidator}; all arguments are
         * assumed already validated.
         */
        ParsedCustomMap
            (final String scenarioKey, final String name, final String description,
             final int[] playerCounts, final boolean shuffle,
             final int[] landHexType, final int[] landHexCoord, final int[] landHexNumber,
             final int[] landAreaPathRanges, final int maxLandAreaNumber,
             final int[] portType, final int[] portEdgeFacing,
             final int robberHex, final int pirateHex)
        {
            this.scenarioKey = scenarioKey;
            this.name = name;
            this.description = description;
            this.playerCounts = playerCounts;
            this.shuffle = shuffle;
            this.landHexType = landHexType;
            this.landHexCoord = landHexCoord;
            this.landHexNumber = landHexNumber;
            this.landAreaPathRanges = landAreaPathRanges;
            this.maxLandAreaNumber = maxLandAreaNumber;
            this.portType = portType;
            this.portEdgeFacing = portEdgeFacing;
            this.robberHex = robberHex;
            this.pirateHex = pirateHex;
        }

        /**
         * Is the given max-player count supported by this map?
         * @param maxPl  Maximum players (2, 3, 4, or 6)
         * @return true if {@code maxPl} is in {@link #playerCounts}
         */
        public boolean supportsPlayerCount(final int maxPl)
        {
            for (final int pc : playerCounts)
                if (pc == maxPl)
                    return true;

            return false;
        }
    }

    /**
     * Thrown when a custom map file can't be parsed, fails validation, or otherwise can't be registered.
     * Caught and logged as a warning by {@link CustomMapLoader#loadAndRegisterAll(File)}.
     * @since 2.7.00
     */
    public static class CustomMapException extends Exception
    {
        private static final long serialVersionUID = 2700L;

        /**
         * Create an exception with a detail message.
         * @param msg  Detail message describing the problem
         */
        public CustomMapException(final String msg)
        {
            super(msg);
        }
    }

}
