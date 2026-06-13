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

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import soc.game.SOCBoard;
import soc.game.SOCBoardLarge;
import soc.server.CustomMapLoader.CustomMapException;
import soc.server.CustomMapLoader.CustomMapJson;
import soc.server.CustomMapLoader.HexJson;
import soc.server.CustomMapLoader.LandAreaJson;
import soc.server.CustomMapLoader.ParsedCustomMap;
import soc.server.CustomMapLoader.PortJson;

/**
 * Validates and parses a {@link CustomMapJson} into a {@link ParsedCustomMap} for {@link CustomMapLoader}
 * (standard rules only, v1).  All checks throw {@link CustomMapException} with an actionable message describing
 * the first problem found; {@code CustomMapLoader} logs that as a startup warning and skips the bad file.
 *<P>
 * <B>What is validated:</B>
 *<UL>
 *<LI> map name present; at least one supported player count, each in {2, 3, 4, 6}
 *<LI> at least one land hex; every land hex has a recognized type and a coordinate within large-board range
 *     and on a valid (odd) hex row
 *<LI> no duplicate land hex coordinates
 *<LI> dice numbers in 2..12 excluding 7; deserts and water have no dice number
 *<LI> ports: recognized type, recognized facing, edge within board range, no duplicate port edges,
 *     facing geometrically valid for the edge, and the port faces a declared non-water land hex
 *     (reuses the same facing-vs-edge geometry as built-in scenarios)
 *<LI> land-area ranges (if given) sum to the number of land hexes; land-area numbers are positive and unique
 *<LI> robber/pirate start hexes (if given) name a declared land hex
 *</UL>
 *<P>
 * <B>What is NOT validated</B> (documented in {@code doc/Custom-Maps.md}):
 *<UL>
 *<LI> playability/fairness (resource balance, reachability, that each player has a fair starting position)
 *<LI> that land hexes form connected islands, or that land areas are spatially contiguous
 *<LI> that 6s and 8s aren't adjacent (the board generator handles that only when {@code shuffle} is true)
 *<LI> that the number of land hexes is appropriate for the declared player counts
 *<LI> port edges being on the true coastline beyond the cheap facing-faces-land check
 *</UL>
 *
 * @since 2.7.00
 */
public class CustomMapValidator
{
    /**
     * Default board height for legacy custom maps which don't specify a size.
     * This is the 6-player fallback board size; see {@link SOCBoardAtServer}.
     */
    private static final int DEFAULT_BOARD_HEIGHT = 0x16;

    /**
     * Default board width for legacy custom maps which don't specify a size.
     * This is the 6-player fallback board size; see {@link SOCBoardAtServer}.
     */
    private static final int DEFAULT_BOARD_WIDTH = 0x17;

    /** Minimum custom board height accepted by the loader. */
    private static final int MIN_BOARD_HEIGHT = 0x08;

    /** Minimum custom board width accepted by the loader. */
    private static final int MIN_BOARD_WIDTH = 0x09;

    /** Maximum custom board height accepted by the loader. */
    private static final int MAX_BOARD_HEIGHT = DEFAULT_BOARD_HEIGHT;

    /** Maximum custom board width accepted by the loader. */
    private static final int MAX_BOARD_WIDTH = DEFAULT_BOARD_WIDTH;

