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
package soctest.server;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.io.Writer;

import soc.game.SOCBoard;
import soc.game.SOCScenario;
import soc.server.CustomMapLoader;
import soc.server.CustomMapLoader.CustomMapException;
import soc.server.CustomMapLoader.ParsedCustomMap;

import org.junit.After;
import org.junit.Test;
import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * Tests for {@link CustomMapLoader} and {@link soc.server.CustomMapValidator}:
 * parse success, each validation failure mode, and scenario registration (key prefix, no shadowing).
 * @since 2.7.00
 */
public class TestCustomMapLoader
{
    /** A complete, valid map JSON, mirroring the shipped {@code sample-island.map.json}. */
    private static final String VALID_MAP_JSON =
        "{\n"
        + "  \"name\": \"Sample Two Islands\",\n"
        + "  \"description\": \"Two-island variant for tests.\",\n"
        + "  \"playerCounts\": [3, 4],\n"
        + "  \"shuffle\": false,\n"
        + "  \"landHexes\": [\n"
        + "    { \"type\": \"clay\",  \"coord\": \"0x0309\", \"diceNum\": 5,  \"landArea\": 1 },\n"
        + "    { \"type\": \"ore\",   \"coord\": \"0x030B\", \"diceNum\": 6,  \"landArea\": 1 },\n"
        + "    { \"type\": \"sheep\", \"coord\": \"0x0508\", \"diceNum\": 8,  \"landArea\": 1 },\n"
        + "    { \"type\": \"wheat\", \"coord\": \"0x050A\", \"diceNum\": 4,  \"landArea\": 1 },\n"
        + "    { \"type\": \"wood\",  \"coord\": \"0x050C\", \"diceNum\": 9,  \"landArea\": 1 },\n"
        + "    { \"type\": \"clay\",  \"coord\": \"0x0709\", \"diceNum\": 10, \"landArea\": 1 },\n"
        + "    { \"type\": \"sheep\", \"coord\": \"0x070B\", \"diceNum\": 3,  \"landArea\": 1 },\n"
        + "    { \"type\": \"wheat\", \"coord\": \"0x0908\", \"diceNum\": 11, \"landArea\": 1 },\n"
        + "    { \"type\": \"wood\",  \"coord\": \"0x0B0B\", \"diceNum\": 5,  \"landArea\": 2 },\n"
        + "    { \"type\": \"ore\",   \"coord\": \"0x0B0D\", \"diceNum\": 9,  \"landArea\": 2 },\n"
        + "    { \"type\": \"sheep\", \"coord\": \"0x0D0C\", \"diceNum\": 4,  \"landArea\": 2 },\n"
        + "    { \"type\": \"wheat\", \"coord\": \"0x0F0B\", \"diceNum\": 8,  \"landArea\": 2 }\n"
        + "  ],\n"
        + "  \"landAreas\": [\n"
        + "    { \"area\": 1, \"count\": 8 },\n"
        + "    { \"area\": 2, \"count\": 4 }\n"
        + "  ],\n"
        + "  \"ports\": [\n"
        + "    { \"type\": \"misc\",  \"edge\": \"0x0807\", \"facing\": \"SE\" },\n"
        + "    { \"type\": \"wood\",  \"edge\": \"0x060C\", \"facing\": \"NW\" },\n"
        + "    { \"type\": \"ore\",   \"edge\": \"0x0A0C\", \"facing\": \"SE\" },\n"
        + "    { \"type\": \"misc\",  \"edge\": \"0x0C0D\", \"facing\": \"NW\" }\n"
        + "  ],\n"
        + "  \"robberHex\": \"0x0709\",\n"
        + "  \"pirateHex\": \"0x0D0C\"\n"
        + "}\n";

    /** Clean up any custom scenarios registered during a test. */
    @After
    public void tearDown()
    {
        CustomMapLoader.clearLoadedMapsForTests();
    }

    /**
     * Write JSON content to a temp file ending in {@code .map.json}.
     * @param baseName  Base filename (without extension) for deriving the scenario key
     * @param json  File content
     * @return the temp file (deleted on JVM exit)
     */
    private static File writeTempMap(final String baseName, final String json)
        throws IOException
    {
        final File f = File.createTempFile(baseName + "-", CustomMapLoader.FILENAME_EXTENSION);
        f.deleteOnExit();
        try (Writer w = new OutputStreamWriter(new FileOutputStream(f), "UTF-8"))
        {
            w.write(json);
        }
        return f;
    }

