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
            ['python3', '-c', ssc],
            this.stdout, null, this.stdin, false,
            (status) => {
                if (status.status == "Failure")
                    vscode.window.showWarningMessage("Pod daemon failed to start (probably missing python3 installation): " + status.message);
            }
        );
        this.ws.on('error', async (err) => {
            vscode.window.showInformationMessage("Reconnecting due to lost connection to pod: " + err.message);
            await delay(3000);
            this.open();
        });
        
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
