/**
 * Sammys-Settlers - An online multiplayer version of the game Settlers of Catan
 * This file copyright (C) 2026 Jeremy D Monin <jeremy@nand.net>
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

import java.awt.BorderLayout;
import java.awt.FlowLayout;
import java.awt.Font;
import java.awt.GridBagConstraints;
import java.awt.GridBagLayout;
import java.awt.Insets;
import java.awt.Window;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;
import java.util.ArrayList;
import java.util.List;
import java.util.MissingResourceException;

import javax.swing.BorderFactory;
import javax.swing.JButton;
import javax.swing.JCheckBox;
import javax.swing.JComboBox;
import javax.swing.JComponent;
import javax.swing.JDialog;
import javax.swing.JLabel;
import javax.swing.JPanel;
import javax.swing.JSpinner;
import javax.swing.SpinnerNumberModel;

import soc.client.UserPreferences.PreferenceDescriptor;
import soc.util.SOCStringManager;

/**
 * Modal dialog to view and edit the user's persistent client {@link UserPreferences}.
 * Lists every preference registered in {@link UserPreferences#getRegisteredPreferences()},
 * showing the appropriate control for each type:
 *<UL>
 * <LI> {@link PreferenceDescriptor.Type#BOOLEAN}: a {@link JCheckBox}
 * <LI> {@link PreferenceDescriptor.Type#INT}: a {@link JSpinner}
 * <LI> {@link PreferenceDescriptor.Type#CHOICE}: a {@link JComboBox}
 *</UL>
 * Current values are loaded when the dialog opens; clicking <em>OK</em> applies and persists all
 * changed values via the existing {@link UserPreferences} static API, then closes the dialog.
 * Clicking <em>Cancel</em> discards changes.
 *<P>
 * Some preferences (board rendering quality, UI font size, UI scale) take effect only for
 * newly created windows or after a restart; this dialog persists them but doesn't re-render
 * existing windows. The hex graphics set takes effect immediately, reloading the board
 * graphics of any open games via {@link SOCPlayerClient#reloadBoardGraphics()}.
 *
 * @since 2.7.00
 */
