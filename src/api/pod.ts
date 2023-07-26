import * as vscode from 'vscode';
import * as api from '.';
import * as k8s from '@kubernetes/client-node';
import path from 'path';
import fs from 'fs';
import stream from 'stream';
import WebSocket from 'ws';
import { delay } from '../utils';
import { Interface, createInterface } from 'readline';
import * as tar from 'tar';

export interface Command {
    cmd: string
}

export interface Result {
    result: string
    ticket: number | undefined
    msg: string | undefined
}


export async function listPods(): Promise<k8s.V1Pod[]> {
    const k8sApi = api.make(k8s.CoreV1Api);
    const resp = await k8sApi.listNamespacedPod(api.ns());
    return resp.body.items;
}


export async function getLogStream(podName: string) {
    const ps = new stream.PassThrough({ encoding: 'utf-8' });
    const logApi = await new k8s.Log(api.kube()).log(api.ns(), podName, '', ps, {
        follow: true
    });
    ps.on('close', () => {
        console.log("POD LOG STREAM CLOSED");
        logApi.abort();
    });
    return ps;
}


export async function describeStream(podName: string) {
    const ps = new stream.PassThrough({ encoding: 'utf-8' });
    let dontWorryItsMe = false;
    const watch = await new k8s.Watch(api.kube()).watch(
        '/api/v1/namespaces/ucsd-haosulab/events',
        { fieldSelector: `involvedObject.name==${podName}` },
        (type, apiObj: k8s.CoreV1Event, watchObj) => {
            if (type == 'ADDED' || type == 'MODIFIED') {
                ps.write(apiObj.lastTimestamp + "\t" + apiObj.type + "\t" + apiObj.reason + "\t" + apiObj.message + '\n');
            }
        },
        (err) => {
            if (!dontWorryItsMe)
                vscode.window.showErrorMessage(`Error in describe streaming ${podName}: ${err.message}`);
        }
    );
    ps.on('close', () => {
        console.log("POD DESCRIBE STREAM CLOSED");
        dontWorryItsMe = true;
        watch.abort();
    });
    return ps;
}


export async function whoIsUsingA100() {
    function key(a: k8s.V1Node) {
        let labels = (a.metadata?.labels ?? {});
        return parseInt(labels["nvidia.com/gpu.memory"] ?? "0") + parseInt(labels['nvidia.com/gpu.count'] ?? "0");
    }
    let nodes = (await api.make(k8s.CoreV1Api).listNode()).body.items.sort((a, b) => key(b) - key(a));
    let usingPods = new Map<string, k8s.V1Pod[]>();
    for (let node of nodes)
        usingPods.set(node.metadata?.name ?? "", []);
    for (let pod of (await api.make(k8s.CoreV1Api).listPodForAllNamespaces()).body.items)
        if (pod.status?.phase == "Running" && pod.spec?.nodeName)
            usingPods.get(pod.spec?.nodeName)?.push(pod);
    let doc = [];
    function gpu(a: k8s.V1Pod) {
        return a.spec?.containers?.reduce((x, v) => x + (parseInt((v.resources?.requests ?? {})['nvidia.com/gpu'] ?? "0")), 0) ?? 0;
    }
    for (let node of nodes) {
        let labels = (node.metadata?.labels ?? {});
        if (!(parseInt(labels['nvidia.com/gpu.count']) ?? 0))
            continue;
        doc.push(node.metadata?.name + "\t" + labels['nvidia.com/gpu.product'] + " x " + labels['nvidia.com/gpu.count']);
        for (let pod of usingPods.get(node.metadata?.name ?? "")!.sort((a, b) => gpu(b) - gpu(a))) {
            if (0 == gpu(pod))
                continue;
            doc.push(gpu(pod) + "\t" + pod.metadata?.namespace + "::" + pod.metadata?.name);
        }
        doc.push("");
    }
    vscode.env.clipboard.writeText(doc.join('\n'));
    vscode.window.showInformationMessage("Done.");
}

function formatTime(seconds: number) {
    if (!isFinite(seconds))
        return "--";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.round(seconds % 60);
    return [
      h,
      m > 9 ? m : (h ? '0' + m : m || '0'),
      s > 9 ? s : '0' + s
    ].filter(Boolean).join(':');
}


