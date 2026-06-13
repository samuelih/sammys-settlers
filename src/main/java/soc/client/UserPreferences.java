/**
 * Sammys-Settlers - An online multiplayer version of the game Settlers of Catan
 * This file copyright (C) 2019-2020 Jeremy D Monin <jeremy@nand.net>
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
package soc.client;

import java.awt.EventQueue;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.logging.Level;
import java.util.logging.Logger;
import java.util.prefs.BackingStoreException;
import java.util.prefs.Preferences;

/**
 * Gathered static methods to use persistent user preferences if available, or defaults if not.
 *<P>
 * Before v2.0.00 these methods were in {@code SOCPlayerClient} itself.
 * Method names are simplifed to prevent redundancy:
 * v1.x {@code getUserPreference(..)} -> v2.x {@code UserPreferences.getPref(..)}, etc.
 *<P>
 * Because the user preference storage namespace is based on the {@code soc.client} package
 * and not a class name, preferences are shared among all Sammys-Settlers client versions.
 *<P>
 * Is public for possible use by anyone extending Sammys-Settlers in a different package.
 *
 * @author Jeremy D Monin &lt;jeremy@nand.net&gt;
 * @since 2.0.00
 */
public class UserPreferences
{
    /**
     * Persistent user preferences like {@link SOCPlayerClient#PREF_SOUND_ON}, or {@code null} if none could be loaded.
     * @since 1.2.00
     */
    private static Preferences userPrefs;
    static
    {
        /*
         * Workaround on windows to not print this harmless JVM warning about systemNode (which this class doesn't use):
         * WARNING: Could not open/create prefs root node Software\JavaSoft\Prefs at root 0
         * x80000002. Windows RegCreateKeyEx(...) returned error code 5.
         * Uses same concept as 2019-03-15 Gegomu answer to
         * https://stackoverflow.com/questions/23720446/java-could-not-open-create-prefs-error
         * (tested java 1.6, 13.0.1)
         */
        Logger logger = null;
        Level currLevel = null;
        try
        {
            logger = Logger.getLogger("java.util.prefs");
            currLevel = logger.getLevel();
            logger.setLevel(Level.SEVERE);
        } catch (Throwable th) {}

        try
        {
            userPrefs = Preferences.userNodeForPackage(SOCPlayerInterface.class);
            int i = getPref("nonExistentDummy", 0);
            if ((i != 42) && (currLevel != null))  // use i, to not optimize away getPref
                logger.setLevel(currLevel);
        } catch (Throwable th) {}
    }

    /**
     * Get a boolean persistent user preference if available, or the default value.
     *<P>
     * Before v2.0.00 this method was {@code getUserPreference}.
     *
     * @param prefKey  Preference name key, such as {@link SOCPlayerClient#PREF_SOUND_ON}
     * @param dflt  Default value to get if no preference, or if {@code prefKey} is null
     * @return  Preference value or {@code dflt}
     * @see #putPref(String, boolean)
     * @see #getPref(String, int)
     * @since 1.2.00
     */
    public static boolean getPref(final String prefKey, final boolean dflt)
    {
        if (userPrefs == null)
            return dflt;

        try
        {
            return userPrefs.getBoolean(prefKey, dflt);
        } catch (RuntimeException e) {
            return dflt;
        }
    }

    /**
     * Get an int persistent user preference if available, or the default value.
     *<P>
     * Before v2.0.00 this method was {@code getUserPreference}.
     *
     * @param prefKey  Preference name key, such as {@link SOCPlayerClient#PREF_BOT_TRADE_REJECT_SEC}
     * @param dflt  Default value to get if no preference, or if {@code prefKey} is null
     * @return  Preference value or {@code dflt}
     * @see #putPref(String, int)
     * @see #getPref(String, boolean)
     * @since 1.2.00
     */
    public static int getPref(final String prefKey, final int dflt)
    {
        if (userPrefs == null)
            return dflt;

        try
        {
            return userPrefs.getInt(prefKey, dflt);
        } catch (RuntimeException e) {
            return dflt;
        }
    }

    /**
     * Get a String persistent user preference if available, or the default value.
     *
     * @param prefKey  Preference name key, such as {@link PreferenceDescriptor#KEY_COLOR_BLIND_MODE}
     * @param dflt  Default value to get if no preference, or if {@code prefKey} is null
     * @return  Preference value or {@code dflt}
     * @see #putPref(String, String)
     * @see #getPref(String, boolean)
     * @see #getPref(String, int)
     * @since 2.7.00
     */
    public static String getPref(final String prefKey, final String dflt)
    {
        if (userPrefs == null)
            return dflt;

        try
        {
            return userPrefs.get(prefKey, dflt);
        } catch (RuntimeException e) {
            return dflt;
        }
    }

