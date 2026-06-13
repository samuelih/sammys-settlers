/**
 * Sammys-Settlers - An online multiplayer version of the game Settlers of Catan
 * This file Copyright (C) 2026 Robert S. Thomas and contributors
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
 * along with this program.  If not, see <http://www.gnu.org/licenses/> .
 *
 * The maintainer of this program can be reached at jsettlers@nand.net
 **/
package soc.game;

/**
 * Cities &amp; Knights progress-card type constants ({@link SOCInventoryItem#itype} values),
 * deck composition, and small helpers. Used with game option
 * {@link SOCGameOptionSet#K__CK_PROGRESS _CK_PROG}; see {@code doc/Cities-and-Knights-Implemented.md}.
 *<P>
 * Per the {@link SOCInventoryItem#itype} convention these codes don't overlap the
 * dev-card constants ({@link SOCDevCardConstants#MAXPLUSONE} == 10), so progress cards
 * and dev cards can share a player's {@link SOCInventory}.
 *
 * @since 2.7.00
 */
public abstract class SOCCKProgressCardConstants
{
    /** Trade deck: Name a resource; take up to 2 of it from each other player. */
    public static final int RESOURCE_MONOPOLY = 11;

    /** Trade deck: Name a commodity; take 1 of it from each other player. */
    public static final int TRADE_MONOPOLY = 12;

    /** Trade deck: Take 2 random resources from the opponent holding the most resources. */
    public static final int MASTER_MERCHANT = 13;

    /** Politics deck: Activate all your inactive knights for free. */
    public static final int WARLORD = 14;

    /** Politics deck: Each player with more VP than you gives you 1 random resource. */
    public static final int WEDDING = 15;

    /** Politics deck: +1 VP, revealed and scored when drawn. */
    public static final int CONSTITUTION = 16;

    /** Science deck: Gain 2 wheat per distinct fields hex adjacent to your settlements/cities. */
    public static final int IRRIGATION = 17;

    /** Science deck: Gain 2 ore per distinct mountains hex adjacent to your settlements/cities. */
    public static final int MINING = 18;

    /** Science deck: +1 VP, revealed and scored when drawn. */
    public static final int PRINTER = 19;

    /** Lowest progress-card type value. */
    public static final int MIN = 11;

    /** One past the highest progress-card type value ({@link #PRINTER}). */
    public static final int MAXPLUSONE = 20;

    /**
     * Deck composition for the Trade deck (track index 0): the multiset of card types
     * shuffled into the deck at game start.
     */
    public static final int[] DECK_TRADE =
    {
        RESOURCE_MONOPOLY, RESOURCE_MONOPOLY, RESOURCE_MONOPOLY, RESOURCE_MONOPOLY,
        TRADE_MONOPOLY, TRADE_MONOPOLY, TRADE_MONOPOLY, TRADE_MONOPOLY,
        MASTER_MERCHANT, MASTER_MERCHANT
    };

    /** Deck composition for the Politics deck (track index 1); see {@link #DECK_TRADE}. */
    public static final int[] DECK_POLITICS =
    {
        WARLORD, WARLORD, WARLORD, WARLORD, WARLORD,
        WEDDING, WEDDING, WEDDING, WEDDING,
        CONSTITUTION
    };

    /** Deck composition for the Science deck (track index 2); see {@link #DECK_TRADE}. */
    public static final int[] DECK_SCIENCE =
    {
        IRRIGATION, IRRIGATION, IRRIGATION, IRRIGATION, IRRIGATION,
        MINING, MINING, MINING, MINING,
        PRINTER
    };

    /**
     * Is this progress card a victory-point card ({@link #CONSTITUTION} or {@link #PRINTER})?
     * VP cards are revealed and scored (+1 Special VP) when drawn, are kept rather than played,
     * and don't count against the progress-card hand limit.
     * @param itype  Progress-card type constant
     * @return  true if {@code itype} is a VP progress card
     */
    public static boolean isVPCard(final int itype)
    {
        return (itype == CONSTITUTION) || (itype == PRINTER);
    }

    /**
     * Is this {@link SOCInventoryItem#itype} value a Cities &amp; Knights progress card?
     * @param itype  Item type code
     * @return  true if {@link #MIN} &lt;= {@code itype} &lt; {@link #MAXPLUSONE}
     */
    public static boolean isProgressCard(final int itype)
    {
        return (itype >= MIN) && (itype < MAXPLUSONE);
    }

    /**
     * Get the i18n string key fragment for a progress-card type, for keys like
     * {@code "game.ck.progress.warlord"}; used by
     * {@link SOCInventoryItem#createForScenario(SOCGame, int, boolean, boolean, boolean, boolean)}.
     * @param itype  Progress-card type constant
     * @return  lowercase key fragment such as {@code "warlord"}, or {@code "unknown"}
     */
    public static String keyFragment(final int itype)
    {
        switch (itype)
        {
        case RESOURCE_MONOPOLY: return "resource_monopoly";
        case TRADE_MONOPOLY:    return "trade_monopoly";
        case MASTER_MERCHANT:   return "master_merchant";
        case WARLORD:           return "warlord";
        case WEDDING:           return "wedding";
        case CONSTITUTION:      return "constitution";
        case IRRIGATION:        return "irrigation";
        case MINING:            return "mining";
        case PRINTER:           return "printer";
        default:                return "unknown";
        }
    }
}