    /**
     * Parse a temp map and expect a {@link CustomMapException} whose message contains {@code expectMsgFragment}.
     * @param json  Map JSON content
     * @param expectMsgFragment  Substring expected in the exception message, or null to just expect any failure
     */
    private static void expectValidationFailure(final String json, final String expectMsgFragment)
        throws IOException
    {
        final File f = writeTempMap("invalid", json);
        try
        {
            CustomMapLoader.parseAndValidateForTests(f);
            fail("Expected validation to fail"
                 + ((expectMsgFragment != null) ? " with message containing: " + expectMsgFragment : ""));
        }
        catch (CustomMapException e) {
            if ((expectMsgFragment != null) && ! e.getMessage().contains(expectMsgFragment))
                fail("Expected message containing \"" + expectMsgFragment + "\", got: " + e.getMessage());
        }
    }

    /**
     * The full sample map parses successfully into the expected arrays.
     */
    @Test
    public void testParseValidSampleMap()
        throws IOException, CustomMapException
    {
        final File f = writeTempMap("sample-island", VALID_MAP_JSON);
        final ParsedCustomMap pmap = CustomMapLoader.parseAndValidateForTests(f);

        assertNotNull(pmap);
        assertEquals("Sample Two Islands", pmap.name);
        assertEquals("Two-island variant for tests.", pmap.description);
        assertArrayEquals(new int[]{3, 4}, pmap.playerCounts);
        assertFalse(pmap.shuffle);

        assertEquals(12, pmap.landHexType.length);
        assertEquals(12, pmap.landHexCoord.length);
        assertEquals(SOCBoard.CLAY_HEX, pmap.landHexType[0]);
        assertEquals(0x0309, pmap.landHexCoord[0]);

        // 12 numbered hexes, no deserts/water: compacted array length 12
        assertEquals(12, pmap.landHexNumber.length);
        assertEquals(5, pmap.landHexNumber[0]);

        // 2 land areas of 8 and 4 hexes
        assertArrayEquals(new int[]{1, 8, 2, 4}, pmap.landAreaPathRanges);
        assertEquals(2, pmap.maxLandAreaNumber);

        assertEquals(4, pmap.portType.length);
        assertEquals(8, pmap.portEdgeFacing.length);
        assertEquals(SOCBoard.MISC_PORT, pmap.portType[0]);
        assertEquals(0x0807, pmap.portEdgeFacing[0]);
        assertEquals(SOCBoard.FACING_SE, pmap.portEdgeFacing[1]);

        assertEquals(0x0709, pmap.robberHex);
        assertEquals(0x0D0C, pmap.pirateHex);

        assertTrue(pmap.supportsPlayerCount(4));
        assertFalse(pmap.supportsPlayerCount(6));
    }

    /**
     * A desert hex contributes no entry to the compacted dice-number array.
     */
    @Test
    public void testDesertExcludedFromNumberArray()
        throws IOException, CustomMapException
    {
        final String json =
            "{ \"name\": \"Desert Test\", \"playerCounts\": [4], \"landHexes\": [\n"
            + "  { \"type\": \"clay\",   \"coord\": \"0x0309\", \"diceNum\": 5 },\n"
            + "  { \"type\": \"desert\", \"coord\": \"0x030B\" },\n"
            + "  { \"type\": \"wood\",   \"coord\": \"0x0508\", \"diceNum\": 9 } ] }";
        final File f = writeTempMap("desert", json);
        final ParsedCustomMap pmap = CustomMapLoader.parseAndValidateForTests(f);

        assertEquals(3, pmap.landHexType.length);
        assertEquals(SOCBoard.DESERT_HEX, pmap.landHexType[1]);
        // Only 2 non-desert hexes get number slots
        assertArrayEquals(new int[]{5, 9}, pmap.landHexNumber);
    }

    /** Missing required "name" fails. */
    @Test
    public void testMissingName()
        throws IOException
    {
        expectValidationFailure
            ("{ \"playerCounts\": [4], \"landHexes\": [ { \"type\": \"clay\", \"coord\": \"0x0309\", \"diceNum\": 5 } ] }",
             "name");
    }

    /** Missing/empty playerCounts fails. */
    @Test
    public void testMissingPlayerCounts()
        throws IOException
    {
        expectValidationFailure
            ("{ \"name\": \"x\", \"landHexes\": [ { \"type\": \"clay\", \"coord\": \"0x0309\", \"diceNum\": 5 } ] }",
             "playerCounts");
    }

    /** Unsupported player count fails. */
    @Test
    public void testUnsupportedPlayerCount()
        throws IOException
    {
        expectValidationFailure
            ("{ \"name\": \"x\", \"playerCounts\": [5], \"landHexes\": [ { \"type\": \"clay\", \"coord\": \"0x0309\", \"diceNum\": 5 } ] }",
             "playerCounts");
    }