    /**
     * Set a boolean persistent user preference, if available.
     * Asynchronously calls {@link Preferences#flush()}.
     *<P>
     * Before v2.0.00 this method was {@code putUserPreference}.
     *
     * @param prefKey  Preference name key, such as {@link SOCPlayerClient#PREF_SOUND_ON}
     * @param val  Value to set
     * @throws NullPointerException if {@code prefKey} is null
     * @throws IllegalArgumentException if {@code prefKey} is longer than {@link Preferences#MAX_KEY_LENGTH}
     * @see #getPref(String, boolean)
     * @see #putPref(String, int)
     * @see #clear(String)
     * @since 1.2.00
     */
    public static void putPref(final String prefKey, final boolean val)
        throws NullPointerException, IllegalArgumentException
    {
        if (userPrefs == null)
            return;

        try
        {
            userPrefs.putBoolean(prefKey, val);
            flushSoon();
        } catch (IllegalStateException e) {
            // unlikely
            System.err.println("Error setting userPref " + prefKey + ": " + e);
        }
    }

    /**
     * Set an int persistent user preference, if available.
     * Asynchronously calls {@link Preferences#flush()}.
     *<P>
     * Before v2.0.00 this method was {@code putUserPreference}.
     *
     * @param prefKey  Preference name key, such as {@link SOCPlayerClient#PREF_BOT_TRADE_REJECT_SEC}
     * @param val  Value to set
     * @throws NullPointerException if {@code prefKey} is null
     * @throws IllegalArgumentException if {@code prefKey} is longer than {@link Preferences#MAX_KEY_LENGTH}
     * @see #getPref(String, int)
     * @see #putPref(String, boolean)
     * @see #clear(String)
     * @since 1.2.00
     */
    public static void putPref(final String prefKey, final int val)
        throws NullPointerException, IllegalArgumentException
    {
        if (userPrefs == null)
            return;

        try
        {
            userPrefs.putInt(prefKey, val);
            flushSoon();
        } catch (IllegalStateException e) {
            // unlikely
            System.err.println("Error setting userPref " + prefKey + ": " + e);
        }
    }

    /**
     * Set a String persistent user preference, if available.
     * Asynchronously calls {@link Preferences#flush()}.
     *
     * @param prefKey  Preference name key, such as {@link PreferenceDescriptor#KEY_COLOR_BLIND_MODE}
     * @param val  Value to set; should not be {@code null}
     * @throws NullPointerException if {@code prefKey} or {@code val} is null
     * @throws IllegalArgumentException if {@code prefKey} is longer than {@link Preferences#MAX_KEY_LENGTH},
     *     or {@code val} is longer than {@link Preferences#MAX_VALUE_LENGTH}
     * @see #getPref(String, String)
     * @see #putPref(String, boolean)
     * @see #putPref(String, int)
     * @see #clear(String)
     * @since 2.7.00
     */
    public static void putPref(final String prefKey, final String val)
        throws NullPointerException, IllegalArgumentException
    {
        if (userPrefs == null)
            return;

        try
        {
            userPrefs.put(prefKey, val);
            flushSoon();
        } catch (IllegalStateException e) {
            // unlikely
            System.err.println("Error setting userPref " + prefKey + ": " + e);
        }
    }

    /**
     * Asynchronously flush {@link #userPrefs} to persist them soon, but not this moment in this thread,
     * via {@link EventQueue#invokeLater(Runnable)}.
     * @since 2.0.00
     */
    private static void flushSoon()
    {
        EventQueue.invokeLater(new Runnable()
        {
            public void run()
            {
                try
                {
                    userPrefs.flush();
                } catch (BackingStoreException e) {
                    System.err.println("Error writing userPrefs: " + e);
                }
            }
        });
    }