export async function downloadFile(srcUri: vscode.Uri, podName: string, fp: string) {
    console.log("IN DOWNLOAD FILE")
    let downloadPath = vscode.workspace.getConfiguration().get<string>("naughtyK8s.podFS.downloadPath");
    let destination: string;
    if (downloadPath) {
        if (path.isAbsolute(downloadPath))
            destination = downloadPath;
        else {
            let localRoot = vscode.workspace.workspaceFolders?.find(x => x.uri.scheme == 'file');
            if (!localRoot) {
                vscode.window.showErrorMessage("Cannot download: No local root workspace folder found!");
                throw new Error("Cannot download: No local root workspace folder found!")
            }
            destination = path.join(localRoot.uri.fsPath, downloadPath);
        }
    }
    else {
        vscode.window.showErrorMessage("Cannot download: Download Path not Configured!");
        throw new Error("Cannot download: Download Path not Configured!")
    }
    let fsize = (await vscode.workspace.fs.stat(srcUri)).size;
    let t = Date.now();
    let basep = path.basename(fp);
    let dirp = path.dirname(fp);
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(destination));
    let stdout = tar.extract({ C: destination });
    let ws = await new k8s.Exec(api.kube()).exec(api.ns(), podName, '', ['tar', 'zcf', '-', '-C', dirp, basep], stdout, null, null, false, (status) => {
        if (status.status == "Failure")
            vscode.window.showWarningMessage("Pod daemon failed to start (probably pod stopped or missing tar installation): " + status.message);
    });
    ws.on('error', (err) => { vscode.window.showWarningMessage("Error downloading `" + basep + "`: " + err.message) })
    let target = vscode.Uri.joinPath(vscode.Uri.file(destination), path.basename(fp));
    await vscode.window.withProgress(
        { cancellable: true, title: "Downloading: " + basep, location: vscode.ProgressLocation.Notification },
        async (progress, token) => {
            let downBytes = 0;
            let window: number[] = [];
            let reportSection = setInterval(async () => {
                (await vscode.workspace.fs.stat(target).then((fstat) => {
                    let sz = fstat.size;
                    let delta = sz - downBytes;
                    window.push(delta / 500);
                    downBytes = sz;
                    if (window.length > 10)
                        window.shift();
                    let speed = window.reduce((x, y) => x + y, 0) / window.length;
                    let eta = (fsize - downBytes) / (speed * 1000);
                    progress.report({
                        message: `Downloading: ${basep} ${speed.toFixed()} KB/s ETA ${formatTime(eta)}`,
                        increment: delta / fsize * 100
                    })
                }, () => {}));
            }, 500);
            let isCancel = false;
            token.onCancellationRequested(() => {
                isCancel = true;
                ws.close()
            });
            await new Promise<void>(resolve => ws.on('close', () => {
                clearInterval(reportSection);
                if (isCancel)
                    vscode.window.showInformationMessage("Transfer " + basep + " cancelled.");
                else
                    vscode.window.showInformationMessage("Transfer " + basep + " finished.");
                resolve();
            }));
        }
    )
    let td = Date.now();
    let sz = (await vscode.workspace.fs.stat(target)).size;
    vscode.window.showInformationMessage((sz / 1e6).toFixed(3) + " MB in " + ((td - t) / 1e3).toFixed(1) + " secs (" + (sz / (td - t)).toFixed(1) + " KB/s)");
}


export class BackedPodCommandStream {
    name: string
    stdin: stream.PassThrough
    stdout: stream.PassThrough
    // stderr: stream.PassThrough
    stdoutReader: Interface
    ws: WebSocket | undefined

    constructor(name: string) {
        this.name = name
        // a single huge page
        this.stdin = new stream.PassThrough({ highWaterMark: 2 * 1024 * 1024 });
        this.stdout = new stream.PassThrough({ highWaterMark: 2 * 1024 * 1024 });
        // this.stderr = new stream.PassThrough();
        this.stdoutReader = createInterface(this.stdout);
    }

    async open() {
        let ssc = await fs.promises.readFile(path.join(__filename, '..', '..', 'serverside', 'host.py'), 'ascii');
        this.ws = await new k8s.Exec(api.kube()).exec(
            api.ns(), this.name, '',
            ['python3', '-c', ssc],
            this.stdout, null, this.stdin, false,
            (status) => {
                if (status.status == "Failure")
                    vscode.window.showWarningMessage("Pod daemon failed to start (probably pod stopped or missing python3 installation): " + status.message);
            }
        );
        this.ws.on('error', async (err) => {
            vscode.window.showInformationMessage("Reconnecting due to lost connection to pod: " + err.message);
            await delay(3000);
            this.open();
        });
        
        this.stdoutReader.removeAllListeners();
        this.stdoutReader.on('line', (line) => {
            let result: Result = JSON.parse(line);
            if (!result.ticket)
                vscode.window.showWarningMessage("Pod daemon internal error: " + line);
            else {
                let resolver = this.resolvers.get(result.ticket);
                if (resolver) {
                    resolver(result);
                    this.resolvers.delete(result.ticket);
                }
                else {
                    vscode.window.showWarningMessage("Unexpected pod daemon return: " + line);
                }
            }
        });

        return this;
    }

    ticket = 0
    resolvers = new Map<number, (x: any) => void>;

    async run<TR extends Result, TC extends Command>(command: TC): Promise<TR> {
        let ticket = ++this.ticket;
        (command as any).ticket = ticket;
        this.stdin.write(JSON.stringify(command) + "\n");
        let resp = await new Promise<TR>(resolve => this.resolvers.set(ticket, resolve));
        if (resp.result === "E") {
            throw new Error("Remote command failed with error: " + resp.msg);
        }
        return resp;
    }

    async close() {
        this.stdin.end();
        await delay(1000);
        this.ws?.close();
    }
}
