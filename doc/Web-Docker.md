# Web Docker Deployment

The web client can run from one Docker image together with the Java
`SOCServer`. The image serves the React/Vite build on HTTP port `8080`, starts
the Java server on TCP port `8880`, and enables the browser WebSocket listener
on port `8888`.

## Build

```bash
docker build -t jsettlers-web .
```

Or use Compose:

```bash
docker compose up --build -d
```

## Run On A Server

```bash
docker run -d \
  --name jsettlers \
  -p 8080:8080 \
  -p 8888:8888 \
  -p 8880:8880 \
  -e JS_BOTS=7 \
  -e JS_MAX_CONNECTIONS=50 \
  jsettlers-web
```

Open inbound firewall ports:

- `8080/tcp` for the web app.
- `8888/tcp` for browser WebSocket connections.
- `8880/tcp` only if you also want desktop Java clients to connect directly.

## How Other Players Join

Give players the server URL, for example:

```text
http://your-server.example.com:8080
```

On the web client's connect screen they should enter:

```text
Host: your-server.example.com
Port: 8888
```

After connecting, one player creates a game in the lobby. The others join that
same game from the lobby, then sit in open seats. Built-in bots fill empty seats
when the game starts.

For an HTTPS site, terminate TLS in a reverse proxy and make sure WebSocket
upgrade traffic reaches the container's port `8888`. Browsers may block a
plain `ws://` connection from an `https://` page, so either expose a secure
WebSocket endpoint or serve the web app over HTTP for a private test server.