    /** Missing/empty landHexes fails. */
    @Test
    public void testMissingLandHexes()
        throws IOException
    {
        expectValidationFailure
            ("{ \"name\": \"x\", \"playerCounts\": [4], \"landHexes\": [] }",
             "landHexes");
    }

    /** Unknown hex type fails. */
    @Test
    public void testUnknownHexType()
        throws IOException
    {
        expectValidationFailure
            ("{ \"name\": \"x\", \"playerCounts\": [4], \"landHexes\": [ { \"type\": \"diamond\", \"coord\": \"0x0309\", \"diceNum\": 5 } ] }",
             "unknown type");
    }

    /** Duplicate hex coordinate fails. */
    @Test
    public void testDuplicateHexCoord()
        throws IOException
    {
        expectValidationFailure
            ("{ \"name\": \"x\", \"playerCounts\": [4], \"landHexes\": [\n"
             + "  { \"type\": \"clay\", \"coord\": \"0x0309\", \"diceNum\": 5 },\n"
             + "  { \"type\": \"wood\", \"coord\": \"0x0309\", \"diceNum\": 9 } ] }",
             "duplicate");
    }

    /** Hex on an even (invalid) row fails. */
    @Test
    public void testHexOnEvenRow()
        throws IOException
    {
        expectValidationFailure
            ("{ \"name\": \"x\", \"playerCounts\": [4], \"landHexes\": [ { \"type\": \"clay\", \"coord\": \"0x0409\", \"diceNum\": 5 } ] }",
             "even row");
    }

    /** Hex coordinate out of board range fails. */
    @Test
    public void testHexOutOfRange()
        throws IOException
    {
        expectValidationFailure
            ("{ \"name\": \"x\", \"playerCounts\": [4], \"landHexes\": [ { \"type\": \"clay\", \"coord\": \"0x6309\", \"diceNum\": 5 } ] }",
             "out of board range");
    }

    /** Dice number out of range (e.g. 7 or 13) fails. */
    @Test
    public void testBadDiceNumber()
        throws IOException
    {
        expectValidationFailure
            ("{ \"name\": \"x\", \"playerCounts\": [4], \"landHexes\": [ { \"type\": \"clay\", \"coord\": \"0x0309\", \"diceNum\": 7 } ] }",
             "diceNum");
        expectValidationFailure
            ("{ \"name\": \"x\", \"playerCounts\": [4], \"landHexes\": [ { \"type\": \"clay\", \"coord\": \"0x0309\", \"diceNum\": 13 } ] }",
             "diceNum");
    }

    /** A desert with a dice number fails. */
    @Test
    public void testDesertWithDiceNumber()
        throws IOException
    {
        expectValidationFailure
            ("{ \"name\": \"x\", \"playerCounts\": [4], \"landHexes\": [ { \"type\": \"desert\", \"coord\": \"0x0309\", \"diceNum\": 5 } ] }",
             "no dice number");
    }

    /** Land-area counts not summing to landHexes count fails. */
    @Test
    public void testLandAreaCountMismatch()
        throws IOException
    {
        expectValidationFailure
            ("{ \"name\": \"x\", \"playerCounts\": [4], \"landHexes\": [\n"
             + "  { \"type\": \"clay\", \"coord\": \"0x0309\", \"diceNum\": 5 },\n"
             + "  { \"type\": \"wood\", \"coord\": \"0x030B\", \"diceNum\": 9 } ],\n"
             + "  \"landAreas\": [ { \"area\": 1, \"count\": 5 } ] }",
             "landAreas");
    }

    /** Port facing that's geometrically invalid for its edge fails. */
    @Test
    public void testPortBadFacingGeometry()
        throws IOException
    {
        // edge 0x0807 is a "/" edge needing NW or SE; "E" is invalid
        expectValidationFailure
            ("{ \"name\": \"x\", \"playerCounts\": [4], \"landHexes\": [\n"
             + "  { \"type\": \"clay\", \"coord\": \"0x0908\", \"diceNum\": 5 } ],\n"
             + "  \"ports\": [ { \"type\": \"misc\", \"edge\": \"0x0807\", \"facing\": \"E\" } ] }",
             "facing should be");
    }

    /** Port that faces water (no declared land hex) fails. */
    @Test
    public void testPortFacesNoLand()
        throws IOException
    {
        // edge 0x0807 facing SE points at hex 0x0908, which is NOT declared as land here
        expectValidationFailure
            ("{ \"name\": \"x\", \"playerCounts\": [4], \"landHexes\": [\n"
             + "  { \"type\": \"clay\", \"coord\": \"0x0309\", \"diceNum\": 5 } ],\n"
             + "  \"ports\": [ { \"type\": \"misc\", \"edge\": \"0x0807\", \"facing\": \"SE\" } ] }",
             "doesn't face a declared land hex");
    }

