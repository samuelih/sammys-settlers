/**
 * JSettlers network message system.
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
package soc.server.genericServer;

import java.util.Date;

import org.java_websocket.WebSocket;

import soc.disableDebug.D;
import soc.message.SOCMessage;

/**
 * A WebSocket client's connection at the server, for the web client transport.
 * Wraps an {@link org.java_websocket.WebSocket} provided by {@link WebSocketServerBridge}.
 *<P>
 * Unlike {@link NetConnection}, this connection is event-driven: inbound frames are read
 * by the bridge's {@link WebSocketServerBridge#onMessage(WebSocket, String)} callback, not
 * by a per-connection reader thread. So {@link #run()} is a no-op and {@link #isInputAvailable()}
 * always returns false (which causes the server to set up the version-wait timer, as desired).
 *<P>
 * Unlike the Java TCP transport ({@link NetConnection}), the WebSocket transport does NOT
 * length-prefix or {@code writeUTF}-encode each command: each WebSocket text frame carries
 * exactly one raw {@link SOCMessage#toCmd()} string, since WebSocket already provides framing.
 *<P>
 * As used within JSettlers, the structure of this class has much in common
 * with {@link NetConnection} and {@link StringConnection}, as they all subclass {@link Connection}.
 *
 * @author Jeremy D Monin &lt;jeremy@nand.net&gt;
 * @since 2.7.00
 */
public class WebSocketConnection
    extends Connection
{
    /**
     * The wrapped WebSocket for this connection's remote client.
     * @since 2.7.00
     */
    protected final WebSocket ws;

    /**
     * True once {@link #connect()} has been called and the connection is active;
     * set false by {@link #disconnect()} or {@link #disconnectSoft()}.
     * @since 2.7.00
     */
    protected volatile boolean connected = false;

    /**
     * Has the bridge already seen this connection's first inbound message?
     * Used by {@link WebSocketServerBridge#onMessage(WebSocket, String)} to route
     * the first message through {@link Server#processFirstCommand(SOCMessage, Connection)}.
     * @since 2.7.00
     */
    protected volatile boolean seenFirst = false;

    /**
     * Guards against {@link Server#removeConnection(Connection, boolean)} being called more
     * than once for this connection. The bridge can receive both {@code onError} and {@code onClose}
     * for a failed connection, and {@code removeConnection} itself calls {@link #disconnect()} →
     * {@code ws.close()} which asynchronously fires {@code onClose} again; without this guard an
     * unnamed connection's server bookkeeping would be decremented more than once.
     * Set true exactly once via {@link #markRemoved()}.
     * @since 2.7.00
     */
    private final java.util.concurrent.atomic.AtomicBoolean removed
        = new java.util.concurrent.atomic.AtomicBoolean(false);

    /**
     * Atomically mark this connection as removed so it is removed from the server exactly once.
     * Called by {@link WebSocketServerBridge}'s {@code onClose}/{@code onError} before calling
     * {@link Server#removeConnection(Connection, boolean)}.
     *
     * @return true if this is the first call (caller should remove the connection);
     *     false if removal was already triggered (caller should do nothing)
     * @since 2.7.00
     */
    boolean markRemoved()
    {
        return removed.compareAndSet(false, true);
    }

    /**
     * Create a new WebSocketConnection wrapping a freshly opened WebSocket.
     *
     * @param ws  The opened WebSocket for the remote client; not null
     * @param sve  The server handling this connection; not null
     * @since 2.7.00
     */
    public WebSocketConnection(final WebSocket ws, final Server sve)
    {
        this.ws = ws;
        ourServer = sve;
    }

    /**
     * Send this data over the WebSocket as a single text frame.
     * The frame carries the raw {@code str} (no {@code writeUTF} length prefix);
     * WebSocket provides its own framing.
     *<P>
     * <B>Threads:</B> Safe to call from any thread; synchronizes on this connection.
     * Silently ignored if the connection is closed or closing.
     *
     * @param str Data to send, from {@link SOCMessage#toCmd()}
     * @since 2.7.00
     */
    public synchronized void put(String str)
    {
        if ((! connected) || (! ws.isOpen()))
            return;  // <--- Early return: Closed or closing ---

        try
        {
            ws.send(str);
        }
        catch (Exception e)
        {
            D.ebugPrintlnINFO("Exception in WebSocketConnection.put (" + host() + ") - " + e);

            if (D.ebugOn)
                e.printStackTrace(System.out);

            error = e;
        }
    }

    /**
     * Mark this already-open WebSocket connection as connected; called only by the server
     * framework's {@link Server#addConnection(Connection)}.
     * Sets {@link #connectTime} to now.
     *<P>
     * Connection must be unnamed (<tt>{@link #getData()} == null</tt>) at this point.
     *
     * @return true (the WebSocket is already open)
     * @since 2.7.00
     */
    public boolean connect()
    {
        connected = true;
        connectTime = new Date();
        return true;
    }

    /**
     * Is input available now, without blocking?
     *<P>
     * Always returns false for WebSocket connections: inbound frames are delivered
     * asynchronously to {@link WebSocketServerBridge#onMessage(WebSocket, String)},
     * not read here. Returning false causes the server to set up the version-wait timer,
     * which is the desired behavior.
     *
     * @return false, always
     * @since 2.7.00
     */
    public boolean isInputAvailable()
    {
        return false;
    }

    /**
     * No-op for WebSocket connections.
     *<P>
     * The WebSocket transport is event-driven: inbound reading happens in
     * {@link WebSocketServerBridge#onMessage(WebSocket, String)}, so this connection
     * has no reader thread/loop to run.
     *
     * @since 2.7.00
     */
    public void run()
    {
        // No-op: WebSocket is event-driven; reading happens in the bridge's onMessage.
    }

    /**
     * Close the WebSocket; called after conn is removed from server structures.
     * @since 2.7.00
     */
    public synchronized void disconnect()
    {
        if (! connected)
            return;  // <--- Early return: Already disconnected ---

        connected = false;

        try
        {
            if (ws.isOpen())
                ws.close();
        }
        catch (Exception e)
        {
            D.ebugPrintlnINFO("Exception in WebSocketConnection.disconnect (" + host() + ") - " + e);

            if (D.ebugOn)
                e.printStackTrace(System.out);

            error = e;
        }
    }

    /**
     * Accept no further input, allow output to drain, don't immediately close the socket.
     * Once called, {@link #isConnected()} will return false.
     * @since 2.7.00
     */
    public synchronized void disconnectSoft()
    {
        connected = false;
    }

    /**
     * Are we currently connected and active?
     * @return true if {@link #connect()} was called and the WebSocket is still open
     * @since 2.7.00
     */
    public boolean isConnected()
    {
        return connected && ws.isOpen();
    }

    /**
     * @return Hostname (remote socket address) of the remote end of the connection,
     *     or {@code "(unknown)"} if not available
     * @since 2.7.00
     */
    public String host()
    {
        try
        {
            java.net.InetSocketAddress addr = ws.getRemoteSocketAddress();
            if (addr != null)
                return addr.getAddress().getHostAddress();
        }
        catch (Exception e) {}

        return "(unknown)";
    }

    /**
     * For debugging, toString includes connection name key ({@link #getData()}) if available.
     * @since 2.7.00
     */
    @Override
    public String toString()
    {
        StringBuffer sb = new StringBuffer("WebSocketConnection[");
        if (data != null)
            sb.append(data);
        else
            sb.append(super.hashCode());
        sb.append('-');
        sb.append(host());
        sb.append(']');
        return sb.toString();
    }

}
