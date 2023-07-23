import * as vscode from 'vscode';
import { listPods } from '../api/pod';
import { html } from './webviews';

class KubernetesConfigProvider implements vscode.WebviewViewProvider {
    tree: KubernetesTreeProvider
    extensionUri: vscode.Uri

    constructor(controlledTree: KubernetesTreeProvider, extensionUri: vscode.Uri) {
        this.tree = controlledTree;
        this.extensionUri = extensionUri
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
            console.log(ev);
            if (ev.command == 'filter-name')
            {
                if (this.tree.filters.name != ev.args[0])
                {
                    this.tree.filters.name = ev.args[0];
                    this.tree.refresh();
                }
            }
        })
    }
}

class PodItem extends vscode.TreeItem {
    constructor(label: string, collapsibleState: vscode.TreeItemCollapsibleState) {
        super(label, collapsibleState);
    }
}

class KubernetesTreeProvider implements vscode.TreeDataProvider<PodItem>  {
    private _onDidChangeTreeData: vscode.EventEmitter<PodItem | undefined | void> = new vscode.EventEmitter<PodItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<PodItem | undefined | void> = this._onDidChangeTreeData.event;
	
    filters = {
        name: ""
    };

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
            for (let pod of await listPods())
            {
                const name = pod.metadata?.name ?? "<unnamed>";
                const status = pod.status?.phase ?? "<unknown>";
                if (!name.includes(this.filters.name))
                    continue;
                pods.push(new PodItem(`${name} (${status})`, vscode.TreeItemCollapsibleState.None));
            }
            return pods;
        }
      }
}

export default class KubernetesView {
    constructor(context: vscode.ExtensionContext) {
        let provider = new KubernetesTreeProvider();
        let cfgProvider = new KubernetesConfigProvider(provider, context.extensionUri);
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider('naughty-k8s.cfg', cfgProvider),
            vscode.window.registerTreeDataProvider('naughty-k8s.res', provider),
            vscode.commands.registerCommand("naughty-k8s.res.refresh", () => provider.refresh())
        );
    }
}