    /**
     * Clear some user preferences by removing the value stored for their key(s).
     * (Calls {@link Preferences#remove(String)}, not {@link Preferences#clear()}).
     * Calls {@link Preferences#flush()} afterwards. Prints a "Cleared" message
     * to {@link System#err} with {@code prefKeyList}.
     *<P>
     * Before v2.0.00 this method was {@code clearUserPreferences}.
     *
     * @param prefKeyList  Preference name key(s) to clear, same format
     *     as {@link SOCPlayerClient#PROP_JSETTLERS_DEBUG_CLEAR__PREFS}.
     *     Does nothing if {@code null} or "". Keys on this list do not
     *     all have to exist with a value; key name typos will not throw
     *     an exception.
     * @since 1.2.00
     */
    public static final void clear(final String prefKeyList)
    {
        if ((prefKeyList == null) || (prefKeyList.length() == 0) || (userPrefs == null))
            return;

        for (String key : prefKeyList.split(","))
        {
            try
            {
                userPrefs.remove(key);
            } catch (IllegalStateException e) {}
        }

        try
        {
            userPrefs.flush();
        }
        catch (BackingStoreException e) {}

        System.err.println("Cleared user preferences: " + prefKeyList);
    }

    /**
     * Registry of {@link PreferenceDescriptor}s for preferences which can be shown and edited in
     * {@link PreferencesDialog}. Built once by {@link #buildRegistry()}, keyed by preference name.
     * Insertion order is preserved (uses {@link LinkedHashMap}) so the dialog can list them in a stable order.
     * @since 2.7.00
     */
    private static Map<String, PreferenceDescriptor> registry;

    /**
     * Get the list of registered {@link PreferenceDescriptor}s, in registration order, for use by
     * {@link PreferencesDialog}. Builds the registry on first call.
     * @return  All registered preference descriptors; never {@code null} or empty.
     * @since 2.7.00
     */
    public static synchronized List<PreferenceDescriptor> getRegisteredPreferences()
    {
        if (registry == null)
            buildRegistry();

        return new ArrayList<PreferenceDescriptor>(registry.values());
    }

    /**
     * Get a single registered {@link PreferenceDescriptor} by its preference key name.
     * Builds the registry on first call.
     * @param prefKey  Preference name key, such as {@link PreferenceDescriptor#KEY_COLOR_BLIND_MODE}
     * @return  The descriptor, or {@code null} if {@code prefKey} isn't registered
     * @since 2.7.00
     */
    public static synchronized PreferenceDescriptor getDescriptor(final String prefKey)
    {
        if (registry == null)
            buildRegistry();

        return registry.get(prefKey);
    }

    /**
     * Build the {@link #registry} of {@link PreferenceDescriptor}s for the preferences shown in
     * {@link PreferencesDialog}. Registers the existing persistent preferences plus the newer
     * rendering/accessibility preferences. Called once, lazily, from {@link #getRegisteredPreferences()}
     * or {@link #getDescriptor(String)}.
     * @since 2.7.00
     */
    private static void buildRegistry()
    {
        final Map<String, PreferenceDescriptor> reg = new LinkedHashMap<String, PreferenceDescriptor>();

        // Registration order also determines display order in PreferencesDialog,
        // grouped to match the section headers (general, display, accessibility).

        // --- General (existing persistent preferences) ---

        reg.put(SOCPlayerClient.PREF_SOUND_ON, new PreferenceDescriptor
            (SOCPlayerClient.PREF_SOUND_ON, "pref.sound_on",
             Boolean.TRUE));

        reg.put(SOCPlayerClient.PREF_BOT_TRADE_REJECT_SEC, new PreferenceDescriptor
            (SOCPlayerClient.PREF_BOT_TRADE_REJECT_SEC, "pref.bot_trade_reject_sec",
             Integer.valueOf(-8)));

        reg.put(SOCPlayerClient.PREF_FACE_ICON, new PreferenceDescriptor
            (SOCPlayerClient.PREF_FACE_ICON, "pref.face_icon",
             Integer.valueOf(1)));

        // --- Display ---

        reg.put(PreferenceDescriptor.KEY_HEX_GRAPHICS_SET, new PreferenceDescriptor
            (PreferenceDescriptor.KEY_HEX_GRAPHICS_SET, "pref.hex_graphics_set",
             new String[]{ "pastel", "classic" }, "pastel", true));

        reg.put(SOCPlayerClient.PREF_UI_SCALE_FORCE, new PreferenceDescriptor
            (SOCPlayerClient.PREF_UI_SCALE_FORCE, "pref.ui_scale_force",
             Integer.valueOf(0)));

        // Newer rendering preferences (consumed by later waves)

        reg.put(PreferenceDescriptor.KEY_RENDER_ANTIALIASING, new PreferenceDescriptor
            (PreferenceDescriptor.KEY_RENDER_ANTIALIASING, "pref.render_antialiasing",
             Boolean.TRUE));

        reg.put(PreferenceDescriptor.KEY_RENDER_INTERPOLATION, new PreferenceDescriptor
            (PreferenceDescriptor.KEY_RENDER_INTERPOLATION, "pref.render_interpolation",
             new String[]{ "nearest", "bilinear", "bicubic" }, "bicubic", false));

        reg.put(PreferenceDescriptor.KEY_UI_FONT_SIZE, new PreferenceDescriptor
            (PreferenceDescriptor.KEY_UI_FONT_SIZE, "pref.ui_font_size",
             new String[]{ "small", "normal", "large", "xlarge" }, "normal", false));

        // --- Accessibility ---

        reg.put(PreferenceDescriptor.KEY_COLOR_BLIND_MODE, new PreferenceDescriptor
            (PreferenceDescriptor.KEY_COLOR_BLIND_MODE, "pref.color_blind_mode",
             new String[]{ "off", "deuteranopia", "protanopia", "tritanopia" }, "off", false));

        registry = reg;
    }

