/**
 * Sammys-Settlers - An online multiplayer version of the game Settlers of Catan
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

import java.io.File;

import soc.server.CustomMapLoader;
import soc.server.CustomMapLoader.CustomMapException;
import soc.server.CustomMapLoader.ParsedCustomMap;

/**
 * Dev-only command-line wrapper around the real Sammys-Settlers custom-map validator, for the
 * web map editor's round-trip proof.  Reads a {@code .map.json} file path from {@code args[0]},
 * runs it through the actual {@link CustomMapLoader#parseAndValidateForTests(File)} /
 * {@link soc.server.CustomMapValidator} pipeline (GSON deserialize + every validation rule),
 * and reports the result:
 *<UL>
 *<LI> on success: prints {@code "VALID"} (plus the parsed map name) and exits {@code 0}
 *<LI> on a validation/parse failure: prints {@code "INVALID: <message>"} and exits {@code 1}
 *</UL>
 *<P>
 * This class is NOT part of the shipped JARs; it lives under {@code web/scripts/} and is
 * compiled on demand by {@code web/scripts/validate-map.sh}.  It is placed in the default
 * package and uses no Sammys-Settlers-internal access beyond the public
 * {@code parseAndValidateForTests} entry point, so it stays a thin, standalone tool.
 *<P>
 * {@code parseAndValidateForTests} is used (rather than {@code loadAndRegisterOne}) on purpose:
 * it runs the identical GSON parse + full {@code CustomMapValidator.validateAndParse} rule set
 * but does NOT register a {@link soc.game.SOCScenario} or mutate any global state, so the tool
 * can be run repeatedly on many files without scenario-key-collision side effects.
 *
 * @since 2.7.00
 */
public final class MapValidateCLI
{
    /** Not instantiable. */
    private MapValidateCLI() {}

    /**
     * Validate the {@code .map.json} file named by {@code args[0]} against the real validator.
     * @param args  Command-line args; {@code args[0]} must be the path to a {@code .map.json} file
     */
    public static void main(final String[] args)
    {
        if (args.length != 1)
        {
            System.err.println("Usage: MapValidateCLI <path-to-map.json>");
            System.exit(2);
            return;   // <--- Early return: bad usage (also satisfies static analysis after exit) ---
        }

        final File f = new File(args[0]);
        if (! f.isFile())
        {
            System.out.println("INVALID: file not found: " + f.getPath());
            System.exit(1);
            return;   // <--- Early return: missing file ---
        }

        try
        {
            final ParsedCustomMap pmap = CustomMapLoader.parseAndValidateForTests(f);
            System.out.println("VALID: \"" + pmap.name + "\" (" + f.getName() + ")");
            System.exit(0);
        }
        catch (CustomMapException e) {
            System.out.println("INVALID: " + e.getMessage());
            System.exit(1);
        }
        catch (Throwable th) {
            System.out.println("INVALID: unexpected error: " + th);
            System.exit(1);
        }
    }
}