@SuppressWarnings("serial")
public class PreferencesDialog extends JDialog
    implements ActionListener
{
    /**
     * i18n text strings; uses same locale as {@link SOCStringManager#getClientManager()}.
     */
    private static final SOCStringManager strings = SOCStringManager.getClientManager();

    /**
     * Main display, for {@link MainDisplay#getClient()} when a changed preference
     * (such as the hex graphics set) must take effect immediately.
     * @since 2.7.00
     */
    private final MainDisplay mainDisplay;

    /**
     * Display scaling factor (1 if not high-DPI), used for padding/insets.
     */
    private final int displayScale;

    /**
     * Per-preference editor controls, in the same order as {@link #descriptors}.
     * Each is a {@link JCheckBox}, {@link JSpinner}, or {@link JComboBox} depending on the
     * descriptor's {@link PreferenceDescriptor#type}.
     */
    private final List<JComponent> editors;

    /**
     * The registered preferences shown in this dialog, parallel to {@link #editors}.
     */
    private final List<PreferenceDescriptor> descriptors;

    /** OK button: apply and persist all changes, then close. */
    private JButton bOK;

    /** Cancel button: discard changes and close. */
    private JButton bCancel;

    /**
     * Create and show a modal {@code PreferencesDialog}. Convenience method which constructs
     * the dialog, packs it, centers it over {@code owner}, and makes it visible.
     * @param md  Main display, for display-scale lookup; not {@code null}
     * @param owner  Parent window the dialog should be centered over, or {@code null}
     */
    public static void createAndShow(final MainDisplay md, final Window owner)
    {
        PreferencesDialog dia = new PreferencesDialog(md, owner);
        dia.pack();
        dia.setLocationRelativeTo(owner);
        dia.setVisible(true);
    }

    /**
     * Construct a new {@code PreferencesDialog}; does not show it (see {@link #createAndShow(MainDisplay, Window)}).
     * @param md  Main display, for {@link MainDisplay#getDisplayScaleFactor()}; not {@code null}
     * @param owner  Parent window, or {@code null}
     * @throws IllegalArgumentException if {@code md} is {@code null}
     */
    public PreferencesDialog(final MainDisplay md, final Window owner)
        throws IllegalArgumentException
    {
        super(owner, strings.get("pref.dialog.title"), ModalityType.APPLICATION_MODAL);

        if (md == null)
            throw new IllegalArgumentException("md");

        mainDisplay = md;
        displayScale = md.getDisplayScaleFactor();
        descriptors = UserPreferences.getRegisteredPreferences();
        editors = new ArrayList<JComponent>(descriptors.size());

        setDefaultCloseOperation(DISPOSE_ON_CLOSE);
        buildUI();
    }

    /**
     * Build and lay out the dialog's controls: one row per registered preference, plus OK/Cancel buttons.
     */
    private void buildUI()
    {
        final JPanel mainPanel = new JPanel(new BorderLayout());
        final int pad = 4 * displayScale;
        mainPanel.setBorder(BorderFactory.createEmptyBorder(pad, pad, pad, pad));

        final JPanel prefsPanel = new JPanel(new GridBagLayout());
        final GridBagConstraints gbc = new GridBagConstraints();
        gbc.insets = new Insets(pad / 2, pad, pad / 2, pad);
        gbc.anchor = GridBagConstraints.LINE_START;

        int row = 0;
        String prevSectionKey = null;
        for (final PreferenceDescriptor pd : descriptors)
        {
            // Section header, shown once when the section changes
            final String sectionKey = sectionKeyFor(pd.key);
            if ((sectionKey != null) && ! sectionKey.equals(prevSectionKey))
            {
                final JLabel hdr = new JLabel(strings.get(sectionKey));
                final Font hf = hdr.getFont();
                if (hf != null)
                    hdr.setFont(hf.deriveFont(Font.BOLD));

                gbc.gridx = 0;
                gbc.gridy = row;
                gbc.gridwidth = 2;
                gbc.weightx = 0;
                gbc.fill = GridBagConstraints.NONE;
                prefsPanel.add(hdr, gbc);
                gbc.gridwidth = 1;

                ++row;
                prevSectionKey = sectionKey;
            }

            final JLabel lbl = new JLabel(strings.get(pd.labelKey));

            gbc.gridx = 0;
            gbc.gridy = row;
            gbc.weightx = 0;
            gbc.fill = GridBagConstraints.NONE;
            prefsPanel.add(lbl, gbc);

            final JComponent editor = buildEditor(pd);
            editors.add(editor);

            gbc.gridx = 1;
            gbc.weightx = 1;
            gbc.fill = GridBagConstraints.HORIZONTAL;
            prefsPanel.add(editor, gbc);

            ++row;
        }

        mainPanel.add(prefsPanel, BorderLayout.CENTER);

        // OK / Cancel buttons
        final JPanel btnPanel = new JPanel(new FlowLayout(FlowLayout.TRAILING, pad, pad));
        bOK = new JButton(strings.get("base.ok"));  // "OK"
        bCancel = new JButton(strings.get("base.cancel"));  // "Cancel"
        bOK.addActionListener(this);
        bCancel.addActionListener(this);
        btnPanel.add(bCancel);
        btnPanel.add(bOK);
        mainPanel.add(btnPanel, BorderLayout.SOUTH);

        getRootPane().setDefaultButton(bOK);
        setContentPane(mainPanel);
    }

    /**
     * Map a preference key to the i18n key of the dialog section it belongs under.
     * Used to insert simple section headers when listing preferences.
     * @param prefKey  The preference key, such as {@link PreferenceDescriptor#KEY_COLOR_BLIND_MODE}
     * @return  An i18n section-header key ("pref.section.*"), or {@code null} for no header
     * @since 2.7.00
     */
    private static String sectionKeyFor(final String prefKey)
    {
        if (PreferenceDescriptor.KEY_RENDER_ANTIALIASING.equals(prefKey)
            || PreferenceDescriptor.KEY_RENDER_INTERPOLATION.equals(prefKey)
            || PreferenceDescriptor.KEY_HEX_GRAPHICS_SET.equals(prefKey)
            || PreferenceDescriptor.KEY_UI_FONT_SIZE.equals(prefKey)
            || SOCPlayerClient.PREF_UI_SCALE_FORCE.equals(prefKey))
            return "pref.section.display";

        if (PreferenceDescriptor.KEY_COLOR_BLIND_MODE.equals(prefKey))
            return "pref.section.accessibility";

        return "pref.section.general";
    }

    /**
     * Build the editor control for one preference, initialized to its current persisted value.
     * @param pd  The preference descriptor; not {@code null}
     * @return  A {@link JCheckBox}, {@link JSpinner}, or {@link JComboBox} appropriate to {@code pd}'s type
     */
    private JComponent buildEditor(final PreferenceDescriptor pd)
    {
        switch (pd.type)
        {
        case BOOLEAN:
            {
                final boolean dflt = ((Boolean) pd.defaultValue).booleanValue();
                final JCheckBox cb = new JCheckBox();
                cb.setSelected(UserPreferences.getPref(pd.key, dflt));
                return cb;
            }

        case INT:
            {
                final int dflt = ((Integer) pd.defaultValue).intValue();
                int cur = UserPreferences.getPref(pd.key, dflt);
                // Allow a wide range so negative "disabled" sentinel values are preserved; clamp to model bounds.
                if (cur < -999)
                    cur = -999;
                else if (cur > 999)
                    cur = 999;
                final SpinnerNumberModel model = new SpinnerNumberModel(cur, -999, 999, 1);
                final JSpinner sp = new JSpinner(model);
                return sp;
            }

        case CHOICE:
            {
                final JComboBox<String> combo = new JComboBox<String>();
                final String cur = pd.getCurrentChoice();
                int selIdx = 0;
                for (int i = 0; i < pd.choices.length; ++i)
                {
                    // Localized label for the choice value, e.g. pref.color_blind_mode.off ; falls back to raw value
                    final String labelKey = pd.labelKey + '.' + pd.choices[i];
                    String label;
                    try
                    {
                        label = strings.get(labelKey);
                    } catch (MissingResourceException mre) {
                        label = pd.choices[i];
                    }
                    combo.addItem(label);
                    if (pd.choices[i].equals(cur))
                        selIdx = i;
                }
                combo.setSelectedIndex(selIdx);
                return combo;
            }

        default:
            // unreachable; keep compiler happy
            return new JLabel();
        }
    }

    /**
     * Handle the OK and Cancel buttons.
     * @param e  Action event from {@link #bOK} or {@link #bCancel}
     */
    public void actionPerformed(final ActionEvent e)
    {
        final Object src = e.getSource();
        if (src == bOK)
        {
            try
            {
                applyChanges();
            } catch (Throwable th) {
                System.err.println("Error applying preferences: " + th);
            }
            dispose();
        }
        else if (src == bCancel)
        {
            dispose();
        }
    }

    /**
     * Read each editor control and persist its value via {@link UserPreferences} if it differs
     * from the currently-stored value. Called when OK is clicked.
     */
    private void applyChanges()
    {
        for (int i = 0; i < descriptors.size(); ++i)
        {
            final PreferenceDescriptor pd = descriptors.get(i);
            final JComponent editor = editors.get(i);

            switch (pd.type)
            {
            case BOOLEAN:
                {
                    final boolean dflt = ((Boolean) pd.defaultValue).booleanValue();
                    final boolean newVal = ((JCheckBox) editor).isSelected();
                    if (newVal != UserPreferences.getPref(pd.key, dflt))
                        UserPreferences.putPref(pd.key, newVal);
                }
                break;

            case INT:
                {
                    final int dflt = ((Integer) pd.defaultValue).intValue();
                    final Object val = ((JSpinner) editor).getValue();
                    final int newVal = (val instanceof Number) ? ((Number) val).intValue() : dflt;
                    if (newVal != UserPreferences.getPref(pd.key, dflt))
                        UserPreferences.putPref(pd.key, newVal);
                }
                break;

            case CHOICE:
                {
                    final int selIdx = ((JComboBox<?>) editor).getSelectedIndex();
                    if ((selIdx >= 0) && (selIdx < pd.choices.length))
                    {
                        final String newChoice = pd.choices[selIdx];
                        if (! newChoice.equals(pd.getCurrentChoice()))
                        {
                            pd.putCurrentChoice(newChoice);

                            if (PreferenceDescriptor.KEY_HEX_GRAPHICS_SET.equals(pd.key))
                                mainDisplay.getClient().reloadBoardGraphics();
                                    // refresh all current PIs, like NewGameOptionsFrame does
                        }
                    }
                }
                break;
            }
        }
    }

}
