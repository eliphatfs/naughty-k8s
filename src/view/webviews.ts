import { Uri, Webview } from "vscode";

export function getNonce() {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

export function getUri(webview: Webview, extensionUri: Uri, pathList: string[]) {
    return webview.asWebviewUri(Uri.joinPath(extensionUri, ...pathList));
}

export function html(webview: Webview, extensionUri: Uri, mainScriptName: string) {
    const nonce = getNonce();
    const webviewUri = getUri(webview, extensionUri, ["out", "webview.js"]);
    const styles = getUri(webview, extensionUri, ["webview", "styles.css"]);
    const mainScript = getUri(webview, extensionUri, ["webview", mainScriptName]);
    return `<!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8" />
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; font-src ${webview.cspSource}; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';">
        <link nonce="${nonce}" rel="stylesheet" href="${styles}" />
    </head>
    <body>
        <div id="main"></div>
        <script type="module" nonce="${nonce}" src="${webviewUri}"></script>
        <script nonce="${nonce}" src="${mainScript}"></script>
    </body>
    </html>`
}
