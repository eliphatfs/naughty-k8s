import * as vscode from 'vscode';
import { BackedPodCommandStream, Command, Result } from '../api/pod';

interface PathCommand<T extends string> extends Command {
    cmd: T, p: string
}

interface LsResult extends Result {
    files: { name: string, kind: vscode.FileType }[]
}

interface B64ReadResult extends Result {
    b64: string
}

type LsCommand = PathCommand<"ls">;
type MStatCommand = PathCommand<"mstat">;
type B64ReadCommand = PathCommand<"b64read">;
type MStatResult = Result & vscode.FileStat;


export default class PodFS implements vscode.FileSystemProvider {
    private _onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._onDidChangeFile.event;

    constructor(context: vscode.ExtensionContext) {
        context.subscriptions.push(
            vscode.workspace.registerFileSystemProvider('nk8spodfs', this, { isCaseSensitive: true }),
            vscode.commands.registerCommand('naughty-k8s.podfs.mount', (pod: string) => {
                vscode.workspace.updateWorkspaceFolders(
                    vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders.length : 0,
                    null,
                    { uri: vscode.Uri.parse(`nk8spodfs://${pod}/`) }
                );
            })
        );
    }

    commandStreams = new Map<string, BackedPodCommandStream>();

    async podRun<TR extends Result, TC extends Command>(podName: string, command: TC) {
        let cmds = this.commandStreams.get(podName);
        if (!cmds) {
            cmds = new BackedPodCommandStream(podName);
            this.commandStreams.set(podName, cmds);
            let future = cmds.open();
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Mounting Pod FS for " + podName,
                cancellable: false
            }, async (progress, token) => {
                await future;
            });
        }
        console.log(command);
        let t = Date.now();
        let resp = await cmds.run<TR, TC>(command);
        console.log(resp);
        console.log(resp.ticket + ": " + (Date.now() - t)  + "ms response time");
        return resp;
    }

    watch(uri: vscode.Uri, options: { readonly recursive: boolean; readonly excludes: readonly string[]; }): vscode.Disposable {
        // TODO: implement watch better
        return new vscode.Disposable(() => {});
    }

    async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        return await this.podRun<MStatResult, MStatCommand>(uri.authority, { cmd: 'mstat', p: uri.path });
    }

    async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
        let results = await this.podRun<LsResult, LsCommand>(uri.authority, { cmd: 'ls', p: uri.path });
        return results.files.map((x) => [x.name, x.kind]);
    }
    
    async createDirectory(uri: vscode.Uri) {
        await this.podRun(uri.authority, { cmd: 'mkdirs', p: uri.path });
    }

    async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        return Buffer.from(
            (await this.podRun<B64ReadResult, B64ReadCommand>(uri.authority, { cmd: 'b64read', p: uri.path })).b64,
            'base64'
        );
    }

    async writeFile(uri: vscode.Uri, content: Uint8Array, options: { readonly create: boolean; readonly overwrite: boolean; }) {
        // TODO: implement create and overwrite
        await this.podRun(uri.authority, { cmd: 'b64write', p: uri.path, contents: Buffer.from(content).toString('base64') });
    }

    async delete(uri: vscode.Uri, options: { readonly recursive: boolean; }) {
        await this.podRun(uri.authority, { cmd: 'rm', p: uri.path, recursive: options.recursive });
    }

    async rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { readonly overwrite: boolean; }) {
        // TODO: implement overwrite
        if (oldUri.authority != newUri.authority)
            throw new Error("Moving across pods is not supported yet.")
        await this.podRun(oldUri.authority, { cmd: 'mv', src: oldUri.path, dst: newUri.path });
    }

    async copy(source: vscode.Uri, destination: vscode.Uri, options: { readonly overwrite: boolean; }) {
        // TODO: implement overwrite
        if (source.authority != source.authority)
            throw new Error("Copying across pods is not supported yet.")
        await this.podRun(source.authority, { cmd: 'cp', src: source.path, dst: destination.path });
    }

}
