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

import java.net.InetSocketAddress;

import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;

import soc.disableDebug.D;
import soc.message.SOCMessage;

/**
 * Bridges incoming WebSocket connections to the JSettlers generic {@link Server},
 * for the web client transport. Each opened WebSocket gets a {@link WebSocketConnection}
 * which is integrated into the server exactly like a {@link NetConnection} would be.
 *<P>
 * Lives in package {@code soc.server.genericServer} so it can access the server's
 * {@link Server#inQueue}, {@link Server#addConnection(Connection)},
 * {@link Server#removeConnection(Connection, boolean)}, and
 * {@link Server#processFirstCommand(SOCMessage, Connection)}.
 *<P>
 * Unlike the Java TCP transport, each WebSocket text frame carries exactly one raw
 * {@link SOCMessage#toCmd()} string (no {@code writeUTF} length prefix); WebSocket provides
 * its own framing. See {@link WebSocketConnection} for details.
 *<P>
 * Construct with the address/port to bind and the {@link Server} to bridge to, then call
 * {@link #start()}. The TCP listener and this WebSocket listener can run side by side.
 *
 * @author Jeremy D Monin &lt;jeremy@nand.net&gt;
 * @since 2.7.00
 */
public class WebSocketServerBridge
    extends WebSocketServer
{
    /**
     * The server to bridge WebSocket connections into.
     * @since 2.7.00
     */
    protected final Server ourServer;

    /**
     * Create a WebSocket listener bridge.
     *
     * @param addr  Address/port to bind and listen on; not null
     * @param ourServer  The server to integrate connections into; not null
     * @since 2.7.00
     */
    public WebSocketServerBridge(final InetSocketAddress addr, final Server ourServer)
    {
        super(addr);
        this.ourServer = ourServer;
    }

    /**
     * A new WebSocket client has connected: create a {@link WebSocketConnection},
     * stash it on the WebSocket via {@link WebSocket#setAttachment(Object)}, then
     * integrate it into the server by calling {@link Server#addConnection(Connection)}
     * synchronously (before any inbound frame is processed).
     *<P>
     * {@link Server#addConnection(Connection)} runs {@code newConnection1}/{@code newConnection2},
     * which send the server greeting, set up this connection's per-client app data
     * (the {@code SOCClientData} that {@link #onMessage(WebSocket, String)} depends on), and
     * schedule the version-wait timer. Running it here mirrors {@code NetConnection.run()}/
     * {@code StringConnection.run()}, which call {@code addConnection} and then process the first
     * command on the same thread, sequentially.
     *<P>
     * This must complete before {@link #onMessage(WebSocket, String)} runs for this connection,
     * otherwise the first inbound command (typically the client's {@code SOCVersion}) would be
     * processed while app data is still null, throwing and losing the client's version. Java-WebSocket
     * binds each connection to a single worker thread and invokes {@code onOpen} before {@code onMessage}
     * on that thread, so running setup synchronously here serializes it correctly ahead of the first frame.
     *
     * @param ws  The newly opened WebSocket
     * @param handshake  The client handshake (unused)
     * @since 2.7.00
     */
    @Override
    public void onOpen(final WebSocket ws, final ClientHandshake handshake)
    {
        final WebSocketConnection conn = new WebSocketConnection(ws, ourServer);
        ws.setAttachment(conn);

        // addConnection runs newConnection1/newConnection2 (which send the greeting and set
        // up per-connection app data); do this synchronously so it completes before the first
        // inbound frame is processed in onMessage (Java-WebSocket invokes onOpen before
        // onMessage on this connection's single worker thread).
        try
        {
            ourServer.addConnection(conn);
        }
        catch (Exception e)
        {
            D.ebugPrintlnINFO("Exception in WebSocketServerBridge addConnection - " + e);

            if (D.ebugOn)
                e.printStackTrace(System.out);
        }
    }

    /**
     * A text frame arrived from a WebSocket client. Parse it as a {@link SOCMessage} and
     * route it into the server: the connection's FIRST inbound message goes through
     * {@link Server#processFirstCommand(SOCMessage, Connection)}, and is pushed to
     * {@link Server#inQueue} only if that returns false; later messages are pushed directly
     * (when non-null).
     *
     * @param ws  The WebSocket sending this message
     * @param msg  The text frame: one raw {@link SOCMessage#toCmd()} string
     * @since 2.7.00
     */
    @Override
    public void onMessage(final WebSocket ws, final String msg)
    {
        final WebSocketConnection conn = ws.getAttachment();
        if (conn == null)
            return;  // <--- Early return: Connection not set up ---

        final SOCMessage m = SOCMessage.toMsg(msg);  // parse; may be null if unparsable

        if (! conn.seenFirst)
        {
            conn.seenFirst = true;
            try
            {
                if (ourServer.processFirstCommand(m, conn))
                    return;  // <--- Early return: Handled as first command ---
            }
            catch (Exception e)
            {
                D.ebugPrintlnINFO("Exception in WebSocketServerBridge processFirstCommand - " + e);

                if (D.ebugOn)
                    e.printStackTrace(System.out);
            }
        }

        if (m != null)
            ourServer.inQueue.push(m, conn);
    }

    /**
     * A WebSocket client connection has closed: remove its connection from the server.
     *
     * @param ws  The WebSocket which closed
     * @param code  WebSocket close code (unused)
     * @param reason  Close reason (unused)
     * @param remote  Whether the close was initiated remotely (unused)
     * @since 2.7.00
     */
    @Override
    public void onClose(final WebSocket ws, final int code, final String reason, final boolean remote)
    {
        final WebSocketConnection conn = (ws != null) ? (WebSocketConnection) ws.getAttachment() : null;
        if ((conn != null) && conn.markRemoved())
            ourServer.removeConnection(conn, false);
    }

    /**
     * An error occurred on a WebSocket connection (or the listener itself if {@code ws} is null):
     * log it, and remove the connection if known.
     *
     * @param ws  The WebSocket with the error, or null for a server-level error
     * @param ex  The exception
     * @since 2.7.00
     */
    @Override
    public void onError(final WebSocket ws, final Exception ex)
    {
        if (ws == null)
            // Listener-level error (e.g. the port couldn't be bound): the WebSocket listener
            // never started, so surface this unconditionally rather than via the (possibly
            // disabled) debug print.
            System.err.println("** WebSocket listener error: " + ex);
        else
            D.ebugPrintlnINFO("Exception in WebSocketServerBridge.onError - " + ex);

        if (D.ebugOn)
            ex.printStackTrace(System.out);

        final WebSocketConnection conn = (ws != null) ? (WebSocketConnection) ws.getAttachment() : null;
        if ((conn != null) && conn.markRemoved())
            ourServer.removeConnection(conn, false);
    }

    /**
     * The WebSocket listener has started successfully; log it.
     * @since 2.7.00
     */
    @Override
    public void onStart()
    {
        System.err.println("WebSocket listener started on port " + getPort());
    }

}
