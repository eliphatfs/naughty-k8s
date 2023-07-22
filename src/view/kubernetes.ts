import * as vscode from 'vscode';
import { listPods } from '../api/pod';

class PodItem extends vscode.TreeItem {
    constructor(label: string, collapsibleState: vscode.TreeItemCollapsibleState) {
        super(label, collapsibleState);
    }
}

class KubernetesTreeProvider implements vscode.TreeDataProvider<PodItem>  {
    private _onDidChangeTreeData: vscode.EventEmitter<PodItem | undefined | void> = new vscode.EventEmitter<PodItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<PodItem | undefined | void> = this._onDidChangeTreeData.event;
	
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
                pods.push(new PodItem(pod.metadata?.name ?? "<unnamed>", vscode.TreeItemCollapsibleState.None));
            return pods;
        }
      }
}

export default class KubernetesView {
    constructor(context: vscode.ExtensionContext) {
        let provider = new KubernetesTreeProvider();
        context.subscriptions.push(
            vscode.window.registerTreeDataProvider('naughty-k8s.res', provider),
            vscode.commands.registerCommand("naughty-k8s.res.refresh", () => provider.refresh())
        );
    }
}
