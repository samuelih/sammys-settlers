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

package soctest.game;

import soc.game.SOCGame;
import soc.game.SOCGameOption;
import soc.game.SOCGameOptionSet;
import soc.game.SOCResourceConstants;
import soc.game.SOCResourceSet;
import soc.game.SOCScenario;
import soc.game.SOCSpecialItem;

import org.junit.Test;
import static org.junit.Assert.*;

/**
 * Tests for the Phase 0 Cities &amp; Knights groundwork: reserved inactive game options
 * ({@code _CK_*}), the disabled {@link SOCScenario#K_SC_CK SC_CK} scenario stub,
 * the {@link SOCSpecialItem} city-improvement track entries, and the
 * {@link SOCGame#getBarbarianStrength() barbarian strength} counter.
 *<P>
 * Nothing here changes normal-play behavior; the options are inactive-hidden and the
 * scenario can't be selected. See {@code doc/Cities-and-Knights-Design.md}.
 *
 * @since 2.7.00
 */
public class TestCKGroundwork
{
    /** The reserved Cities &amp; Knights option keys; all must be inactive-hidden groundwork. */
    private static final String[] CK_OPT_KEYS =
    {
        SOCGameOptionSet.K__CK_KNIGHTS, SOCGameOptionSet.K__CK_IMPROV, SOCGameOptionSet.K__CK_PROGRESS,
        SOCGameOptionSet.K__CK_BARBARIAN, SOCGameOptionSet.K__CK_METROPOLIS, SOCGameOptionSet.K_SC_CK
    };

    /**
     * (a) The reserved {@code _CK_*} options exist and are
     * {@link SOCGameOption#FLAG_INACTIVE_HIDDEN inactive-hidden},
     * {@link SOCGameOption#FLAG_DROP_IF_UNUSED drop-if-unused}, boolean, default false,
     * and use minVersion 2000 (matching the existing {@code _SC_*} scenario options).
     */
    @Test
    public void testReservedOptionsExist()
    {
        final SOCGameOptionSet knownOpts = SOCGameOptionSet.getAllKnownOptions();

        for (final String key : CK_OPT_KEYS)
        {
            final SOCGameOption opt = knownOpts.getKnownOption(key, false);
            assertNotNull("missing reserved option " + key, opt);
            assertEquals("option type for " + key, SOCGameOption.OTYPE_BOOL, opt.optType);
            assertFalse("default false for " + key, opt.getBoolValue());
            assertTrue("inactive-hidden for " + key, opt.hasFlag(SOCGameOption.FLAG_INACTIVE_HIDDEN));
            assertTrue("drop-if-unused for " + key, opt.hasFlag(SOCGameOption.FLAG_DROP_IF_UNUSED));
            assertFalse("not yet activated for " + key, opt.hasFlag(SOCGameOption.FLAG_ACTIVATED));
            assertEquals("minVersion for " + key, 2000, opt.minVersion);
            assertEquals("lastModVersion for " + key, 2700, opt.lastModVersion);
        }
    }

    /**
     * (b) Each reserved {@code _CK_*} option can be activated through the
     * {@link SOCGameOptionSet#activate(String)} API, after which it loses
     * {@link SOCGameOption#FLAG_INACTIVE_HIDDEN} and gains {@link SOCGameOption#FLAG_ACTIVATED}.
     */
    @Test
    public void testActivateReservedOptions()
    {
        final SOCGameOptionSet knownOpts = SOCGameOptionSet.getAllKnownOptions();

        for (final String key : CK_OPT_KEYS)
        {
            knownOpts.activate(key);
            final SOCGameOption opt = knownOpts.getKnownOption(key, false);
            assertNotNull("activated option " + key, opt);
            assertFalse("no longer inactive after activate: " + key,
                opt.hasFlag(SOCGameOption.FLAG_INACTIVE_HIDDEN));
            assertTrue("activated flag set for " + key, opt.hasFlag(SOCGameOption.FLAG_ACTIVATED));
        }
    }

