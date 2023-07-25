import * as vscode from 'vscode';
import { listPods, BackedPodCommandStream, getLogStream, describeStream } from '../api/pod';
import { html } from './webviews';
import { PassThrough } from 'stream';
import { throttled } from '../utils';


function getNameFilterValue(context: vscode.ExtensionContext) {
    return context.globalState.get<string>('nk8s.cfg.name-filter-value') ?? "";
}

function setNameFilterValue(context: vscode.ExtensionContext, val: string) {
    return context.globalState.update('nk8s.cfg.name-filter-value', val);
}


class KubernetesConfigProvider implements vscode.WebviewViewProvider {
    tree: KubernetesTreeProvider
    extensionUri: vscode.Uri
    context: vscode.ExtensionContext

    constructor(controlledTree: KubernetesTreeProvider, context: vscode.ExtensionContext) {
        this.tree = controlledTree;
        this.extensionUri = context.extensionUri;
        this.context = context;
    }

    resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext<unknown>, token: vscode.CancellationToken) {
        webviewView.webview.options = {
			enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.extensionUri, 'out'),
                vscode.Uri.joinPath(this.extensionUri, 'webview')
            ],
        };
        webviewView.webview.html = html(webviewView.webview, this.extensionUri, "naughty-k8s.cfg.js");
        webviewView.webview.onDidReceiveMessage((ev) => {
            if (ev.command == 'filter-name') {
                if (getNameFilterValue(this.context) != ev.args[0]) {
                    setNameFilterValue(this.context, ev.args[0]).then(() => this.tree.refresh());
                }
            }
            if (ev.command == 'ready') {
                webviewView.webview.postMessage({
                    command: 'init', nameFilterValue: getNameFilterValue(this.context)
                });
            }
        })
    }
}

class PodItem extends vscode.TreeItem {
    name: string

    constructor(name: string, status: string, collapsibleState: vscode.TreeItemCollapsibleState) {
        super(`${name} (${status})`, collapsibleState);
        this.name = name;
        this.contextValue = status.toLowerCase();
        switch (this.contextValue) {
            case "running":
                this.iconPath = new vscode.ThemeIcon("gear~spin", new vscode.ThemeColor("testing.runAction"));
                break;
            case "pending":
                this.iconPath = new vscode.ThemeIcon("clock");
                break;
            case "succeeded":
                this.iconPath = new vscode.ThemeIcon("check");
                break;
            case "failed":
                this.iconPath = new vscode.ThemeIcon("warning", new vscode.ThemeColor("errorForeground"));
                break;
            case "unknown":
                this.iconPath = new vscode.ThemeIcon("question");
                break;
        }
    }
}

class PodLogFollower implements vscode.TextDocumentContentProvider {
    logs = new Map<string, string[]>();
    streams = new Map<string, PassThrough>();

    constructor(context: vscode.ExtensionContext) {
        context.subscriptions.push(
            vscode.workspace.onDidCloseTextDocument(doc => {
                let uriString = doc.uri.toString();
                console.log("CLOSE " + uriString);
                this.logs.delete(uriString);
                let stream = this.streams.get(uriString);
                if (stream)
                {
                    console.log("POD LOG STREAM DESTROY " + uriString);
                    stream.destroy();
                }
                this.streams.delete(uriString);
            })
        );
    }

    onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
    onDidChange = this.onDidChangeEmitter.event;

    async provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): Promise<string> {
        let uriString = uri.toString();
        if (!this.logs.has(uriString)) {
            console.log("POD LOG CREATE " + uri.path + " " + uriString);
            let stream = await getLogStream(uri.path);
            this.logs.set(uriString, []);
            let fireRefresh = throttled(() => this.onDidChangeEmitter.fire(uri), 50);
            stream.on('data', (chunk: string) => {
                this.logs.get(uriString)!.push(chunk);
                fireRefresh();
            });
            this.streams.set(uriString, stream);
        }
        return this.logs.get(uriString)!.join('');
    }
}

class PodDescribeFollower implements vscode.TextDocumentContentProvider {
    logs = new Map<string, string[]>();
    streams = new Map<string, PassThrough>();