    /**
     * Metadata describing one registered user preference: its key, type, default value,
     * allowed choices (for {@link Type#CHOICE}), and the i18n key for its display label.
     *<P>
     * This mini-registry is additive: it does not change the existing static
     * {@link UserPreferences#getPref(String, boolean)} / {@link UserPreferences#putPref(String, boolean)} API,
     * which remains the way to read and write preference values. It exists so UI such as
     * {@link PreferencesDialog} can enumerate preferences and build the correct controls
     * without hardcoding each preference's key, type, and default.
     *<P>
     * A {@link Type#CHOICE} preference is stored either as a String (its chosen value) or,
     * if {@link #choiceStoredAsInt} is set, as the integer index into {@link #choices}.
     * The latter is used for legacy keys like {@link #KEY_HEX_GRAPHICS_SET}, which predate this registry.
     *
     * @since 2.7.00
     */
    public static class PreferenceDescriptor
    {
        /**
         * Preference key for choice of hex graphics set; same value as
         * {@link SOCPlayerClient#PREF_HEX_GRAPHICS_SET}. Stored as an integer index
         * (0 = pastel, 1 = classic). Declared here so the registry can reference it
         * without depending on {@code SOCPlayerClient} class-load order.
         * @since 2.7.00
         */
        public static final String KEY_HEX_GRAPHICS_SET = "hexGraphicsSet";

        /**
         * Preference key for whether to draw the board with antialiasing (smooth edges).
         * Boolean, default {@code true}. Consumed by the board-rendering code.
         * @since 2.7.00
         */
        public static final String KEY_RENDER_ANTIALIASING = "renderAntialiasing";

        /**
         * Preference key for board image scaling quality: one of "nearest", "bilinear", "bicubic".
         * Default "bicubic". Consumed by the board-rendering code.
         * @since 2.7.00
         */
        public static final String KEY_RENDER_INTERPOLATION = "renderInterpolation";

        /**
         * Preference key for color-blind assist mode: one of "off", "deuteranopia", "protanopia", "tritanopia".
         * Default "off". Consumed by the board-rendering code.
         * @since 2.7.00
         */
        public static final String KEY_COLOR_BLIND_MODE = "colorBlindMode";

        /**
         * Preference key for relative UI font size: one of "small", "normal", "large", "xlarge".
         * Default "normal". Read at startup to scale Swing default fonts.
         * @since 2.7.00
         */
        public static final String KEY_UI_FONT_SIZE = "uiFontSize";

        /**
         * The type of a registered preference value.
         * @since 2.7.00
         */
        public enum Type { BOOLEAN, INT, CHOICE }

        /**
         * The preference key name, such as {@link SOCPlayerClient#PREF_SOUND_ON} or {@link #KEY_COLOR_BLIND_MODE}.
         * @since 2.7.00
         */
        public final String key;

        /**
         * The value type of this preference.
         * @since 2.7.00
         */
        public final Type type;

        /**
         * Default value: a {@link Boolean} for {@link Type#BOOLEAN}, an {@link Integer} for {@link Type#INT},
         * or a {@link String} (one of {@link #choices}) for {@link Type#CHOICE}.
         * @since 2.7.00
         */
        public final Object defaultValue;

        /**
         * For {@link Type#CHOICE}, the allowed values in display order; otherwise {@code null}.
         * @since 2.7.00
         */
        public final String[] choices;

        /**
         * For {@link Type#CHOICE} only: if true, the chosen value is persisted as the integer
         * index into {@link #choices} (legacy keys like {@link #KEY_HEX_GRAPHICS_SET});
         * if false, it's persisted as the chosen String itself.
         * @since 2.7.00
         */
        public final boolean choiceStoredAsInt;