    /**
     * The disabled {@link SOCScenario#K_SC_CK SC_CK} scenario stub exists, is gated at minVersion 2000,
     * has a description, and reserves only active base options (so it passes
     * {@code soctest.game.TestScenarioOpts}).
     */
    @Test
    public void testScenarioStubExists()
    {
        final SOCScenario sc = SOCScenario.getScenario(SOCScenario.K_SC_CK);
        assertNotNull("missing SC_CK scenario stub", sc);
        assertEquals("SC_CK minVersion", 2000, sc.minVersion);
        assertNotNull("SC_CK description", sc.getDesc());
        assertNotEquals("SC_CK description not empty", 0, sc.getDesc().length());
        // scOpts references only active base options (no inactive _CK_* opts in Phase 0)
        assertFalse("SC_CK scOpts must not reference inactive _CK_ options",
            sc.scOpts.contains("_CK_"));
        assertTrue("SC_CK scOpts should set VP=t13", sc.scOpts.contains("VP=t13"));
    }

    /**
     * (c) The Cities &amp; Knights improvement-track {@link SOCSpecialItem}s are retrievable from
     * {@link SOCSpecialItem#makeKnownItem(String, int)} for levels 1-5 with the expected per-level
     * interim costs, and return null cost past the defined levels and for unknown track keys.
     */
    @Test
    public void testImprovementItems()
    {
        final String[] trackKeys =
            { SOCSpecialItem.CK_IMPROV_TRADE, SOCSpecialItem.CK_IMPROV_POLITICS, SOCSpecialItem.CK_IMPROV_SCIENCE };
        // resource type whose count should equal the level, one per track (Trade=sheep, Politics=ore, Science=wheat)
        final int[] trackRsrc =
            { SOCResourceConstants.SHEEP, SOCResourceConstants.ORE, SOCResourceConstants.WHEAT };

        for (int t = 0; t < trackKeys.length; ++t)
        {
            final String typeKey = trackKeys[t];
            final int rtype = trackRsrc[t];

            for (int level = 1; level <= SOCSpecialItem.CK_IMPROV_MAX_LEVEL; ++level)
            {
                final SOCSpecialItem itm = SOCSpecialItem.makeKnownItem(typeKey, level);
                assertNotNull("item for " + typeKey + " level " + level, itm);
                assertEquals("initial level for " + typeKey, 0, itm.getLevel());
                assertNull("no requirements in Phase 0 for " + typeKey, itm.req);

                final SOCResourceSet cost = itm.getCost();
                assertNotNull("cost for " + typeKey + " level " + level, cost);
                assertEquals("cost total for " + typeKey + " level " + level, level, cost.getTotal());
                assertEquals("cost resource amount for " + typeKey + " level " + level,
                    level, cost.getAmount(rtype));
            }

            // past defined levels: null cost, like SC_WOND
            final SOCSpecialItem past =
                SOCSpecialItem.makeKnownItem(typeKey, SOCSpecialItem.CK_IMPROV_MAX_LEVEL + 1);
            assertNotNull(past);
            assertNull("no cost past max level for " + typeKey, past.getCost());

            // index 0 unused
            final SOCSpecialItem zero = SOCSpecialItem.makeKnownItem(typeKey, 0);
            assertNotNull(zero);
            assertNull("no cost at index 0 for " + typeKey, zero.getCost());
        }
    }

