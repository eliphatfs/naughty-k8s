import * as vscode from 'vscode';
import * as api from '.';
import * as k8s from '@kubernetes/client-node';
import path from 'path';
import fs, { stat } from 'fs';
import stream from 'stream';
import WebSocket from 'ws';
import { delay } from '../utils';
import { Interface, createInterface } from 'readline';

export interface Command {
    cmd: string
}

export interface Result {
    result: string
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


export class BackedPodCommandStream {
    name: string
    stdin: stream.PassThrough
    stdout: stream.PassThrough
    // stderr: stream.PassThrough
    stdoutReader: Interface
    ws: WebSocket | undefined

    constructor(name: string) {
        this.name = name
        this.stdin = new stream.PassThrough();
        this.stdout = new stream.PassThrough();
        // this.stderr = new stream.PassThrough();
        this.stdoutReader = createInterface(this.stdout);
    }

    async open() {
        let ssc = await fs.promises.readFile(path.join(__filename, '..', '..', 'serverside', 'host.py'), 'ascii');
        this.ws = await new k8s.Exec(api.kube()).exec(
            api.ns(), this.name, '',
            ['python3', '-u', '-c', ssc],
            this.stdout, null, this.stdin, false,
            (status) => {
                if (status.status == "Failure")
                    vscode.window.showWarningMessage("Pod daemon failed to start (probably missing python3 installation): " + status.message);
            }
        );
        this.ws.on('error', async () => {
            vscode.window.showInformationMessage("Lost connection to pod, reconnecting...");
            await delay(3000);
            this.open();
        });
        
        return this;
    }

    async run<TC extends Command, TR extends Result>(command: TC): Promise<TR> {
        this.stdin.write(JSON.stringify(command) + "\n");
        let resp = await new Promise<TR>((resolve) => this.stdoutReader.once('line', (res) => {
            resolve(JSON.parse(res));
        }));
        if (resp.result === "E")
            vscode.window.showWarningMessage("Remote command failed with error: " + resp.msg);
        return resp;
    }

    async close() {
        this.stdin.end();
        await delay(1000);
        this.ws?.close();
    }
}