    /** Robber hex that isn't a declared land hex fails. */
    @Test
    public void testRobberNotOnLand()
        throws IOException
    {
        expectValidationFailure
            ("{ \"name\": \"x\", \"playerCounts\": [4], \"landHexes\": [\n"
             + "  { \"type\": \"clay\", \"coord\": \"0x0309\", \"diceNum\": 5 } ],\n"
             + "  \"robberHex\": \"0x0508\" }",
             "isn't one of the declared land hexes");
    }

    /** Malformed JSON fails with a parse error, not a crash. */
    @Test
    public void testMalformedJson()
        throws IOException
    {
        expectValidationFailure("{ \"name\": \"x\", \"playerCounts\": [4, }}} not json", null);
    }

    /**
     * Scenario key derivation uses the reserved prefix and stays within the 8-char limit.
     */
    @Test
    public void testDeriveScenarioKey()
        throws CustomMapException
    {
        assertEquals("SC_XSAMP", CustomMapLoader.deriveScenarioKey("sample-island.map.json"));
        assertEquals("SC_XISLE", CustomMapLoader.deriveScenarioKey("isle.map.json"));
        assertEquals("SC_XAB12", CustomMapLoader.deriveScenarioKey("a-b_1_2_3.map.json"));
        // dashes/underscores skipped; only alphanumerics kept
        assertEquals("SC_XMAP", CustomMapLoader.deriveScenarioKey("map.map.json"));

        final String key = CustomMapLoader.deriveScenarioKey("verylongmapname.map.json");
        assertTrue("derived key must start with reserved prefix",
            key.startsWith(SOCScenario.CUSTOM_SCENARIO_KEY_PREFIX));
        assertTrue("derived key must be <= 8 chars: " + key, key.length() <= 8);
    }

    /** A filename with no alphanumerics can't derive a key. */
    @Test
    public void testDeriveScenarioKeyNoAlnum()
    {
        try
        {
            CustomMapLoader.deriveScenarioKey("---.map.json");
            fail("Expected CustomMapException for filename with no alphanumerics");
        }
        catch (CustomMapException e) {
            // expected
        }
    }

    /**
     * Registering a custom map registers a scenario with the reserved prefix, retrievable by key,
     * and the same file can't be registered twice (no shadowing / no double-register).
     */
    @Test
    public void testRegisterCustomMap()
        throws IOException, CustomMapException
    {
        final File f = writeTempMap("isle", VALID_MAP_JSON);
        final ParsedCustomMap pmap = CustomMapLoader.loadAndRegisterOne(f);

        assertNotNull(pmap);
        assertTrue("scenario key must use reserved prefix",
            pmap.scenarioKey.startsWith(SOCScenario.CUSTOM_SCENARIO_KEY_PREFIX));
        assertTrue("scenario key must be <= 8 chars", pmap.scenarioKey.length() <= 8);

        // Registered and retrievable
        assertTrue(CustomMapLoader.isCustomMap(pmap.scenarioKey));
        assertNotNull(CustomMapLoader.getLoadedMap(pmap.scenarioKey));
        assertNotNull(SOCScenario.getScenario(pmap.scenarioKey));

        // Re-registering same key fails (collision detection)
        final File f2 = writeTempMap("isle", VALID_MAP_JSON);
        try
        {
            CustomMapLoader.loadAndRegisterOne(f2);
            fail("Expected collision when registering a second map with the same derived key");
        }
        catch (CustomMapException e) {
            // expected
        }
    }

    /**
     * A custom scenario key can never shadow a built-in scenario: built-in keys don't use the reserved prefix.
     */
    @Test
    public void testNoShadowingBuiltins()
    {
        for (final String builtinKey : SOCScenario.getAllKnownScenarioKeynames())
            assertFalse("built-in scenario key must not use reserved custom prefix: " + builtinKey,
                builtinKey.startsWith(SOCScenario.CUSTOM_SCENARIO_KEY_PREFIX));
    }

    /**
     * {@link CustomMapLoader#getLoadedMap(String)} returns null for unknown or null keys.
     */
    @Test
    public void testGetLoadedMapUnknown()
    {
        assertNull(CustomMapLoader.getLoadedMap(null));
        assertNull(CustomMapLoader.getLoadedMap("SC_XZZZ"));
        assertFalse(CustomMapLoader.isCustomMap(null));
    }
}