    /**
     * Validate a raw custom map and build its parsed integer arrays.
     *
     * @param raw  Raw deserialized map; not null
     * @param scenarioKey  Scenario key derived for this map, such as {@code "SC_XISLE"}
     * @return the validated, parsed custom map
     * @throws CustomMapException describing the first validation problem found
     */
    public static ParsedCustomMap validateAndParse(final CustomMapJson raw, final String scenarioKey)
        throws CustomMapException
    {
        // - name
        if ((raw.name == null) || raw.name.trim().isEmpty())
            throw new CustomMapException("missing required field \"name\"");
        final String name = raw.name.trim();
        if (name.indexOf('|') >= 0 || name.indexOf(',') >= 0)
            throw new CustomMapException("\"name\" must not contain '|' or ',' characters");
        if (hasControlChar(name))
            throw new CustomMapException("\"name\" must not contain control or newline characters");

        // - description (optional); shown as the scenario's long description, which allows ',' but not '|'
        final String description = (raw.description != null) ? raw.description.trim() : null;
        if (description != null)
        {
            if (description.indexOf('|') >= 0)
                throw new CustomMapException("\"description\" must not contain '|' characters");
            if (hasControlChar(description))
                throw new CustomMapException("\"description\" must not contain control or newline characters");
        }

        // - player counts
        if ((raw.playerCounts == null) || (raw.playerCounts.length == 0))
            throw new CustomMapException("missing required field \"playerCounts\"");
        for (final int pc : raw.playerCounts)
            if ((pc != 2) && (pc != 3) && (pc != 4) && (pc != 6))
                throw new CustomMapException
                    ("\"playerCounts\" entry " + pc + " unsupported; must be 2, 3, 4, or 6");

        // - board size
        final int boardHeight = parseBoardDimension
            (raw.boardHeight, "boardHeight", MIN_BOARD_HEIGHT, MAX_BOARD_HEIGHT, DEFAULT_BOARD_HEIGHT);
        final int boardWidth = parseBoardDimension
            (raw.boardWidth, "boardWidth", MIN_BOARD_WIDTH, MAX_BOARD_WIDTH, DEFAULT_BOARD_WIDTH);

        // - land hexes
        if ((raw.landHexes == null) || (raw.landHexes.length == 0))
            throw new CustomMapException("missing required field \"landHexes\"");

        final int nHex = raw.landHexes.length;
        final int[] landHexType = new int[nHex];
        final int[] landHexCoord = new int[nHex];
        final List<Integer> numberList = new ArrayList<Integer>();
        final Set<Integer> seenCoords = new HashSet<Integer>();
        final Set<Integer> seenNonWaterCoords = new HashSet<Integer>();
            // subset of seenCoords for checkPortFacesLand: ports must face an actual land hex, not declared water

        for (int i = 0; i < nHex; ++i)
        {
            final HexJson h = raw.landHexes[i];
            if (h == null)
                throw new CustomMapException("landHexes[" + i + "] is null");

            final int type = parseHexType(h.type, i);
            final int coord = parseCoord(h.coord, "landHexes[" + i + "].coord");
            checkHexCoordInRange(coord, "landHexes[" + i + "].coord", boardHeight, boardWidth);

            if (! seenCoords.add(Integer.valueOf(coord)))
                throw new CustomMapException
                    ("duplicate hex coordinate 0x" + Integer.toHexString(coord)
                     + " at landHexes[" + i + "]");
            if (type != SOCBoard.WATER_HEX)
                seenNonWaterCoords.add(Integer.valueOf(coord));

            landHexType[i] = type;
            landHexCoord[i] = coord;

            final boolean hasNumberSlot =
                (type != SOCBoard.DESERT_HEX) && (type != SOCBoard.WATER_HEX);

            if (hasNumberSlot)
            {
                if (h.diceNum != 0)
                {
                    if ((h.diceNum < 2) || (h.diceNum > 12) || (h.diceNum == 7))
                        throw new CustomMapException
                            ("landHexes[" + i + "].diceNum " + h.diceNum + " out of range; must be 2..12 except 7");
                    numberList.add(Integer.valueOf(h.diceNum));
                }
                else
                {
                    // 0 = no number on this resource hex (allowed; placed as 0)
                    numberList.add(Integer.valueOf(0));
                }
            }
            else if (h.diceNum != 0)
            {
                throw new CustomMapException
                    ("landHexes[" + i + "] is " + h.type + " but has diceNum " + h.diceNum
                     + "; deserts and water must have no dice number");
            }
        }

        final int[] landHexNumber = new int[numberList.size()];
        for (int i = 0; i < landHexNumber.length; ++i)
            landHexNumber[i] = numberList.get(i).intValue();

        // - land areas
        final int[] landAreaPathRanges;
        final int maxLandArea;
        if ((raw.landAreas == null) || (raw.landAreas.length == 0))
        {
            landAreaPathRanges = new int[]{ 1, nHex };  // single land area 1 covering all hexes
            maxLandArea = 1;
        }
        else
        {
            landAreaPathRanges = new int[2 * raw.landAreas.length];
            final Set<Integer> seenAreas = new HashSet<Integer>();
            int total = 0, maxA = 0;
            for (int i = 0; i < raw.landAreas.length; ++i)
            {
                final LandAreaJson la = raw.landAreas[i];
                if (la == null)
                    throw new CustomMapException("landAreas[" + i + "] is null");
                if (la.area < 1)
                    throw new CustomMapException("landAreas[" + i + "].area " + la.area + " must be >= 1");
                if (! seenAreas.add(Integer.valueOf(la.area)))
                    throw new CustomMapException("duplicate land area number " + la.area);
                if (la.count < 1)
                    throw new CustomMapException("landAreas[" + i + "].count " + la.count + " must be >= 1");

                landAreaPathRanges[2 * i] = la.area;
                landAreaPathRanges[(2 * i) + 1] = la.count;
                total += la.count;
                if (la.area > maxA)
                    maxA = la.area;
            }
            if (total != nHex)
                throw new CustomMapException
                    ("landAreas counts sum to " + total + " but there are " + nHex + " landHexes");
            if (! seenAreas.contains(Integer.valueOf(1)))
                throw new CustomMapException
                    ("landAreas must include area 1 (players' starting land area)");
            // Area numbers must be contiguous 1..maxA, or board generation will fail at game start
            // because landAreasLegalNodes would have an unpopulated (null) index.
            for (int a = 1; a <= maxA; ++a)
                if (! seenAreas.contains(Integer.valueOf(a)))
                    throw new CustomMapException
                        ("landAreas numbers must be contiguous starting at 1; missing area " + a);
            maxLandArea = maxA;
        }

        // - robber/pirate start hexes (optional)
        final int robberHex = parseOptionalDeclaredHex(raw.robberHex, "robberHex", seenCoords);
        final int pirateHex = parseOptionalDeclaredHex(raw.pirateHex, "pirateHex", seenCoords);

        // - ports
        final int[] portType, portEdgeFacing;
        if ((raw.ports == null) || (raw.ports.length == 0))
        {
            portType = null;
            portEdgeFacing = null;
        }
        else
        {
            final int nPort = raw.ports.length;
            portType = new int[nPort];
            portEdgeFacing = new int[2 * nPort];
            final Set<Integer> seenEdges = new HashSet<Integer>();
            for (int i = 0; i < nPort; ++i)
            {
                final PortJson p = raw.ports[i];
                if (p == null)
                    throw new CustomMapException("ports[" + i + "] is null");

                final int ptype = parsePortType(p.type, i);
                final int edge = parseCoord(p.edge, "ports[" + i + "].edge");
                checkEdgeCoordInRange(edge, "ports[" + i + "].edge", boardHeight, boardWidth);
                if (! seenEdges.add(Integer.valueOf(edge)))
                    throw new CustomMapException
                        ("duplicate port edge 0x" + Integer.toHexString(edge) + " at ports[" + i + "]");
                final int facing = parseFacing(p.facing, i);
                checkPortFacingGeometry(edge, facing, i);
                checkPortFacesLand(edge, facing, seenNonWaterCoords, i, boardHeight, boardWidth);

                portType[i] = ptype;
                portEdgeFacing[2 * i] = edge;
                portEdgeFacing[(2 * i) + 1] = facing;
            }
        }

        return new ParsedCustomMap
             (scenarioKey, name, ((description != null) && ! description.isEmpty()) ? description : null,
             raw.playerCounts.clone(), raw.shuffle, boardHeight, boardWidth,
             landHexType, landHexCoord, landHexNumber,
             landAreaPathRanges, maxLandArea,
             portType, portEdgeFacing, robberHex, pirateHex);
    }

