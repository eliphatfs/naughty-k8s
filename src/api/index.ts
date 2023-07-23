import { exec } from "child_process";
import * as vscode from "vscode";
import { callAsync } from "../utils";

import axios from 'axios';

interface Configuration {
    port: number,
    namespace: string
}

export const client = axios.create({ timeout: 20000 });
export const activeProxy: Configuration = { port: 0, namespace: "" };

client.interceptors.response.use((resp) => { return resp; }, (err) => {
    return Promise.reject(err);
});

function showDefaultNamespaceWarning() {
    vscode.window.showWarningMessage("kubeconfig current-context not found, using `default` namespace.");
}

export function ns() { return activeProxy.namespace; }

export async function startProxy(context: vscode.ExtensionContext): Promise<Configuration> {
    let namespace = "default";
    let kubectx = (await callAsync("kubectl config current-context")).stdout.trim();
    if (!kubectx)
        showDefaultNamespaceWarning();
    else {
        let getns: string | undefined = (await callAsync(`kubectl config get-contexts ${kubectx}`)).stdout.trim();
        getns = getns.split(/\s+/).pop()?.trim();
        if (!getns)
            showDefaultNamespaceWarning();
        else
            namespace = getns;
    }
    let port = await new Promise<number>(resolve => {
        let spawn = exec("kubectl proxy -p 0 --keepalive 3600s");
        let sub = {
            dispose: () => {
                if (spawn.exitCode === null)
                    spawn.kill('SIGINT');
            }
        };
        spawn.stdout?.on('data', (data: string) => {
            resolve(parseInt(data.split(":").pop()!));
        })
        spawn.stderr?.on('data', (data: string) => {
            if (data.toLowerCase().includes('error')) {
                sub.dispose();
                vscode.commands.executeCommand('naughty-k8s.proxy.restart');
            }
        });
        context.subscriptions.push(sub);
    });
    activeProxy.namespace = namespace;
    activeProxy.port = port;
    console.log(`kubectl backend daemon on port ${port}`);
    client.defaults.baseURL = `http://127.0.0.1:${port}/`;
    return { port, namespace };
}
