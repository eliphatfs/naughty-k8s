import * as vscode from 'vscode';
import { systemAsync } from './utils';

const link = "https://kubernetes.io/docs/tasks/tools/";

function showError(what: string) {
    vscode.window.showErrorMessage(
        `${what} not found. Please install kubectl and kubectl convert plugin according to ${link}`,
        "Open Instructions"
    ).then(selected => {
        if (selected == "Open Instructions")
            vscode.env.openExternal(vscode.Uri.parse(link));
    });
}

async function kubectl() {
    const code = await systemAsync("kubectl version --client");
    if (code !== 0)
        showError("kubectl");
    else
        console.log("Got kubectl.")
}

async function kubeconvert() {
    const code = await systemAsync("kubectl convert --help");
    if (code !== 0)
        showError("kubectl-convert");
    else
        console.log("Got kubectl-convert.")
}

export async function detectTools() {
    for (let promise of [kubectl(), kubeconvert()])
        await promise;
}