        /**
         * i18n key for this preference's display label, found in the client strings file.
         * @since 2.7.00
         */
        public final String labelKey;

        /**
         * Construct a descriptor for a {@link Type#BOOLEAN} or {@link Type#INT} preference.
         * @param key  Preference key name; not {@code null}
         * @param labelKey  i18n key for display label; not {@code null}
         * @param defaultValue  A {@link Boolean} (sets type BOOLEAN) or {@link Integer} (sets type INT); not {@code null}
         * @throws IllegalArgumentException if {@code defaultValue} isn't a Boolean or Integer
         * @since 2.7.00
         */
        public PreferenceDescriptor(final String key, final String labelKey, final Object defaultValue)
            throws IllegalArgumentException
        {
            this.key = key;
            this.labelKey = labelKey;
            this.defaultValue = defaultValue;
            this.choices = null;
            this.choiceStoredAsInt = false;
            if (defaultValue instanceof Boolean)
                this.type = Type.BOOLEAN;
            else if (defaultValue instanceof Integer)
                this.type = Type.INT;
            else
                throw new IllegalArgumentException("defaultValue must be Boolean or Integer");
        }

        /**
         * Construct a descriptor for a {@link Type#CHOICE} preference.
         * @param key  Preference key name; not {@code null}
         * @param labelKey  i18n key for display label; not {@code null}
         * @param choices  Allowed choice values in display order; not {@code null} or empty
         * @param defaultChoice  Default value; should be one of {@code choices}
         * @param choiceStoredAsInt  If true, persist the chosen value as its index into {@code choices};
         *     otherwise persist the chosen String
         * @since 2.7.00
         */
        public PreferenceDescriptor
            (final String key, final String labelKey, final String[] choices,
             final String defaultChoice, final boolean choiceStoredAsInt)
        {
            this.key = key;
            this.labelKey = labelKey;
            this.type = Type.CHOICE;
            this.choices = choices;
            this.defaultValue = defaultChoice;
            this.choiceStoredAsInt = choiceStoredAsInt;
        }

        /**
         * For a {@link Type#CHOICE} preference, read the currently-stored choice value as a String.
         * Honors {@link #choiceStoredAsInt} (reads an int index and maps it through {@link #choices}).
         * Falls back to {@link #defaultValue} if no value is stored or the stored value is unrecognized.
         * @return  The current choice value, one of {@link #choices}
         * @throws IllegalStateException if this descriptor isn't a {@link Type#CHOICE}
         * @since 2.7.00
         */
        public String getCurrentChoice()
            throws IllegalStateException
        {
            if (type != Type.CHOICE)
                throw new IllegalStateException("not a CHOICE pref: " + key);

            if (choiceStoredAsInt)
            {
                int defIdx = indexOfChoice((String) defaultValue);
                if (defIdx < 0)
                    defIdx = 0;
                int idx = UserPreferences.getPref(key, defIdx);
                if ((idx < 0) || (idx >= choices.length))
                    idx = defIdx;
                return choices[idx];
            } else {
                String val = UserPreferences.getPref(key, (String) defaultValue);
                if (indexOfChoice(val) < 0)
                    val = (String) defaultValue;
                return val;
            }
        }

        /**
         * For a {@link Type#CHOICE} preference, persist a new choice value.
         * Honors {@link #choiceStoredAsInt} (stores an int index instead of the String).
         * Does nothing if {@code choice} isn't one of {@link #choices}.
         * @param choice  The new choice value; should be one of {@link #choices}
         * @throws IllegalStateException if this descriptor isn't a {@link Type#CHOICE}
         * @since 2.7.00
         */
        public void putCurrentChoice(final String choice)
            throws IllegalStateException
        {
            if (type != Type.CHOICE)
                throw new IllegalStateException("not a CHOICE pref: " + key);

            final int idx = indexOfChoice(choice);
            if (idx < 0)
                return;   // <--- Early return: not a valid choice ---

            if (choiceStoredAsInt)
                UserPreferences.putPref(key, idx);
            else
                UserPreferences.putPref(key, choice);
        }

        /**
         * Find the index of a value within {@link #choices}.
         * @param choice  Value to find
         * @return  Index of {@code choice} in {@link #choices}, or -1 if not present or not a CHOICE pref
         * @since 2.7.00
         */
        public int indexOfChoice(final String choice)
        {
            if (choices == null)
                return -1;

            for (int i = 0; i < choices.length; ++i)
                if (choices[i].equals(choice))
                    return i;

            return -1;
        }
    }

}
