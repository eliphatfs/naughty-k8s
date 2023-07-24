// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as installs from './installs';
import * as api from './api';
import * as view from './view';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	await installs.detectTools();
	await api.startProxy(context);

	context.subscriptions.push(vscode.commands.registerCommand('naughty-k8s.proxy.restart', async () => {
		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Refreshing k8s backend daemon",
			cancellable: false
		}, (progress, token) => {
			return api.startProxy(context);
		});
	}));

	new view.KubernetesView(context);
	new view.PodFS(context);
}

// This method is called when your extension is deactivated
export function deactivate() {}
