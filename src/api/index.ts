import * as child_process from "child_process";
import * as vscode from "vscode";
import * as k8s from '@kubernetes/client-node';

interface Configuration {
    port: number,
    namespace: string,
    spawn: child_process.ChildProcess | null,
    kc: k8s.KubeConfig,
}

function showDefaultNamespaceWarning() {
    vscode.window.showWarningMessage("kubeconfig current-context not found, using `default` namespace.");
}

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

let defaultNamespace = kc.getContextObject(kc.getCurrentContext());
if (!defaultNamespace?.namespace)
    showDefaultNamespaceWarning();

type ApiCtor<T> = new (server: string) => T;

export const activeProxy: Configuration = {
    port: 0, namespace: defaultNamespace?.namespace ?? 'default', spawn: null, kc
};

export function make<T extends k8s.ApiType>(T: ApiCtor<T>): T {
    return new T(`http://127.0.0.1:${activeProxy.port}`);
}

export function ns() { return activeProxy.namespace; }
export function kube() { return activeProxy.kc; }

export async function startProxy(context: vscode.ExtensionContext): Promise<number> {
    let port = await new Promise<number>(resolve => {
        let spawn = child_process.spawn("kubectl", "proxy -p 0 --keepalive 3600s --disable-filter=true".split(' '));
        let sub = {
            dispose: () => {
                if (spawn.exitCode === null)
                    spawn.kill('SIGINT');
            }
        };
        process.on('exit', () => sub.dispose());
        if (activeProxy.spawn?.exitCode === null)
            activeProxy.spawn?.kill('SIGTERM');
        activeProxy.spawn = spawn;
        context.subscriptions.push(sub);
        spawn.stdout?.on('data', (data: Buffer) => {
            resolve(parseInt(data.toString().split(":").pop()!));
        })
        spawn.stderr?.on('data', (data: Buffer) => {
            let message = data.toString();
            if (message.trim().startsWith("W"))
                return;
            vscode.window.showWarningMessage("naughty-k8s daemon received error, you may want to restart daemon: " + message)
        });
    });
    activeProxy.port = port;
    kc.loadFromClusterAndUser({
        server: `http://127.0.0.1:${activeProxy.port}`,
        skipTLSVerify: true,
        name: 'daemon'
    }, {
        name: ''
    })
    console.log(`kubectl backend daemon on port ${port}`);
    return port;
}