    /**
     * Does the string contain an ISO control character (such as a newline)?
     * Used to keep map names/descriptions single-line and safe for network messages,
     * matching {@code SOCMessage.isSingleLineAndSafe}.
     * @param s  String to check; not null
     * @return true if any character is an ISO control character
     */
    private static boolean hasControlChar(final String s)
    {
        for (int i = 0; i < s.length(); ++i)
            if (Character.isISOControl(s.charAt(i)))
                return true;

        return false;
    }

    /**
     * Parse an optional board dimension. Missing values use the legacy fallback size.
     * @param value  Optional dimension value from JSON
     * @param fieldName  Field name for error messages
     * @param min  Minimum accepted value
     * @param max  Maximum accepted value
     * @param defaultValue  Default when {@code value} is null
     * @return the parsed dimension
     * @throws CustomMapException if the value is out of range
     */
    private static int parseBoardDimension
        (final Integer value, final String fieldName, final int min, final int max, final int defaultValue)
        throws CustomMapException
    {
        if (value == null)
            return defaultValue;   // <--- Early return: legacy map without size fields ---

        final int v = value.intValue();
        if ((v < min) || (v > max))
            throw new CustomMapException
                ("\"" + fieldName + "\" " + v + " out of range; must be " + min + ".." + max);

        return v;
    }