    /**
     * (d) The barbarian-strength counter stays 0 in a normal game (the option is unset),
     * and advances when game option {@link SOCGameOptionSet#K__CK_BARBARIAN} is forcibly set
     * in a test game (both via the direct {@link SOCGame#advanceBarbarianStrength()} hook and
     * through {@link SOCGame#rollDice()}).
     */
    @Test
    public void testBarbarianStrengthCounter()
    {
        // Normal game: counter stays 0, option not set.
        final SOCGame gaNormal = new SOCGame("ck-normal");
        assertEquals("barbarian strength 0 at start", 0, gaNormal.getBarbarianStrength());
        assertFalse("_CK_BARB not set in normal game",
            gaNormal.isGameOptionSet(SOCGameOptionSet.K__CK_BARBARIAN));

        // Test game with _CK_BARB activated and set true.
        final SOCGameOptionSet knownOpts = SOCGameOptionSet.getAllKnownOptions();
        knownOpts.activate(SOCGameOptionSet.K__CK_BARBARIAN);
        final SOCGameOption optBarb = knownOpts.getKnownOption(SOCGameOptionSet.K__CK_BARBARIAN, true);
        assertNotNull(optBarb);
        optBarb.setBoolValue(true);
        final SOCGameOptionSet opts = new SOCGameOptionSet();
        opts.put(optBarb);
        assertNull("no problems adjusting activated _CK_BARBARIAN",
            opts.adjustOptionsToKnown(knownOpts, false, null));

        final SOCGame gaBarb = new SOCGame("ck-barb", opts, knownOpts);
        assertTrue("_CK_BARB set in test game",
            gaBarb.isGameOptionSet(SOCGameOptionSet.K__CK_BARBARIAN));
        assertEquals("barbarian strength 0 before advance", 0, gaBarb.getBarbarianStrength());

        // Direct hook advances the counter
        assertEquals("advance returns 1", 1, gaBarb.advanceBarbarianStrength());
        assertEquals("counter now 1", 1, gaBarb.getBarbarianStrength());

        // rollDice() advances it again (the guarded path used in real play)
        gaBarb.addPlayer("p0", 0);
        gaBarb.addPlayer("p1", 1);
        gaBarb.startGame();
        gaBarb.setGameState(SOCGame.ROLL_OR_CARD);
        gaBarb.setCurrentPlayerNumber(0);
        gaBarb.rollDice();
        assertEquals("counter advanced by rollDice", 2, gaBarb.getBarbarianStrength());
    }

    /**
     * (e) The existing {@code VP} option still drives {@link SOCGame#checkForWinner()} at 13 VP.
     * This verifies existing behavior (per design decision 3.6); it does not reimplement it.
     */
    @Test
    public void testVPOptionDrivesWinAt13()
    {
        final SOCGameOptionSet knownOpts = SOCGameOptionSet.getAllKnownOptions();
        final SOCGameOption optVP = knownOpts.getKnownOption("VP", true);
        assertNotNull(optVP);
        optVP.setIntValue(13);
        optVP.setBoolValue(true);
        final SOCGameOptionSet opts = new SOCGameOptionSet();
        opts.put(optVP);
        assertNull("no problems adjusting VP", opts.adjustOptionsToKnown(knownOpts, false, null));

        final SOCGame ga = new SOCGame("ck-vp13", opts, knownOpts);
        assertEquals("vp_winner read from VP option", 13, ga.vp_winner);

        ga.addPlayer("p0", 0);
        ga.addPlayer("p1", 1);
        ga.startGame();
        ga.setGameState(SOCGame.PLAY1);
        ga.setCurrentPlayerNumber(0);

        // Not yet a winner at 12 VP
        ga.getPlayer(0).setSpecialVP(12);
        ga.checkForWinner();
        assertTrue("no winner yet at 12 VP", ga.getGameState() < SOCGame.OVER);

        // Winner at 13 VP
        ga.getPlayer(0).setSpecialVP(13);
        ga.checkForWinner();
        assertEquals("game over at 13 VP", SOCGame.OVER, ga.getGameState());
        assertNotNull("player 0 wins at 13 VP", ga.getPlayerWithWin());
        assertEquals("player 0 is the winner", 0, ga.getPlayerWithWin().getPlayerNumber());
    }

    public static void main(String[] args)
    {
        org.junit.runner.JUnitCore.main("soctest.game.TestCKGroundwork");
    }

}