    constructor(context: vscode.ExtensionContext) {
        context.subscriptions.push(
            vscode.workspace.onDidCloseTextDocument(doc => {
                let uriString = doc.uri.toString();
                this.logs.delete(uriString);
                let stream = this.streams.get(uriString);
                if (stream)
                {
                    console.log("POD DESCRIBE STREAM DESTROY " + uriString);
                    stream.destroy();
                }
                this.streams.delete(uriString);
            })
        );
    }

    onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
    onDidChange = this.onDidChangeEmitter.event;

    async provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): Promise<string> {
        let uriString = uri.toString();
        if (!this.logs.has(uriString)) {
            console.log("POD DESCRIBE CREATE " + uri.path + " " + uriString);
            let stream = await describeStream(uri.path);
            this.logs.set(uriString, []);
            let fireRefresh = throttled(() => this.onDidChangeEmitter.fire(uri), 50);
            stream.on('data', (chunk: string) => {
                this.logs.get(uriString)!.push(chunk);
                fireRefresh();
            });
            this.streams.set(uriString, stream);
        }
        return this.logs.get(uriString)!.join('');
    }
}

class KubernetesTreeProvider implements vscode.TreeDataProvider<PodItem>  {
    private _onDidChangeTreeData: vscode.EventEmitter<PodItem | undefined | void> = new vscode.EventEmitter<PodItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<PodItem | undefined | void> = this._onDidChangeTreeData.event;

    context: vscode.ExtensionContext

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        context.subscriptions.push(
            vscode.commands.registerCommand("naughty-k8s.res.refresh", () => {
                this.refresh()
            }),
            vscode.commands.registerCommand("naughty-k8s.pod.log", async (podItem: PodItem) => {
                await vscode.window.showTextDocument(vscode.Uri.parse(`nk8slog:${podItem.name}`));
            }),
            vscode.commands.registerCommand("naughty-k8s.pod.events", async (podItem: PodItem) => {
                await vscode.window.showTextDocument(vscode.Uri.parse(`nk8sevt:${podItem.name}`));
            }),
            vscode.commands.registerCommand("naughty-k8s.pod.mount", async (podItem: PodItem) => {
                await vscode.commands.executeCommand("naughty-k8s.podfs.mount", podItem.name);
            }),
            vscode.commands.registerCommand("naughty-k8s.pod.copyname", async (podItem: PodItem) => {
                await vscode.env.clipboard.writeText(podItem.name);
            }),
            vscode.commands.registerCommand("naughty-k8s.pod.test", async (podItem: PodItem) => {
                let stream = await new BackedPodCommandStream(podItem.name).open();
                vscode.window.showInformationMessage(
                    "Test pod successful with message: " + (await stream.run({ cmd: "test" })).msg
                );
                await stream.close();
            })
        );
    }

    refresh(): void {
		this._onDidChangeTreeData.fire();
	}

    getTreeItem(element: PodItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: PodItem): Promise<PodItem[]> {
        if (element) {
          return [];
        } else {
            let pods = [];
            let nameFilter = getNameFilterValue(this.context);
            for (let pod of await listPods())
            {
                const name = pod.metadata?.name ?? "<unnamed>";
                const status = pod.status?.phase ?? "<unknown>";
                if (!name.includes(nameFilter))
                    continue;
                pods.push(new PodItem(name, status, vscode.TreeItemCollapsibleState.None));
            }
            return pods;
        }
      }
}

export default class KubernetesView {
    constructor(context: vscode.ExtensionContext) {
        let provider = new KubernetesTreeProvider(context);
        let cfgProvider = new KubernetesConfigProvider(provider, context);
        let logProvider = new PodLogFollower(context);
        let eventProvider = new PodDescribeFollower(context);
        
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider('naughty-k8s.cfg', cfgProvider),
            vscode.window.registerTreeDataProvider('naughty-k8s.res', provider),
            vscode.workspace.registerTextDocumentContentProvider('nk8slog', logProvider),
            vscode.workspace.registerTextDocumentContentProvider('nk8sevt', eventProvider),
        );
    }
}