    /**
     * Parse a hex resource-type name into a {@link SOCBoard} hex-type constant.
     * @param typeName  Type name such as {@code "clay"} or {@code "gold"}; case-insensitive
     * @param idx  landHexes index, for the error message
     * @return the hex-type constant
     * @throws CustomMapException if {@code typeName} is null or unrecognized
     */
    private static int parseHexType(final String typeName, final int idx)
        throws CustomMapException
    {
        if (typeName == null)
            throw new CustomMapException("landHexes[" + idx + "] missing \"type\"");

        switch (typeName.toLowerCase(Locale.US))
        {
        case "clay":   return SOCBoard.CLAY_HEX;
        case "ore":    return SOCBoard.ORE_HEX;
        case "sheep":  return SOCBoard.SHEEP_HEX;
        case "wheat":  return SOCBoard.WHEAT_HEX;
        case "wood":   return SOCBoard.WOOD_HEX;
        case "desert": return SOCBoard.DESERT_HEX;
        case "gold":   return SOCBoardLarge.GOLD_HEX;
        case "water":  return SOCBoard.WATER_HEX;
        default:
            throw new CustomMapException
                ("landHexes[" + idx + "] unknown type \"" + typeName
                 + "\"; use clay/ore/sheep/wheat/wood/desert/gold/water");
        }
    }

    /**
     * Parse a port-type name into a {@link SOCBoard} port-type constant.
     * @param typeName  Type name such as {@code "misc"} or {@code "wheat"}; case-insensitive
     * @param idx  ports index, for the error message
     * @return the port-type constant
     * @throws CustomMapException if {@code typeName} is null or unrecognized
     */
    private static int parsePortType(final String typeName, final int idx)
        throws CustomMapException
    {
        if (typeName == null)
            throw new CustomMapException("ports[" + idx + "] missing \"type\"");

        switch (typeName.toLowerCase(Locale.US))
        {
        case "misc":  case "3:1":  return SOCBoard.MISC_PORT;
        case "clay":  return SOCBoard.CLAY_PORT;
        case "ore":   return SOCBoard.ORE_PORT;
        case "sheep": return SOCBoard.SHEEP_PORT;
        case "wheat": return SOCBoard.WHEAT_PORT;
        case "wood":  return SOCBoard.WOOD_PORT;
        default:
            throw new CustomMapException
                ("ports[" + idx + "] unknown type \"" + typeName
                 + "\"; use misc/clay/ore/sheep/wheat/wood");
        }
    }

    /**
     * Parse a facing-direction name into a {@link SOCBoard} {@code FACING_*} constant.
     * @param facingName  Facing such as {@code "NE"} or {@code "SW"}; case-insensitive
     * @param idx  ports index, for the error message
     * @return the FACING_ constant (1..6)
     * @throws CustomMapException if {@code facingName} is null or unrecognized
     */
    private static int parseFacing(final String facingName, final int idx)
        throws CustomMapException
    {
        if (facingName == null)
            throw new CustomMapException("ports[" + idx + "] missing \"facing\"");

        switch (facingName.toUpperCase(Locale.US))
        {
        case "NE": return SOCBoard.FACING_NE;
        case "E":  return SOCBoard.FACING_E;
        case "SE": return SOCBoard.FACING_SE;
        case "SW": return SOCBoard.FACING_SW;
        case "W":  return SOCBoard.FACING_W;
        case "NW": return SOCBoard.FACING_NW;
        default:
            throw new CustomMapException
                ("ports[" + idx + "] unknown facing \"" + facingName + "\"; use NE/E/SE/SW/W/NW");
        }
    }

    /**
     * Parse a coordinate string such as {@code "0x0504"} or {@code "1284"} into an int (0xRRCC).
     * Accepts an optional {@code 0x} prefix; always interpreted as hexadecimal.
     * @param s  Coordinate string; not null
     * @param fieldName  Field name for the error message
     * @return the parsed integer coordinate
     * @throws CustomMapException if {@code s} is null/blank or isn't valid hex
     */
    private static int parseCoord(final String s, final String fieldName)
        throws CustomMapException
    {
        if ((s == null) || s.trim().isEmpty())
            throw new CustomMapException("missing coordinate \"" + fieldName + "\"");

        String t = s.trim();
        if (t.length() > 2 && (t.charAt(0) == '0') && ((t.charAt(1) == 'x') || (t.charAt(1) == 'X')))
            t = t.substring(2);

        try
        {
            final int v = Integer.parseInt(t, 16);
            if (v < 0)
                throw new CustomMapException(fieldName + " \"" + s + "\" must not be negative");
            return v;
        }
        catch (NumberFormatException e) {
            throw new CustomMapException
                (fieldName + " \"" + s + "\" isn't a valid hex coordinate (example: \"0x0504\")");
        }
    }

