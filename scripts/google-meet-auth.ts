import "dotenv/config";
import { createServer } from "node:http";
import { google } from "googleapis";

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const redirectUri =
    process.env.GOOGLE_OAUTH_REDIRECT_URI ??
    "http://localhost:53682/oauth2callback";

if (!clientId || !clientSecret) {
    throw new Error(
        "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET before running this script",
    );
}

const parsedRedirectUri = new URL(redirectUri);
if (parsedRedirectUri.hostname !== "localhost") {
    throw new Error("GOOGLE_OAUTH_REDIRECT_URI must use localhost");
}

const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri,
);
const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/meetings.space.created"],
});

const server = createServer(async (req, res) => {
    const requestUrl = new URL(req.url ?? "/", redirectUri);
    if (requestUrl.pathname !== parsedRedirectUri.pathname) {
        res.writeHead(404).end("Not found");
        return;
    }

    const oauthError = requestUrl.searchParams.get("error");
    const code = requestUrl.searchParams.get("code");

    if (oauthError || !code) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(`Google OAuth failed: ${oauthError ?? "missing code"}`);
        server.close();
        return;
    }

    try {
        const { tokens } = await oauth2Client.getToken(code);
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Authorization completed. You can close this tab.");

        console.log("\nAdd this value to .env:");
        console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token ?? ""}`);
        if (!tokens.refresh_token) {
            console.log(
                "No refresh token was returned. Revoke the app permission and run the script again.",
            );
        }
    } catch (error) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Could not exchange the authorization code.");
        console.error(error);
    } finally {
        server.close();
    }
});

server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
        console.error(
            `Port ${parsedRedirectUri.port} is already in use. Stop the previous google-meet:auth process and try again.`,
        );
    } else {
        console.error("OAuth callback server failed", error);
    }

    process.exitCode = 1;
});

server.listen(Number(parsedRedirectUri.port || 80), parsedRedirectUri.hostname, () => {
    console.log("Open this URL and sign in with the clinic Google account:\n");
    console.log(authUrl);
});