    /**
     * Check that a hex coordinate is within the map's large-board range and on a valid (odd) hex row.
     * @param coord  Hex coordinate 0xRRCC
     * @param fieldName  Field name for the error message
     * @param boardHeight  Board height in coordinate units
     * @param boardWidth  Board width in coordinate units
     * @throws CustomMapException if out of range or on an even row
     */
    private static void checkHexCoordInRange
        (final int coord, final String fieldName, final int boardHeight, final int boardWidth)
        throws CustomMapException
    {
        final int r = coord >> 8, c = coord & 0xFF;
        final int maxRow = boardHeight - 1, maxCol = boardWidth - 1;
        if ((r < 1) || (r > maxRow) || (c < 1) || (c > maxCol))
            throw new CustomMapException
                (fieldName + " 0x" + Integer.toHexString(coord)
                 + " is out of board range (row 1.." + maxRow + ", col 1.." + maxCol + ")");
        if ((r % 2) == 0)
            throw new CustomMapException
                (fieldName + " 0x" + Integer.toHexString(coord)
                 + " is on an even row; land hexes must be on odd rows");
    }

    /**
     * Check that an edge coordinate is within the large board's range.
     * Edges can be on odd or even rows, so row parity isn't checked here.
     * @param coord  Edge coordinate 0xRRCC
     * @param fieldName  Field name for the error message
     * @param boardHeight  Board height in coordinate units
     * @param boardWidth  Board width in coordinate units
     * @throws CustomMapException if out of range
     */
    private static void checkEdgeCoordInRange
        (final int coord, final String fieldName, final int boardHeight, final int boardWidth)
        throws CustomMapException
    {
        final int r = coord >> 8, c = coord & 0xFF;
        final int maxRow = boardHeight - 1, maxCol = boardWidth - 1;
        if ((r < 0) || (r > maxRow) || (c < 0) || (c > maxCol))
            throw new CustomMapException
                (fieldName + " 0x" + Integer.toHexString(coord)
                 + " is out of board range (row 0.." + maxRow + ", col 0.." + maxCol + ")");
    }

    /**
     * Check a port's facing direction is geometrically valid for its edge type.
     * Mirrors the per-edge facing rules in {@code SOCBoardAtServer.makeNewBoard_checkPortLocationsConsistent}
     * (and {@link SOCBoardLarge}'s edge geometry): {@code |} edges face E/W, {@code /} edges face NW/SE,
     * {@code \} edges face NE/SW.
     * @param edge  Edge coordinate 0xRRCC
     * @param facing  FACING_ constant
     * @param idx  ports index, for the error message
     * @throws CustomMapException if the facing isn't valid for this edge
     */
    private static void checkPortFacingGeometry(final int edge, final int facing, final int idx)
        throws CustomMapException
    {
        final int r = edge >> 8, c = edge & 0xFF;
        String err = null;

        if ((r % 2) == 1)
        {
            // "|" vertical edge if r is odd
            if ((facing != SOCBoard.FACING_E) && (facing != SOCBoard.FACING_W))
                err = "E or W";
        }
        else if ((c % 2) != ((r / 2) % 2))
        {
            // "/" edge
            if ((facing != SOCBoard.FACING_NW) && (facing != SOCBoard.FACING_SE))
                err = "NW or SE";
        }
        else
        {
            // "\" edge
            if ((facing != SOCBoard.FACING_NE) && (facing != SOCBoard.FACING_SW))
                err = "NE or SW";
        }

        if (err != null)
            throw new CustomMapException
                ("ports[" + idx + "] edge 0x" + Integer.toHexString(edge)
                 + " facing should be " + err + " for this edge");
    }

    /**
     * Check that a port faces a declared land hex (cheap coastal-adjacency check).
     * The land hex in the facing direction is computed from the edge coordinate using the same
     * geometry as {@link SOCBoardLarge}; that hex must be one of the map's declared land hexes
     * with a non-water type.
     * @param edge  Edge coordinate 0xRRCC
     * @param facing  FACING_ constant (already validated by {@link #checkPortFacingGeometry(int, int, int)})
     * @param declaredNonWaterCoords  Set of declared land hex coordinates whose type isn't water
     * @param idx  ports index, for the error message
     * @param boardHeight  Board height in coordinate units
     * @param boardWidth  Board width in coordinate units
     * @throws CustomMapException if the faced hex isn't a declared non-water land hex
     */
    private static void checkPortFacesLand
        (final int edge, final int facing, final Set<Integer> declaredNonWaterCoords, final int idx,
         final int boardHeight, final int boardWidth)
        throws CustomMapException
    {
        final int landHex = adjacentHexToEdge(edge, facing, boardHeight, boardWidth);
        if ((landHex == 0) || ! declaredNonWaterCoords.contains(Integer.valueOf(landHex)))
            throw new CustomMapException
                ("ports[" + idx + "] edge 0x" + Integer.toHexString(edge)
                 + " facing " + facing + " doesn't face a declared non-water land hex"
                 + " (computed hex 0x" + Integer.toHexString(landHex) + ")");
    }

    /**
     * Compute the hex coordinate adjacent to an edge in a given facing direction.
     * Standalone copy of {@link SOCBoardLarge#getAdjacentHexToEdge(int, int)}'s edge-to-hex geometry,
     * so validation doesn't need a board instance.  Edge type ({@code |}, {@code /}, {@code \}) is determined
     * by row parity and column parity, exactly as in {@code SOCBoardLarge}.
     * @param edgeCoord  Edge coordinate 0xRRCC
     * @param facing  FACING_ direction (1..6), already validated
     * @param boardHeight  Board height in coordinate units
     * @param boardWidth  Board width in coordinate units
     * @return adjacent hex coordinate 0xRRCC, or 0 if none in that direction (off the validated coordinate range)
     */
    private static int adjacentHexToEdge
        (final int edgeCoord, final int facing, final int boardHeight, final int boardWidth)
    {
        int r = (edgeCoord >> 8), c = (edgeCoord & 0xFF);

        // "|" if r is odd
        if ((r % 2) == 1)
        {
            switch (facing)
            {
            case SOCBoard.FACING_E:
                ++c;
                break;
            case SOCBoard.FACING_W:
                --c;
                break;
            case SOCBoard.FACING_NE: case SOCBoard.FACING_NW:
                r = r - 2;
                break;
            case SOCBoard.FACING_SE: case SOCBoard.FACING_SW:
                r = r + 2;
                break;
            }
        }
        // "/" if (r/2,c) is even,odd or odd,even
        else if ((c % 2) != ((r / 2) % 2))
        {
            switch (facing)
            {
            case SOCBoard.FACING_NW:
                --r;
                break;
            case SOCBoard.FACING_SE:
                ++r;
                ++c;
                break;
            case SOCBoard.FACING_NE: case SOCBoard.FACING_E:
                --r;
                c = c + 2;
                break;
            case SOCBoard.FACING_SW: case SOCBoard.FACING_W:
                ++r;
                --c;
                break;
            }
        }
        else
        {
            // "\" if (r/2,c) is odd,odd or even,even
            switch (facing)
            {
            case SOCBoard.FACING_NE:
                --r;
                ++c;
                break;
            case SOCBoard.FACING_SW:
                ++r;
                break;
            case SOCBoard.FACING_E: case SOCBoard.FACING_SE:
                ++r;
                c = c + 2;
                break;
            case SOCBoard.FACING_W: case SOCBoard.FACING_NW:
                --r;
                --c;
                break;
            }
        }

        if ((r > 0) && (c > 0) && (r < boardHeight) && (c < boardWidth))
            return (r << 8) | c;
        else
            return 0;
    }

    /**
     * Parse an optional robber/pirate hex string, requiring (if present) that it name a declared land hex.
     * @param s  Coordinate string, or null/blank for none
     * @param fieldName  Field name for error messages
     * @param declaredCoords  Set of declared land hex coordinates
     * @return the parsed coordinate, or 0 if {@code s} is null/blank
     * @throws CustomMapException if present but not a valid declared hex coordinate
     */
    private static int parseOptionalDeclaredHex
        (final String s, final String fieldName, final Set<Integer> declaredCoords)
        throws CustomMapException
    {
        if ((s == null) || s.trim().isEmpty())
            return 0;  // <--- Early return: optional field absent ---

        final int coord = parseCoord(s, fieldName);
        if (! declaredCoords.contains(Integer.valueOf(coord)))
            throw new CustomMapException
                (fieldName + " 0x" + Integer.toHexString(coord) + " isn't one of the declared land hexes");

        return coord;
    }

}
